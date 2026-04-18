from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
import hashlib, random, requests as http_requests
import models, schemas, database
from routers.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter()


def geolocate_ip(ip: str) -> dict:
    """Resolve country and city from an IP address using ip-api.com (free, no key required)."""
    private_prefixes = ("127.", "192.168.", "10.", "172.16.", "172.17.", "172.18.",
                        "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                        "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.",
                        "172.31.", "::1", "localhost")
    if any(ip.startswith(p) for p in private_prefixes):
        return {"country": "Local Network", "city": "—"}

    try:
        res = http_requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,country,city",
            timeout=3
        )
        data = res.json()
        if data.get("status") == "success":
            return {"country": data.get("country", "Unknown"), "city": data.get("city", "Unknown")}
    except Exception:
        pass
    return {"country": "Unknown", "city": "Unknown"}


@router.post("/track")
def track_visitor(tracking_data: schemas.BITrackCreate, request: Request, db: Session = Depends(database.get_db)):
    """Public endpoint — called by the bruenel.de website on every page view and interaction."""
    # Extract real client IP (Vercel forwards via x-forwarded-for)
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    ip_hash = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    geo = geolocate_ip(client_ip)

    # Fall back to request headers for user_agent if not sent in body
    user_agent = tracking_data.user_agent or request.headers.get("user-agent", "Unknown")

    new_track = models.BITracking(
        ip_hash=ip_hash,
        ip_address=client_ip,
        referral=tracking_data.referral,
        device_type=tracking_data.device_type,
        mapped_kst_interest=tracking_data.mapped_kst_interest,
        country=geo["country"],
        city=geo["city"],
        page_url=tracking_data.page_url,
        user_agent=user_agent,
        session_id=tracking_data.session_id,
        event_type=tracking_data.event_type or "pageview",
        consent_given=tracking_data.consent_given or 0,
        duration_seconds=tracking_data.duration_seconds,
    )
    db.add(new_track)
    db.commit()
    return {"status": "tracked"}


@router.post("/seed_demo")
def seed_demo_data(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Seed realistic demo BI data."""
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Only Owner can seed demo data")

    devices = ["Desktop", "Mobile", "Tablet"]
    referrals = ["google.com", "linkedin.com", "direct", "xing.de", "bruenel.de", "instagram.com"]
    kst_options = [1000, 2000, 3000, 4000]
    pages = ["/", "/de/products", "/de/services", "/de/sectors", "/de/karriere", "/en", "/en/products", "/en/services"]

    locations = [
        ("Germany", "Berlin"), ("Germany", "Munich"), ("Germany", "Hamburg"),
        ("Germany", "Frankfurt"), ("Germany", "Cologne"), ("Germany", "Stuttgart"),
        ("China", "Shenzhen"), ("China", "Shanghai"), ("China", "Guangzhou"),
        ("United States", "New York"), ("United States", "Los Angeles"),
        ("Netherlands", "Amsterdam"), ("Austria", "Vienna"), ("Switzerland", "Zurich"),
        ("France", "Paris"), ("United Kingdom", "London"), ("Poland", "Warsaw"),
        ("Turkey", "Istanbul"), ("United Arab Emirates", "Dubai"),
    ]

    ip_pools = {
        ("Germany", "Berlin"): "91.114", ("Germany", "Munich"): "89.204",
        ("Germany", "Hamburg"): "87.128", ("Germany", "Frankfurt"): "217.110",
        ("Germany", "Cologne"): "188.174", ("Germany", "Stuttgart"): "212.185",
        ("China", "Shenzhen"): "183.60", ("China", "Shanghai"): "101.226",
        ("China", "Guangzhou"): "113.108", ("United States", "New York"): "207.241",
        ("United States", "Los Angeles"): "198.145", ("Netherlands", "Amsterdam"): "145.131",
        ("Austria", "Vienna"): "193.81", ("Switzerland", "Zurich"): "195.176",
        ("France", "Paris"): "176.149", ("United Kingdom", "London"): "82.132",
        ("Poland", "Warsaw"): "83.238", ("Turkey", "Istanbul"): "78.188",
        ("United Arab Emirates", "Dubai"): "5.36",
    }

    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148",
        "Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile",
    ]

    for i in range(50):
        country, city = random.choice(locations)
        prefix = ip_pools.get((country, city), "10.0")
        fake_ip = f"{prefix}.{random.randint(1, 254)}.{random.randint(1, 254)}"
        ip_hash = hashlib.sha256(fake_ip.encode()).hexdigest()
        days_ago = random.randint(0, 30)
        session = hashlib.md5(f"{fake_ip}-{days_ago}".encode()).hexdigest()[:16]

        entry = models.BITracking(
            ip_hash=ip_hash,
            ip_address=fake_ip,
            referral=random.choice(referrals),
            device_type=random.choice(devices),
            mapped_kst_interest=random.choice(kst_options),
            country=country,
            city=city,
            page_url=random.choice(pages),
            user_agent=random.choice(user_agents),
            session_id=session,
            event_type="pageview",
            created_at=datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23)),
        )
        db.add(entry)

    db.commit()
    return {"message": "50 demo BI events seeded successfully"}


@router.get("/dashboard")
def get_bi_dashboard_data(
    kst: int = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role == models.RoleEnum.MITARBEITER:
        raise HTTPException(status_code=403, detail="Unauthorized")

    query = db.query(models.BITracking)
    if kst:
        query = query.filter(models.BITracking.mapped_kst_interest == kst)
    
    if start_date:
        try:
            sd = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(models.BITracking.created_at >= sd)
        except ValueError:
            pass
            
    if end_date:
        try:
            ed = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(models.BITracking.created_at < ed)
        except ValueError:
            pass

    results = query.order_by(models.BITracking.created_at.desc()).all()

    # Aggregate analytics
    kst_counts: dict[int, int] = {}
    device_counts: dict[str, int] = {}
    referral_counts: dict[str, int] = {}
    daily_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    page_counts: dict[str, int] = {}
    event_counts: dict[str, int] = {}
    unique_ips: set[str] = set()
    unique_sessions: set[str] = set()

    page_duration_sums: dict[str, int] = {}
    page_duration_counts: dict[str, int] = {}

    for r in results:
        k = r.mapped_kst_interest or 0
        kst_counts[k] = kst_counts.get(k, 0) + 1

        d = r.device_type or "Unknown"
        device_counts[d] = device_counts.get(d, 0) + 1

        ref = r.referral or "direct"
        referral_counts[ref] = referral_counts.get(ref, 0) + 1

        if r.created_at:
            day = r.created_at.strftime("%Y-%m-%d")
            daily_counts[day] = daily_counts.get(day, 0) + 1

        c = r.country or "Unknown"
        country_counts[c] = country_counts.get(c, 0) + 1

        page = r.page_url or "/"
        page_counts[page] = page_counts.get(page, 0) + 1

        evt = r.event_type or "pageview"
        event_counts[evt] = event_counts.get(evt, 0) + 1
        
        if r.duration_seconds is not None and r.duration_seconds > 0:
            page_duration_sums[page] = page_duration_sums.get(page, 0) + r.duration_seconds
            page_duration_counts[page] = page_duration_counts.get(page, 0) + 1

        unique_ips.add(r.ip_hash)
        if r.session_id:
            unique_sessions.add(r.session_id)
            
    avg_durations = []
    for page, s in page_duration_sums.items():
        count = page_duration_counts.get(page, 1)
        avg_durations.append({"page": page, "avg_seconds": round(s / count)})

    return {
        "total_hits": len(results),
        "unique_visitors": len(unique_ips),
        "unique_sessions": len(unique_sessions),
        "kst_breakdown": [{"kst": k, "count": v} for k, v in sorted(kst_counts.items())],
        "device_breakdown": [{"device": k, "count": v} for k, v in sorted(device_counts.items(), key=lambda x: -x[1])],
        "referral_breakdown": [{"referral": k, "count": v} for k, v in sorted(referral_counts.items(), key=lambda x: -x[1])[:8]],
        "daily_trend": [{"date": k, "count": v} for k, v in sorted(daily_counts.items())[-14:]],
        "country_breakdown": [{"country": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: -x[1])[:10]],
        "page_breakdown": [{"page": k, "count": v} for k, v in sorted(page_counts.items(), key=lambda x: -x[1])[:10]],
        "event_breakdown": [{"event": k, "count": v} for k, v in sorted(event_counts.items(), key=lambda x: -x[1])],
        "page_avg_durations": sorted(avg_durations, key=lambda x: -x["avg_seconds"]),
        "raw_data": [
            {
                "id": r.id,
                "ip_address": r.ip_address or "—",
                "referral": r.referral,
                "device_type": r.device_type,
                "mapped_kst_interest": r.mapped_kst_interest,
                "country": r.country or "—",
                "city": r.city or "—",
                "page_url": r.page_url or "/",
                "event_type": r.event_type or "pageview",
                "consent_given": bool(r.consent_given),
                "duration_seconds": r.duration_seconds,
                "user_agent": r.user_agent or "—",
                "session_id": r.session_id or "—",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results[:100]
        ],
    }
