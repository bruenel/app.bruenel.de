from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid

import models
import schemas
import database
from core.security import get_current_user, get_effective_tier
from core.audit import log_audit

router = APIRouter()


@router.get("/vehicles")
def list_vehicles(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    vehicles = db.query(models.Vehicle).order_by(models.Vehicle.plate_number.asc()).all()
    tools = db.query(models.Equipment).all()

    results = []
    for v in vehicles:
        veh_tools = [
            {"id": t.id, "name": t.name, "serial_number": t.serial_number}
            for t in tools if t.assigned_vehicle_id == v.id
        ]
        results.append({
            "id": v.id,
            "plate_number": v.plate_number,
            "model": v.model,
            "vin": v.vin,
            "mileage_km": v.mileage_km or 0,
            "next_inspection_date": v.next_inspection_date.isoformat() if v.next_inspection_date else None,
            "assigned_team_lead_id": v.assigned_team_lead_id,
            "assigned_team_lead_name": emp_map.get(v.assigned_team_lead_id, "Available Pool"),
            "is_active": v.is_active,
            "assigned_tools": veh_tools,
            "attributes": v.attributes or {},
        })
    return results


@router.post("/vehicles")
def create_vehicle(
    payload: schemas.VehicleCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to add fleet vehicles")
    if db.query(models.Vehicle).filter(models.Vehicle.plate_number == payload.plate_number).first():
        raise HTTPException(status_code=400, detail="Vehicle plate number already exists")

    v = models.Vehicle(
        id=str(uuid.uuid4()),
        plate_number=payload.plate_number,
        model=payload.model,
        vin=payload.vin,
        mileage_km=payload.mileage_km,
        next_inspection_date=payload.next_inspection_date,
        assigned_team_lead_id=payload.assigned_team_lead_id,
        is_active=payload.is_active,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    log_audit(db, "vehicles", "INSERT", v.id, current_user.email, None, {"plate": v.plate_number})
    return {"id": v.id, "plate_number": v.plate_number, "model": v.model}


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(
    vehicle_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to delete fleet vehicles")
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    db.query(models.Equipment).filter(models.Equipment.assigned_vehicle_id == vehicle_id).update({"assigned_vehicle_id": None})
    db.query(models.Expense).filter(models.Expense.vehicle_id == vehicle_id).update({"vehicle_id": None})
    db.delete(v)
    db.commit()
    log_audit(db, "vehicles", "DELETE", vehicle_id, current_user.email, {"plate": v.plate_number}, None)
    return {"status": "deleted", "id": vehicle_id}


@router.get("/equipment")
def list_equipment(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    veh_map = {v.id: f"{v.plate_number} ({v.model})" for v in db.query(models.Vehicle).all()}

    items = db.query(models.Equipment).order_by(models.Equipment.name.asc()).all()
    return [
        {
            "id": eq.id,
            "name": eq.name,
            "category": eq.category,
            "serial_number": eq.serial_number,
            "condition_status": eq.condition_status,
            "assigned_employee_id": eq.assigned_employee_id,
            "assigned_employee_name": emp_map.get(eq.assigned_employee_id),
            "assigned_vehicle_id": eq.assigned_vehicle_id,
            "assigned_vehicle_name": veh_map.get(eq.assigned_vehicle_id),
            "holder_type": "Employee" if eq.assigned_employee_id else ("Vehicle" if eq.assigned_vehicle_id else "Warehouse Pool"),
            "holder_label": emp_map.get(eq.assigned_employee_id) or veh_map.get(eq.assigned_vehicle_id) or "Static Warehouse",
        }
        for eq in items
    ]


@router.post("/equipment")
def create_equipment(
    payload: schemas.EquipmentCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to register equipment")

    # Enforce exclusive possession check constraint (Employee XOR Vehicle)
    if payload.assigned_employee_id and payload.assigned_vehicle_id:
        raise HTTPException(
            status_code=400,
            detail="Exclusive Possession Violation: Equipment cannot be assigned to both an Employee and a Vehicle simultaneously."
        )

    eq = models.Equipment(
        id=str(uuid.uuid4()),
        name=payload.name,
        category=payload.category,
        serial_number=payload.serial_number,
        condition_status=payload.condition_status,
        assigned_employee_id=payload.assigned_employee_id,
        assigned_vehicle_id=payload.assigned_vehicle_id,
    )
    db.add(eq)
    db.commit()
    db.refresh(eq)
    return {"id": eq.id, "name": eq.name, "serial_number": eq.serial_number}


@router.patch("/equipment/{equipment_id}/assign")
def assign_equipment_exclusive(
    equipment_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Handover / Take-over tool with strict exclusive assignment enforcement (Employee XOR Vehicle XOR Warehouse).
    """
    eq = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    emp_id = payload.get("assigned_employee_id")
    veh_id = payload.get("assigned_vehicle_id")
    if emp_id and veh_id:
        raise HTTPException(
            status_code=400,
            detail="Equipment can only be assigned to either an Employee OR a Vehicle, never both."
        )

    old_holder = {"employee": eq.assigned_employee_id, "vehicle": eq.assigned_vehicle_id}
    eq.assigned_employee_id = emp_id or None
    eq.assigned_vehicle_id = veh_id or None
    if "condition_status" in payload:
        eq.condition_status = payload["condition_status"]

    db.commit()
    log_audit(db, "equipment", "UPDATE_ASSIGNMENT", eq.id, current_user.email, old_holder, {"employee": eq.assigned_employee_id, "vehicle": eq.assigned_vehicle_id})
    return {"id": eq.id, "assigned_employee_id": eq.assigned_employee_id, "assigned_vehicle_id": eq.assigned_vehicle_id}


@router.delete("/equipment/{equipment_id}")
def delete_equipment(
    equipment_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to delete equipment")
    eq = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    db.delete(eq)
    db.commit()
    log_audit(db, "equipment", "DELETE", equipment_id, current_user.email, {"name": eq.name, "serial": eq.serial_number}, None)
    return {"status": "deleted", "id": equipment_id}
