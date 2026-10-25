from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta

import models
import database
from core.security import get_current_user, get_effective_tier
from routers.projects import normalize_task_status, task_status_color

router = APIRouter()


@router.get("/events")
def get_master_calendar_events(
    employee_id: Optional[str] = None,
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Centralized Interactive Master Calendar (Chapter 5 Module 5).
    Reads directly from assignments, leave_requests, sickness_records, and objects.
    Strict Task Color Coding:
      - Green (#22c55e): Completed / Done tasks
      - Yellow (#eab308): Remaining Work tasks (and Approved Leave)
      - Blue (#3b82f6): Planned / To Do (for construction) tasks
      - Red (#ef4444): Not Completed tasks (and Reported Sickness)
    """
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}
    obj_map = {o.id: o for o in db.query(models.BuildingObject).all()}
    team_map = {t.id: t for t in db.query(models.Team).all()}

    target_emp_id = current_user.employee_id if tier == 5 else employee_id
    events = []

    # 1. Assignments & Team Tasks
    assign_q = db.query(models.Assignment)
    if project_id:
        assign_q = assign_q.filter(models.Assignment.project_id == project_id)
    if team_id:
        assign_q = assign_q.filter(models.Assignment.team_id == team_id)

    for a in assign_q.all():
        assigned_ids = list(a.assigned_employee_ids or [])
        if a.employee_id and a.employee_id not in assigned_ids:
            assigned_ids.insert(0, a.employee_id)
        if a.team_id and a.team_id in team_map:
            for mid in (team_map[a.team_id].member_ids or []):
                if mid not in assigned_ids:
                    assigned_ids.append(mid)

        if target_emp_id and target_emp_id not in assigned_ids and a.employee_id != target_emp_id:
            continue

        obj = obj_map.get(a.object_id) if a.object_id else None
        norm_status = normalize_task_status(a.task_status)
        hex_color = task_status_color(norm_status)
        color_cat_map = {
            "Completed": "green",
            "Remaining": "solid_yellow",
            "Not Completed": "red",
            "Planned": "blue",
        }
        color_code = color_cat_map.get(norm_status, "blue")
        team_obj = team_map.get(a.team_id) if a.team_id else None
        assignee_names = ", ".join(emp_map.get(eid, "") for eid in assigned_ids if emp_map.get(eid))
        if team_obj:
            assignee_label = f"Team {team_obj.name} ({assignee_names})"
        else:
            assignee_label = assignee_names or emp_map.get(a.employee_id, "Tech")

        events.append({
            "id": f"assign-{a.id}",
            "source_id": a.id,
            "event_type": "Assignment",
            "date": a.date.isoformat() if a.date else date.today().isoformat(),
            "end_date": a.date.isoformat() if a.date else date.today().isoformat(),
            "title": a.title or f"{assignee_label} — {proj_map.get(a.project_id, 'Project')}",
            "subtitle": obj.address if obj else reg_map.get(a.region_id, ""),
            "employee_id": a.employee_id,
            "employee_name": assignee_label,
            "team_id": a.team_id,
            "team_name": team_obj.name if team_obj else None,
            "assigned_employee_ids": assigned_ids,
            "project_id": a.project_id,
            "project_name": proj_map.get(a.project_id, ""),
            "task_status": norm_status,
            "object_status": norm_status,
            "comments_count": len(a.comments or []),
            "color_category": color_code,
            "hex_color": hex_color,
        })

    # 2. Leave Requests (Urlaub) — Solid Yellow (Approved) & Faded Yellow (Pending)
    leave_q = db.query(models.LeaveRequest).filter(models.LeaveRequest.status.in_(["Approved", "Pending"]))
    if tier == 5:
        leave_q = leave_q.filter(models.LeaveRequest.employee_id == current_user.employee_id)
    elif employee_id:
        leave_q = leave_q.filter(models.LeaveRequest.employee_id == employee_id)

    for lv in leave_q.all():
        is_approved = lv.status == "Approved"
        cur = lv.start_date
        end = lv.end_date or lv.start_date
        # Expand date range (capped at 45 days for safety)
        days_count = min((end - cur).days + 1, 45)
        for i in range(max(days_count, 1)):
            d_str = (cur + timedelta(days=i)).isoformat()
            events.append({
                "id": f"leave-{lv.id}-{i}",
                "source_id": lv.id,
                "event_type": "Leave",
                "date": d_str,
                "end_date": end.isoformat(),
                "title": f"Urlaub ({lv.type}): {emp_map.get(lv.employee_id, 'Employee')}",
                "subtitle": f"Status: {lv.status}",
                "employee_id": lv.employee_id,
                "employee_name": emp_map.get(lv.employee_id, ""),
                "status": lv.status,
                "color_category": "solid_yellow" if is_approved else "faded_yellow",
                "hex_color": "#eab308" if is_approved else "#fde047",
            })

    # 3. Sickness Records (Krankmeldung)
    sick_q = db.query(models.SicknessRecord)
    if tier == 5:
        sick_q = sick_q.filter(models.SicknessRecord.employee_id == current_user.employee_id)
    elif employee_id:
        sick_q = sick_q.filter(models.SicknessRecord.employee_id == employee_id)

    for sk in sick_q.all():
        cur = sk.start_date
        end = sk.end_date or sk.start_date
        days_count = min((end - cur).days + 1, 30)
        for i in range(max(days_count, 1)):
            d_str = (cur + timedelta(days=i)).isoformat()
            events.append({
                "id": f"sick-{sk.id}-{i}",
                "source_id": sk.id,
                "event_type": "Sickness",
                "date": d_str,
                "end_date": end.isoformat(),
                "title": f"Krankmeldung: {emp_map.get(sk.employee_id, 'Employee')}",
                "subtitle": sk.status,
                "employee_id": sk.employee_id,
                "employee_name": emp_map.get(sk.employee_id, ""),
                "status": sk.status,
                "color_category": "red",
                "hex_color": "#ef4444",
            })

    # 4. Building Objects milestones (for management overview)
    if tier <= 4 and not employee_id:
        obj_q = db.query(models.BuildingObject)
        if project_id:
            obj_q = obj_q.filter(models.BuildingObject.project_id == project_id)
        for o in obj_q.all():
            is_done = o.status in ("Tested", "Completed")
            events.append({
                "id": f"obj-{o.id}",
                "source_id": o.id,
                "event_type": "BuildingObject",
                "date": o.created_at.date().isoformat() if o.created_at else date.today().isoformat(),
                "title": f"Object: {o.address} ({o.units_count} WE)",
                "subtitle": f"{o.status} • {o.cabling_type}",
                "project_id": o.project_id,
                "project_name": proj_map.get(o.project_id, ""),
                "object_status": o.status,
                "color_category": "green" if is_done else "blue",
                "hex_color": "#22c55e" if is_done else "#3b82f6",
            })

    events.sort(key=lambda x: x["date"], reverse=True)
    return events
