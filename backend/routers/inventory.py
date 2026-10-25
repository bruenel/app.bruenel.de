from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import uuid

import models
import schemas
import database
from core.security import get_current_user, get_effective_tier, ensure_employee_linked
from core.audit import log_audit

router = APIRouter()


@router.get("/lagers")
def list_lagers(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    static_lagers = db.query(models.Lager).all()
    vehicles = db.query(models.Vehicle).filter(models.Vehicle.is_active == True).all()

    return {
        "static_lagers": [
            {
                "id": l.id,
                "name": l.name,
                "location": l.location,
                "manager_id": l.manager_id,
                "manager_name": emp_map.get(l.manager_id, "Unassigned"),
            }
            for l in static_lagers
        ],
        "vehicle_lagers": [
            {
                "id": v.id,
                "name": f"{v.plate_number} ({v.model})",
                "plate_number": v.plate_number,
                "model": v.model,
            }
            for v in vehicles
        ],
    }


@router.post("/lagers")
def create_lager(
    payload: schemas.LagerCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Unauthorized to create static lagers")
    lg = models.Lager(
        id=str(uuid.uuid4()),
        name=payload.name,
        location=payload.location,
        manager_id=payload.manager_id,
    )
    db.add(lg)
    db.commit()
    db.refresh(lg)
    return {"id": lg.id, "name": lg.name, "location": lg.location}


@router.get("/materials")
def list_materials(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    mats = db.query(models.Material).order_by(models.Material.sku.asc()).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "sku": m.sku,
            "category": m.category,
            "unit": m.unit,
            "min_stock_threshold": m.min_stock_threshold,
            "unit_cost": float(m.unit_cost or 0),
        }
        for m in mats
    ]


@router.post("/materials")
def create_material(
    payload: schemas.MaterialCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to create material SKUs")
    if db.query(models.Material).filter(models.Material.sku == payload.sku).first():
        raise HTTPException(status_code=400, detail="SKU already exists")

    mat = models.Material(
        id=str(uuid.uuid4()),
        name=payload.name,
        sku=payload.sku,
        category=payload.category,
        unit=payload.unit,
        min_stock_threshold=payload.min_stock_threshold,
        unit_cost=payload.unit_cost,
    )
    db.add(mat)
    db.commit()
    db.refresh(mat)
    return {"id": mat.id, "name": mat.name, "sku": mat.sku}


def get_aggregated_stock(db: Session, material_id: str, lager_type: str, lager_id: str) -> int:
    """
    Event-sourced stock calculation via SUM(quantity) over material_transactions (Chapter 5 Module 3).
    """
    total = (
        db.query(func.coalesce(func.sum(models.MaterialTransaction.quantity), 0))
        .filter(
            models.MaterialTransaction.material_id == material_id,
            models.MaterialTransaction.source_lager_type == lager_type,
            models.MaterialTransaction.source_lager_id == lager_id,
        )
        .scalar()
    )
    return int(total or 0)


@router.get("/stock")
def get_inventory_stock(
    lager_type: Optional[str] = None,
    lager_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    mats = {m.id: m for m in db.query(models.Material).all()}
    static_map = {l.id: l.name for l in db.query(models.Lager).all()}
    veh_map = {v.id: f"{v.plate_number} ({v.model})" for v in db.query(models.Vehicle).all()}

    query = db.query(
        models.MaterialTransaction.material_id,
        models.MaterialTransaction.source_lager_type,
        models.MaterialTransaction.source_lager_id,
        func.sum(models.MaterialTransaction.quantity).label("current_stock"),
    ).group_by(
        models.MaterialTransaction.material_id,
        models.MaterialTransaction.source_lager_type,
        models.MaterialTransaction.source_lager_id,
    )

    if lager_type:
        query = query.filter(models.MaterialTransaction.source_lager_type == lager_type)
    if lager_id:
        query = query.filter(models.MaterialTransaction.source_lager_id == lager_id)

    rows = query.all()
    results = []
    for r in rows:
        m = mats.get(r.material_id)
        if not m:
            continue
        l_name = static_map.get(r.source_lager_id) if r.source_lager_type == "StaticLager" else veh_map.get(r.source_lager_id, r.source_lager_id)
        qty = int(r.current_stock or 0)
        results.append({
            "material_id": m.id,
            "material_name": m.name,
            "sku": m.sku,
            "unit": m.unit,
            "category": m.category,
            "lager_type": r.source_lager_type,
            "lager_id": r.source_lager_id,
            "lager_name": l_name,
            "current_stock": qty,
            "min_stock_threshold": m.min_stock_threshold,
            "low_stock_alert": qty < (m.min_stock_threshold or 0),
        })
    return results


@router.post("/buchen")
def execute_material_buchen(
    payload: schemas.MaterialBuchenRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Execute material transfer, restock, consumption, or Schwund reconciliation (Chapter 5 Module 3).
    """
    emp = ensure_employee_linked(db, current_user)
    if payload.transaction_type == "Schwund" and (not payload.note or len(payload.note.strip()) < 3):
        raise HTTPException(
            status_code=400,
            detail="Schwund (wastage/loss) requires a mandatory text justification note."
        )

    qty = abs(int(payload.quantity))
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")

    # Determine sign for source lager
    if payload.transaction_type in ("Consume", "Schwund"):
        signed_qty = -qty
    elif payload.transaction_type == "Return":
        signed_qty = qty
    elif payload.transaction_type == "CheckOut":
        # If target_lager_id is provided, it's a transfer from source_lager (-qty) to target_lager (+qty)
        # If no target_lager_id is provided and it's initial stock addition into StaticLager, allow positive restock
        if payload.target_lager_id:
            signed_qty = -qty
        else:
            signed_qty = qty
    else:
        signed_qty = -qty

    tx = models.MaterialTransaction(
        id=str(uuid.uuid4()),
        material_id=payload.material_id,
        employee_id=emp.id,
        project_id=payload.project_id,
        object_id=payload.object_id,
        source_lager_type=payload.source_lager_type,
        source_lager_id=payload.source_lager_id,
        transaction_type=payload.transaction_type,
        quantity=signed_qty,
        note=payload.note,
    )
    db.add(tx)

    # If transfer between StaticLager and Vehicle (e.g., CheckOut to Vehicle), create corresponding positive ledger entry
    if payload.target_lager_id and payload.target_lager_type:
        tx_target = models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=payload.material_id,
            employee_id=emp.id,
            project_id=payload.project_id,
            object_id=payload.object_id,
            source_lager_type=payload.target_lager_type,
            source_lager_id=payload.target_lager_id,
            transaction_type="Return" if payload.transaction_type == "CheckOut" else payload.transaction_type,
            quantity=qty,
            note=f"Transfer from {payload.source_lager_type} ({payload.note or 'Buchen'})",
        )
        db.add(tx_target)

    db.commit()
    new_balance = get_aggregated_stock(db, payload.material_id, payload.source_lager_type, payload.source_lager_id)
    log_audit(db, "material_transactions", "INSERT", tx.id, current_user.email, None, {"type": payload.transaction_type, "qty": signed_qty, "note": payload.note})
    return {
        "transaction_id": tx.id,
        "transaction_type": payload.transaction_type,
        "quantity_delta": signed_qty,
        "new_stock_level": new_balance,
    }


@router.get("/transactions")
def list_material_transactions(
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    mats = {m.id: f"{m.name} ({m.sku})" for m in db.query(models.Material).all()}
    emps = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    static_map = {l.id: l.name for l in db.query(models.Lager).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}

    txs = db.query(models.MaterialTransaction).order_by(models.MaterialTransaction.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": t.id,
            "material_id": t.material_id,
            "material_name": mats.get(t.material_id, t.material_id),
            "employee_id": t.employee_id,
            "employee_name": emps.get(t.employee_id, t.employee_id),
            "source_lager_type": t.source_lager_type,
            "source_lager_id": t.source_lager_id,
            "source_lager_name": static_map.get(t.source_lager_id) if t.source_lager_type == "StaticLager" else veh_map.get(t.source_lager_id, t.source_lager_id),
            "transaction_type": t.transaction_type,
            "quantity": t.quantity,
            "note": t.note,
            "timestamp": t.timestamp.isoformat() if t.timestamp else None,
        }
        for t in txs
    ]
