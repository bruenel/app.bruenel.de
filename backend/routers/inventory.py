from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
import uuid

import models
import schemas
import database
from core.security import get_current_user, get_effective_tier, ensure_employee_linked
from core.audit import log_audit

router = APIRouter()


def get_aggregated_stock(db: Session, material_id: str, lager_type: str, lager_id: str) -> int:
    """
    Event-sourced stock calculation via SUM(quantity) over material_transactions.
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


def _ensure_default_lager(db: Session):
    static_lagers = db.query(models.Lager).order_by(models.Lager.name.asc()).all()
    if not static_lagers:
        default_lg = models.Lager(
            id=str(uuid.uuid4()),
            name="Hauptlager Brünel (Zentrallager)",
            location="Rheingaustraße 42, 65391 Lorch / Hessen",
            manager_id=None,
            attributes={
                "code": "WH-MAIN-01",
                "type": "Zentrallager",
                "street": "Rheingaustraße 42",
                "postal_code": "65391",
                "city": "Lorch / Hessen",
                "phone": "+49 6726 80790",
                "capacity": "LWL Trommeln, Spleiß- & Montagezubehör",
                "status": "Active",
                "notes": "Zentrales Hauptlager für Glasfaser- & Tiefbau-Materialien",
            },
        )
        db.add(default_lg)
        db.commit()
        db.refresh(default_lg)
        static_lagers = [default_lg]
    return static_lagers


@router.get("/lagers")
def list_lagers(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    static_lagers = _ensure_default_lager(db)
    vehicles = db.query(models.Vehicle).filter(models.Vehicle.is_active == True).all()
    mats = {m.id: m for m in db.query(models.Material).all()}

    # Compute stock per lager
    tx_groups = (
        db.query(
            models.MaterialTransaction.source_lager_type,
            models.MaterialTransaction.source_lager_id,
            models.MaterialTransaction.material_id,
            func.sum(models.MaterialTransaction.quantity).label("qty"),
        )
        .group_by(
            models.MaterialTransaction.source_lager_type,
            models.MaterialTransaction.source_lager_id,
            models.MaterialTransaction.material_id,
        )
        .all()
    )

    lager_items_map = {}
    for row in tx_groups:
        key = (row.source_lager_type, row.source_lager_id)
        m = mats.get(row.material_id)
        if not m:
            continue
        qty = int(row.qty or 0)
        lager_items_map.setdefault(key, []).append({
            "material_id": m.id,
            "material_name": m.name,
            "sku": m.sku,
            "unit": m.unit,
            "category": m.category,
            "unit_cost": float(m.unit_cost or 0),
            "min_stock_threshold": m.min_stock_threshold,
            "current_stock": qty,
            "stock_value": round(qty * float(m.unit_cost or 0), 2),
        })

    static_out = []
    for l in static_lagers:
        attrs = dict(l.attributes or {})
        items = lager_items_map.get(("StaticLager", l.id), [])
        total_units = sum(max(0, i["current_stock"]) for i in items)
        total_value = round(sum(max(0.0, i["stock_value"]) for i in items), 2)
        static_out.append({
            "id": l.id,
            "name": l.name,
            "location": l.location,
            "manager_id": l.manager_id,
            "manager_name": emp_map.get(l.manager_id, "Nicht zugewiesen"),
            "code": attrs.get("code") or f"WH-{l.id[:4].upper()}",
            "type": attrs.get("type") or "Zentrallager",
            "street": attrs.get("street") or "",
            "postal_code": attrs.get("postal_code") or "",
            "city": attrs.get("city") or "",
            "phone": attrs.get("phone") or "",
            "capacity": attrs.get("capacity") or "",
            "notes": attrs.get("notes") or "",
            "status": attrs.get("status") or "Active",
            "attributes": attrs,
            "items": items,
            "total_skus": len([i for i in items if i["current_stock"] > 0]),
            "total_units": total_units,
            "total_value": total_value,
        })

    vehicle_out = []
    for v in vehicles:
        items = lager_items_map.get(("Vehicle", v.id), [])
        vehicle_out.append({
            "id": v.id,
            "name": f"{v.plate_number} ({v.model})",
            "plate_number": v.plate_number,
            "model": v.model,
            "items": items,
            "total_skus": len([i for i in items if i["current_stock"] > 0]),
            "total_units": sum(max(0, i["current_stock"]) for i in items),
        })

    return {
        "static_lagers": static_out,
        "vehicle_lagers": vehicle_out,
    }


@router.post("/lagers")
def create_lager(
    payload: schemas.LagerCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung zum Anlegen von Lagern.")
    attrs = dict(payload.attributes or {})
    attrs.update({
        "code": payload.code or f"WH-{str(uuid.uuid4())[:4].upper()}",
        "type": payload.type or "Zentrallager",
        "street": payload.street or "",
        "postal_code": payload.postal_code or "",
        "city": payload.city or "",
        "phone": payload.phone or "",
        "capacity": payload.capacity or "",
        "notes": payload.notes or "",
        "status": payload.status or "Active",
    })
    lg = models.Lager(
        id=str(uuid.uuid4()),
        name=payload.name,
        location=payload.location,
        manager_id=payload.manager_id or None,
        attributes=attrs,
    )
    db.add(lg)
    db.commit()
    db.refresh(lg)
    log_audit(db, "lagers", "INSERT", lg.id, current_user.email, None, {"name": lg.name, "location": lg.location})
    return {"id": lg.id, "name": lg.name, "location": lg.location, "attributes": attrs}


@router.put("/lagers/{lager_id}")
def update_lager(
    lager_id: str,
    payload: schemas.LagerCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung.")
    lg = db.query(models.Lager).filter(models.Lager.id == lager_id).first()
    if not lg:
        raise HTTPException(status_code=404, detail="Lager nicht gefunden.")
    attrs = dict(lg.attributes or {})
    attrs.update({
        "code": payload.code or attrs.get("code") or f"WH-{lg.id[:4].upper()}",
        "type": payload.type or attrs.get("type") or "Zentrallager",
        "street": payload.street if payload.street is not None else attrs.get("street", ""),
        "postal_code": payload.postal_code if payload.postal_code is not None else attrs.get("postal_code", ""),
        "city": payload.city if payload.city is not None else attrs.get("city", ""),
        "phone": payload.phone if payload.phone is not None else attrs.get("phone", ""),
        "capacity": payload.capacity if payload.capacity is not None else attrs.get("capacity", ""),
        "notes": payload.notes if payload.notes is not None else attrs.get("notes", ""),
        "status": payload.status or attrs.get("status") or "Active",
    })
    lg.name = payload.name
    lg.location = payload.location
    lg.manager_id = payload.manager_id or None
    lg.attributes = attrs
    db.commit()
    db.refresh(lg)
    return {"id": lg.id, "name": lg.name, "location": lg.location, "attributes": attrs}


@router.delete("/lagers/{lager_id}")
def delete_lager(
    lager_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung.")
    lg = db.query(models.Lager).filter(models.Lager.id == lager_id).first()
    if not lg:
        raise HTTPException(status_code=404, detail="Lager nicht gefunden.")
    db.query(models.MaterialTransaction).filter(
        models.MaterialTransaction.source_lager_type == "StaticLager",
        models.MaterialTransaction.source_lager_id == lager_id,
    ).delete()
    db.delete(lg)
    db.commit()
    log_audit(db, "lagers", "DELETE", lager_id, current_user.email, None, None)
    return {"status": "deleted", "id": lager_id}


@router.post("/lagers/{lager_id}/fill")
def fill_lager_with_items(
    lager_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Fill a warehouse with one or multiple materials at once.
    payload: { items: [{ material_id, quantity, mode: 'add' | 'set', note }], general_note }
    """
    emp = ensure_employee_linked(db, current_user)
    items = payload.get("items") or []
    general_note = payload.get("general_note") or "Wareneingang / Lagerbefüllung"
    if not items:
        raise HTTPException(status_code=400, detail="Keine Artikel zur Befüllung angegeben.")

    created_txs = []
    for item in items:
        mat_id = item.get("material_id")
        qty = int(item.get("quantity") or 0)
        mode = item.get("mode") or "add"
        item_note = item.get("note") or general_note
        if not mat_id:
            continue

        current_bal = get_aggregated_stock(db, mat_id, "StaticLager", lager_id)
        if mode == "set":
            delta = qty - current_bal
            if delta == 0:
                continue
            tx_type = "Return" if delta > 0 else "Schwund"
        else:
            if qty <= 0:
                continue
            delta = qty
            tx_type = "Return"

        tx = models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=mat_id,
            employee_id=emp.id,
            source_lager_type="StaticLager",
            source_lager_id=lager_id,
            transaction_type=tx_type,
            quantity=delta,
            note=item_note,
        )
        db.add(tx)
        created_txs.append(tx.id)

    db.commit()
    return {"status": "filled", "transactions_created": len(created_txs), "transaction_ids": created_txs}


@router.get("/materials")
def list_materials(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    mats = db.query(models.Material).order_by(models.Material.sku.asc()).all()
    static_map = {l.id: l.name for l in db.query(models.Lager).all()}
    veh_map = {v.id: f"{v.plate_number} ({v.model})" for v in db.query(models.Vehicle).all()}

    tx_groups = (
        db.query(
            models.MaterialTransaction.material_id,
            models.MaterialTransaction.source_lager_type,
            models.MaterialTransaction.source_lager_id,
            func.sum(models.MaterialTransaction.quantity).label("qty"),
        )
        .group_by(
            models.MaterialTransaction.material_id,
            models.MaterialTransaction.source_lager_type,
            models.MaterialTransaction.source_lager_id,
        )
        .all()
    )

    mat_stock_map = {}
    for r in tx_groups:
        qty = int(r.qty or 0)
        lname = (
            static_map.get(r.source_lager_id, "Hauptlager")
            if r.source_lager_type == "StaticLager"
            else veh_map.get(r.source_lager_id, r.source_lager_id)
        )
        mat_stock_map.setdefault(r.material_id, []).append({
            "lager_type": r.source_lager_type,
            "lager_id": r.source_lager_id,
            "lager_name": lname,
            "quantity": qty,
        })

    results = []
    for m in mats:
        attrs = dict(m.attributes or {})
        breakdown = mat_stock_map.get(m.id, [])
        total_stock = sum(b["quantity"] for b in breakdown)
        results.append({
            "id": m.id,
            "name": m.name,
            "sku": m.sku,
            "category": m.category,
            "unit": m.unit,
            "min_stock_threshold": m.min_stock_threshold,
            "unit_cost": float(m.unit_cost or 0),
            "manufacturer": attrs.get("manufacturer") or "",
            "supplier": attrs.get("supplier") or "",
            "ean_barcode": attrs.get("ean_barcode") or "",
            "shelf_location": attrs.get("shelf_location") or "",
            "package_size": attrs.get("package_size") or "",
            "description": attrs.get("description") or "",
            "attributes": attrs,
            "total_stock": total_stock,
            "stock_by_lager": breakdown,
            "low_stock_alert": total_stock < (m.min_stock_threshold or 0),
        })
    return results


@router.post("/materials")
def create_material(
    payload: schemas.MaterialCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Unauthorized to create material SKUs")
    if db.query(models.Material).filter(models.Material.sku == payload.sku).first():
        raise HTTPException(status_code=400, detail=f"SKU '{payload.sku}' existiert bereits.")

    attrs = dict(payload.attributes or {})
    attrs.update({
        "manufacturer": payload.manufacturer or "",
        "supplier": payload.supplier or "",
        "ean_barcode": payload.ean_barcode or "",
        "shelf_location": payload.shelf_location or "",
        "package_size": payload.package_size or "",
        "description": payload.description or "",
    })

    mat = models.Material(
        id=str(uuid.uuid4()),
        name=payload.name,
        sku=payload.sku,
        category=payload.category,
        unit=payload.unit,
        min_stock_threshold=payload.min_stock_threshold,
        unit_cost=payload.unit_cost,
        attributes=attrs,
    )
    db.add(mat)
    db.commit()
    db.refresh(mat)

    # If initial stock and warehouse are provided, immediately book initial stock
    init_qty = int(payload.initial_stock or 0)
    if init_qty > 0:
        lagers = _ensure_default_lager(db)
        target_lid = payload.initial_lager_id or (lagers[0].id if lagers else None)
        if target_lid:
            emp = ensure_employee_linked(db, current_user)
            tx = models.MaterialTransaction(
                id=str(uuid.uuid4()),
                material_id=mat.id,
                employee_id=emp.id,
                source_lager_type="StaticLager",
                source_lager_id=target_lid,
                transaction_type="Return",
                quantity=init_qty,
                note=f"Anfangsbestand bei Artikelanlage ({mat.sku})",
            )
            db.add(tx)
            db.commit()

    return {"id": mat.id, "name": mat.name, "sku": mat.sku, "attributes": attrs}


@router.put("/materials/{material_id}")
def update_material(
    material_id: str,
    payload: schemas.MaterialCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung.")
    mat = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material nicht gefunden.")

    existing_sku = (
        db.query(models.Material)
        .filter(models.Material.sku == payload.sku, models.Material.id != material_id)
        .first()
    )
    if existing_sku:
        raise HTTPException(status_code=400, detail=f"SKU '{payload.sku}' wird bereits verwendet.")

    attrs = dict(mat.attributes or {})
    attrs.update({
        "manufacturer": payload.manufacturer if payload.manufacturer is not None else attrs.get("manufacturer", ""),
        "supplier": payload.supplier if payload.supplier is not None else attrs.get("supplier", ""),
        "ean_barcode": payload.ean_barcode if payload.ean_barcode is not None else attrs.get("ean_barcode", ""),
        "shelf_location": payload.shelf_location if payload.shelf_location is not None else attrs.get("shelf_location", ""),
        "package_size": payload.package_size if payload.package_size is not None else attrs.get("package_size", ""),
        "description": payload.description if payload.description is not None else attrs.get("description", ""),
    })

    mat.name = payload.name
    mat.sku = payload.sku
    mat.category = payload.category
    mat.unit = payload.unit
    mat.min_stock_threshold = payload.min_stock_threshold
    mat.unit_cost = payload.unit_cost
    mat.attributes = attrs
    db.commit()
    db.refresh(mat)
    return {"id": mat.id, "name": mat.name, "sku": mat.sku, "attributes": attrs}


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung.")
    mat = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material nicht gefunden.")
    db.query(models.MaterialTransaction).filter(models.MaterialTransaction.material_id == material_id).delete()
    db.query(models.InventoryStock).filter(models.InventoryStock.material_id == material_id).delete()
    db.delete(mat)
    db.commit()
    return {"status": "deleted", "id": material_id}


@router.get("/stock")
def get_inventory_stock(
    lager_type: Optional[str] = None,
    lager_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    static_lagers = _ensure_default_lager(db)
    mats = {m.id: m for m in db.query(models.Material).all()}
    static_map = {l.id: l.name for l in static_lagers}
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
    seen_mat_ids = set()

    for r in rows:
        m = mats.get(r.material_id)
        if not m:
            continue
        seen_mat_ids.add(m.id)
        attrs = dict(m.attributes or {})
        l_name = (
            static_map.get(r.source_lager_id, "Hauptlager")
            if r.source_lager_type == "StaticLager"
            else veh_map.get(r.source_lager_id, r.source_lager_id)
        )
        qty = int(r.current_stock or 0)
        unit_cost = float(m.unit_cost or 0)
        results.append({
            "material_id": m.id,
            "material_name": m.name,
            "sku": m.sku,
            "unit": m.unit,
            "category": m.category,
            "unit_cost": unit_cost,
            "stock_value": round(max(0, qty) * unit_cost, 2),
            "shelf_location": attrs.get("shelf_location") or "",
            "manufacturer": attrs.get("manufacturer") or "",
            "lager_type": r.source_lager_type,
            "lager_id": r.source_lager_id,
            "lager_name": l_name,
            "current_stock": qty,
            "min_stock_threshold": m.min_stock_threshold,
            "low_stock_alert": qty < (m.min_stock_threshold or 0),
        })

    # Include materials that have 0 transactions so far so they are visible in Stock Balances
    default_lager = static_lagers[0] if static_lagers else None
    if default_lager and not lager_type and not lager_id:
        for mid, m in mats.items():
            if mid not in seen_mat_ids:
                attrs = dict(m.attributes or {})
                results.append({
                    "material_id": m.id,
                    "material_name": m.name,
                    "sku": m.sku,
                    "unit": m.unit,
                    "category": m.category,
                    "unit_cost": float(m.unit_cost or 0),
                    "stock_value": 0.0,
                    "shelf_location": attrs.get("shelf_location") or "",
                    "manufacturer": attrs.get("manufacturer") or "",
                    "lager_type": "StaticLager",
                    "lager_id": default_lager.id,
                    "lager_name": default_lager.name,
                    "current_stock": 0,
                    "min_stock_threshold": m.min_stock_threshold,
                    "low_stock_alert": 0 < (m.min_stock_threshold or 0),
                })

    return results


@router.post("/buchen")
def execute_material_buchen(
    payload: schemas.MaterialBuchenRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Execute material transfer, restock, consumption, inventory set, or Schwund reconciliation.
    """
    emp = ensure_employee_linked(db, current_user)
    if payload.transaction_type == "Schwund" and (not payload.note or len(payload.note.strip()) < 3):
        raise HTTPException(
            status_code=400,
            detail="Schwund erfordert eine Begründung (mindestens 3 Zeichen)."
        )

    if payload.transaction_type == "InventorySet":
        target_qty = max(0, int(payload.quantity))
        current_bal = get_aggregated_stock(db, payload.material_id, payload.source_lager_type, payload.source_lager_id)
        signed_qty = target_qty - current_bal
        if signed_qty == 0:
            return {
                "transaction_id": None,
                "transaction_type": "InventorySet",
                "quantity_delta": 0,
                "new_stock_level": current_bal,
            }
    else:
        qty = abs(int(payload.quantity))
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Menge muss größer als 0 sein.")

        if payload.transaction_type in ("Consume", "Schwund"):
            signed_qty = -qty
        elif payload.transaction_type in ("Return", "Restock"):
            signed_qty = qty
        elif payload.transaction_type in ("CheckOut", "Transfer"):
            signed_qty = -qty
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

    # If transfer between Lagers/Vehicles, create corresponding positive ledger entry in target
    if payload.target_lager_id and payload.target_lager_type and payload.transaction_type in ("CheckOut", "Transfer"):
        tx_target = models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=payload.material_id,
            employee_id=emp.id,
            project_id=payload.project_id,
            object_id=payload.object_id,
            source_lager_type=payload.target_lager_type,
            source_lager_id=payload.target_lager_id,
            transaction_type="Return",
            quantity=abs(signed_qty),
            note=f"Umlagerung aus {payload.source_lager_type} ({payload.note or 'Transfer'})",
        )
        db.add(tx_target)

    db.commit()
    new_balance = get_aggregated_stock(db, payload.material_id, payload.source_lager_type, payload.source_lager_id)
    log_audit(
        db,
        "material_transactions",
        "INSERT",
        tx.id,
        current_user.email,
        None,
        {"type": payload.transaction_type, "qty": signed_qty, "note": payload.note},
    )
    return {
        "transaction_id": tx.id,
        "transaction_type": payload.transaction_type,
        "quantity_delta": signed_qty,
        "new_stock_level": new_balance,
    }


@router.post("/abholung")
def execute_worker_lager_abholung(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Worker submits 'Abholung von Lager': deducts multiple items from selected warehouse
    and documents date, items, amounts, and summary.
    """
    emp = ensure_employee_linked(db, current_user)
    lager_id = payload.get("lager_id")
    pickup_date = payload.get("pickup_date") or datetime.utcnow().strftime("%Y-%m-%d")
    project_name = payload.get("project_name") or ""
    summary_note = payload.get("summary_note") or ""
    items = payload.get("items") or []

    if not lager_id:
        raise HTTPException(status_code=400, detail="Bitte wählen Sie ein Lager aus.")
    if not items:
        raise HTTPException(status_code=400, detail="Bitte mindestens einen Artikel hinzufügen.")

    batch_code = f"ABH-{str(int(datetime.utcnow().timestamp()))[-6:]}"
    inserted_ids = []
    updated_balances = {}

    for item in items:
        mat_id = item.get("material_id")
        qty = abs(int(item.get("quantity") or 0))
        item_note = item.get("note") or ""
        if not mat_id or qty <= 0:
            continue

        note_parts = [
            f"[{batch_code} · {pickup_date}]",
            f"Projekt: {project_name}" if project_name else "",
            f"Pos: {item_note}" if item_note else "",
            f"Info: {summary_note}" if summary_note else "Abholung von Lager",
        ]
        full_note = " | ".join([p for p in note_parts if p])

        tx = models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=mat_id,
            employee_id=emp.id,
            project_id=payload.get("project_id") or None,
            source_lager_type="StaticLager",
            source_lager_id=lager_id,
            transaction_type="CheckOut",
            quantity=-qty,
            note=full_note,
        )
        db.add(tx)
        inserted_ids.append(tx.id)

    db.commit()
    for item in items:
        mat_id = item.get("material_id")
        if mat_id:
            updated_balances[mat_id] = get_aggregated_stock(db, mat_id, "StaticLager", lager_id)

    return {
        "status": "completed",
        "batch_code": batch_code,
        "transaction_ids": inserted_ids,
        "updated_balances": updated_balances,
        "message": f"Abholung ({batch_code}) erfolgreich dokumentiert und vom Lagerbestand abgezogen.",
    }


@router.get("/transactions")
def list_material_transactions(
    limit: int = 150,
    employee_id: Optional[str] = None,
    lager_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    mats = {m.id: m for m in db.query(models.Material).all()}
    emps = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    static_map = {l.id: l.name for l in db.query(models.Lager).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}

    query = db.query(models.MaterialTransaction)
    if employee_id:
        query = query.filter(models.MaterialTransaction.employee_id == employee_id)
    if lager_id:
        query = query.filter(models.MaterialTransaction.source_lager_id == lager_id)

    txs = query.order_by(models.MaterialTransaction.timestamp.desc()).limit(limit).all()
    results = []
    for t in txs:
        m = mats.get(t.material_id)
        results.append({
            "id": t.id,
            "material_id": t.material_id,
            "material_name": f"{m.name} ({m.sku})" if m else t.material_id,
            "sku": m.sku if m else "",
            "unit": m.unit if m else "Stk.",
            "employee_id": t.employee_id,
            "employee_name": emps.get(t.employee_id, t.employee_id),
            "source_lager_type": t.source_lager_type,
            "source_lager_id": t.source_lager_id,
            "source_lager_name": (
                static_map.get(t.source_lager_id, "Hauptlager")
                if t.source_lager_type == "StaticLager"
                else veh_map.get(t.source_lager_id, t.source_lager_id)
            ),
            "transaction_type": t.transaction_type,
            "quantity": t.quantity,
            "note": t.note,
            "timestamp": t.timestamp.isoformat() if t.timestamp else None,
        })
    return results


@router.delete("/transactions/{tx_id}")
def delete_material_transaction(
    tx_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 3:
        raise HTTPException(status_code=403, detail="Keine Berechtigung.")
    tx = db.query(models.MaterialTransaction).filter(models.MaterialTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Buchung nicht gefunden.")
    db.delete(tx)
    db.commit()
    return {"status": "deleted", "id": tx_id}
