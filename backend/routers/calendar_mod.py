from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from typing import Optional
from datetime import date, timedelta

import models
import database
from core.security import get_current_user, get_effective_tier
from routers.projects import normalize_task_status, task_status_color
from routers.protocol import (
    parse_date_obj,
    sync_protocol_address_to_erp,
    normalize_gemeinde_ort,
    format_date_dd_mm_yyyy,
)

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
    Reads directly from protocol addresses (Objects & Properties), assignments,
    leave_requests, sickness_records, and building objects.
    Strict Task Color Coding:
      - Green (#22c55e): Completed / Done / Abgeschlossen
      - Yellow/Orange (#f59e0b / #eab308): Restarbeiten / Approved Leave
      - Blue (#3b82f6): Planned / Ausbautermin / To Do
      - Red (#ef4444): Not Completed / Reported Sickness
    """
    try:
        for proto_addr in db.query(models.Address).all():
            sync_protocol_address_to_erp(db, proto_addr)
    except Exception:
        pass

    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    reg_map = {r.id: f"{r.postal_code} {r.name}" for r in db.query(models.Region).all()}
    obj_map = {o.id: o for o in db.query(models.BuildingObject).all()}
    team_map = {t.id: t for t in db.query(models.Team).all()}

    target_emp_id = current_user.employee_id if tier == 5 else employee_id
    events = []
    synced_protocol_ids = set()

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
        obj_attrs = (obj.attributes if (obj and isinstance(obj.attributes, dict)) else {}) or {}
        proto_addr_id = str(obj_attrs.get("protocol_address_id", "") or "")
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
            assignee_label = f"Team {team_obj.name}" + (f" ({assignee_names})" if assignee_names else "")
        else:
            assignee_label = assignee_names or emp_map.get(a.employee_id, "Field Team")

        events.append({
            "id": f"assign-{a.id}",
            "source_id": a.id,
            "protocol_address_id": proto_addr_id,
            "event_type": "Assignment",
            "event_subtype": "Einsatz / Task",
            "date": a.date.isoformat() if a.date else date.today().isoformat(),
            "end_date": a.date.isoformat() if a.date else date.today().isoformat(),
            "title": a.title or f"{assignee_label} — {proj_map.get(a.project_id, 'Project')}",
            "subtitle": obj.address if obj else reg_map.get(a.region_id, ""),
            "employee_id": a.employee_id,
            "employee_name": assignee_label,
            "team_id": a.team_id,
            "team_name": team_obj.name if team_obj else (obj_attrs.get("team") or ""),
            "assigned_employee_ids": assigned_ids,
            "project_id": a.project_id,
            "project_name": proj_map.get(a.project_id, "") or obj_attrs.get("project_name", "UGG"),
            "gemeinde": normalize_gemeinde_ort(obj_attrs.get("ort", ""), obj_attrs.get("plz", "")),
            "plz": obj_attrs.get("plz", ""),
            "projektnummer": obj_attrs.get("projektnummer", ""),
            "adress_id": obj_attrs.get("adress_id", ""),
            "ausbau_typ": obj_attrs.get("ausbau_typ", ""),
            "total_we": obj.units_count if obj else 0,
            "task_status": norm_status,
            "object_status": obj_attrs.get("building_status") or norm_status,
            "priority": a.priority or ("High" if obj_attrs.get("is_priority") else "Normal"),
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
        days_count = min((end - cur).days + 1, 45)
        for i in range(max(days_count, 1)):
            d_str = (cur + timedelta(days=i)).isoformat()
            events.append({
                "id": f"leave-{lv.id}-{i}",
                "source_id": lv.id,
                "event_type": "Leave",
                "event_subtype": lv.type or "Urlaub",
                "date": d_str,
                "end_date": end.isoformat(),
                "title": f"Urlaub ({lv.type}): {emp_map.get(lv.employee_id, 'Mitarbeiter')}",
                "subtitle": f"Status: {lv.status}" + (f" • {lv.reason}" if getattr(lv, "reason", None) else ""),
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
                "event_subtype": "Krankmeldung (AU)",
                "date": d_str,
                "end_date": end.isoformat(),
                "title": f"Krankmeldung: {emp_map.get(sk.employee_id, 'Mitarbeiter')}",
                "subtitle": f"{sk.status}" + (f" • {sk.symptoms_note}" if getattr(sk, "symptoms_note", None) else ""),
                "employee_id": sk.employee_id,
                "employee_name": emp_map.get(sk.employee_id, ""),
                "status": sk.status,
                "color_category": "red",
                "hex_color": "#ef4444",
            })

    # 4. Rich Objects & Properties (`models.Address`) Milestones (Ausbautermin, Restarbeit Termin, Abgeschlossen)
    if tier <= 4 and not employee_id:
        try:
            proto_addrs = (
                db.query(models.Address)
                .options(selectinload(models.Address.units))
                .all()
            )
            for addr in proto_addrs:
                synced_protocol_ids.add(str(addr.id))
                addr_proj_id = getattr(addr, "project_id", "") or ""
                addr_proj_name = getattr(addr, "project_name", None) or "UGG"
                if project_id and addr_proj_id and addr_proj_id != project_id:
                    continue
                addr_team = (getattr(addr, "team", "") or "").strip()
                if team_id and team_id in team_map:
                    if addr_team.lower() != (team_map[team_id].name or "").strip().lower():
                        continue

                units_list = list(addr.units or [])
                total_we = max(len(units_list), int(addr.total_we or 1))
                ta_cnt = 0
                res_cnt = 0
                ohne_cnt = 0
                for u in units_list:
                    we_art = (getattr(u, "we_ausbau_art", "") or "").strip()
                    if we_art == "Reserve" or getattr(u, "reserve", False):
                        res_cnt += 1
                    elif we_art in ("Ohne", "Not installed") or getattr(u, "ohne", False):
                        ohne_cnt += 1
                    else:
                        ta_cnt += 1

                checks = [
                    bool(getattr(addr, "metalkanal_installiert", False)),
                    bool(getattr(addr, "flexrohr", False)),
                    bool(getattr(addr, "huep_installiert", False)),
                    bool(getattr(addr, "spleissen_fertig", False)),
                    bool(getattr(addr, "upload_done", False)),
                    bool(getattr(addr, "genehmigt", False)),
                    bool(getattr(addr, "rechnung_erstellt", False)),
                    bool(getattr(addr, "rechnung_bezahlt", False)),
                ]
                done_checks = sum(1 for c in checks if c)
                b_status = getattr(addr, "building_status", None) or "Ausbau terminiert"
                if b_status == "Abgeschlossen":
                    pct = 100
                else:
                    pct = round((done_checks / len(checks)) * 100)
                    if b_status == "In Bearbeitung" and pct < 25:
                        pct = 25
                    elif b_status == "Restarbeiten" and pct < 65:
                        pct = 65

                comments_list = [
                    c for c in (getattr(addr, "comments", None) or [])
                    if isinstance(c, dict) and str(c.get("text", "")).strip()
                ]
                last_comment = str(comments_list[0].get("text", "")).strip() if comments_list else ""
                norm_ort = normalize_gemeinde_ort(addr.ort, addr.plz) or addr.ort or ""
                street_full = f"{addr.strasse or ''} {addr.hausnummer or ''}".strip()

                ab_dt = parse_date_obj(getattr(addr, "ausbautermin", ""))
                rest_dt = parse_date_obj(getattr(addr, "restarbeit_termin", ""))
                abg_dt = parse_date_obj(getattr(addr, "abgeschlossen_datum", ""))

                milestone_specs = []
                if ab_dt:
                    milestone_specs.append(("Ausbautermin", ab_dt, "#3b82f6", "blue"))
                if rest_dt:
                    milestone_specs.append(("Restarbeit Termin", rest_dt, "#f97316", "solid_yellow"))
                if abg_dt:
                    milestone_specs.append(("Abgeschlossen", abg_dt, "#16a34a", "green"))

                if not milestone_specs:
                    fallback_dt = (
                        parse_date_obj(getattr(addr, "datum", ""))
                        or (addr.created_at.date() if getattr(addr, "created_at", None) else date.today())
                    )
                    if b_status == "Abgeschlossen":
                        milestone_specs.append(("Abgeschlossen", fallback_dt, "#16a34a", "green"))
                    elif b_status == "Restarbeiten":
                        milestone_specs.append(("Restarbeit Termin", fallback_dt, "#f97316", "solid_yellow"))
                    else:
                        milestone_specs.append(("Objekt Termin", fallback_dt, "#3b82f6", "blue"))

                for m_label, m_dt, m_hex, m_cat in milestone_specs:
                    events.append({
                        "id": f"proto-{addr.id}-{m_label.lower().replace(' ', '-')}",
                        "source_id": str(addr.id),
                        "protocol_address_id": str(addr.id),
                        "event_type": "BuildingObject",
                        "event_subtype": m_label,
                        "date": m_dt.isoformat(),
                        "end_date": m_dt.isoformat(),
                        "title": f"{street_full} ({norm_ort})",
                        "subtitle": f"{m_label} • {b_status} • {total_we} WE ({ta_cnt}/{total_we} TA)",
                        "project_id": addr_proj_id,
                        "project_name": addr_proj_name,
                        "gemeinde": norm_ort,
                        "plz": addr.plz or "",
                        "strasse": addr.strasse or "",
                        "hausnummer": addr.hausnummer or "",
                        "projektnummer": addr.projektnummer or "",
                        "adress_id": addr.adress_id or "",
                        "team_name": addr_team,
                        "ausbau_typ": getattr(addr, "ausbau_typ", None) or "Metalkanal",
                        "building_status": b_status,
                        "object_status": b_status,
                        "total_we": total_we,
                        "ta_count": ta_cnt,
                        "reserve_count": res_cnt,
                        "ohne_count": ohne_cnt,
                        "progress_pct": pct,
                        "checklist_done": done_checks,
                        "checklist_total": len(checks),
                        "ausbautermin": format_date_dd_mm_yyyy(getattr(addr, "ausbautermin", "")),
                        "restarbeit_termin": format_date_dd_mm_yyyy(getattr(addr, "restarbeit_termin", "")),
                        "abgeschlossen_datum": format_date_dd_mm_yyyy(getattr(addr, "abgeschlossen_datum", "")),
                        "last_comment": last_comment,
                        "comments_count": len(comments_list),
                        "is_priority": bool(getattr(addr, "is_priority", False)),
                        "has_pdf": bool(getattr(addr, "pdf_base64", None)),
                        "color_category": m_cat,
                        "hex_color": m_hex,
                    })
        except Exception:
            pass

        # Include standalone BuildingObjects that are not already represented by a protocol Address
        obj_q = db.query(models.BuildingObject)
        if project_id:
            obj_q = obj_q.filter(models.BuildingObject.project_id == project_id)
        for o in obj_q.all():
            attrs = o.attributes if isinstance(o.attributes, dict) else {}
            if str(attrs.get("protocol_address_id", "")) in synced_protocol_ids:
                continue
            is_done = o.status in ("Tested", "Completed", "Abgeschlossen")
            sched_dt = (
                parse_date_obj(attrs.get("ausbautermin"))
                or parse_date_obj(attrs.get("restarbeit_termin"))
                or parse_date_obj(attrs.get("abgeschlossen_datum"))
                or (o.created_at.date() if o.created_at else date.today())
            )
            events.append({
                "id": f"obj-{o.id}",
                "source_id": o.id,
                "event_type": "BuildingObject",
                "event_subtype": "Objekt Termin",
                "date": sched_dt.isoformat(),
                "end_date": sched_dt.isoformat(),
                "title": f"{o.address} ({o.units_count} WE)",
                "subtitle": f"{o.status} • {o.cabling_type}",
                "project_id": o.project_id,
                "project_name": proj_map.get(o.project_id, ""),
                "object_status": o.status,
                "building_status": o.status,
                "total_we": o.units_count or 1,
                "color_category": "green" if is_done else "blue",
                "hex_color": "#22c55e" if is_done else "#3b82f6",
            })

    events.sort(key=lambda x: x["date"], reverse=True)
    return events
