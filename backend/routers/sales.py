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
from routers.inventory import get_aggregated_stock

router = APIRouter()


@router.get("/catalog")
def list_sales_catalog(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = db.query(models.SalesCatalog).filter(models.SalesCatalog.is_active == True).order_by(models.SalesCatalog.item_name.asc()).all()
    return [
        {
            "id": c.id,
            "item_name": c.item_name,
            "sku": c.sku,
            "category": c.category,
            "buy_price": float(c.buy_price or 0),
            "sell_price": float(c.sell_price or 0),
            "commission_amount": float(c.commission_amount or 0),
            "is_active": c.is_active,
        }
        for c in items
    ]


@router.post("/catalog")
def create_catalog_item(
    payload: schemas.SalesCatalogCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 2:
        raise HTTPException(status_code=403, detail="Only Super Admin or Project Manager can manage the Sales Catalog.")

    item = models.SalesCatalog(
        id=str(uuid.uuid4()),
        item_name=payload.item_name,
        sku=payload.sku,
        category=payload.category,
        buy_price=payload.buy_price,
        sell_price=payload.sell_price,
        commission_amount=payload.commission_amount,
        is_active=payload.is_active,
    )
    db.add(item)

    # Ensure corresponding Material SKU exists so vehicle stock tracking works seamlessly
    if not db.query(models.Material).filter(models.Material.sku == payload.sku).first():
        db.add(models.Material(
            id=str(uuid.uuid4()),
            name=payload.item_name,
            sku=payload.sku,
            category=payload.category or "Hardware",
            unit="pcs",
            min_stock_threshold=5,
            unit_cost=payload.buy_price,
        ))

    db.commit()
    db.refresh(item)
    return {"id": item.id, "item_name": item.item_name, "sku": item.sku}


@router.post("/transaction")
def process_field_sale_transaction(
    payload: schemas.FieldSaleCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Process on-site hardware upsell (Chapter 5 Module 7):
    1. Validates that the active vehicle_id has sufficient inventory of the catalog item SKU.
    2. Records CASH or CARD payment.
    3. Deducts mobile stock automatically and calculates technician commission (Provision).
    """
    emp = ensure_employee_linked(db, current_user)
    cat_item = db.query(models.SalesCatalog).filter(models.SalesCatalog.id == payload.catalog_item_id).first()
    if not cat_item:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    mat = db.query(models.Material).filter(models.Material.sku == cat_item.sku).first()
    if mat:
        available_stock = get_aggregated_stock(db, mat.id, "Vehicle", payload.vehicle_id)
        if available_stock < payload.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient vehicle inventory for '{cat_item.item_name}' (SKU {cat_item.sku}). Available in vehicle: {available_stock}, Requested: {payload.quantity}."
            )

    total_rev = round(float(cat_item.sell_price) * payload.quantity, 2)
    total_comm = round(float(cat_item.commission_amount) * payload.quantity, 2)
    sale_id = str(uuid.uuid4())

    sale = models.FieldSale(
        sale_id=sale_id,
        employee_id=emp.id,
        vehicle_id=payload.vehicle_id,
        project_id=payload.project_id,
        object_id=payload.object_id,
        catalog_item_id=cat_item.id,
        customer_name=payload.customer_name,
        customer_unit=payload.customer_unit,
        quantity=payload.quantity,
        payment_method=payload.payment_method,
        total_revenue=total_rev,
        total_commission=total_comm,
        status="COMPLETED",
    )
    db.add(sale)

    # If running on SQLite (where PL/pgSQL trigger is not active), insert the FIELD_SALE material_transaction in application layer.
    # On PostgreSQL, check if trigger already inserted it to avoid double deduction.
    if mat and not database.is_postgres():
        db.add(models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=mat.id,
            employee_id=emp.id,
            project_id=payload.project_id,
            object_id=payload.object_id,
            source_lager_type="Vehicle",
            source_lager_id=payload.vehicle_id,
            transaction_type="FIELD_SALE",
            quantity=-payload.quantity,
            note=f"Field Sale ID: {sale_id}",
        ))

    db.commit()
    log_audit(db, "field_sales", "INSERT", sale_id, current_user.email, None, {"sku": cat_item.sku, "qty": payload.quantity, "revenue": total_rev, "commission": total_comm})

    remaining = get_aggregated_stock(db, mat.id, "Vehicle", payload.vehicle_id) if mat else 0
    return {
        "sale_id": sale_id,
        "item_name": cat_item.item_name,
        "quantity": payload.quantity,
        "payment_method": payload.payment_method,
        "total_revenue": total_rev,
        "total_commission": total_comm,
        "remaining_vehicle_stock": remaining,
        "status": "COMPLETED",
    }


@router.get("/dashboard")
def get_sales_dashboard(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}
    cat_map = {c.id: c for c in db.query(models.SalesCatalog).all()}

    query = db.query(models.FieldSale)
    if tier == 5:
        query = query.filter(models.FieldSale.employee_id == current_user.employee_id)

    sales = query.order_by(models.FieldSale.sale_timestamp.desc()).all()

    total_rev = sum(float(s.total_revenue or 0) for s in sales if s.status == "COMPLETED")
    total_comm = sum(float(s.total_commission or 0) for s in sales if s.status == "COMPLETED")
    total_units = sum(int(s.quantity or 0) for s in sales if s.status == "COMPLETED")

    leaderboard = {}
    for s in sales:
        if s.status != "COMPLETED":
            continue
        ename = emp_map.get(s.employee_id, "Technician")
        if ename not in leaderboard:
            leaderboard[ename] = {"employee_id": s.employee_id, "employee_name": ename, "units": 0, "revenue": 0.0, "commission": 0.0}
        leaderboard[ename]["units"] += s.quantity
        leaderboard[ename]["revenue"] = round(leaderboard[ename]["revenue"] + float(s.total_revenue or 0), 2)
        leaderboard[ename]["commission"] = round(leaderboard[ename]["commission"] + float(s.total_commission or 0), 2)

    return {
        "total_revenue": round(total_rev, 2),
        "total_commission": round(total_comm, 2),
        "total_units_sold": total_units,
        "leaderboard": sorted(leaderboard.values(), key=lambda x: -x["revenue"]),
        "transactions": [
            {
                "sale_id": s.sale_id,
                "employee_id": s.employee_id,
                "employee_name": emp_map.get(s.employee_id, "Technician"),
                "vehicle_id": s.vehicle_id,
                "vehicle_plate": veh_map.get(s.vehicle_id, s.vehicle_id),
                "catalog_item_id": s.catalog_item_id,
                "item_name": cat_map[s.catalog_item_id].item_name if s.catalog_item_id in cat_map else "Hardware",
                "sku": cat_map[s.catalog_item_id].sku if s.catalog_item_id in cat_map else "",
                "customer_name": s.customer_name,
                "customer_unit": s.customer_unit,
                "quantity": s.quantity,
                "payment_method": s.payment_method,
                "total_revenue": float(s.total_revenue or 0),
                "total_commission": float(s.total_commission or 0),
                "sale_timestamp": s.sale_timestamp.isoformat() if s.sale_timestamp else None,
                "status": s.status,
            }
            for s in sales
        ],
    }


@router.get("/commissions/{employee_id}")
def get_employee_commissions(
    employee_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    target_id = current_user.employee_id if (tier == 5 or employee_id == "me") else employee_id

    sales = (
        db.query(models.FieldSale)
        .filter(models.FieldSale.employee_id == target_id, models.FieldSale.status == "COMPLETED")
        .order_by(models.FieldSale.sale_timestamp.desc())
        .all()
    )
    total_comm = sum(float(s.total_commission or 0) for s in sales)
    total_rev = sum(float(s.total_revenue or 0) for s in sales)
    return {
        "employee_id": target_id,
        "sales_count": len(sales),
        "total_revenue": round(total_rev, 2),
        "total_commission": round(total_comm, 2),
    }
