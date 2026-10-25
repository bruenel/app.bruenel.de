from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, date
import uuid

import models
import schemas
import database
from core.security import (
    get_current_user,
    get_effective_tier,
    get_delegated_manager_ids,
)
from core.storage import create_presigned_download
from core.audit import log_audit

router = APIRouter()


# ==============================================================================
# REGIONS (PLZ)
# ==============================================================================

@router.get("/regions")
def list_regions(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    regions = db.query(models.Region).order_by(models.Region.postal_code.asc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "postal_code": r.postal_code,
            "city": r.city,
            "attributes": r.attributes or {},
        }
        for r in regions
    ]


@router.post("/regions")
def create_region(
    payload: schemas.RegionCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Only Super Admin or Project Manager can create regions.")
    reg = models.Region(
        id=str(uuid.uuid4()),
        name=payload.name,
        postal_code=payload.postal_code,
        city=payload.city,
        attributes=payload.attributes or {},
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return {"id": reg.id, "name": reg.name, "postal_code": reg.postal_code, "city": reg.city}


# ==============================================================================
# PROJECTS (RLS + DELEGATION SCOPED)
# ==============================================================================

@router.get("/projects")
def list_projects(
    status: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}

    query = db.query(models.Project)
    if status:
        query = query.filter(models.Project.status == status)

    # Project Manager scope + Vertretung delegation
    if tier == 2 and current_user.employee_id:
        mgr_ids = get_delegated_manager_ids(db, current_user.employee_id)
        # Include projects where manager_id is in mgr_ids OR unassigned
        projects = [
            p for p in query.all()
            if (p.manager_id in mgr_ids or p.manager_id is None)
        ]
    else:
        projects = query.order_by(models.Project.created_at.desc()).all()

    results = []
    for p in projects:
        objs = db.query(models.BuildingObject).filter(models.BuildingObject.project_id == p.id).all()
        completed_objs = sum(1 for o in objs if o.status in ("Tested", "Completed"))
        total_units = sum(o.units_count or 0 for o in objs)
        results.append({
            "id": p.id,
            "name": p.name,
            "code": p.code,
            "client_name": p.client_name,
            "kst": p.kst,
            "status": p.status,
            "manager_id": p.manager_id,
            "manager_name": emp_map.get(p.manager_id, "Unassigned"),
            "region_id": p.region_id,
            "region_name": reg_map.get(p.region_id, "All Regions"),
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "budget": float(p.budget or 0),
            "objects_count": len(objs),
            "completed_objects_count": completed_objs,
            "total_units": total_units,
            "attributes": p.attributes or {},
        })
    return results


@router.post("/projects")
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Only Super Admin or Project Manager can create projects.")

    proj = models.Project(
        id=str(uuid.uuid4()),
        name=payload.name,
        code=payload.code or f"PRJ-{db.query(models.Project).count() + 101}",
        client_name=payload.client_name,
        kst=payload.kst,
        status=payload.status,
        manager_id=payload.manager_id or current_user.employee_id,
        region_id=payload.region_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        budget=payload.budget or 0.0,
        attributes=payload.attributes or {},
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    log_audit(db, "projects", "INSERT", proj.id, current_user.email, None, {"name": proj.name})
    return {"id": proj.id, "name": proj.name, "status": proj.status}


@router.patch("/projects/{project_id}")
def update_project(
    project_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Unauthorized")
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    for k in ["name", "code", "client_name", "kst", "status", "manager_id", "region_id", "budget", "attributes"]:
        if k in payload:
            setattr(proj, k, payload[k])
    db.commit()
    return {"id": proj.id, "status": proj.status}


# ==============================================================================
# BUILDING OBJECTS (Planned -> Hausbegehung -> In Progress -> Tested -> Completed)
# ==============================================================================

@router.get("/objects")
def list_objects(
    project_id: Optional[str] = None,
    region_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}

    query = db.query(models.BuildingObject)
    if project_id:
        query = query.filter(models.BuildingObject.project_id == project_id)
    if region_id:
        query = query.filter(models.BuildingObject.region_id == region_id)
    if status:
        query = query.filter(models.BuildingObject.status == status)

    objs = query.order_by(models.BuildingObject.created_at.desc()).all()
    results = []
    for o in objs:
        media_docs = db.query(models.DocumentRecord).filter(
            models.DocumentRecord.reference_type == "ObjectMedia",
            models.DocumentRecord.reference_id == o.id
        ).all()
        results.append({
            "id": o.id,
            "project_id": o.project_id,
            "project_name": proj_map.get(o.project_id, "Project"),
            "region_id": o.region_id,
            "region_name": reg_map.get(o.region_id, "Region"),
            "address": o.address,
            "units_count": o.units_count,
            "cabling_type": o.cabling_type,
            "status": o.status,
            "drive_folder_id": o.drive_folder_id,
            "notes": o.notes,
            "attributes": o.attributes or {},
            "media_count": len(media_docs),
            "media": [
                {
                    "id": m.id,
                    "title": m.title,
                    "file_name": m.file_name,
                    "mime_type": m.mime_type,
                    "url": create_presigned_download(m.storage_key),
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in media_docs
            ],
        })
    return results


@router.get("/objects/{object_id}")
def get_object_detail(
    object_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    o = db.query(models.BuildingObject).filter(models.BuildingObject.id == object_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Building Object not found")

    media_docs = db.query(models.DocumentRecord).filter(
        models.DocumentRecord.reference_type == "ObjectMedia",
        models.DocumentRecord.reference_id == o.id
    ).order_by(models.DocumentRecord.created_at.desc()).all()

    return {
        "id": o.id,
        "project_id": o.project_id,
        "region_id": o.region_id,
        "address": o.address,
        "units_count": o.units_count,
        "cabling_type": o.cabling_type,
        "status": o.status,
        "drive_folder_id": o.drive_folder_id,
        "notes": o.notes,
        "attributes": o.attributes or {},
        "media": [
            {
                "id": m.id,
                "title": m.title,
                "file_name": m.file_name,
                "mime_type": m.mime_type,
                "file_size": m.file_size,
                "url": create_presigned_download(m.storage_key),
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in media_docs
        ],
    }


@router.post("/objects")
def create_building_object(
    payload: schemas.ObjectCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 4:
        raise HTTPException(status_code=403, detail="Unauthorized to create building objects")

    obj = models.BuildingObject(
        id=str(uuid.uuid4()),
        project_id=payload.project_id,
        region_id=payload.region_id,
        address=payload.address,
        units_count=payload.units_count,
        cabling_type=payload.cabling_type,
        status=payload.status,
        drive_folder_id=payload.drive_folder_id,
        notes=payload.notes,
        attributes=payload.attributes or {},
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    log_audit(db, "objects", "INSERT", obj.id, current_user.email, None, {"address": obj.address, "status": obj.status})
    return {"id": obj.id, "address": obj.address, "status": obj.status}


@router.patch("/objects/{object_id}/status")
def update_object_status(
    object_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    obj = db.query(models.BuildingObject).filter(models.BuildingObject.id == object_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    old_status = obj.status
    if "status" in payload:
        obj.status = payload["status"]
    if "notes" in payload:
        obj.notes = payload["notes"]
    if "units_count" in payload:
        obj.units_count = int(payload["units_count"])
    db.commit()

    log_audit(db, "objects", "UPDATE", obj.id, current_user.email, {"status": old_status}, {"status": obj.status})
    return {"id": obj.id, "status": obj.status}


# ==============================================================================
# TEAMS (CREATE & MANAGE TEAMS BY EMPLOYEES OR MANAGERS)
# ==============================================================================

def normalize_task_status(raw_status: Optional[str]) -> str:
    if not raw_status:
        return "Planned"
    s = str(raw_status).strip()
    if s in ("Planned", "To Do", "Assigned"):
        return "Planned"
    if s in ("Remaining", "Remaining Work", "In Progress"):
        return "Remaining"
    if s in ("Completed", "Done"):
        return "Completed"
    if s in ("Not Completed", "Uncompleted", "Failed"):
        return "Not Completed"
    return "Planned"


def task_status_color(status: str) -> str:
    norm = normalize_task_status(status)
    if norm == "Completed":
        return "#22c55e"  # Green
    if norm == "Remaining":
        return "#eab308"  # Yellow
    if norm == "Not Completed":
        return "#ef4444"  # Red
    return "#3b82f6"      # Blue (Planned / To Do)


@router.get("/teams")
def list_teams(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_objs = {e.id: e for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    teams = db.query(models.Team).order_by(models.Team.created_at.desc()).all()
    my_id = current_user.employee_id

    results = []
    for t in teams:
        m_ids = list(dict.fromkeys(([t.leader_id] if t.leader_id else []) + (t.member_ids or [])))
        members = []
        for mid in m_ids:
            e = emp_objs.get(mid)
            if e:
                members.append({
                    "id": e.id,
                    "name": f"{e.first_name} {e.last_name}",
                    "role": e.role,
                    "employee_number": e.employee_number,
                })
        leader = emp_objs.get(t.leader_id)
        results.append({
            "id": t.id,
            "name": t.name,
            "leader_id": t.leader_id,
            "leader_name": f"{leader.first_name} {leader.last_name}" if leader else "Unassigned",
            "member_ids": m_ids,
            "members": members,
            "project_id": t.project_id,
            "project_name": proj_map.get(t.project_id, "All Projects"),
            "notes": t.notes,
            "is_my_team": bool(my_id and (my_id in m_ids or my_id == t.leader_id)),
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return results


@router.post("/teams")
def create_team(
    payload: schemas.TeamCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    leader_id = payload.leader_id or current_user.employee_id
    m_ids = list(dict.fromkeys(([leader_id] if leader_id else []) + (payload.member_ids or [])))
    t = models.Team(
        id=str(uuid.uuid4()),
        name=payload.name,
        leader_id=leader_id,
        member_ids=m_ids,
        project_id=payload.project_id,
        notes=payload.notes,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    log_audit(db, "teams", "INSERT", t.id, current_user.email, None, {"name": t.name, "member_ids": m_ids})
    return {"id": t.id, "name": t.name, "member_ids": m_ids}


@router.put("/teams/{team_id}")
def update_team(
    team_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    t = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    if "name" in payload and payload["name"]:
        t.name = payload["name"]
    if "leader_id" in payload:
        t.leader_id = payload["leader_id"]
    if "member_ids" in payload and isinstance(payload["member_ids"], list):
        leader = t.leader_id
        t.member_ids = list(dict.fromkeys(([leader] if leader else []) + payload["member_ids"]))
    if "project_id" in payload:
        t.project_id = payload["project_id"]
    if "notes" in payload:
        t.notes = payload["notes"]
    db.commit()
    return {"id": t.id, "name": t.name, "member_ids": t.member_ids}


@router.delete("/teams/{team_id}")
def delete_team(
    team_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    t = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    db.delete(t)
    db.commit()
    return {"status": "deleted"}


# ==============================================================================
# ASSIGNMENTS & EMPLOYEE / TEAM TASKS (MULTI-TASK + COMMENTS + DOCUMENTATION)
# ==============================================================================

def serialize_assignment(
    a: models.Assignment,
    emp_map: dict,
    proj_map: dict,
    reg_map: dict,
    obj_map: dict,
    team_map: dict,
    db: Session,
) -> dict:
    assigned_ids = list(a.assigned_employee_ids or [])
    if a.employee_id and a.employee_id not in assigned_ids:
        assigned_ids.insert(0, a.employee_id)
    if a.team_id and a.team_id in team_map:
        for tm_id in (team_map[a.team_id].member_ids or []):
            if tm_id not in assigned_ids:
                assigned_ids.append(tm_id)

    assigned_employees = [
        {"id": eid, "name": emp_map.get(eid, "Employee")}
        for eid in assigned_ids if eid
    ]
    primary_emp_id = a.employee_id or (assigned_ids[0] if assigned_ids else None)
    team_obj = team_map.get(a.team_id) if a.team_id else None

    if team_obj:
        assignee_label = f"Team: {team_obj.name}"
    elif len(assigned_employees) > 1:
        assignee_label = ", ".join(x["name"] for x in assigned_employees)
    else:
        assignee_label = emp_map.get(primary_emp_id, "Unassigned")

    # Fetch media attached directly to this task OR to its building object
    ref_ids = [a.id]
    if a.object_id:
        ref_ids.append(a.object_id)
    media_docs = db.query(models.DocumentRecord).filter(
        models.DocumentRecord.reference_id.in_(ref_ids),
        models.DocumentRecord.reference_type.in_(["TaskMedia", "ObjectMedia"]),
    ).order_by(models.DocumentRecord.created_at.desc()).all()

    norm_status = normalize_task_status(a.task_status)
    return {
        "id": a.id,
        "employee_id": primary_emp_id,
        "employee_name": emp_map.get(primary_emp_id, assignee_label),
        "assignee_label": assignee_label,
        "team_id": a.team_id,
        "team_name": team_obj.name if team_obj else None,
        "assigned_employee_ids": assigned_ids,
        "assigned_employees": assigned_employees,
        "project_id": a.project_id,
        "project_name": proj_map.get(a.project_id, "Project"),
        "region_id": a.region_id,
        "region_name": reg_map.get(a.region_id, "Region"),
        "object_id": a.object_id,
        "object_address": obj_map.get(a.object_id, "General Area"),
        "date": a.date.isoformat() if a.date else None,
        "title": a.title or f"Site Deployment: {obj_map.get(a.object_id, proj_map.get(a.project_id, 'Task'))}",
        "instructions": a.instructions,
        "priority": a.priority or "Normal",
        "task_status": norm_status,
        "hex_color": task_status_color(norm_status),
        "checklist": a.checklist or [],
        "comments": a.comments or [],
        "media_count": len(media_docs),
        "media": [
            {
                "id": m.id,
                "title": m.title,
                "file_name": m.file_name,
                "mime_type": m.mime_type,
                "file_size": m.file_size,
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "employee_id": m.employee_id,
                "employee_name": emp_map.get(m.employee_id, "Team Member"),
                "url": create_presigned_download(m.storage_key),
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in media_docs
        ],
    }


@router.get("/assignments")
def list_assignments(
    employee_id: Optional[str] = None,
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}
    obj_map = {o.id: o.address for o in db.query(models.BuildingObject).all()}
    team_map = {t.id: t for t in db.query(models.Team).all()}

    query = db.query(models.Assignment)
    if project_id:
        query = query.filter(models.Assignment.project_id == project_id)
    if team_id:
        query = query.filter(models.Assignment.team_id == team_id)

    all_items = query.order_by(models.Assignment.date.desc()).all()

    target_emp_id = current_user.employee_id if tier == 5 else employee_id
    results = []
    for a in all_items:
        serialized = serialize_assignment(a, emp_map, proj_map, reg_map, obj_map, team_map, db)
        if target_emp_id:
            if target_emp_id != serialized["employee_id"] and target_emp_id not in serialized["assigned_employee_ids"]:
                continue
        results.append(serialized)
    return results


@router.get("/assignments/{assignment_id}/documentation")
def get_assignment_documentation(
    assignment_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    a = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task not found")
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}
    obj_map = {o.id: o.address for o in db.query(models.BuildingObject).all()}
    team_map = {t.id: t for t in db.query(models.Team).all()}
    return serialize_assignment(a, emp_map, proj_map, reg_map, obj_map, team_map, db)


@router.post("/assignments")
def create_assignment(
    payload: schemas.AssignmentCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 4:
        raise HTTPException(status_code=403, detail="Only Management, Project Managers, or Team Leads can assign tasks.")

    assigned_ids = list(payload.assigned_employee_ids or [])
    if payload.employee_id and payload.employee_id not in assigned_ids:
        assigned_ids.insert(0, payload.employee_id)

    if payload.team_id:
        t = db.query(models.Team).filter(models.Team.id == payload.team_id).first()
        if t:
            for mid in (t.member_ids or []):
                if mid not in assigned_ids:
                    assigned_ids.append(mid)
            if t.leader_id and t.leader_id not in assigned_ids:
                assigned_ids.insert(0, t.leader_id)

    primary_emp = payload.employee_id or (assigned_ids[0] if assigned_ids else current_user.employee_id)

    # Multiple tasks per employee/team per day are explicitly allowed!
    item = models.Assignment(
        id=str(uuid.uuid4()),
        employee_id=primary_emp,
        team_id=payload.team_id,
        assigned_employee_ids=assigned_ids,
        project_id=payload.project_id,
        region_id=payload.region_id,
        object_id=payload.object_id,
        date=payload.date,
        title=payload.title,
        instructions=payload.instructions,
        priority=payload.priority,
        task_status=normalize_task_status(payload.task_status),
        checklist=payload.checklist or [],
        comments=[],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "created", "task_status": item.task_status}


@router.patch("/assignments/{assignment_id}/status")
@router.put("/assignments/{assignment_id}")
def update_assignment_task_status(
    assignment_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Task assignment not found")

    if "task_status" in payload and payload["task_status"]:
        item.task_status = normalize_task_status(payload["task_status"])
    if "date" in payload and payload["date"]:
        # Manager drag-and-drop rescheduling to another date
        raw_d = payload["date"]
        item.date = date.fromisoformat(str(raw_d)[:10]) if isinstance(raw_d, str) else raw_d
    if "title" in payload and payload["title"] is not None:
        item.title = payload["title"]
    if "checklist" in payload and payload["checklist"] is not None:
        item.checklist = payload["checklist"]
    if "instructions" in payload and payload["instructions"] is not None:
        item.instructions = payload["instructions"]
    if "priority" in payload and payload["priority"]:
        item.priority = payload["priority"]
    if "team_id" in payload:
        item.team_id = payload["team_id"]
        if item.team_id:
            t = db.query(models.Team).filter(models.Team.id == item.team_id).first()
            if t:
                merged = list(dict.fromkeys((item.assigned_employee_ids or []) + (t.member_ids or [])))
                item.assigned_employee_ids = merged
    if "assigned_employee_ids" in payload and isinstance(payload["assigned_employee_ids"], list):
        item.assigned_employee_ids = payload["assigned_employee_ids"]
        if payload["assigned_employee_ids"]:
            item.employee_id = payload["assigned_employee_ids"][0]
    if "employee_id" in payload and payload["employee_id"]:
        item.employee_id = payload["employee_id"]
        curr = list(item.assigned_employee_ids or [])
        if payload["employee_id"] not in curr:
            curr.insert(0, payload["employee_id"])
            item.assigned_employee_ids = curr

    # Optional inline comment when changing status
    if payload.get("comment"):
        emp = db.query(models.Employee).filter(models.Employee.id == current_user.employee_id).first() if current_user.employee_id else None
        author_name = f"{emp.first_name} {emp.last_name}" if emp else current_user.email
        existing_comments = list(item.comments or [])
        existing_comments.append({
            "id": str(uuid.uuid4()),
            "employee_id": current_user.employee_id,
            "author_name": author_name,
            "text": str(payload["comment"]).strip(),
            "status_at_comment": item.task_status,
            "created_at": datetime.utcnow().isoformat(),
        })
        item.comments = existing_comments

    db.commit()
    return {
        "id": item.id,
        "task_status": item.task_status,
        "date": item.date.isoformat() if item.date else None,
        "comments": item.comments or [],
    }


@router.post("/assignments/{assignment_id}/comments")
def add_assignment_comment(
    assignment_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Task assignment not found")

    text_val = str(payload.get("text") or payload.get("comment") or "").strip()
    if not text_val:
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")

    if payload.get("task_status"):
        item.task_status = normalize_task_status(payload["task_status"])

    emp = db.query(models.Employee).filter(models.Employee.id == current_user.employee_id).first() if current_user.employee_id else None
    author_name = f"{emp.first_name} {emp.last_name}" if emp else current_user.email

    new_comment = {
        "id": str(uuid.uuid4()),
        "employee_id": current_user.employee_id,
        "author_name": author_name,
        "text": text_val,
        "status_at_comment": normalize_task_status(item.task_status),
        "created_at": datetime.utcnow().isoformat(),
    }
    existing_comments = list(item.comments or [])
    existing_comments.append(new_comment)
    item.comments = existing_comments
    db.commit()
    return {"id": item.id, "comment": new_comment, "comments": item.comments, "task_status": item.task_status}


# ==============================================================================
# TIME-BOUND DELEGATION (VERTRETUNG - CHAPTER 3.2)
# ==============================================================================

@router.get("/delegations")
def list_delegations(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    items = db.query(models.Delegation).order_by(models.Delegation.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "delegator_id": d.delegator_id,
            "delegator_name": emp_map.get(d.delegator_id, d.delegator_id),
            "delegatee_id": d.delegatee_id,
            "delegatee_name": emp_map.get(d.delegatee_id, d.delegatee_id),
            "start_date": d.start_date.isoformat() if d.start_date else None,
            "end_date": d.end_date.isoformat() if d.end_date else None,
            "scope_note": d.scope_note,
            "is_active": d.is_active,
        }
        for d in items
    ]


@router.post("/delegations")
def create_delegation(
    payload: schemas.DelegationCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Only Super Admin or Project Managers can create Vertretung delegations.")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date.")

    d = models.Delegation(
        id=str(uuid.uuid4()),
        delegator_id=payload.delegator_id,
        delegatee_id=payload.delegatee_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        scope_note=payload.scope_note,
        is_active=True,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    log_audit(db, "delegation", "INSERT", d.id, current_user.email, None, {"delegator": d.delegator_id, "delegatee": d.delegatee_id})
    return {"id": d.id, "status": "active"}
