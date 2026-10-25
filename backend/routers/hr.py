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


import secrets
import string


def _generate_otp_code(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "BRN-" + "".join(secrets.choice(alphabet) for _ in range(length))


def serialize_employee(emp: models.Employee, db: Optional[Session] = None, include_sensitive: bool = True) -> dict:
    attrs = dict(emp.attributes or {})
    docs = []
    if db is not None and include_sensitive:
        doc_rows = (
            db.query(models.DocumentRecord)
            .filter(models.DocumentRecord.reference_id == emp.id)
            .order_by(models.DocumentRecord.created_at.desc())
            .all()
        )
        for d in doc_rows:
            docs.append({
                "id": d.id,
                "reference_type": d.reference_type,
                "file_name": d.file_name,
                "title": d.title or d.file_name,
                "mime_type": d.mime_type,
                "url": create_presigned_download(d.storage_key),
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
        "employee_number": emp.employee_number,
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
    query = db.query(models.Employee)
    emps = query.order_by(models.Employee.employee_number.asc()).all()
    results = []
    for e in emps:
        include_sens = (tier in (1, 2, 3)) or (e.id == current_user.employee_id)
        item = serialize_employee(e, db=db, include_sensitive=include_sens)
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
                detail=f"Ein Mitarbeiter mit der E-Mail '{clean_email}' existiert bereits ({existing_emp.first_name} {existing_emp.last_name}, {existing_emp.employee_number}). Bitte öffnen Sie dessen Personalakte zur Bearbeitung.",
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
                detail=f"Die E-Mail '{clean_email}' wird bereits von einem anderen Mitarbeiter verwendet ({existing_other.first_name} {existing_other.last_name}, {existing_other.employee_number}).",
            )

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

    # Sync linked User email/tier if changed, or create User if converted from Candidate to Employee/Freelancer/Subunternehmer
    u = db.query(models.User).filter(models.User.employee_id == emp.id).first()
    if not u and emp.email:
        u = db.query(models.User).filter(models.User.email == emp.email).first()
    if u:
        u.employee_id = emp.id
        if emp.email and u.email != emp.email:
            u.email = emp.email
        if emp.role_tier:
            u.role_tier = emp.role_tier
            u.can_access_app = (emp.role_tier <= 3)
    elif emp.email and emp.employment_type and emp.employment_type != "Candidate":
        otp_plain = _generate_otp_code(8)
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
            can_access_app=((emp.role_tier or 5) <= 3),
            can_access_portal=True,
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
    tagessatz = float(payload.get("expected_daily_rate") or payload.get("tagessatz") or 0.0)
    stundensatz = float(payload.get("expected_hourly_rate") or payload.get("stundensatz") or (round(tagessatz / 8.0, 2) if tagessatz > 0 else 0.0))
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
        "preferred_contract_model": payload.get("preferred_contract_model") or "Freelancer",
        "willing_to_travel": payload.get("willing_to_travel") or payload.get("remote_preference") or "Hybrid (Vor Ort & Remote)",
        "availability_date": payload.get("availability_date") or "",
        "tagessatz": tagessatz,
        "stundensatz": stundensatz,
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
        base_salary=0.0,
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
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}
    tool_map = {t.id: f"{t.name} ({t.serial_number})" for t in db.query(models.Equipment).all()}

    query = db.query(models.TimeLog)
    if tier == 5:
        query = query.filter(models.TimeLog.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(models.TimeLog.employee_id == employee_id)

    logs = query.order_by(models.TimeLog.check_in_time.desc()).limit(200).all()
    results = []
    for l in logs:
        team_ids = [t.team_member_id for t in db.query(models.TimeLogTeam).filter(models.TimeLogTeam.time_log_id == l.id).all()]
        veh_ids = [v.vehicle_id for v in db.query(models.TimeLogVehicle).filter(models.TimeLogVehicle.time_log_id == l.id).all()]
        tool_ids = [t.equipment_id for t in db.query(models.TimeLogTool).filter(models.TimeLogTool.time_log_id == l.id).all()]

        results.append({
            "id": l.id,
            "employee_id": l.employee_id,
            "employee_name": emp_map.get(l.employee_id, "Employee"),
            "project_id": l.project_id,
            "project_name": proj_map.get(l.project_id, "General / Office"),
            "object_id": l.object_id,
            "date": l.date.isoformat() if l.date else None,
            "check_in_time": l.check_in_time.isoformat() if l.check_in_time else None,
            "check_out_time": l.check_out_time.isoformat() if l.check_out_time else None,
            "pause_start_time": l.pause_start_time.isoformat() if getattr(l, "pause_start_time", None) else None,
            "break_minutes": l.break_minutes or 0,
            "total_hours": float(l.total_hours) if l.total_hours is not None else None,
            "status": l.status,
            "is_locked_for_employee": l.status == "Approved",
            "approved_by": getattr(l, "approved_by", None),
            "approved_by_name": emp_map.get(getattr(l, "approved_by", None), None),
            "approved_at": l.approved_at.isoformat() if getattr(l, "approved_at", None) else None,
            "team_members": [{"id": tid, "name": emp_map.get(tid, tid)} for tid in team_ids],
            "vehicles": [{"id": vid, "plate": veh_map.get(vid, vid)} for vid in veh_ids],
            "tools": [{"id": eid, "name": tool_map.get(eid, eid)} for eid in tool_ids],
            "check_in_data": l.check_in_data or {},
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
    tier = get_effective_tier(current_user)
    if tier == 5:
        emp = ensure_employee_linked(db, current_user)
        target_emp_id = emp.id
    else:
        target_emp_id = payload.get("employee_id") or current_user.employee_id
        if not target_emp_id:
            raise HTTPException(status_code=400, detail="employee_id is required")

    raw_date = str(payload.get("date") or date.today().isoformat())[:10]
    ref_date = date.fromisoformat(raw_date)
    start_str = payload.get("check_in_time") or "08:00"
    end_str = payload.get("check_out_time") or "16:30"
    break_mins = max(int(payload.get("break_minutes") or 0), 0)

    dt_in = _parse_iso_dt(start_str, ref_date) or datetime(ref_date.year, ref_date.month, ref_date.day, 8, 0, 0)
    dt_out = _parse_iso_dt(end_str, ref_date) or datetime(ref_date.year, ref_date.month, ref_date.day, 16, 30, 0)

    dur_sec = max((dt_out - dt_in).total_seconds(), 0)
    net_hours = round(max((dur_sec - break_mins * 60) / 3600.0, 0.0), 2)

    status_val = "Completed"
    approved_by = None
    approved_at = None
    if tier <= 4 and payload.get("status") == "Approved":
        status_val = "Approved"
        approved_by = current_user.employee_id
        approved_at = datetime.utcnow()

    tl = models.TimeLog(
        id=str(uuid.uuid4()),
        employee_id=target_emp_id,
        project_id=payload.get("project_id") or None,
        object_id=payload.get("object_id") or None,
        date=ref_date,
        check_in_time=dt_in,
        check_out_time=dt_out,
        break_minutes=break_mins,
        total_hours=net_hours,
        status=status_val,
        approved_by=approved_by,
        approved_at=approved_at,
        check_in_data={"notes": payload.get("notes") or "Manual past-day entry"},
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
        dur_sec = max((tl.check_out_time - tl.check_in_time).total_seconds(), 0)
        brk_sec = (tl.break_minutes or 0) * 60
        tl.total_hours = round(max((dur_sec - brk_sec) / 3600.0, 0.0), 2)
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

            monthly_ot = round(tot_cred - contract_h, 2) if (contract_h > 0 and tot_cred > contract_h) else 0.0
            effective_ot = max(monthly_ot, weekly_overtime_sum)
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
    if tier == 5:
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
    payload: schemas.LeaveRequestCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    lv = models.LeaveRequest(
        id=str(uuid.uuid4()),
        employee_id=emp.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        type=payload.type,
        reason=payload.reason,
        status="Pending",
    )
    db.add(lv)
    db.commit()
    db.refresh(lv)
    return {"id": lv.id, "status": lv.status, "message": "Urlaub request submitted."}


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
    if tier == 5:
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
    payload: schemas.SicknessCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    rec = models.SicknessRecord(
        id=str(uuid.uuid4()),
        employee_id=emp.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        symptoms_note=payload.symptoms_note,
        doctor_visited=payload.doctor_visited,
        au_document_id=payload.au_document_id,
        status="AU_Uploaded" if payload.au_document_id else "Reported",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "status": rec.status, "message": "Sickness notification (Krankmeldung) recorded."}


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
    emp_map = {e.id: f"{e.first_name} {e.last_name} ({e.employee_number})" for e in db.query(models.Employee).all()}
    query = db.query(models.Payslip)

    # Strict RLS: Tier 1, 2, 3 (Management & HR) can view all employees' payslips; others only their own
    if tier not in (1, 2, 3):
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

    db.commit()
    db.refresh(slip)
    return {"id": slip.id, "document_id": slip.document_id, "status": slip.status, "message": "Lohnabrechnung updated."}
