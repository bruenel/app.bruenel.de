from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, date
import calendar
import uuid
import os

import models
import schemas
import database
from core.security import (
    get_current_user,
    get_effective_tier,
    ensure_employee_linked,
    get_password_hash,
)
from core.storage import create_presigned_download, LOCAL_STORAGE_ROOT
from core.audit import log_audit

router = APIRouter()


NO_OVERTIME_TYPES = ("Freelancer", "Subunternehmer", "Candidate")
DAILY_CREDIT_HOURS = 8.0  # Urlaub & Krankheit are credited with 8h per weekday


def _employee_weekly_hours(emp) -> float:
    """Contract hours per week (Wochenstunden) of an employee."""
    attrs = dict(emp.attributes or {})
    raw = attrs.get("weekly_hours")
    try:
        if raw not in (None, ""):
            return float(raw)
    except (TypeError, ValueError):
        pass
    if emp.employment_type == "Part-time":
        return 20.0
    return 40.0


def _contract_soll_hours(emp, y: int, m: int, today: Optional[date] = None) -> float:
    """
    Contractual target hours (Soll) of a month = weekly contract hours / 5 × number of weekdays
    (Mon-Fri) in the month. Weekdays before the contract start date and days in the future
    (current month) are not counted yet.
    """
    from datetime import timedelta
    today = today or date.today()
    weekly = _employee_weekly_hours(emp)
    if weekly <= 0:
        return 0.0
    first = date(y, m, 1)
    last = date(y, m, calendar.monthrange(y, m)[1])
    last = min(last, today) if (y, m) == (today.year, today.month) else last
    attrs = dict(emp.attributes or {})
    cs = attrs.get("contract_start_date")
    if cs:
        try:
            cs_d = date.fromisoformat(str(cs)[:10])
            if cs_d > first:
                first = cs_d
        except ValueError:
            pass
    if (y, m) > (today.year, today.month) or first > last:
        return 0.0
    weekdays = 0
    cur = first
    while cur <= last:
        if cur.weekday() < 5:
            weekdays += 1
        cur += timedelta(days=1)
    return round(weekdays * (weekly / 5.0), 2)


def _absence_credit_hours(leaves, sicks, start_d: date, end_d: date):
    """Returns (urlaub_hours, krankheit_hours) credited at 8h/weekday (4h for half-day leave)."""
    from datetime import timedelta
    urlaub = 0.0
    krank = 0.0
    for lv in leaves:
        if not lv.start_date or not lv.end_date or lv.status != "Approved":
            continue
        cur = max(lv.start_date, start_d)
        last = min(lv.end_date, end_d)
        while cur <= last:
            if cur.weekday() < 5:
                urlaub += DAILY_CREDIT_HOURS / 2 if lv.type == "Half-day" else DAILY_CREDIT_HOURS
            cur += timedelta(days=1)
    for sk in sicks:
        if not sk.start_date or not sk.end_date:
            continue
        cur = max(sk.start_date, start_d)
        last = min(sk.end_date, end_d)
        while cur <= last:
            if cur.weekday() < 5:
                krank += DAILY_CREDIT_HOURS
            cur += timedelta(days=1)
    return round(urlaub, 2), round(krank, 2)


import secrets
import string


def _generate_otp_code(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "BRN-" + "".join(secrets.choice(alphabet) for _ in range(length))


def serialize_employee(
    emp: models.Employee,
    db: Optional[Session] = None,
    include_sensitive: bool = True,
    include_pending_contracts: bool = True,
    include_employee_number: bool = True,
) -> dict:
    attrs = dict(emp.attributes or {})
    docs = []
    if db is not None and include_sensitive:
        doc_rows = (
            db.query(models.DocumentRecord)
            .filter(
                (models.DocumentRecord.reference_id == emp.id)
                | (models.DocumentRecord.employee_id == emp.id)
            )
            .order_by(models.DocumentRecord.created_at.desc())
            .all()
        )
        seen_doc_ids = set()
        for d in doc_rows:
            if d.id in seen_doc_ids:
                continue
            seen_doc_ids.add(d.id)
            meta = dict(d.metadata_json or {})
            is_pending_contract = (
                d.status == "Pending_Signature"
                or meta.get("visibility") == "admin_only"
                or meta.get("employee_visible") is False
            )
            if not include_pending_contracts and is_pending_contract:
                continue
            download_link = create_presigned_download(d.storage_key)
            docs.append({
                "id": d.id,
                "reference_type": d.reference_type,
                "category": meta.get("category") or d.reference_type,
                "doc_date": meta.get("doc_date") or (d.created_at.strftime("%Y-%m-%d") if d.created_at else None),
                "period_month": meta.get("period_month"),
                "period_year": meta.get("period_year"),
                "uploaded_by": meta.get("uploaded_by") or ("Mitarbeiter" if d.reference_type == "Krankmeldung" else "Management"),
                "file_name": d.file_name,
                "title": d.title or d.file_name,
                "mime_type": d.mime_type,
                "file_size": d.file_size or 0,
                "status": d.status or "Uploaded",
                "visibility": meta.get("visibility") or ("admin_only" if is_pending_contract else "employee_visible"),
                "employee_visible": not is_pending_contract,
                "is_hr_contract": bool(meta.get("is_hr_contract")),
                "contract_type": meta.get("contract_type"),
                "contract_status": meta.get("contract_status") or d.status or "Uploaded",
                "signed_at": meta.get("signed_at"),
                "conditions": meta.get("conditions") if include_pending_contracts else None,
                "html_content": meta.get("html_content") if include_pending_contracts else None,
                "url": download_link,
                "download_url": download_link,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            })

    must_change_pw = False
    if db is not None and emp.email:
        u = db.query(models.User).filter(models.User.email == emp.email).first()
        if u:
            must_change_pw = bool(getattr(u, "must_change_password", False))

    assigned_project_id = attrs.get("assigned_project_id") or None
    assigned_project_name = attrs.get("assigned_project_name") or None
    if db is not None and assigned_project_id and not assigned_project_name:
        prj = db.query(models.Project).filter(models.Project.id == assigned_project_id).first()
        if prj:
            assigned_project_name = prj.name

    return {
        "id": emp.id,
        "employee_number": emp.employee_number if include_employee_number else None,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "full_name": f"{emp.first_name} {emp.last_name}",
        "email": emp.email,
        "phone": emp.phone,
        "department": emp.department,
        "employment_type": emp.employment_type,
        "role": emp.role,
        "role_tier": emp.role_tier,
        "base_salary": float(emp.base_salary or 0) if include_sensitive else 0.0,
        "hourly_rate": float(emp.hourly_rate or 0) if include_sensitive else 0.0,
        "annual_leave_days": emp.annual_leave_days,
        "is_active": emp.is_active,
        "must_change_password": must_change_pw,
        "assigned_project_id": assigned_project_id,
        "assigned_project_name": assigned_project_name,
        "attributes": attrs if include_sensitive else {},
        "documents": docs,
        "created_at": emp.created_at.isoformat() if emp.created_at else None,
    }


@router.get("/employees")
def list_employees(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    is_hr_mgmt = tier in (1, 2, 3)
    query = db.query(models.Employee)
    emps = query.order_by(models.Employee.employee_number.asc()).all()
    results = []
    for e in emps:
        include_sens = is_hr_mgmt or (e.id == current_user.employee_id)
        item = serialize_employee(
            e,
            db=db,
            include_sensitive=include_sens,
            include_pending_contracts=is_hr_mgmt,
            include_employee_number=is_hr_mgmt,
        )
        results.append(item)
    return results


@router.post("/employees")
def create_employee(
    payload: schemas.EmployeeCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR & Finance Admin can create employees.")

    clean_email = (payload.email or "").strip()
    if clean_email:
        existing_emp = (
            db.query(models.Employee)
            .filter(models.Employee.email.ilike(clean_email))
            .first()
        )
        if existing_emp:
            raise HTTPException(
                status_code=400,
                detail=f"Ein Mitarbeiter mit der E-Mail '{clean_email}' existiert bereits ({existing_emp.first_name} {existing_emp.last_name}). Bitte öffnen Sie dessen Personalakte zur Bearbeitung.",
            )

    emp_num = payload.employee_number or f"BRN-{1000 + db.query(models.Employee).count() + 1}"
    if db.query(models.Employee).filter(models.Employee.employee_number == emp_num).first():
        emp_num = f"{emp_num}-{int(datetime.utcnow().timestamp()) % 100}"

    otp_plain = (payload.one_time_password or "").strip() or _generate_otp_code(8)
    attrs = dict(payload.attributes or {})
    attrs["last_generated_otp"] = otp_plain
    attrs["must_change_password"] = True

    emp = models.Employee(
        id=str(uuid.uuid4()),
        employee_number=emp_num,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=clean_email,
        phone=payload.phone,
        department=payload.department or "Field Operations",
        employment_type=payload.employment_type,
        role=payload.role,
        role_tier=payload.role_tier,
        base_salary=payload.base_salary or 0.0,
        hourly_rate=payload.hourly_rate or 0.0,
        annual_leave_days=payload.annual_leave_days or 30,
        attributes=attrs,
    )
    try:
        db.add(emp)
        db.commit()
        db.refresh(emp)
    except Exception as e:
        db.rollback()
        err_msg = str(e)
        if "unique constraint" in err_msg.lower() or "duplicate key" in err_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"Ein Mitarbeiter mit diesen Daten (E-Mail '{clean_email}' oder Nummer '{emp_num}') existiert bereits.",
            )
        raise HTTPException(status_code=500, detail=f"Fehler beim Speichern der Personalakte: {err_msg}")

    # Auto-create or link a User login account with One-Time Password (OTP) and must_change_password=True
    if payload.email:
        existing_u = db.query(models.User).filter(models.User.email == payload.email).first()
        if not existing_u:
            role_enum = models.RoleEnum.MITARBEITER
            if payload.role_tier == 1:
                role_enum = models.RoleEnum.SUPER_ADMIN
            elif payload.role_tier == 2:
                role_enum = models.RoleEnum.PROJECT_MANAGER
            elif payload.role_tier == 3:
                role_enum = models.RoleEnum.HR_FINANCE
            elif payload.role_tier == 4:
                role_enum = models.RoleEnum.TEAM_LEAD
            else:
                role_enum = models.RoleEnum.FIELD_EMPLOYEE

            new_u = models.User(
                email=payload.email,
                hashed_password=get_password_hash(otp_plain),
                role=role_enum,
                role_tier=payload.role_tier,
                employee_id=emp.id,
                can_access_app=(payload.role_tier <= 3),
                can_access_portal=True,
                must_change_password=True,
            )
            db.add(new_u)
            db.commit()
        else:
            existing_u.employee_id = emp.id
            existing_u.hashed_password = get_password_hash(otp_plain)
            existing_u.must_change_password = True
            db.commit()

    log_audit(db, "employees", "INSERT", emp.id, current_user.email, None, {"employee_number": emp.employee_number})
    res = serialize_employee(emp, db=db, include_sensitive=True)
    res["generated_otp"] = otp_plain
    return res


@router.put("/employees/{emp_id}")
@router.patch("/employees/{emp_id}")
def update_employee(
    emp_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Unauthorized to edit employee profiles")

    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if "email" in payload and payload["email"]:
        clean_email = payload["email"].strip()
        existing_other = (
            db.query(models.Employee)
            .filter(models.Employee.email.ilike(clean_email), models.Employee.id != emp_id)
            .first()
        )
        if existing_other:
            raise HTTPException(
                status_code=400,
                detail=f"Die E-Mail '{clean_email}' wird bereits von einem anderen Mitarbeiter verwendet ({existing_other.first_name} {existing_other.last_name}).",
            )

    if "employee_number" in payload and payload["employee_number"] is not None:
        clean_emp_num = str(payload["employee_number"]).strip()
        if clean_emp_num:
            existing_num = (
                db.query(models.Employee)
                .filter(models.Employee.employee_number == clean_emp_num, models.Employee.id != emp_id)
                .first()
            )
            if existing_num:
                raise HTTPException(
                    status_code=400,
                    detail=f"Die Personalnummer '{clean_emp_num}' wird bereits von einem anderen Mitarbeiter verwendet ({existing_num.first_name} {existing_num.last_name}).",
                )
            emp.employee_number = clean_emp_num

    old_vals = serialize_employee(emp, db=None, include_sensitive=True)
    for field in [
        "first_name", "last_name", "email", "phone", "department",
        "employment_type", "role", "role_tier", "base_salary",
        "hourly_rate", "annual_leave_days", "is_active"
    ]:
        if field in payload and payload[field] is not None:
            setattr(emp, field, payload[field])

    if "attributes" in payload and isinstance(payload["attributes"], dict):
        merged_attrs = dict(emp.attributes or {})
        merged_attrs.update(payload["attributes"])
        if "assigned_project_id" in payload:
            merged_attrs["assigned_project_id"] = payload["assigned_project_id"]
        emp.attributes = merged_attrs
    elif "assigned_project_id" in payload:
        merged_attrs = dict(emp.attributes or {})
        merged_attrs["assigned_project_id"] = payload["assigned_project_id"]
        emp.attributes = merged_attrs

    custom_otp_in_payload = (payload.get("one_time_password") or "").strip()

    # Sync linked User email/tier/active/password if changed, or create User if converted from Candidate to Employee/Freelancer/Subunternehmer
    u = db.query(models.User).filter(models.User.employee_id == emp.id).first()
    if not u and emp.email:
        u = db.query(models.User).filter(models.User.email.ilike(emp.email.strip())).first()
    if u:
        u.employee_id = emp.id
        if emp.email and u.email != emp.email:
            u.email = emp.email
        if emp.role_tier:
            u.role_tier = emp.role_tier
        if emp.is_active is False:
            u.can_access_portal = False
            u.can_access_app = False
        else:
            u.can_access_portal = True
            u.can_access_app = ((emp.role_tier or 5) <= 3)
        if custom_otp_in_payload and custom_otp_in_payload != (old_vals.get("attributes") or {}).get("last_generated_otp"):
            u.hashed_password = get_password_hash(custom_otp_in_payload)
            u.must_change_password = True
            merged_attrs = dict(emp.attributes or {})
            merged_attrs["last_generated_otp"] = custom_otp_in_payload
            merged_attrs["must_change_password"] = True
            emp.attributes = merged_attrs
    elif emp.email and emp.employment_type and emp.employment_type != "Candidate":
        otp_plain = custom_otp_in_payload or _generate_otp_code(8)
        merged_attrs = dict(emp.attributes or {})
        merged_attrs["last_generated_otp"] = otp_plain
        merged_attrs["must_change_password"] = True
        emp.attributes = merged_attrs
        new_u = models.User(
            email=emp.email,
            hashed_password=get_password_hash(otp_plain),
            role=models.RoleEnum.FIELD_EMPLOYEE if (emp.role_tier or 5) == 5 else models.RoleEnum.MITARBEITER,
            role_tier=emp.role_tier or 5,
            employee_id=emp.id,
            can_access_app=(emp.is_active is not False and (emp.role_tier or 5) <= 3),
            can_access_portal=(emp.is_active is not False),
            must_change_password=True,
        )
        db.add(new_u)

    try:
        db.commit()
        db.refresh(emp)
    except Exception as e:
        db.rollback()
        err_msg = str(e)
        if "unique constraint" in err_msg.lower() or "duplicate key" in err_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="Ein Mitarbeiter mit dieser E-Mail-Adresse existiert bereits.",
            )
        raise HTTPException(status_code=500, detail=f"Fehler beim Aktualisieren der Personalakte: {err_msg}")
    log_audit(db, "employees", "UPDATE", emp.id, current_user.email, old_vals, serialize_employee(emp, db=None, include_sensitive=True))
    return serialize_employee(emp, db=db, include_sensitive=True)


@router.post("/ai/read-document")
async def ai_read_document_backend(
    payload: dict,
    current_user: models.User = Depends(get_current_user),
):
    """
    Parses an identity or HR document via Google Gemini Vision.
    Extracts structured fields (first_name, last_name, birth_date, nationality, street, etc.).
    Uses GEMINI_API_KEY from environment variables.
    """
    import urllib.request
    import json

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY is not configured on the server environment. Please set GEMINI_API_KEY.",
        )

    mime_type = payload.get("mime_type") or "image/jpeg"
    b64_data = payload.get("data")
    if not b64_data:
        raise HTTPException(status_code=400, detail="Missing image data")

    prompt = """You are an expert German & EU HR document parser. Analyze the uploaded document thoroughly (it may be a Personalausweis front/back, Reisepass, Aufenthaltstitel, Meldebestätigung, Führerschein, Krankenkassenkarte/eGK, Sozialversicherungsausweis, Steuer-ID Schreiben, Bankkarte/Kontoauszug, Lebenslauf/CV, Arbeitsvertrag, Lohnabrechnung, Gewerbeanmeldung, §48b Freistellungsbescheinigung, or any other HR/ID document).
Read ALL visible text, tables, headers, and Machine-Readable Zones (MRZ lines at the bottom of IDs/passports).
Convert all dates from DD.MM.YYYY or DD.MM.YY to YYYY-MM-DD format.
Return ONLY a valid JSON object with these exact keys (empty string "" if not present, do not guess):
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "phone": "",
  "birth_date": "YYYY-MM-DD",
  "nationality": "",
  "gender": "",
  "street": "",
  "postal_code": "",
  "city": "",
  "steuer_id": "",
  "sozialversicherungsnummer": "",
  "krankenversicherung_name": "",
  "krankenversicherung_nummer": "",
  "drivers_license": "",
  "document_type": "",
  "document_number": "",
  "document_valid_until": "YYYY-MM-DD",
  "company_name": "",
  "ust_id": "",
  "steuernummer": "",
  "iban": "",
  "bic": "",
  "bank_name": "",
  "role": "",
  "notes": ""
}"""

    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash"]
    last_err = None

    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        gen_cfg = {"temperature": 0, "responseMimeType": "application/json"}
        if "2.5" in model_name:
            gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}
        body = json.dumps({
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": b64_data}}
                ]
            }],
            "generationConfig": gen_cfg,
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                raw_text = resp_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                cleaned = raw_text.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                try:
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, list) and parsed:
                        parsed = parsed[0]
                    fields = parsed if isinstance(parsed, dict) else {}
                except Exception:
                    fields = {}
                return {"fields": fields, "model": model_name}
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode('utf-8')[:200]}"
        except Exception as e:
            last_err = str(e)

    raise HTTPException(status_code=502, detail=f"Gemini API request failed: {last_err}")


@router.post("/candidates/upload-cv")
async def upload_candidate_cv_public(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    """Public endpoint allowing candidates in the 4-page IT Project Registration Wizard to upload their CV."""
    os.makedirs(LOCAL_STORAGE_ROOT, exist_ok=True)
    safe_name = (file.filename or "candidate_cv.pdf").replace("/", "_").replace("\\", "_")
    doc_id = str(uuid.uuid4())
    storage_key = f"candidates/cv_{doc_id}_{safe_name}"
    full_path = os.path.join(LOCAL_STORAGE_ROOT, storage_key)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    content = await file.read()
    with open(full_path, "wb") as f:
        f.write(content)

    doc = models.DocumentRecord(
        id=doc_id,
        reference_type="CV",
        reference_id="pending-candidate",
        title=f"CV / Lebenslauf: {safe_name}",
        file_name=safe_name,
        mime_type=file.content_type or "application/pdf",
        file_size=len(content),
        storage_key=storage_key,
    )
    db.add(doc)
    db.commit()
    return {
        "document_id": doc.id,
        "file_name": safe_name,
        "download_url": create_presigned_download(storage_key),
    }


@router.post("/candidates/register")
def register_it_project_candidate_public(
    payload: dict,
    db: Session = Depends(database.get_db),
):
    """
    Public 4-Page IT Project Candidate Registration endpoint.
    Stores the candidate directly in the HR database with employment_type='Candidate'
    so HR/Management can inspect their full profile, CV, project interests, and DSGVO consent,
    and later convert them to Employee, Freelancer, or Subunternehmer.
    """
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    email = (payload.get("email") or "").strip()
    if not first_name or not last_name or not email:
        raise HTTPException(status_code=400, detail="First name, last name, and email are required.")

    if not payload.get("dsgvo_accepted") or not payload.get("datenschutz_accepted"):
        raise HTTPException(status_code=400, detail="DSGVO and Datenschutzerklärung consent must be accepted.")

    cand_count = db.query(models.Employee).filter(models.Employee.employment_type == "Candidate").count()
    emp_num = f"BRN-CAND-{cand_count + 1:02d}"
    if db.query(models.Employee).filter(models.Employee.employee_number == emp_num).first():
        emp_num = f"BRN-CAND-{int(datetime.utcnow().timestamp()) % 1000}"

    emp_id = str(uuid.uuid4())
    preferred_model = payload.get("preferred_contract_model") or "Freelancer"
    gehaltsvorstellung = float(payload.get("gehaltsvorstellung") or payload.get("salary_expectation") or 0.0)
    tagessatz = float(payload.get("expected_daily_rate") or payload.get("tagessatz") or 0.0) if preferred_model != "Full-time" else 0.0
    stundensatz = float(payload.get("expected_hourly_rate") or payload.get("stundensatz") or (round(tagessatz / 8.0, 2) if tagessatz > 0 else 0.0)) if preferred_model != "Full-time" else 0.0
    role_title = payload.get("current_position") or payload.get("role") or "IT & Fiber Project Specialist"

    attrs = {
        "registration_status": "Bewerber / Kandidat (IT-Projekte Pool)",
        "candidate_registered_at": datetime.utcnow().isoformat(),
        "birth_date": payload.get("birth_date") or "",
        "nationality": payload.get("nationality") or "",
        "street": payload.get("street") or "",
        "postal_code": payload.get("postal_code") or "",
        "city": payload.get("city") or payload.get("location") or "",
        "location": payload.get("location") or payload.get("city") or "",
        "experience_years": payload.get("experience_years") or "",
        "current_position": role_title,
        "experience_summary": payload.get("experience_summary") or payload.get("work_history_summary") or "",
        "skills": payload.get("skills") or "",
        "linkedin_or_portfolio": payload.get("linkedin_or_portfolio") or payload.get("linkedin_url") or "",
        "interested_projects": payload.get("interested_projects") or [],
        "preferred_contract_model": preferred_model,
        "willing_to_travel": payload.get("willing_to_travel") or payload.get("remote_preference") or "Hybrid (Vor Ort & Remote)",
        "availability_date": payload.get("availability_date") or "",
        "tagessatz": tagessatz,
        "stundensatz": stundensatz,
        "gehaltsvorstellung": gehaltsvorstellung,
        "dsgvo_accepted": bool(payload.get("dsgvo_accepted")),
        "datenschutz_accepted": bool(payload.get("datenschutz_accepted")),
        "talent_pool_consent": bool(payload.get("talent_pool_consent", payload.get("talent_pool_accepted", True))),
        "dsgvo_accepted_at": datetime.utcnow().isoformat(),
        "cv_document_id": payload.get("cv_document_id") or None,
        "cv_file_name": payload.get("cv_file_name") or "",
        "cv_file_url": payload.get("cv_file_url") or "",
    }

    cand = models.Employee(
        id=emp_id,
        employee_number=emp_num,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=payload.get("phone") or "",
        department=payload.get("desired_department") or payload.get("department") or "IT & Cloud Infrastructure",
        employment_type="Candidate",
        role=role_title,
        role_tier=5,
        base_salary=gehaltsvorstellung if preferred_model == "Full-time" else 0.0,
        hourly_rate=stundensatz,
        annual_leave_days=0,
        is_active=True,
        attributes=attrs,
    )
    db.add(cand)
    db.flush()

    cv_doc_id = payload.get("cv_document_id")
    if cv_doc_id:
        doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == cv_doc_id).first()
        if doc:
            doc.reference_id = emp_id
            doc.title = f"CV / Lebenslauf — {first_name} {last_name}"

    db.commit()
    db.refresh(cand)
    log_audit(db, "employees", "CANDIDATE_REGISTER", cand.id, email, None, {"employee_number": cand.employee_number})
    serialized = serialize_employee(cand, db=db, include_sensitive=True)
    return {"status": "ok", "candidate": serialized, **serialized}


@router.post("/employees/{emp_id}/reset-otp")
def reset_employee_one_time_password(
    emp_id: str,
    payload: Optional[dict] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can reset employee passwords.")

    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    custom_otp = (payload or {}).get("one_time_password")
    otp_plain = str(custom_otp).strip() if custom_otp else _generate_otp_code(8)

    u = db.query(models.User).filter(models.User.employee_id == emp.id).first()
    if not u and emp.email:
        u = db.query(models.User).filter(models.User.email == emp.email).first()

    if not u:
        if not emp.email:
            raise HTTPException(status_code=400, detail="Employee has no email address configured for login.")
        u = models.User(
            email=emp.email,
            hashed_password=get_password_hash(otp_plain),
            role=models.RoleEnum.FIELD_EMPLOYEE if emp.role_tier == 5 else models.RoleEnum.MITARBEITER,
            role_tier=emp.role_tier or 5,
            employee_id=emp.id,
            can_access_app=((emp.role_tier or 5) <= 4),
            can_access_portal=True,
            must_change_password=True,
        )
        db.add(u)
    else:
        u.employee_id = emp.id
        u.hashed_password = get_password_hash(otp_plain)
        u.must_change_password = True

    attrs = dict(emp.attributes or {})
    attrs["last_generated_otp"] = otp_plain
    attrs["must_change_password"] = True
    emp.attributes = attrs

    db.commit()
    log_audit(db, "users", "RESET_OTP", emp.id, current_user.email, None, {"email": emp.email})
    return {
        "employee_id": emp.id,
        "email": emp.email,
        "one_time_password": otp_plain,
        "must_change_password": True,
        "message": "One-time password generated. Employee will be required to set a new password upon next login.",
    }


@router.delete("/employees/{emp_id}")
def delete_employee_record(
    emp_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can delete employee profiles.")

    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    emp_email = emp.email
    # Clean up dependent records
    emp_log_ids = [r.id for r in db.query(models.TimeLog.id).filter(models.TimeLog.employee_id == emp_id).all()]
    if emp_log_ids:
        db.query(models.TimeLogTeam).filter(models.TimeLogTeam.time_log_id.in_(emp_log_ids)).delete(synchronize_session=False)
        db.query(models.TimeLogVehicle).filter(models.TimeLogVehicle.time_log_id.in_(emp_log_ids)).delete(synchronize_session=False)
        db.query(models.TimeLogTool).filter(models.TimeLogTool.time_log_id.in_(emp_log_ids)).delete(synchronize_session=False)
    db.query(models.TimeLogTeam).filter(models.TimeLogTeam.team_member_id == emp_id).delete(synchronize_session=False)
    db.query(models.TimeLog).filter(models.TimeLog.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.LeaveRequest).filter(models.LeaveRequest.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.SicknessRecord).filter(models.SicknessRecord.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.Payslip).filter(models.Payslip.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.DocumentRecord).filter(
        (models.DocumentRecord.employee_id == emp_id) | (models.DocumentRecord.reference_id == emp_id)
    ).delete(synchronize_session=False)
    db.query(models.Assignment).filter(models.Assignment.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.Expense).filter(models.Expense.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.MaterialTransaction).filter(models.MaterialTransaction.employee_id == emp_id).delete(synchronize_session=False)
    db.query(models.Equipment).filter(models.Equipment.assigned_employee_id == emp_id).update({"assigned_employee_id": None}, synchronize_session=False)
    db.query(models.Vehicle).filter(models.Vehicle.assigned_team_lead_id == emp_id).update({"assigned_team_lead_id": None}, synchronize_session=False)

    # Delete linked user account unless it is the current logged-in Owner
    linked_users = db.query(models.User).filter(
        (models.User.employee_id == emp_id) | (models.User.email == emp_email if emp_email else False)
    ).all()
    for u in linked_users:
        if u.id == current_user.id or u.role == models.RoleEnum.OWNER:
            u.employee_id = None
        else:
            db.delete(u)

    db.delete(emp)
    db.commit()
    log_audit(db, "employees", "DELETE", emp_id, current_user.email, {"email": emp_email}, None)
    return {"status": "deleted", "id": emp_id}


# ==============================================================================
# SMART CHECK-IN & CHECK-OUT (WORKING HOURS)
# ==============================================================================

@router.get("/time-logs")
def list_time_logs(
    employee_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier == 5 and not current_user.employee_id:
        ensure_employee_linked(db, current_user)

    emp_map = {e.id: f"{e.first_name} {e.last_name}".strip() for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}
    tool_map = {t.id: f"{t.name} ({t.serial_number})" for t in db.query(models.Equipment).all()}

    query = db.query(models.TimeLog)
    if tier not in (1, 2, 3):
        if not current_user.employee_id:
            return []
        query = query.filter(models.TimeLog.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(models.TimeLog.employee_id == employee_id)

    logs = query.order_by(models.TimeLog.date.desc(), models.TimeLog.check_in_time.desc()).limit(250).all()
    results = []
    for l in logs:
        team_ids = [t.team_member_id for t in db.query(models.TimeLogTeam).filter(models.TimeLogTeam.time_log_id == l.id).all()]
        veh_ids = [v.vehicle_id for v in db.query(models.TimeLogVehicle).filter(models.TimeLogVehicle.time_log_id == l.id).all()]
        tool_ids = [t.equipment_id for t in db.query(models.TimeLogTool).filter(models.TimeLogTool.time_log_id == l.id).all()]
        ci_data = l.check_in_data if isinstance(l.check_in_data, dict) else {}
        resolved_proj_name = proj_map.get(l.project_id) or ci_data.get("project_name") or "Allgemein / Projekt"

        results.append({
            "id": l.id,
            "employee_id": l.employee_id,
            "employee_name": emp_map.get(l.employee_id, "Mitarbeiter"),
            "project_id": l.project_id,
            "project_name": resolved_proj_name,
            "object_id": l.object_id,
            "date": l.date.isoformat() if l.date else None,
            "check_in_time": l.check_in_time.isoformat() if l.check_in_time else None,
            "check_out_time": l.check_out_time.isoformat() if l.check_out_time else None,
            "pause_start_time": l.pause_start_time.isoformat() if getattr(l, "pause_start_time", None) else None,
            "break_minutes": l.break_minutes or 0,
            "total_hours": float(l.total_hours) if l.total_hours is not None else None,
            "status": l.status,
            "notes": ci_data.get("notes") or "",
            "is_locked_for_employee": l.status == "Approved",
            "approved_by": getattr(l, "approved_by", None),
            "approved_by_name": emp_map.get(getattr(l, "approved_by", None), None),
            "approved_at": l.approved_at.isoformat() if getattr(l, "approved_at", None) else None,
            "team_members": [{"id": tid, "name": emp_map.get(tid, tid)} for tid in team_ids],
            "vehicles": [{"id": vid, "plate": veh_map.get(vid, vid)} for vid in veh_ids],
            "tools": [{"id": eid, "name": tool_map.get(eid, eid)} for eid in tool_ids],
            "check_in_data": ci_data,
            "check_out_data": l.check_out_data or {},
        })
    return results


@router.post("/checkin")
def smart_check_in(
    payload: schemas.SmartCheckInRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")

    # Check if employee already has an active open check-in
    active_log = db.query(models.TimeLog).filter(
        models.TimeLog.employee_id == emp.id,
        models.TimeLog.check_out_time == None
    ).first()
    if active_log:
        raise HTTPException(status_code=400, detail="You already have an active check-in session. Please check out first.")

    now = datetime.utcnow()
    log_id = str(uuid.uuid4())
    new_log = models.TimeLog(
        id=log_id,
        employee_id=emp.id,
        project_id=payload.project_id,
        object_id=payload.object_id,
        date=now.date(),
        check_in_time=now,
        status="Active",
        check_in_data={
            "notes": payload.notes,
            "gps_location": payload.gps_location or "50.2288° N, 8.7667° E (Karben / Field)",
            "vehicle_ids": payload.vehicle_ids,
            "equipment_ids": payload.equipment_ids,
            "team_member_ids": payload.team_member_ids,
        },
    )
    db.add(new_log)
    db.flush()

    for tid in set(payload.team_member_ids):
        if tid:
            db.add(models.TimeLogTeam(time_log_id=log_id, team_member_id=tid))

    for vid in set(payload.vehicle_ids):
        if vid:
            db.add(models.TimeLogVehicle(time_log_id=log_id, vehicle_id=vid))

    for eid in set(payload.equipment_ids):
        if eid:
            db.add(models.TimeLogTool(time_log_id=log_id, equipment_id=eid))
            # Enforce exclusive assignment to employee during active shift
            eq = db.query(models.Equipment).filter(models.Equipment.id == eid).first()
            if eq:
                eq.assigned_vehicle_id = None
                eq.assigned_employee_id = emp.id

    db.commit()
    db.refresh(new_log)
    return {"status": "checked_in", "time_log_id": new_log.id, "check_in_time": new_log.check_in_time.isoformat()}


@router.post("/pause-start")
def start_pause_break(
    payload: Optional[dict] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    active_log = db.query(models.TimeLog).filter(
        models.TimeLog.employee_id == emp.id,
        models.TimeLog.check_out_time == None
    ).order_by(models.TimeLog.check_in_time.desc()).first()

    if not active_log:
        raise HTTPException(status_code=404, detail="No active check-in session found to start a break.")
    if active_log.pause_start_time is not None:
        raise HTTPException(status_code=400, detail="Break is already active.")

    now = datetime.utcnow()
    active_log.pause_start_time = now
    active_log.status = "Paused"
    db.commit()
    return {
        "status": "paused",
        "time_log_id": active_log.id,
        "pause_start_time": now.isoformat(),
        "break_minutes": active_log.break_minutes or 0,
    }


@router.post("/pause-end")
def end_pause_break(
    payload: Optional[dict] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    active_log = db.query(models.TimeLog).filter(
        models.TimeLog.employee_id == emp.id,
        models.TimeLog.check_out_time == None
    ).order_by(models.TimeLog.check_in_time.desc()).first()

    if not active_log:
        raise HTTPException(status_code=404, detail="No active check-in session found.")
    if not active_log.pause_start_time:
        raise HTTPException(status_code=400, detail="No active break is running.")

    now = datetime.utcnow()
    elapsed_mins = max(int(round((now - active_log.pause_start_time).total_seconds() / 60.0)), 1)
    active_log.break_minutes = (active_log.break_minutes or 0) + elapsed_mins
    active_log.pause_start_time = None
    active_log.status = "Active"
    db.commit()
    return {
        "status": "resumed",
        "time_log_id": active_log.id,
        "added_break_minutes": elapsed_mins,
        "total_break_minutes": active_log.break_minutes,
    }


@router.post("/checkout")
def smart_check_out(
    payload: schemas.SmartCheckOutRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    query = db.query(models.TimeLog).filter(models.TimeLog.check_out_time == None)
    if payload.time_log_id:
        time_log = query.filter(models.TimeLog.id == payload.time_log_id).first()
    else:
        time_log = query.filter(models.TimeLog.employee_id == emp.id).order_by(models.TimeLog.check_in_time.desc()).first()

    if not time_log:
        raise HTTPException(status_code=404, detail="No active check-in session found to check out.")

    now = datetime.utcnow()
    # If employee was still on a pause when checking out, finalize the pause
    accumulated_break = time_log.break_minutes or 0
    if time_log.pause_start_time:
        extra_mins = max(int(round((now - time_log.pause_start_time).total_seconds() / 60.0)), 1)
        accumulated_break += extra_mins
        time_log.pause_start_time = None

    final_break_mins = payload.break_minutes if (payload.break_minutes is not None and payload.break_minutes >= 0 and accumulated_break == 0) else max(accumulated_break, payload.break_minutes or 0)
    duration_sec = max((now - time_log.check_in_time).total_seconds(), 60)
    break_sec = max(final_break_mins * 60, 0)
    net_hours = round(max((duration_sec - break_sec) / 3600.0, 0.1), 2)

    time_log.check_out_time = now
    time_log.break_minutes = final_break_mins
    time_log.total_hours = net_hours
    time_log.status = "Completed"
    time_log.check_out_data = {
        "notes": payload.notes,
        "tool_confirmations": payload.tool_confirmations,
        "materials_consumed": payload.materials_consumed,
    }

    # Process optional material consumption/Schwund reported at check-out
    for mat_entry in (payload.materials_consumed or []):
        mat_id = mat_entry.get("material_id")
        qty = int(mat_entry.get("quantity") or 0)
        tx_type = mat_entry.get("transaction_type", "Consume")
        lager_type = mat_entry.get("source_lager_type", "Vehicle")
        lager_id = mat_entry.get("source_lager_id")
        note = mat_entry.get("note", "Checkout reconciliation")
        if mat_id and qty != 0 and lager_id:
            signed_qty = -abs(qty) if tx_type in ("Consume", "Schwund", "CheckOut") else abs(qty)
            db.add(models.MaterialTransaction(
                id=str(uuid.uuid4()),
                material_id=mat_id,
                employee_id=emp.id,
                project_id=time_log.project_id,
                object_id=time_log.object_id,
                source_lager_type=lager_type,
                source_lager_id=lager_id,
                transaction_type=tx_type,
                quantity=signed_qty,
                note=note,
            ))

    db.commit()
    return {
        "status": "checked_out",
        "time_log_id": time_log.id,
        "check_out_time": now.isoformat(),
        "break_minutes": final_break_mins,
        "total_hours": net_hours,
    }


def _parse_iso_dt(val, fallback_date: date) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    s = str(val).strip()
    # Support "HH:MM" combined with fallback_date or full ISO string
    if len(s) <= 8 and ":" in s:
        parts = s.split(":")
        h = int(parts[0])
        m = int(parts[1])
        return datetime(fallback_date.year, fallback_date.month, fallback_date.day, h, m, 0)
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except Exception:
        return None


@router.post("/time-logs/manual")
def create_manual_time_log(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    from datetime import timedelta

    tier = get_effective_tier(current_user)
    if tier == 5:
        emp = ensure_employee_linked(db, current_user)
        if not emp:
            raise HTTPException(status_code=400, detail="Kein Mitarbeiterprofil mit diesem Konto verknüpft.")
        target_emp_id = emp.id
    else:
        target_emp_id = payload.get("employee_id") or current_user.employee_id
        if not target_emp_id:
            emp = ensure_employee_linked(db, current_user)
            target_emp_id = emp.id if emp else None
        if not target_emp_id:
            first_emp = db.query(models.Employee).order_by(models.Employee.created_at.asc()).first()
            target_emp_id = first_emp.id if first_emp else None
        if not target_emp_id:
            raise HTTPException(status_code=400, detail="Bitte wählen Sie einen Mitarbeiter aus.")

    raw_date = str(payload.get("date") or date.today().isoformat())[:10]
    ref_date = date.fromisoformat(raw_date)
    start_str = payload.get("check_in_time") or "08:00"
    end_str = payload.get("check_out_time") or "16:30"
    break_mins = max(int(payload.get("break_minutes") or 0), 0)

    dt_in = _parse_iso_dt(start_str, ref_date) or datetime(ref_date.year, ref_date.month, ref_date.day, 8, 0, 0)
    dt_out = _parse_iso_dt(end_str, ref_date) or datetime(ref_date.year, ref_date.month, ref_date.day, 16, 30, 0)
    if dt_out < dt_in:
        dt_out = dt_out + timedelta(days=1)

    dur_sec = max((dt_out - dt_in).total_seconds(), 0)
    net_hours = round(max((dur_sec - break_mins * 60) / 3600.0, 0.05), 2)

    status_val = "Completed"
    approved_by = None
    approved_at = None
    if tier <= 4 and payload.get("status") == "Approved":
        status_val = "Approved"
        approved_by = current_user.employee_id
        approved_at = datetime.utcnow()

    proj_id = payload.get("project_id") or None
    proj_name = payload.get("project_name") or ""
    if proj_id and not proj_name:
        p_obj = db.query(models.Project).filter(models.Project.id == proj_id).first()
        if p_obj:
            proj_name = p_obj.name

    tl = models.TimeLog(
        id=str(uuid.uuid4()),
        employee_id=target_emp_id,
        project_id=proj_id,
        object_id=payload.get("object_id") or None,
        date=ref_date,
        check_in_time=dt_in,
        check_out_time=dt_out,
        break_minutes=break_mins,
        total_hours=net_hours,
        status=status_val,
        approved_by=approved_by,
        approved_at=approved_at,
        check_in_data={
            "project_name": proj_name or "Allgemein / Projekt",
            "notes": payload.get("notes") or "Manueller Zeiteintrag",
        },
    )
    db.add(tl)
    db.commit()
    db.refresh(tl)
    log_audit(db, "time_logs", "MANUAL_INSERT", tl.id, current_user.email, None, {"employee_id": target_emp_id, "date": raw_date, "total_hours": net_hours})
    return {
        "id": tl.id,
        "employee_id": tl.employee_id,
        "date": tl.date.isoformat(),
        "check_in_time": tl.check_in_time.isoformat(),
        "check_out_time": tl.check_out_time.isoformat(),
        "break_minutes": tl.break_minutes,
        "total_hours": float(tl.total_hours or 0),
        "status": tl.status,
    }


@router.delete("/time-logs/{log_id}")
def delete_time_log_entry(
    log_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    tl = db.query(models.TimeLog).filter(models.TimeLog.id == log_id).first()
    if not tl:
        raise HTTPException(status_code=404, detail="Time log not found")

    if tier == 5:
        if tl.employee_id != current_user.employee_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        if tl.status == "Approved":
            raise HTTPException(status_code=403, detail="Approved working hours cannot be deleted by employee.")

    db.query(models.TimeLogTeam).filter(models.TimeLogTeam.time_log_id == log_id).delete()
    db.query(models.TimeLogVehicle).filter(models.TimeLogVehicle.time_log_id == log_id).delete()
    db.query(models.TimeLogTool).filter(models.TimeLogTool.time_log_id == log_id).delete()
    db.delete(tl)
    db.commit()
    log_audit(db, "time_logs", "DELETE", log_id, current_user.email, None, None)
    return {"status": "deleted", "id": log_id}


@router.put("/time-logs/{log_id}")
@router.patch("/time-logs/{log_id}")
def update_time_log_hours(
    log_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    tl = db.query(models.TimeLog).filter(models.TimeLog.id == log_id).first()
    if not tl:
        raise HTTPException(status_code=404, detail="Time log not found")

    # Employees (Tier 5) can only edit their own logs AND only before Manager Approval
    if tier == 5:
        if tl.employee_id != current_user.employee_id:
            raise HTTPException(status_code=403, detail="Cannot edit another employee's time log")
        if tl.status == "Approved":
            raise HTTPException(
                status_code=403,
                detail="This working time entry has been approved by management and is locked against employee edits."
            )

    ref_date = tl.date or date.today()
    if "date" in payload and payload["date"]:
        ref_date = date.fromisoformat(str(payload["date"])[:10])
        tl.date = ref_date

    if "check_in_time" in payload and payload["check_in_time"]:
        parsed_in = _parse_iso_dt(payload["check_in_time"], ref_date)
        if parsed_in:
            tl.check_in_time = parsed_in

    if "check_out_time" in payload and payload["check_out_time"]:
        parsed_out = _parse_iso_dt(payload["check_out_time"], ref_date)
        if parsed_out:
            tl.check_out_time = parsed_out

    if "break_minutes" in payload and payload["break_minutes"] is not None:
        tl.break_minutes = max(int(payload["break_minutes"]), 0)

    if tier <= 4 and "project_id" in payload:
        tl.project_id = payload["project_id"] or None

    if "notes" in payload:
        ci = dict(tl.check_in_data or {})
        ci["notes"] = payload["notes"]
        tl.check_in_data = ci

    # Recalculate net hours if both check_in_time and check_out_time are set
    if tl.check_in_time and tl.check_out_time:
        from datetime import timedelta
        if tl.check_out_time < tl.check_in_time:
            tl.check_out_time = tl.check_out_time + timedelta(days=1)
        dur_sec = max((tl.check_out_time - tl.check_in_time).total_seconds(), 0)
        brk_sec = (tl.break_minutes or 0) * 60
        tl.total_hours = round(max((dur_sec - brk_sec) / 3600.0, 0.05), 2)
        if tl.status in ("Active", "Paused"):
            tl.status = "Completed"

    # Managers (Tier 1-4) can also change status directly
    if tier <= 4 and "status" in payload and payload["status"]:
        tl.status = payload["status"]
        if payload["status"] == "Approved":
            tl.approved_by = current_user.employee_id
            tl.approved_at = datetime.utcnow()

    db.commit()
    db.refresh(tl)
    return {
        "id": tl.id,
        "date": tl.date.isoformat() if tl.date else None,
        "check_in_time": tl.check_in_time.isoformat() if tl.check_in_time else None,
        "check_out_time": tl.check_out_time.isoformat() if tl.check_out_time else None,
        "break_minutes": tl.break_minutes or 0,
        "total_hours": float(tl.total_hours or 0),
        "status": tl.status,
        "is_locked_for_employee": tl.status == "Approved",
    }


@router.patch("/time-logs/{log_id}/approve")
@router.post("/time-logs/{log_id}/approve")
def approve_time_log(
    log_id: str,
    payload: Optional[dict] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier > 4:
        raise HTTPException(status_code=403, detail="Only Management, HR, or Project Managers can approve working hours.")

    tl = db.query(models.TimeLog).filter(models.TimeLog.id == log_id).first()
    if not tl:
        raise HTTPException(status_code=404, detail="Time log not found")

    tl.status = "Approved"
    tl.approved_by = current_user.employee_id
    tl.approved_at = datetime.utcnow()
    db.commit()
    log_audit(db, "time_logs", "APPROVE", tl.id, current_user.email, None, {"status": "Approved", "total_hours": float(tl.total_hours or 0)})
    return {
        "id": tl.id,
        "status": tl.status,
        "approved_by": tl.approved_by,
        "approved_at": tl.approved_at.isoformat(),
    }


@router.get("/time-logs/bi-summary")
def get_monthly_working_hours_bi_summary(
    year: Optional[int] = None,
    month: Optional[int] = None,
    employee_id: Optional[str] = None,
    include_absence_credits: Optional[bool] = False,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Comprehensive Monthly BI Working Hours Summary spanning from the 1st to the last day (30th/31st) of the month.
    - Employee Portal (Tier 5 / include_absence_credits=False): returns pure working hours summary only.
    - Management HR Portal (Tier <= 4 / include_absence_credits=True): also computes Urlaub & Krankheit days
      and credits +8.0h per day (4.0h for Half-day Urlaub) ONLY in the management HR view, plus per-employee matrix.
    """
    from datetime import timedelta

    tier = get_effective_tier(current_user)
    today = date.today()
    y = year or today.year
    m = month or today.month
    last_day = calendar.monthrange(y, m)[1]
    start_d = date(y, m, 1)
    end_d = date(y, m, last_day)

    # Strictly enforce that employees (Tier 5) only see their own pure working hours without HR 8h credits
    is_mgmt_hr_view = (tier <= 4) and bool(include_absence_credits)
    target_emp_id = current_user.employee_id if tier == 5 else employee_id

    query = db.query(models.TimeLog).filter(
        models.TimeLog.date >= start_d,
        models.TimeLog.date <= end_d,
    )
    if target_emp_id:
        query = query.filter(models.TimeLog.employee_id == target_emp_id)

    logs = query.all()
    daily_map = {
        d: {
            "day": d,
            "date": date(y, m, d).isoformat(),
            "hours": 0.0,
            "approved_hours": 0.0,
            "pending_hours": 0.0,
            "leave_hours": 0.0,
            "sick_hours": 0.0,
            "effective_hours": 0.0,
            "break_minutes": 0,
            "shifts_count": 0,
        }
        for d in range(1, last_day + 1)
    }

    total_hours = 0.0
    approved_hours = 0.0
    pending_hours = 0.0
    total_break_minutes = 0
    days_worked_set = set()

    for l in logs:
        if not l.date:
            continue
        d_num = l.date.day
        hrs = float(l.total_hours or 0.0)
        brk = int(l.break_minutes or 0)
        total_hours += hrs
        total_break_minutes += brk
        if hrs > 0 or l.status in ("Active", "Paused", "Completed", "Approved"):
            days_worked_set.add(d_num)

        if l.status == "Approved":
            approved_hours += hrs
            daily_map[d_num]["approved_hours"] = round(daily_map[d_num]["approved_hours"] + hrs, 2)
        else:
            pending_hours += hrs
            daily_map[d_num]["pending_hours"] = round(daily_map[d_num]["pending_hours"] + hrs, 2)

        daily_map[d_num]["hours"] = round(daily_map[d_num]["hours"] + hrs, 2)
        daily_map[d_num]["break_minutes"] += brk
        daily_map[d_num]["shifts_count"] += 1

    days_worked = len(days_worked_set)
    avg_hours = round(total_hours / days_worked, 2) if days_worked > 0 else 0.0

    # Management HR Portal: Compute Urlaub (8h/day, 4h half-day) & Krankheit (8h/day)
    leave_days_count = 0.0
    leave_credited_hours = 0.0
    sick_days_count = 0
    sick_credited_hours = 0.0
    employee_breakdown = []

    if is_mgmt_hr_view:
        emp_query = db.query(models.Employee)
        if target_emp_id:
            emp_query = emp_query.filter(models.Employee.id == target_emp_id)
        emps = emp_query.order_by(models.Employee.employee_number.asc()).all()

        lv_query = db.query(models.LeaveRequest).filter(
            models.LeaveRequest.status == "Approved",
            models.LeaveRequest.start_date <= end_d,
            models.LeaveRequest.end_date >= start_d,
        )
        if target_emp_id:
            lv_query = lv_query.filter(models.LeaveRequest.employee_id == target_emp_id)
        approved_leaves = lv_query.all()

        sk_query = db.query(models.SicknessRecord).filter(
            models.SicknessRecord.start_date <= end_d,
            models.SicknessRecord.end_date >= start_d,
        )
        if target_emp_id:
            sk_query = sk_query.filter(models.SicknessRecord.employee_id == target_emp_id)
        sick_records = sk_query.all()

        # Per-employee aggregation map (including German HR Cost Control & Weekly Overtime metrics)
        emp_stats = {}
        emp_weekly_hours = {}
        for e in emps:
            attrs = dict(e.attributes or {})
            base_sal = float(e.base_salary or 0.0)
            hr_rate = float(e.hourly_rate or float(attrs.get("stundensatz") or 0.0))
            tagessatz = float(attrs.get("tagessatz") or 0.0)
            ot_rate = float(attrs.get("overtime_rate") or (hr_rate * 1.25 if hr_rate > 0 else 28.5))
            contract_hrs = float(attrs.get("monthly_contract_hours") or (160.0 if e.employment_type == "Full-time" else 80.0 if e.employment_type == "Part-time" else 0.0))
            weekly_limit = float(attrs.get("weekly_hours") or (40.0 if e.employment_type == "Full-time" else 20.0 if e.employment_type == "Part-time" else 40.0))
            emp_weekly_hours[e.id] = {}
            emp_stats[e.id] = {
                "employee_id": e.id,
                "employee_number": e.employee_number,
                "employee_name": f"{e.first_name} {e.last_name}",
                "email": e.email,
                "phone": e.phone,
                "department": e.department,
                "employment_type": e.employment_type,
                "role": e.role,
                "base_salary": base_sal,
                "hourly_rate": hr_rate,
                "tagessatz": tagessatz,
                "overtime_rate": ot_rate,
                "monthly_contract_hours": contract_hrs,
                "weekly_hours_limit": weekly_limit,
                "registration_status": attrs.get("registration_status") or "Angemeldet (Aktiv)",
                "worked_hours": 0.0,
                "approved_worked_hours": 0.0,
                "pending_worked_hours": 0.0,
                "break_minutes": 0,
                "days_worked": set(),
                "urlaub_days": 0.0,
                "urlaub_hours": 0.0,
                "krankheit_days": 0,
                "krankheit_hours": 0.0,
                "total_credited_hours": 0.0,
                "overtime_hours": 0.0,
                "overtime_cost": 0.0,
                "weekly_exceeded": False,
                "max_weekly_hours": 0.0,
                "estimated_monthly_cost": 0.0,
            }

        for l in logs:
            if l.employee_id in emp_stats and l.date:
                st = emp_stats[l.employee_id]
                hrs = float(l.total_hours or 0.0)
                st["worked_hours"] = round(st["worked_hours"] + hrs, 2)
                if l.status == "Approved":
                    st["approved_worked_hours"] = round(st["approved_worked_hours"] + hrs, 2)
                else:
                    st["pending_worked_hours"] = round(st["pending_worked_hours"] + hrs, 2)
                st["break_minutes"] += int(l.break_minutes or 0)
                if hrs > 0 or l.status in ("Active", "Paused", "Completed", "Approved"):
                    st["days_worked"].add(l.date.day)
                iso_yr, iso_wk, _ = l.date.isocalendar()
                wk_key = f"{iso_yr}-KW{iso_wk:02d}"
                emp_weekly_hours[l.employee_id][wk_key] = round(
                    emp_weekly_hours[l.employee_id].get(wk_key, 0.0) + hrs, 2
                )

        for lv in approved_leaves:
            if not lv.start_date or not lv.end_date:
                continue
            cur_d = max(lv.start_date, start_d)
            last_lv_d = min(lv.end_date, end_d)
            while cur_d <= last_lv_d:
                if cur_d.weekday() < 5:  # Mon-Fri standard working days
                    is_half = (lv.type == "Half-day")
                    d_inc = 0.5 if is_half else 1.0
                    h_inc = 4.0 if is_half else 8.0
                    leave_days_count += d_inc
                    leave_credited_hours += h_inc
                    daily_map[cur_d.day]["leave_hours"] = round(daily_map[cur_d.day]["leave_hours"] + h_inc, 2)
                    if lv.employee_id in emp_stats:
                        emp_stats[lv.employee_id]["urlaub_days"] += d_inc
                        emp_stats[lv.employee_id]["urlaub_hours"] = round(emp_stats[lv.employee_id]["urlaub_hours"] + h_inc, 2)
                cur_d += timedelta(days=1)

        for sk in sick_records:
            if not sk.start_date or not sk.end_date:
                continue
            cur_d = max(sk.start_date, start_d)
            last_sk_d = min(sk.end_date, end_d)
            while cur_d <= last_sk_d:
                if cur_d.weekday() < 5:  # Mon-Fri standard working days
                    sick_days_count += 1
                    sick_credited_hours += 8.0
                    daily_map[cur_d.day]["sick_hours"] = round(daily_map[cur_d.day]["sick_hours"] + 8.0, 2)
                    if sk.employee_id in emp_stats:
                        emp_stats[sk.employee_id]["krankheit_days"] += 1
                        emp_stats[sk.employee_id]["krankheit_hours"] = round(emp_stats[sk.employee_id]["krankheit_hours"] + 8.0, 2)
                cur_d += timedelta(days=1)

        total_base_payroll = 0.0
        total_overtime_hours = 0.0
        total_overtime_cost = 0.0
        total_estimated_cost = 0.0
        weekly_alerts = []

        for e_id, st in emp_stats.items():
            st["days_worked"] = len(st["days_worked"])
            tot_cred = round(st["worked_hours"] + st["urlaub_hours"] + st["krankheit_hours"], 2)
            st["total_credited_hours"] = tot_cred
            contract_h = st["monthly_contract_hours"]
            weekly_limit = st["weekly_hours_limit"]

            # Check weekly hours against weekly contract limit (Wochenarbeitszeit überschritten)
            wk_map = emp_weekly_hours.get(e_id, {})
            weekly_overtime_sum = 0.0
            max_wk_h = 0.0
            exceeded_weeks = []
            for wk_key in sorted(wk_map.keys()):
                wk_hrs = wk_map[wk_key]
                if wk_hrs > max_wk_h:
                    max_wk_h = wk_hrs
                if weekly_limit > 0 and wk_hrs > weekly_limit:
                    ex_by = round(wk_hrs - weekly_limit, 2)
                    weekly_overtime_sum = round(weekly_overtime_sum + ex_by, 2)
                    st["weekly_exceeded"] = True
                    exceeded_weeks.append({
                        "week_key": wk_key,
                        "worked_hours": wk_hrs,
                        "weekly_limit": weekly_limit,
                        "exceeded_by": ex_by,
                    })
                    weekly_alerts.append({
                        "employee_id": e_id,
                        "employee_name": st["employee_name"],
                        "employee_number": st["employee_number"],
                        "department": st["department"],
                        "week_key": wk_key,
                        "worked_hours": wk_hrs,
                        "weekly_limit": weekly_limit,
                        "exceeded_by": ex_by,
                    })
            st["max_weekly_hours"] = round(max_wk_h, 2)
            st["exceeded_weeks"] = exceeded_weeks

            # Überstunden = Ist (gearbeitet + Urlaub 8h/Tag + Krankheit 8h/Tag) − Soll (Wochenstunden laut Vertrag)
            emp_obj = next((x for x in emps if x.id == e_id), None)
            is_exempt = (st["employment_type"] in NO_OVERTIME_TYPES) or emp_obj is None
            soll_h = 0.0 if is_exempt else _contract_soll_hours(emp_obj, y, m)
            st["soll_hours"] = soll_h
            st["ist_hours"] = tot_cred
            st["difference_hours"] = round(tot_cred - soll_h, 2) if not is_exempt else 0.0
            effective_ot = round(tot_cred - soll_h, 2) if (not is_exempt and soll_h > 0 and tot_cred > soll_h) else 0.0
            if effective_ot > 0:
                st["overtime_hours"] = round(effective_ot, 2)
                st["overtime_cost"] = round(st["overtime_hours"] * st["overtime_rate"], 2)

            if st["base_salary"] > 0:
                est = round(st["base_salary"] + st["overtime_cost"], 2)
                total_base_payroll += st["base_salary"]
            elif st["tagessatz"] > 0 and st["days_worked"] > 0 and st["hourly_rate"] <= 0:
                est = round(st["days_worked"] * st["tagessatz"] + st["overtime_cost"], 2)
                total_base_payroll += round(st["days_worked"] * st["tagessatz"], 2)
            else:
                base_c = round(tot_cred * st["hourly_rate"], 2)
                est = round(base_c + st["overtime_cost"], 2)
                total_base_payroll += base_c
            st["estimated_monthly_cost"] = est
            total_overtime_hours += st["overtime_hours"]
            total_overtime_cost += st["overtime_cost"]
            total_estimated_cost += est
            employee_breakdown.append(st)

    for d_num in range(1, last_day + 1):
        dm = daily_map[d_num]
        dm["effective_hours"] = round(
            dm["hours"] + (dm["leave_hours"] + dm["sick_hours"] if is_mgmt_hr_view else 0.0), 2
        )

    result = {
        "year": y,
        "month": m,
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "last_day": last_day,
        "employee_id": target_emp_id,
        "total_hours": round(total_hours, 2),
        "approved_hours": round(approved_hours, 2),
        "pending_hours": round(pending_hours, 2),
        "total_break_minutes": total_break_minutes,
        "total_break_hours": round(total_break_minutes / 60.0, 2),
        "days_worked": days_worked,
        "avg_hours_per_day": avg_hours,
        "daily_breakdown": [daily_map[d] for d in range(1, last_day + 1)],
    }

    if is_mgmt_hr_view:
        result.update({
            "leave_days_count": leave_days_count,
            "leave_credited_hours": round(leave_credited_hours, 2),
            "sick_days_count": sick_days_count,
            "sick_credited_hours": round(sick_credited_hours, 2),
            "total_credited_hours_with_absences": round(
                total_hours + leave_credited_hours + sick_credited_hours, 2
            ),
            "total_base_payroll": round(total_base_payroll, 2),
            "total_overtime_hours": round(total_overtime_hours, 2),
            "total_overtime_cost": round(total_overtime_cost, 2),
            "total_estimated_cost": round(total_estimated_cost, 2),
            "weekly_alerts": weekly_alerts,
            "employee_breakdown": employee_breakdown,
        })

    return result


@router.get("/time-logs/overtime-report")
def get_yearly_overtime_report(
    year: Optional[int] = None,
    employee_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Month-by-month Überstunden report (Jan-Dec) per employee, based on the weekly contract hours.
    Soll = Wochenstunden / 5 × Werktage, Ist = gearbeitet + Urlaub (8h/Tag) + Krankheit (8h/Tag).
    Mehrstunden = max(0, Ist − Soll).
    """
    if get_effective_tier(current_user) > 4:
        raise HTTPException(status_code=403, detail="Only management can view the overtime report.")
    y = year or date.today().year
    y_start, y_end = date(y, 1, 1), date(y, 12, 31)

    emp_query = db.query(models.Employee)
    if employee_id:
        emp_query = emp_query.filter(models.Employee.id == employee_id)
    emps = emp_query.order_by(models.Employee.employee_number.asc()).all()

    logs = db.query(models.TimeLog).filter(models.TimeLog.date >= y_start, models.TimeLog.date <= y_end).all()
    leaves = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.status == "Approved",
        models.LeaveRequest.start_date <= y_end,
        models.LeaveRequest.end_date >= y_start,
    ).all()
    sicks = db.query(models.SicknessRecord).filter(
        models.SicknessRecord.start_date <= y_end,
        models.SicknessRecord.end_date >= y_start,
    ).all()

    worked = {}
    for l in logs:
        if l.date and l.employee_id:
            worked[(l.employee_id, l.date.month)] = worked.get((l.employee_id, l.date.month), 0.0) + float(l.total_hours or 0.0)

    result = []
    for e in emps:
        exempt = e.employment_type in NO_OVERTIME_TYPES
        e_leaves = [x for x in leaves if x.employee_id == e.id]
        e_sicks = [x for x in sicks if x.employee_id == e.id]
        months = []
        total_ot = 0.0
        total_diff = 0.0
        for mm in range(1, 13):
            ms = date(y, mm, 1)
            me = date(y, mm, calendar.monthrange(y, mm)[1])
            urlaub_h, krank_h = _absence_credit_hours(e_leaves, e_sicks, ms, me)
            worked_h = round(worked.get((e.id, mm), 0.0), 2)
            ist = round(worked_h + urlaub_h + krank_h, 2)
            soll = 0.0 if exempt else _contract_soll_hours(e, y, mm)
            diff = 0.0 if exempt else round(ist - soll, 2)
            ot = diff if diff > 0 else 0.0
            total_ot += ot
            total_diff += diff
            months.append({
                "month": mm,
                "soll_hours": soll,
                "worked_hours": worked_h,
                "urlaub_hours": urlaub_h,
                "krankheit_hours": krank_h,
                "ist_hours": ist,
                "difference_hours": diff,
                "overtime_hours": round(ot, 2),
            })
        result.append({
            "employee_id": e.id,
            "employee_name": f"{e.first_name} {e.last_name}",
            "employment_type": e.employment_type,
            "weekly_hours": 0.0 if exempt else _employee_weekly_hours(e),
            "overtime_exempt": exempt,
            "months": months,
            "total_overtime_hours": round(total_ot, 2),
            "balance_hours": round(total_diff, 2),
        })
    return {"year": y, "employees": result}


# ==============================================================================
# URLAUB (LEAVE REQUESTS) & SICKNESS (KRANKMELDUNG)
# ==============================================================================

@router.get("/leave-requests")
def get_leave_requests(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    query = db.query(models.LeaveRequest)
    if tier not in (1, 2, 3):
        if not current_user.employee_id:
            return []
        query = query.filter(models.LeaveRequest.employee_id == current_user.employee_id)

    leaves = query.order_by(models.LeaveRequest.created_at.desc()).all()
    return [
        {
            "id": lv.id,
            "employee_id": lv.employee_id,
            "employee_name": emp_map.get(lv.employee_id, "Employee"),
            "start_date": lv.start_date.isoformat() if lv.start_date else None,
            "end_date": lv.end_date.isoformat() if lv.end_date else None,
            "type": lv.type,
            "reason": lv.reason,
            "status": lv.status,
            "approved_by": emp_map.get(lv.approved_by) if lv.approved_by else None,
            "created_at": lv.created_at.isoformat() if lv.created_at else None,
        }
        for lv in leaves
    ]


@router.post("/leave-requests")
def create_leave_request(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    target_emp_id = payload.get("employee_id") if tier <= 3 else None
    if not target_emp_id:
        emp = ensure_employee_linked(db, current_user)
        target_emp_id = emp.id if emp else None
    if not target_emp_id:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie einen Mitarbeiter aus.")

    start_d = date.fromisoformat(str(payload.get("start_date"))[:10])
    end_d = date.fromisoformat(str(payload.get("end_date"))[:10])
    init_status = payload.get("status") if (tier <= 3 and payload.get("status") in ("Pending", "Approved", "Rejected")) else "Pending"

    lv = models.LeaveRequest(
        id=str(uuid.uuid4()),
        employee_id=target_emp_id,
        start_date=start_d,
        end_date=end_d,
        type=payload.get("type") or "Daily",
        reason=payload.get("reason") or "Erholungsurlaub",
        status=init_status,
        approved_by=current_user.employee_id if init_status == "Approved" else None,
    )
    db.add(lv)
    db.commit()
    db.refresh(lv)
    return {"id": lv.id, "status": lv.status, "message": "Urlaub request submitted."}


@router.delete("/leave-requests/{leave_id}")
def delete_leave_request(
    leave_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier > 3:
        raise HTTPException(status_code=403, detail="Only Management or HR can delete leave requests.")
    lv = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave request not found")
    db.delete(lv)
    db.commit()
    log_audit(db, "leave_requests", "DELETE", leave_id, current_user.email, None, None)
    return {"status": "deleted", "id": leave_id}


@router.patch("/leave-requests/{leave_id}/status")
def update_leave_status(
    leave_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier > 3:
        raise HTTPException(status_code=403, detail="Only Management, Project Managers, or HR can approve/reject leave requests.")

    lv = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave request not found")

    old_status = lv.status
    lv.status = payload.get("status", "Approved")
    if not current_user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.email == current_user.email).first()
        if emp:
            current_user.employee_id = emp.id
            db.commit()
    lv.approved_by = current_user.employee_id
    db.commit()

    log_audit(db, "leave_requests", "UPDATE", lv.id, current_user.email, {"status": old_status}, {"status": lv.status})
    return {"id": lv.id, "status": lv.status}


@router.get("/sickness")
def list_sickness_records(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    query = db.query(models.SicknessRecord)
    if tier not in (1, 2, 3):
        if not current_user.employee_id:
            return []
        query = query.filter(models.SicknessRecord.employee_id == current_user.employee_id)

    records = query.order_by(models.SicknessRecord.created_at.desc()).all()
    results = []
    for r in records:
        doc_url = None
        if r.au_document_id:
            doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == r.au_document_id).first()
            if doc:
                doc_url = create_presigned_download(doc.storage_key)

        results.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": emp_map.get(r.employee_id, "Employee"),
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "symptoms_note": r.symptoms_note,
            "doctor_visited": r.doctor_visited,
            "au_document_id": r.au_document_id,
            "au_document_url": doc_url,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return results


@router.post("/sickness")
def report_sickness(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    target_emp_id = payload.get("employee_id") if tier <= 3 else None
    if not target_emp_id:
        emp = ensure_employee_linked(db, current_user)
        target_emp_id = emp.id if emp else None
    if not target_emp_id:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie einen Mitarbeiter aus.")

    start_d = date.fromisoformat(str(payload.get("start_date"))[:10])
    end_d = date.fromisoformat(str(payload.get("end_date"))[:10])
    au_doc_id = payload.get("au_document_id") or None
    rec = models.SicknessRecord(
        id=str(uuid.uuid4()),
        employee_id=target_emp_id,
        start_date=start_d,
        end_date=end_d,
        symptoms_note=payload.get("symptoms_note") or "",
        doctor_visited=bool(payload.get("doctor_visited", True)),
        au_document_id=au_doc_id,
        status="AU_Uploaded" if au_doc_id else "Reported",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "status": rec.status, "message": "Sickness notification (Krankmeldung) recorded."}


@router.delete("/sickness/{sickness_id}")
def delete_sickness_record(
    sickness_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier > 3:
        raise HTTPException(status_code=403, detail="Only Management or HR can delete sickness records.")
    rec = db.query(models.SicknessRecord).filter(models.SicknessRecord.id == sickness_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Sickness record not found")
    db.delete(rec)
    db.commit()
    log_audit(db, "sickness_records", "DELETE", sickness_id, current_user.email, None, None)
    return {"status": "deleted", "id": sickness_id}


@router.patch("/sickness/{sickness_id}/status")
def acknowledge_sickness(
    sickness_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier > 3:
        raise HTTPException(status_code=403, detail="Unauthorized")
    rec = db.query(models.SicknessRecord).filter(models.SicknessRecord.id == sickness_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    if "status" in payload:
        rec.status = payload["status"]
    if "au_document_id" in payload:
        rec.au_document_id = payload["au_document_id"]
    db.commit()
    return {"id": rec.id, "status": rec.status}


# ==============================================================================
# MONTHLY SALARY DOCUMENTS (LOHNABRECHNUNG / PAYSLIPS)
# ==============================================================================

@router.get("/payslips")
def list_payslips(
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    query = db.query(models.Payslip)

    # Strict RLS: Tier 1, 2, 3 (Management & HR) can view all employees' payslips when in admin view;
    # if employee_id is specified or user is non-management, strictly filter to that single employee.
    if tier not in (1, 2, 3):
        if not current_user.employee_id:
            return []
        query = query.filter(models.Payslip.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(models.Payslip.employee_id == employee_id)

    if year:
        query = query.filter(models.Payslip.period_year == year)

    slips = query.order_by(models.Payslip.period_year.desc(), models.Payslip.period_month.desc()).all()
    results = []
    for s in slips:
        doc_url = None
        if s.document_id:
            doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == s.document_id).first()
            if doc:
                doc_url = create_presigned_download(doc.storage_key)

        results.append({
            "id": s.id,
            "employee_id": s.employee_id,
            "employee_name": emp_map.get(s.employee_id, "Employee"),
            "period_month": s.period_month,
            "period_year": s.period_year,
            "period_label": f"{s.period_year}-{str(s.period_month).zfill(2)}",
            "gross_salary": float(s.gross_salary or 0),
            "net_salary": float(s.net_salary or 0),
            "commission_bonus": float(s.commission_bonus or 0),
            "total_payout": float((s.net_salary or 0) + (s.commission_bonus or 0)),
            "hours_worked": float(s.hours_worked or 0),
            "document_id": s.document_id,
            "document_url": doc_url,
            "status": s.status,
            "notes": s.notes,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return results


@router.post("/payslips")
def create_payslip(
    payload: schemas.PayslipCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management, Project Managers, or HR & Finance Admin can issue payslips.")

    if not payload.employee_id:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie einen Mitarbeiter aus.")

    # Ensure linked document strictly belongs to this employee_id
    if payload.document_id:
        doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == payload.document_id).first()
        if doc:
            doc.employee_id = payload.employee_id
            doc.reference_id = payload.employee_id

    slip = models.Payslip(
        id=str(uuid.uuid4()),
        employee_id=payload.employee_id,
        period_month=payload.period_month,
        period_year=payload.period_year,
        gross_salary=payload.gross_salary,
        net_salary=payload.net_salary,
        commission_bonus=payload.commission_bonus,
        hours_worked=payload.hours_worked,
        document_id=payload.document_id,
        status="Issued",
        notes=payload.notes,
    )
    db.add(slip)
    db.commit()
    db.refresh(slip)
    log_audit(db, "payslips", "INSERT", slip.id, current_user.email, None, {"employee_id": slip.employee_id, "month": slip.period_month, "year": slip.period_year})
    return {"id": slip.id, "status": slip.status, "message": "Monthly payslip (Lohnabrechnung) issued."}


@router.patch("/payslips/{payslip_id}")
@router.put("/payslips/{payslip_id}")
def update_payslip_document(
    payslip_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can upload or update Lohnabrechnungen.")

    slip = db.query(models.Payslip).filter(models.Payslip.id == payslip_id).first()
    if not slip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    for field in ["document_id", "gross_salary", "net_salary", "commission_bonus", "hours_worked", "notes", "status"]:
        if field in payload and payload[field] is not None:
            setattr(slip, field, payload[field])

    if slip.document_id:
        doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == slip.document_id).first()
        if doc:
            doc.employee_id = slip.employee_id
            doc.reference_id = slip.employee_id

    db.commit()
    db.refresh(slip)
    return {"id": slip.id, "document_id": slip.document_id, "status": slip.status, "message": "Lohnabrechnung updated."}


@router.delete("/payslips/{payslip_id}")
def delete_payslip(
    payslip_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can delete Lohnabrechnungen.")

    slip = db.query(models.Payslip).filter(models.Payslip.id == payslip_id).first()
    if not slip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    doc_id = slip.document_id
    db.delete(slip)
    if doc_id:
        doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == doc_id).first()
        if doc:
            db.delete(doc)
    db.commit()
    log_audit(db, "payslips", "DELETE", payslip_id, current_user.email, None, None)
    return {"status": "deleted", "id": payslip_id}


# ==============================================================================
# HR CONTRACT GENERATOR, MULTI-CONTRACT ISSUANCE & SIGNED CONTRACT WORKFLOW
# ==============================================================================

def _serialize_contract_doc(doc: models.DocumentRecord, emp_map: dict) -> dict:
    meta = dict(doc.metadata_json or {})
    emp_obj = emp_map.get(doc.employee_id or doc.reference_id)
    is_signed = (doc.status == "Signed") or (meta.get("contract_status") == "Signed")
    return {
        "id": doc.id,
        "employee_id": doc.employee_id or doc.reference_id,
        "employee_name": f"{emp_obj.first_name} {emp_obj.last_name}".strip() if emp_obj else meta.get("employee_name", "Mitarbeiter"),
        "employee_number": emp_obj.employee_number if emp_obj else meta.get("employee_number", ""),
        "employee_role": emp_obj.role if emp_obj else "",
        "employment_type": emp_obj.employment_type if emp_obj else "",
        "title": doc.title,
        "file_name": doc.file_name,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size or 0,
        "contract_type": meta.get("contract_type") or doc.reference_type,
        "contract_code": meta.get("contract_code") or "ARBEITSVERTRAG",
        "batch_id": meta.get("batch_id"),
        "is_mandatory_dsgvo": bool(meta.get("is_mandatory_dsgvo")),
        "status": "Signed" if is_signed else "Pending_Signature",
        "contract_status": "Signed" if is_signed else "Pending_Signature",
        "visibility": "employee_visible" if is_signed else "admin_only",
        "employee_visible": bool(is_signed),
        "conditions": meta.get("conditions") or {},
        "html_content": meta.get("html_content") or "",
        "issued_at": meta.get("issued_at") or (doc.created_at.isoformat() if doc.created_at else None),
        "issued_by": meta.get("issued_by") or "HR Management",
        "signed_at": meta.get("signed_at"),
        "signed_by": meta.get("signed_by"),
        "signed_file_name": meta.get("signed_file_name") or (doc.file_name if is_signed else None),
        "url": create_presigned_download(doc.storage_key),
        "download_url": create_presigned_download(doc.storage_key),
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/contracts")
def list_hr_contracts(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can manage employee contracts.")

    emps = db.query(models.Employee).all()
    emp_map = {e.id: e for e in emps}

    query = db.query(models.DocumentRecord)
    if employee_id:
        query = query.filter(
            (models.DocumentRecord.employee_id == employee_id)
            | (models.DocumentRecord.reference_id == employee_id)
        )

    docs = query.order_by(models.DocumentRecord.created_at.desc()).all()
    results = []
    for d in docs:
        meta = dict(d.metadata_json or {})
        is_contract = (
            bool(meta.get("is_hr_contract"))
            or d.reference_type in (
                "Arbeitsvertrag / Werkvertrag",
                "HR_Contract",
                "DSGVO Datenschutzerklärung",
                "Kfz-Übergabeprotokoll",
                "Orientierungspraktikum",
                "Subunternehmervertrag",
            )
            or "vertrag" in str(d.title or "").lower()
            or "dsgvo" in str(d.title or "").lower()
            or "übergabeprotokoll" in str(d.title or "").lower()
            or "praktikum" in str(d.title or "").lower()
        )
        if not is_contract:
            continue
        serialized = _serialize_contract_doc(d, emp_map)
        if status and status != "ALL":
            if status.lower() == "pending" and serialized["status"] != "Pending_Signature":
                continue
            if status.lower() in ("signed", "completed") and serialized["status"] != "Signed":
                continue
        results.append(serialized)
    return results


@router.post("/contracts/issue")
def issue_hr_contracts(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Issues one or multiple contracts for a registered Mitarbeiter (always including the mandatory
    5th DSGVO Datenschutzerklärung module if not already present), saves them as 'Pending_Signature'
    (visible in HR & Mitarbeiter admin profile, hidden from Employee Portal), and syncs all contract
    conditions (start date, Probezeit end date, salary, Praktikum dates, weekly hours, vehicle, etc.)
    onto the Mitarbeiter's profile.
    """
    import base64

    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can issue employee contracts.")

    emp_id = payload.get("employee_id")
    if not emp_id:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie einen Mitarbeiter aus (employee_id required).")

    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")

    contracts_input = payload.get("contracts") or []
    if not contracts_input:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie mindestens einen Vertrag zur Erstellung aus.")

    conditions = dict(payload.get("conditions") or {})
    batch_id = f"BATCH-{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.utcnow().isoformat()
    signed_date_str = str(conditions.get("signed_date") or date.today().isoformat())[:10]

    # Sync employee profile and attributes from contract conditions
    attrs = dict(emp.attributes or {})
    if conditions.get("salutation"):
        attrs["salutation"] = str(conditions["salutation"]).strip()
        attrs["anrede"] = attrs["salutation"]
    if conditions.get("private_email"):
        attrs["private_email"] = str(conditions["private_email"]).strip()
    if conditions.get("portal_email"):
        emp.email = str(conditions["portal_email"]).strip()
    if conditions.get("contract_start_date"):
        attrs["contract_start_date"] = str(conditions["contract_start_date"])[:10]
    if conditions.get("probezeit_end_date"):
        attrs["probezeit_end_date"] = str(conditions["probezeit_end_date"])[:10]
    if conditions.get("probezeit_months") is not None:
        attrs["probezeit_months"] = int(conditions["probezeit_months"])
    if conditions.get("signed_date"):
        attrs["contract_signed_date"] = signed_date_str
    if conditions.get("praktikum_start_date"):
        attrs["praktikum_start_date"] = str(conditions["praktikum_start_date"])[:10]
    if conditions.get("praktikum_end_date"):
        attrs["praktikum_end_date"] = str(conditions["praktikum_end_date"])[:10]
    if conditions.get("weekly_hours") is not None and str(conditions.get("weekly_hours")) != "":
        wk_h = float(conditions["weekly_hours"])
        attrs["weekly_hours"] = wk_h
        attrs["monthly_contract_hours"] = round(wk_h * 4.0, 1)
    if conditions.get("base_salary") is not None and str(conditions.get("base_salary")) != "":
        sal = float(conditions["base_salary"])
        if sal > 0:
            emp.base_salary = sal
            wk_h = float(attrs.get("weekly_hours") or 40.0)
            if wk_h > 0:
                emp.hourly_rate = round(sal / (wk_h * 4.333), 2)
    if conditions.get("annual_leave_days") is not None and str(conditions.get("annual_leave_days")) != "":
        emp.annual_leave_days = int(conditions["annual_leave_days"])
    if conditions.get("statutory_leave_days") is not None:
        attrs["statutory_leave_days"] = int(conditions["statutory_leave_days"])
    if conditions.get("extra_leave_days") is not None:
        attrs["extra_leave_days"] = int(conditions["extra_leave_days"])
    if conditions.get("role"):
        emp.role = str(conditions["role"]).strip()
    if conditions.get("employment_type"):
        emp.employment_type = str(conditions["employment_type"]).strip()
    if conditions.get("contract_model"):
        attrs["contract_model"] = str(conditions["contract_model"]).strip()
    if conditions.get("street"):
        attrs["street"] = str(conditions["street"]).strip()
        attrs["strasse"] = attrs["street"]
    if conditions.get("postal_code"):
        attrs["postal_code"] = str(conditions["postal_code"]).strip()
        attrs["plz"] = attrs["postal_code"]
    if conditions.get("city"):
        attrs["city"] = str(conditions["city"]).strip()
        attrs["ort"] = attrs["city"]
    if conditions.get("company_name"):
        attrs["company_name"] = str(conditions["company_name"]).strip()
    if conditions.get("sub_rate_variante_a") is not None:
        attrs["sub_rate_variante_a"] = float(conditions["sub_rate_variante_a"] or 40.0)
    if conditions.get("sub_rate_variante_b") is not None:
        attrs["sub_rate_variante_b"] = float(conditions["sub_rate_variante_b"] or 35.0)
    if conditions.get("sub_location"):
        attrs["sub_location"] = str(conditions["sub_location"]).strip()
    if conditions.get("vehicle_plate"):
        attrs["assigned_vehicle_plate"] = str(conditions["vehicle_plate"]).strip()
    if conditions.get("vehicle_model"):
        attrs["assigned_vehicle_model"] = str(conditions["vehicle_model"]).strip()
    if conditions.get("vehicle_vin"):
        attrs["assigned_vehicle_vin"] = str(conditions["vehicle_vin"]).strip()
    if conditions.get("vehicle_mileage") is not None and str(conditions.get("vehicle_mileage")) != "":
        try:
            attrs["assigned_vehicle_km"] = int(conditions["vehicle_mileage"])
        except Exception:
            pass
    if conditions.get("vehicle_id"):
        attrs["assigned_vehicle_id"] = str(conditions["vehicle_id"])
        veh = db.query(models.Vehicle).filter(models.Vehicle.id == str(conditions["vehicle_id"])).first()
        if veh:
            veh.assigned_team_lead_id = emp.id
            if conditions.get("vehicle_mileage"):
                try:
                    veh.mileage_km = int(conditions["vehicle_mileage"])
                except Exception:
                    pass

    attrs["dsgvo_issued_at"] = now_iso
    attrs["last_contract_batch_id"] = batch_id

    os.makedirs(os.path.join(LOCAL_STORAGE_ROOT, "contracts"), exist_ok=True)
    issued_docs = []

    for c_item in contracts_input:
        c_code = str(c_item.get("contract_code") or c_item.get("code") or "ARBEITSVERTRAG").upper()
        c_type = str(c_item.get("contract_type") or c_item.get("title") or "Arbeitsvertrag")
        c_title = str(c_item.get("title") or f"{c_type} — {emp.first_name} {emp.last_name}")
        html_body = str(c_item.get("html_content") or "")
        is_dsgvo = bool(c_item.get("is_mandatory_dsgvo")) or ("DSGVO" in c_code) or ("DATENSCHUTZ" in c_code)

        doc_id = str(uuid.uuid4())
        safe_emp = f"{emp.first_name}_{emp.last_name}".replace(" ", "_").replace("/", "_")[:80]
        safe_code = c_code.lower().replace(" ", "_")[:40]
        file_name = f"{safe_code}_{safe_emp}_{signed_date_str}.html"[:240]
        storage_key = f"contracts/{emp.id}/{doc_id}_{file_name}"[:480]
        drive_file_id = f"s3://{storage_key}"[:250]
        c_title_safe = c_title[:250]
        full_path = os.path.join(LOCAL_STORAGE_ROOT, storage_key)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        full_html_doc = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>{c_title_safe}</title>
<style>
  @page {{ size: A4; margin: 18mm 18mm 18mm 18mm; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #111827; line-height: 1.55; font-size: 10.5pt; margin: 0; padding: 24px; background: #fff; }}
  .contract-page {{ max-width: 210mm; margin: 0 auto; }}
  h1, h2, h3 {{ color: #0f172a; }}
  @media print {{
    body {{ padding: 0; }}
    .page-break {{ page-break-before: always; }}
  }}
</style>
</head>
<body>
<div class="contract-page">{html_body}</div>
</body>
</html>"""
        raw_bytes = full_html_doc.encode("utf-8")
        try:
            with open(full_path, "wb") as f:
                f.write(raw_bytes)
        except Exception:
            pass
        b64_html = base64.b64encode(raw_bytes).decode("ascii")

        meta = {
            "is_hr_contract": True,
            "contract_code": c_code,
            "contract_type": c_type,
            "batch_id": batch_id,
            "is_mandatory_dsgvo": is_dsgvo,
            "contract_status": "Pending_Signature",
            "visibility": "admin_only",
            "employee_visible": False,
            "category": "Arbeitsvertrag / Werkvertrag",
            "doc_date": signed_date_str,
            "issued_at": now_iso,
            "issued_by": current_user.email,
            "uploaded_by": "Management",
            "employee_name": f"{emp.first_name} {emp.last_name}",
            "employee_number": emp.employee_number,
            "salutation": attrs.get("salutation") or "Herr",
            "conditions": conditions,
            "html_content": html_body,
            "base64_data": b64_html,
        }

        doc_rec = models.DocumentRecord(
            id=doc_id,
            reference_type="Arbeitsvertrag / Werkvertrag",
            reference_id=emp.id,
            employee_id=emp.id,
            title=c_title_safe,
            file_name=file_name,
            mime_type="text/html",
            file_size=len(raw_bytes),
            storage_provider="local_s3",
            storage_key=storage_key,
            drive_file_id=drive_file_id,
            status="Pending_Signature",
            metadata_json=meta,
        )
        db.add(doc_rec)
        issued_docs.append(doc_rec)

    # Also store a summary array inside emp.attributes["hr_contracts"]
    existing_summary = list(attrs.get("hr_contracts") or [])
    for d in issued_docs:
        m = d.metadata_json or {}
        existing_summary.append({
            "id": d.id,
            "title": d.title,
            "contract_code": m.get("contract_code"),
            "contract_type": m.get("contract_type"),
            "status": "Pending_Signature",
            "employee_visible": False,
            "issued_at": now_iso,
            "start_date": attrs.get("contract_start_date"),
            "probezeit_end_date": attrs.get("probezeit_end_date"),
        })
    attrs["hr_contracts"] = existing_summary
    attrs["onboarding_email_sent"] = False
    emp.attributes = attrs

    db.commit()
    db.refresh(emp)

    emp_map = {emp.id: emp}
    serialized_contracts = [_serialize_contract_doc(d, emp_map) for d in issued_docs]
    log_audit(
        db,
        "hr_contracts",
        "ISSUE",
        emp.id,
        current_user.email,
        None,
        {"batch_id": batch_id, "count": len(serialized_contracts), "employee": f"{emp.first_name} {emp.last_name}"},
    )
    return {
        "status": "issued",
        "batch_id": batch_id,
        "employee": serialize_employee(emp, db=db, include_sensitive=True, include_pending_contracts=True),
        "contracts": serialized_contracts,
    }


@router.put("/contracts/{contract_id}")
@router.patch("/contracts/{contract_id}")
def update_hr_contract(
    contract_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    import base64

    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can edit contracts.")

    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == contract_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    meta = dict(doc.metadata_json or {})
    if "title" in payload and payload["title"]:
        doc.title = str(payload["title"]).strip()
    if "conditions" in payload and isinstance(payload["conditions"], dict):
        meta["conditions"] = payload["conditions"]
    if "html_content" in payload and payload["html_content"] is not None:
        html_body = str(payload["html_content"])
        meta["html_content"] = html_body
        if doc.mime_type == "text/html":
            full_html_doc = f"""<!DOCTYPE html><html lang="de"><head><meta charset="utf-8" /><title>{doc.title}</title></head><body>{html_body}</body></html>"""
            raw_bytes = full_html_doc.encode("utf-8")
            doc.file_size = len(raw_bytes)
            meta["base64_data"] = base64.b64encode(raw_bytes).decode("ascii")
            try:
                full_path = os.path.join(LOCAL_STORAGE_ROOT, doc.storage_key)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, "wb") as f:
                    f.write(raw_bytes)
            except Exception:
                pass

    doc.metadata_json = meta
    db.commit()
    db.refresh(doc)
    emp_map = {e.id: e for e in db.query(models.Employee).all()}
    return _serialize_contract_doc(doc, emp_map)


def _build_and_send_onboarding_welcome_email(
    db: Session,
    emp: models.Employee,
    sender_user: Optional[models.User] = None,
    regenerate_otp: bool = False,
    contract_title: str = "",
    override_private_email: Optional[str] = None,
    preview_only: bool = False,
) -> dict:
    """
    Ensures the Mitarbeiter has an active portal User account (`@bruenel.de` username) + One-Time Password (OTP),
    builds the German 'Herzlich willkommen bei der Brünel Deutschland UG' onboarding email
    with their `@bruenel.de` login username, OTP, and iPhone/Android Homescreen App installation instructions,
    and sends it EXCLUSIVELY to the employee's private email address (`private_email`).
    Never sends emails to `@bruenel.de` addresses, as those are strictly panel login usernames.
    """
    import re
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    attrs = dict(emp.attributes or {})
    if override_private_email is not None and str(override_private_email).strip():
        attrs["private_email"] = str(override_private_email).strip()

    raw_emp_email = (emp.email or "").strip()
    private_email = (attrs.get("private_email") or "").strip()

    # If emp.email was accidentally a non-bruenel private email and private_email wasn't set yet, preserve it as private_email
    if raw_emp_email and not raw_emp_email.lower().endswith("@bruenel.de") and not private_email:
        private_email = raw_emp_email
        attrs["private_email"] = private_email

    # Ensure portal login username ends with @bruenel.de
    def _make_bruenel_username(fn: str, ln: str) -> str:
        def _clean(s: str) -> str:
            s = (s or "").strip().lower()
            for k, v in [("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")]:
                s = s.replace(k, v)
            s = re.sub(r"[^a-z0-9]+", ".", s).strip(".")
            return s
        f_part = _clean(fn)
        l_part = _clean(ln)
        if f_part and l_part:
            return f"{f_part}.{l_part}@bruenel.de"
        if f_part:
            return f"{f_part}@bruenel.de"
        if l_part:
            return f"{l_part}@bruenel.de"
        return "mitarbeiter@bruenel.de"

    if raw_emp_email and raw_emp_email.lower().endswith("@bruenel.de"):
        portal_username = raw_emp_email.lower()
    else:
        portal_username = _make_bruenel_username(emp.first_name, emp.last_name)
        if not raw_emp_email:
            emp.email = portal_username

    otp_plain = (attrs.get("last_generated_otp") or "").strip()
    if not otp_plain or regenerate_otp:
        otp_plain = _generate_otp_code(8)
        attrs["last_generated_otp"] = otp_plain
        attrs["must_change_password"] = True

    # Ensure linked User account exists and uses portal_username (@bruenel.de) for portal login
    login_key = (emp.email or portal_username).strip()
    if login_key:
        u = db.query(models.User).filter(models.User.employee_id == emp.id).first()
        if not u:
            u = db.query(models.User).filter(models.User.email.ilike(login_key)).first()
        if not u:
            role_tier = emp.role_tier or 5
            role_enum = models.RoleEnum.FIELD_EMPLOYEE
            if role_tier == 1:
                role_enum = models.RoleEnum.SUPER_ADMIN
            elif role_tier == 2:
                role_enum = models.RoleEnum.PROJECT_MANAGER
            elif role_tier == 3:
                role_enum = models.RoleEnum.HR_FINANCE
            elif role_tier == 4:
                role_enum = models.RoleEnum.TEAM_LEAD
            u = models.User(
                email=login_key,
                hashed_password=get_password_hash(otp_plain),
                role=role_enum,
                role_tier=role_tier,
                employee_id=emp.id,
                can_access_app=(role_tier <= 3),
                can_access_portal=True,
                must_change_password=True,
            )
            db.add(u)
            db.flush()
        else:
            u.employee_id = emp.id
            u.can_access_portal = True
            if regenerate_otp or getattr(u, "must_change_password", False) or not attrs.get("onboarding_email_sent"):
                u.hashed_password = get_password_hash(otp_plain)
                u.must_change_password = True

    portal_url = "https://www.bruenel.de/de#login"
    salutation = (attrs.get("salutation") or attrs.get("anrede") or "Herr").strip()
    full_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() or "Mitarbeiter/in"
    first_name = (emp.first_name or full_name).strip()
    last_name = (emp.last_name or "").strip()
    company_name = (attrs.get("company_name") or full_name).strip()
    role_label = emp.role or "Mitarbeiter"

    if salutation == "Frau":
        display_title_name = f"Frau {full_name}"
        greeting_line = f"Sehr geehrte Frau {last_name}," if last_name else f"Sehr geehrte Frau {full_name},"
    elif salutation == "Firma":
        display_title_name = f"Firma {company_name} ({full_name})"
        greeting_line = f"Sehr geehrte Damen und Herren ({company_name} — {full_name}),"
    else:
        display_title_name = f"Herr {full_name}"
        greeting_line = f"Sehr geehrter Herr {last_name}," if last_name else f"Sehr geehrter Herr {full_name},"

    start_date_str = attrs.get("contract_start_date") or datetime.utcnow().strftime("%Y-%m-%d")
    if len(start_date_str) >= 10 and "-" in start_date_str[:10]:
        parts = start_date_str[:10].split("-")
        start_date_de = f"{parts[2]}.{parts[1]}.{parts[0]}"
    else:
        start_date_de = start_date_str

    def _ascii_header_text(val: str) -> str:
        s = val or ""
        for k, v in [("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss"), ("–", "-"), ("—", "-")]:
            s = s.replace(k, v)
        return s.encode("ascii", errors="ignore").decode("ascii").strip()

    ascii_title_name = _ascii_header_text(display_title_name)
    subject = f"Willkommen bei der Bruenel Deutschland UG - Ihr Mitarbeiter-Portal Zugang ({ascii_title_name})"

    plain_text = (
        f"{greeting_line}\n\n"
        f"herzlich willkommen im Team der Brünel Deutschland UG.\n"
        f"Wir freuen uns sehr auf die Zusammenarbeit mit Ihnen als {role_label} und wünschen Ihnen einen erfolgreichen Start sowie eine gute Arbeitszeit in unserem Unternehmen.\n\n"
        f"Ihr unterschriebener Vertrag wurde erfolgreich in Ihrer digitalen Personalakte hinterlegt und ist ab sofort in Ihrem persönlichen Mitarbeiter-Portal unter „Dokumente“ für Sie freigeschaltet.\n\n"
        f"------------------------------------------------------------\n"
        f"IHRE PERSÖNLICHEN ZUGANGSDATEN (MITARBEITER-PORTAL)\n"
        f"------------------------------------------------------------\n"
        f"Login-Link: {portal_url}\n"
        f"Benutzername (Portal-Login): {login_key}\n"
        f"Einmal-Passwort (OTP): {otp_plain}\n"
        f"(Hinweis: Ihre @bruenel.de-Kennung dient als Ihr Benutzername für das Portal. Beim ersten Login werden Sie gebeten, Ihr eigenes persönliches Passwort festzulegen.)\n\n"
        f"FUNKTIONEN IM BRÜNEL MITARBEITER-PORTAL:\n"
        f"- Arbeitszeiten und Pausen täglich digital erfassen\n"
        f"- Unterschriebene Verträge, DSGVO-Dokumente und Lohnabrechnungen jederzeit einsehen und herunterladen\n"
        f"- Urlaubsanträge und Krankmeldungen (AU) digital einreichen\n"
        f"- Projekte, Baustellen und Aufgaben abrufen\n\n"
        f"------------------------------------------------------------\n"
        f"ANLEITUNG: PORTAL ALS APP AUF IHREM SMARTPHONE HINZUFÜGEN\n"
        f"------------------------------------------------------------\n\n"
        f"FÜR IPHONE / iOS (Safari):\n"
        f"1. Öffnen Sie Safari auf Ihrem iPhone und rufen Sie {portal_url} auf.\n"
        f"2. Tippen Sie unten in der Menüleiste auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).\n"
        f"3. Scrollen Sie im Menü nach unten und wählen Sie „Zum Home-Bildschirm“.\n"
        f"4. Bestätigen Sie oben rechts mit „Hinzufügen“. Das Brünel-Portal erscheint nun als App-Icon auf Ihrem Home-Bildschirm.\n\n"
        f"FÜR ANDROID (Google Chrome):\n"
        f"1. Öffnen Sie Google Chrome auf Ihrem Android-Smartphone und rufen Sie {portal_url} auf.\n"
        f"2. Tippen Sie oben rechts auf das Drei-Punkte-Menü.\n"
        f"3. Wählen Sie „Zum Startbildschirm hinzufügen“ oder „App installieren“.\n"
        f"4. Bestätigen Sie mit „Hinzufügen / Installieren“. Das Brünel-Portal ist nun direkt auf Ihrem Startbildschirm verfügbar.\n\n"
        f"Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.\n"
        f"Auf eine erfolgreiche Zusammenarbeit.\n\n"
        f"Mit freundlichen Grüßen\n"
        f"Brünel Deutschland UG (haftungsbeschränkt)\n"
        f"Geschäftsführung & Personalabteilung\n"
        f"Ramonville Str. 28 · 61184 Karben\n"
        f"Web: https://www.bruenel.de | Mitarbeiter-Login: {portal_url}\n"
    )

    html_body = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);border:1px solid #cbd5e1;">
    <!-- Top Corporate Header -->
    <div style="background:#0f172a;padding:26px 32px;color:#ffffff;border-bottom:4px solid #FF6B00;">
      <div style="font-size:11px;font-weight:700;color:#FF6B00;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">
        BRÜNEL DEUTSCHLAND UG · PERSONALABTEILUNG &amp; ONBOARDING
      </div>
      <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#ffffff;">
        Herzlich willkommen bei der Brünel Deutschland UG
      </h1>
      <p style="margin:0;font-size:13px;color:#cbd5e1;">
        Vertragsunterlagen freigeschaltet · Ihr persönlicher Zugang zum Mitarbeiter-Portal
      </p>
    </div>

    <!-- Main Greeting -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">
        <strong>{greeting_line}</strong>
      </p>
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.65;color:#334155;">
        wir heißen Sie herzlich willkommen im Team der <strong>Brünel Deutschland UG (haftungsbeschränkt)</strong>.<br />
        Wir freuen uns auf die Zusammenarbeit mit Ihnen ab dem <strong>{start_date_de}</strong> in der Position als <strong>{role_label}</strong> und wünschen Ihnen einen erfolgreichen Start sowie eine gute Arbeitszeit in unserem Unternehmen.
      </p>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#334155;">
        <strong>Status Ihrer Vertragsunterlagen:</strong> Ihr unterschriebener Vertrag{f' (<em>{contract_title}</em>)' if contract_title else ''} wurde in Ihrer digitalen Personalakte abgeschlossen und ist ab sofort in Ihrem persönlichen <strong>Mitarbeiter-Portal unter „Dokumente“</strong> für Sie freigeschaltet.
      </p>

      <!-- Credentials Card -->
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #FF6B00;border-radius:8px;padding:20px 22px;margin:22px 0;">
        <div style="font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">
          Ihre persönlichen Zugangsdaten zum Mitarbeiter-Portal
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#475569;width:44%;"><strong>Login-Link:</strong></td>
            <td style="padding:6px 0;font-weight:700;">
              <a href="{portal_url}" style="color:#FF6B00;text-decoration:none;">{portal_url}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#475569;"><strong>Benutzername (Portal-Login):</strong></td>
            <td style="padding:6px 0;font-family:monospace;font-size:14px;font-weight:700;color:#0f172a;">
              {login_key}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#475569;"><strong>Einmal-Passwort (OTP):</strong></td>
            <td style="padding:6px 0;">
              <span style="display:inline-block;padding:4px 12px;border-radius:6px;background:#0f172a;color:#ffffff;font-family:monospace;font-size:14px;font-weight:700;letter-spacing:0.06em;">
                {otp_plain}
              </span>
            </td>
          </tr>
        </table>
        <div style="margin-top:12px;font-size:12px;color:#475569;line-height:1.5;">
          <strong>Hinweis zur Erstanmeldung:</strong> Bitte melden Sie sich unter <a href="{portal_url}" style="color:#FF6B00;text-decoration:none;font-weight:600;">{portal_url}</a> mit Ihrem Benutzernamen <strong>{login_key}</strong> und dem oben genannten Einmal-Passwort an. Beim ersten Login werden Sie aufgefordert, ein persönliches Passwort zu vergeben.
        </div>
        <div style="margin-top:16px;">
          <a href="{portal_url}" target="_blank" rel="noreferrer" style="display:inline-block;padding:11px 22px;border-radius:8px;background:#FF6B00;color:#ffffff;font-weight:700;font-size:13.5px;text-decoration:none;">
            Zum Mitarbeiter-Portal anmelden
          </a>
        </div>
      </div>

      <!-- Portal Features Section -->
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <div style="font-size:13.5px;font-weight:700;color:#0f172a;margin-bottom:8px;">
          Funktionen im Brünel Mitarbeiter-Portal:
        </div>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;line-height:1.7;color:#334155;">
          <li><strong>Arbeitszeiterfassung:</strong> Täglichen Arbeitsbeginn, Pausen und Arbeitsende digital erfassen.</li>
          <li><strong>Dokumente &amp; Verträge:</strong> Unterschriebene Verträge, DSGVO-Erklärung und Abrechnungen einsehen und herunterladen.</li>
          <li><strong>Abwesenheiten:</strong> Urlaubsanträge stellen sowie Arbeitsunfähigkeitsbescheinigungen digital einreichen.</li>
          <li><strong>Projekte &amp; Einsätze:</strong> Aktuelle Projektzuweisungen, Baustellen und Aufgaben einsehen.</li>
        </ul>
      </div>

      <!-- Mobile Homescreen App Installation Guide (iOS & Android) -->
      <div style="margin:24px 0 10px 0;">
        <h3 style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:#0f172a;">
          Anleitung: Mitarbeiter-Portal als App auf dem Smartphone einrichten
        </h3>
        <p style="margin:0 0 14px 0;font-size:13px;color:#475569;line-height:1.5;">
          Für den schnellen täglichen Zugriff auf Zeiterfassung und Dokumente können Sie den Login-Link direkt auf dem Startbildschirm Ihres Smartphones ablegen:
        </p>

        <!-- iPhone / iOS Box -->
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px 18px;margin-bottom:12px;">
          <div style="font-size:13.5px;font-weight:700;color:#0f172a;margin-bottom:6px;">
            Apple iPhone / iOS (Safari Browser)
          </div>
          <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#334155;">
            <li>Öffnen Sie <strong>Safari</strong> auf Ihrem iPhone und rufen Sie <a href="{portal_url}" style="color:#FF6B00;font-weight:700;">{portal_url}</a> auf.</li>
            <li>Tippen Sie in der unteren Menüleiste auf das <strong>Teilen-Symbol</strong> (Quadrat mit Pfeil nach oben).</li>
            <li>Wählen Sie im Menü den Punkt <strong>„Zum Home-Bildschirm“</strong>.</li>
            <li>Bestätigen Sie oben rechts mit <strong>„Hinzufügen“</strong>.</li>
          </ol>
        </div>

        <!-- Android Box -->
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px 18px;">
          <div style="font-size:13.5px;font-weight:700;color:#0f172a;margin-bottom:6px;">
            Android-Smartphone (Google Chrome Browser)
          </div>
          <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#334155;">
            <li>Öffnen Sie <strong>Google Chrome</strong> auf Ihrem Smartphone und rufen Sie <a href="{portal_url}" style="color:#FF6B00;font-weight:700;">{portal_url}</a> auf.</li>
            <li>Tippen Sie oben rechts auf das <strong>Drei-Punkte-Menü</strong>.</li>
            <li>Wählen Sie <strong>„Zum Startbildschirm hinzufügen“</strong> bzw. <strong>„App installieren“</strong>.</li>
            <li>Bestätigen Sie die Eingabe mit <strong>„Hinzufügen“</strong>.</li>
          </ol>
        </div>
      </div>

      <p style="margin:22px 0 8px 0;font-size:14px;line-height:1.6;color:#334155;">
        Bei Fragen zu Ihrer Anmeldung steht Ihnen unsere Personalabteilung jederzeit gerne zur Verfügung.<br />
        <strong>Mit freundlichen Grüßen und auf eine erfolgreiche Zusammenarbeit</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#0f172a;color:#94a3b8;padding:18px 32px;font-size:12px;line-height:1.6;">
      <div style="color:#ffffff;font-weight:700;font-size:13px;">Brünel Deutschland UG (haftungsbeschränkt)</div>
      <div>Ramonville Str. 28 · 61184 Karben · Deutschland</div>
      <div>Geschäftsführer: Sam Rastegar Moghadam · Web: <a href="https://www.bruenel.de" style="color:#FF6B00;text-decoration:none;">www.bruenel.de</a> · Mitarbeiter-Login: <a href="{portal_url}" style="color:#FF6B00;text-decoration:none;">www.bruenel.de/de#login</a></div>
    </div>
  </div>
</body>
</html>"""

    # Strictly send ONLY to private_email and NEVER to @bruenel.de!
    recipient_email = private_email.strip() if (private_email and not private_email.lower().endswith("@bruenel.de")) else ""
    sent_via_smtp = False
    smtp_note = ""
    from_addr = "hr@bruenel.de"

    if recipient_email and not preview_only:
        from email.message import EmailMessage
        from email.policy import SMTP
        from email.utils import formatdate, make_msgid

        smtp_user = None
        smtp_pass = None
        smtp_host = os.environ.get("SMTP_HOST", "smtp.strato.de")
        smtp_port = int(os.environ.get("SMTP_PORT", "465"))
        imap_host = "imap.strato.de"

        if sender_user and getattr(sender_user, "email_password", None) and "@" in (sender_user.email or ""):
            smtp_user = sender_user.email.strip()
            smtp_pass = sender_user.email_password
            smtp_host = sender_user.smtp_host or smtp_host
            smtp_port = int(sender_user.smtp_port or smtp_port)
            imap_host = getattr(sender_user, "imap_host", None) or imap_host
        else:
            configured_admin = (
                db.query(models.User)
                .filter(
                    models.User.email_password.isnot(None),
                    models.User.email_password != "",
                    models.User.email.like("%@%"),
                )
                .first()
            )
            if configured_admin:
                smtp_user = configured_admin.email.strip()
                smtp_pass = configured_admin.email_password
                smtp_host = configured_admin.smtp_host or smtp_host
                smtp_port = int(configured_admin.smtp_port or smtp_port)
                imap_host = getattr(configured_admin, "imap_host", None) or imap_host
            elif os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"):
                smtp_user = os.environ.get("SMTP_USER").strip()
                smtp_pass = os.environ.get("SMTP_PASSWORD")

        if smtp_user and smtp_pass:
            valid_from_email = smtp_user if "@" in smtp_user else f"{smtp_user}@bruenel.de"
            from_addr = valid_from_email
            try:
                msg = EmailMessage(policy=SMTP)
                msg["Subject"] = subject
                msg["From"] = f"Bruenel Deutschland UG <{valid_from_email}>"
                msg["To"] = recipient_email
                if valid_from_email.lower() != recipient_email.lower():
                    msg["Cc"] = valid_from_email
                msg["Reply-To"] = valid_from_email
                msg["Date"] = formatdate(localtime=True)
                msg["Message-ID"] = make_msgid(domain="bruenel.de")
                msg.set_content(plain_text, charset="utf-8")
                msg.add_alternative(html_body, subtype="html", charset="utf-8")

                raw_bytes = msg.as_bytes(policy=SMTP)
                recipients = [recipient_email]
                if valid_from_email.lower() != recipient_email.lower():
                    recipients.append(valid_from_email)

                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                    server.login(smtp_user, smtp_pass)
                    server.sendmail(valid_from_email, recipients, raw_bytes)

                # Also save a copy into the sender's IMAP Sent Items folder so it appears in their mail client
                try:
                    import imaplib
                    import time
                    with imaplib.IMAP4_SSL(imap_host, 993) as imap_conn:
                        imap_conn.login(smtp_user, smtp_pass)
                        for sent_folder in ('"Sent Items"', "Sent", "INBOX.Sent"):
                            st, _ = imap_conn.select(sent_folder)
                            if st == "OK":
                                imap_conn.append(
                                    sent_folder,
                                    "\\Seen",
                                    imaplib.Time2Internaldate(time.time()),
                                    raw_bytes,
                                )
                                break
                except Exception:
                    pass

                sent_via_smtp = True
                smtp_note = f"Willkommens-E-Mail erfolgreich an die private E-Mail ({recipient_email}) sowie als Kopie an {valid_from_email} gesendet. (Portal-Login: {login_key})"
            except Exception as smtp_err:
                sent_via_smtp = False
                smtp_note = f"SMTP-Versandhinweis ({recipient_email}): {str(smtp_err)}."
        else:
            smtp_note = f"E-Mail-Vorlage für die private E-Mail ({recipient_email}) erstellt. (Portal-Login: {login_key} — es wird keine E-Mail an @bruenel.de gesendet)."
    elif recipient_email and preview_only:
        smtp_note = f"Vorschau der Willkommens-E-Mail für {recipient_email}. Klicken Sie auf „Willkommens-E-Mail jetzt senden“, um die E-Mail einmalig zu versenden."
    else:
        smtp_note = f"Bitte hinterlegen Sie eine private E-Mail-Adresse des Mitarbeiters für den Onboarding-Versand. (Die @bruenel.de-Kennung '{login_key}' dient ausschließlich als Portal-Benutzername)."

    now_iso = datetime.utcnow().isoformat()
    attrs["onboarding_email_prepared_at"] = now_iso
    if sent_via_smtp:
        attrs["onboarding_email_sent"] = True
        attrs["onboarding_email_sent_at"] = now_iso
    attrs["onboarding_email_to"] = recipient_email
    emp.attributes = attrs

    return {
        "sent_via_smtp": sent_via_smtp,
        "smtp_note": smtp_note,
        "from_email": from_addr,
        "to_email": recipient_email,
        "private_email": recipient_email,
        "employee_name": full_name,
        "username": login_key,
        "portal_username": login_key,
        "otp": otp_plain,
        "portal_url": portal_url,
        "subject": subject,
        "plain_text": plain_text,
        "html_body": html_body,
        "sent_at": now_iso,
    }


def _count_employee_hr_contracts(db: Session, emp_id: str):
    """Returns (pending_count, signed_count, total_count) of HR contracts for an employee."""
    docs = (
        db.query(models.DocumentRecord)
        .filter(
            (models.DocumentRecord.employee_id == emp_id)
            | (models.DocumentRecord.reference_id == emp_id)
        )
        .all()
    )
    pending_count = 0
    signed_count = 0
    for d in docs:
        m = d.metadata_json or {}
        if m.get("is_hr_contract") or d.reference_type in (
            "Arbeitsvertrag / Werkvertrag",
            "DSGVO & Datenschutz",
            "Orientierungspraktikum",
            "Kfz-Übergabeprotokoll",
            "Subunternehmervertrag",
        ):
            if d.status == "Signed" or m.get("contract_status") == "Signed":
                signed_count += 1
            else:
                pending_count += 1
    return pending_count, signed_count, pending_count + signed_count


@router.post("/employees/{emp_id}/send-onboarding-email")
def send_employee_onboarding_email(
    emp_id: str,
    payload: Optional[dict] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Generates or sends the German Onboarding Welcome Email with username, One-Time Password (OTP),
    portal login link, and iPhone/Android Homescreen App installation instructions.
    Enforces that all issued HR contracts for this employee are signed & uploaded before sending.
    """
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can send onboarding emails.")

    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")

    body = payload or {}
    regenerate_otp = bool(body.get("regenerate_otp", False))
    preview_only = bool(body.get("preview_only", False))

    pending_count, signed_count, total_count = _count_employee_hr_contracts(db, emp.id)
    if not preview_only and not body.get("force_send", False):
        if total_count == 0 or pending_count > 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Die Willkommens-E-Mail kann erst gesendet werden, wenn alle Verträge des Mitarbeiters "
                    f"unterschrieben und hochgeladen sind (aktuell: {signed_count} unterschrieben, {pending_count} noch offen)."
                ),
            )

    result = _build_and_send_onboarding_welcome_email(
        db=db,
        emp=emp,
        sender_user=current_user,
        regenerate_otp=regenerate_otp,
        contract_title=body.get("contract_title") or "",
        override_private_email=body.get("private_email"),
        preview_only=preview_only,
    )
    result["pending_contracts_count"] = pending_count
    result["signed_contracts_count"] = signed_count
    result["all_contracts_signed"] = pending_count == 0 and signed_count > 0
    db.commit()
    log_audit(
        db,
        "employees",
        "ONBOARDING_EMAIL",
        emp.id,
        current_user.email,
        None,
        {"to_email": result["to_email"], "sent_via_smtp": result["sent_via_smtp"], "preview_only": preview_only},
    )
    return result


@router.post("/contracts/{contract_id}/upload-signed")
def upload_signed_hr_contract(
    contract_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Marks an issued contract as Completed / Signed after HR uploads the signed PDF/scan.
    Immediately flips visibility from 'admin_only' (Pending) to 'employee_visible' (Signed)
    so the employee can view & download the signed contract in their Employee Portal Documents section.
    Does NOT automatically send the onboarding email on each upload — the onboarding email is unlocked
    once ALL contracts of the employee are signed & uploaded, and sent once when HR clicks 'Send Email Now'.
    """
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can upload signed contracts.")

    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == contract_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Contract record not found")

    meta = dict(doc.metadata_json or {})
    now_iso = datetime.utcnow().isoformat()

    signed_doc_id = payload.get("signed_document_id") or payload.get("document_id")
    if signed_doc_id and signed_doc_id != doc.id:
        uploaded_doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == signed_doc_id).first()
        if uploaded_doc:
            up_meta = dict(uploaded_doc.metadata_json or {})
            doc.storage_key = uploaded_doc.storage_key
            doc.file_name = uploaded_doc.file_name
            doc.mime_type = uploaded_doc.mime_type or "application/pdf"
            doc.file_size = uploaded_doc.file_size or 0
            if up_meta.get("base64_data"):
                meta["base64_data"] = up_meta["base64_data"]
            meta["signed_file_name"] = uploaded_doc.file_name
            db.delete(uploaded_doc)
            db.flush()

    doc.status = "Signed"
    if not doc.title.endswith("(Unterschrieben)"):
        doc.title = f"{doc.title} (Unterschrieben)"
    meta["is_hr_contract"] = True
    meta["contract_status"] = "Signed"
    meta["visibility"] = "employee_visible"
    meta["employee_visible"] = True
    meta["signed_at"] = now_iso
    meta["signed_by"] = current_user.email
    doc.metadata_json = meta
    db.flush()

    emp_id = doc.employee_id or doc.reference_id
    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first() if emp_id else None
    pending_count, signed_count, total_count = (
        _count_employee_hr_contracts(db, emp_id) if emp_id else (0, 1, 1)
    )
    all_contracts_signed = pending_count == 0 and signed_count > 0

    if emp:
        attrs = dict(emp.attributes or {})
        attrs["contract_signed_date"] = now_iso[:10]
        if meta.get("is_mandatory_dsgvo") or "DSGVO" in str(meta.get("contract_code", "")):
            attrs["dsgvo_accepted"] = True
            attrs["datenschutz_accepted"] = True
            attrs["dsgvo_accepted_at"] = now_iso
        hr_list = list(attrs.get("hr_contracts") or [])
        for item in hr_list:
            if item.get("id") == doc.id:
                item["status"] = "Signed"
                item["employee_visible"] = True
                item["signed_at"] = now_iso
        attrs["hr_contracts"] = hr_list
        attrs["all_contracts_signed"] = all_contracts_signed
        emp.attributes = attrs

    db.commit()
    db.refresh(doc)
    emp_map = {e.id: e for e in db.query(models.Employee).all()}
    log_audit(db, "hr_contracts", "UPLOAD_SIGNED", doc.id, current_user.email, {"status": "Pending_Signature"}, {"status": "Signed", "employee_visible": True})
    serialized = _serialize_contract_doc(doc, emp_map)
    serialized["all_contracts_signed"] = all_contracts_signed
    serialized["pending_contracts_count"] = pending_count
    serialized["signed_contracts_count"] = signed_count
    serialized["total_contracts_count"] = total_count
    serialized["onboarding_email_already_sent"] = bool((emp.attributes or {}).get("onboarding_email_sent")) if emp else False
    return serialized


@router.delete("/contracts/{contract_id}")
def delete_hr_contract(
    contract_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR can delete contracts.")

    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == contract_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    emp_id = doc.employee_id or doc.reference_id
    if emp_id:
        emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
        if emp and isinstance(emp.attributes, dict):
            attrs = dict(emp.attributes)
            attrs["hr_contracts"] = [c for c in (attrs.get("hr_contracts") or []) if c.get("id") != contract_id]
            emp.attributes = attrs

    db.delete(doc)
    db.commit()
    log_audit(db, "hr_contracts", "DELETE", contract_id, current_user.email, None, None)
    return {"status": "deleted", "id": contract_id}

