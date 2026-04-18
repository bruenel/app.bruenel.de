from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
import hashlib, random, requests as http_requests
import models, schemas, database
from routers.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter()

def geolocate_ip(ip: str) -> dict:
    """Resolve country and city from an IP address using ip-api.com (free, no key required)."""
    # Private/local IPs can't be geolocated
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
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(client_ip.encode('utf-8')).hexdigest()
    geo = geolocate_ip(client_ip)

    new_track = models.BITracking(
        ip_hash=ip_hash,
        ip_address=client_ip,
        referral=tracking_data.referral,
        device_type=tracking_data.device_type,
        mapped_kst_interest=tracking_data.mapped_kst_interest,
        country=geo["country"],
        city=geo["city"]
    )
    db.add(new_track)
    db.commit()
    return {"status": "tracked successfully"}


@router.post("/seed_demo")
def seed_demo_data(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Seed realistic demo BI data."""
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Only Owner can seed demo data")

    devices = ["Desktop", "Mobile", "Tablet"]
    referrals = ["google.com", "linkedin.com", "direct", "xing.de", "bruenel.de", "instagram.com"]
    kst_options = [1000, 2000, 3000, 4000]
    
    # Realistic visitor origins for a German B2B company
    locations = [
        ("Germany", "Berlin"),
        ("Germany", "Munich"),
        ("Germany", "Hamburg"),
        ("Germany", "Frankfurt"),
        ("Germany", "Cologne"),
        ("Germany", "Stuttgart"),
        ("China", "Shenzhen"),
        ("China", "Shanghai"),
        ("China", "Guangzhou"),
        ("United States", "New York"),
        ("United States", "Los Angeles"),
        ("Netherlands", "Amsterdam"),
        ("Austria", "Vienna"),
        ("Switzerland", "Zurich"),
        ("France", "Paris"),
        ("United Kingdom", "London"),
        ("Poland", "Warsaw"),
        ("Turkey", "Istanbul"),
        ("United Arab Emirates", "Dubai"),
    ]
    
    # Realistic IPs by region
    ip_pools = {
        ("Germany", "Berlin"): "91.114",
        ("Germany", "Munich"): "89.204",
        ("Germany", "Hamburg"): "87.128",
        ("Germany", "Frankfurt"): "217.110",
        ("Germany", "Cologne"): "188.174",
        ("Germany", "Stuttgart"): "212.185",
        ("China", "Shenzhen"): "183.60",
        ("China", "Shanghai"): "101.226",
        ("China", "Guangzhou"): "113.108",
        ("United States", "New York"): "207.241",
        ("United States", "Los Angeles"): "198.145",
        ("Netherlands", "Amsterdam"): "145.131",
        ("Austria", "Vienna"): "193.81",
        ("Switzerland", "Zurich"): "195.176",
        ("France", "Paris"): "176.149",
        ("United Kingdom", "London"): "82.132",
        ("Poland", "Warsaw"): "83.238",
        ("Turkey", "Istanbul"): "78.188",
        ("United Arab Emirates", "Dubai"): "5.36",
    }
    
    for i in range(50):
        country, city = random.choice(locations)
        prefix = ip_pools.get((country, city), "10.0")
        fake_ip = f"{prefix}.{random.randint(1,254)}.{random.randint(1,254)}"
        ip_hash = hashlib.sha256(fake_ip.encode()).hexdigest()
        days_ago = random.randint(0, 30)
        entry = models.BITracking(
            ip_hash=ip_hash,
            ip_address=fake_ip,
            referral=random.choice(referrals),
            device_type=random.choice(devices),
            mapped_kst_interest=random.choice(kst_options),
            country=country,
            city=city,
            created_at=datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
        )
        db.add(entry)
    
    db.commit()
    return {"message": "50 demo BI events seeded successfully"}


@router.get("/dashboard")
def get_bi_dashboard_data(
    kst: int = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role == models.RoleEnum.MITARBEITER:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    query = db.query(models.BITracking)
    if kst:
        query = query.filter(models.BITracking.mapped_kst_interest == kst)
        
    results = query.order_by(models.BITracking.created_at.desc()).all()

    kst_counts = {}
    device_counts = {}
    referral_counts = {}
    daily_counts = {}
    country_counts = {}

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

    return {
        "total_hits": len(results),
        "kst_breakdown": [{"kst": k, "count": v} for k, v in sorted(kst_counts.items())],
        "device_breakdown": [{"device": k, "count": v} for k, v in sorted(device_counts.items(), key=lambda x: -x[1])],
        "referral_breakdown": [{"referral": k, "count": v} for k, v in sorted(referral_counts.items(), key=lambda x: -x[1])[:6]],
        "daily_trend": [{"date": k, "count": v} for k, v in sorted(daily_counts.items())[-14:]],
        "country_breakdown": [{"country": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: -x[1])[:10]],
        "raw_data": [
            {
                "id": r.id,
                "ip_address": r.ip_address or "—",
                "referral": r.referral,
                "device_type": r.device_type,
                "mapped_kst_interest": r.mapped_kst_interest,
                "country": r.country or "—",
                "city": r.city or "—",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results[:50]
        ]
    }
