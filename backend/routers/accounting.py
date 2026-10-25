from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
import uuid
import csv
import io

import models
import schemas
import database
from core.security import get_current_user, get_effective_tier, ensure_employee_linked
from core.storage import create_presigned_download
from core.audit import log_audit

router = APIRouter()


@router.get("/expenses")
def list_expenses(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in db.query(models.Employee).all()}
    proj_map = {p.id: p.name for p in db.query(models.Project).all()}
    veh_map = {v.id: v.plate_number for v in db.query(models.Vehicle).all()}

    query = db.query(models.Expense)
    if tier == 5:
        query = query.filter(models.Expense.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(models.Expense.employee_id == employee_id)

    if status:
        query = query.filter(models.Expense.status == status)

    items = query.order_by(models.Expense.expense_date.desc(), models.Expense.created_at.desc()).all()
    results = []
    for ex in items:
        doc_url = None
        if ex.document_id:
            doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == ex.document_id).first()
            if doc:
                doc_url = create_presigned_download(doc.storage_key)

        results.append({
            "id": ex.id,
            "employee_id": ex.employee_id,
            "employee_name": emp_map.get(ex.employee_id, "Employee"),
            "project_id": ex.project_id,
            "project_name": proj_map.get(ex.project_id, "General Overhead"),
            "vehicle_id": ex.vehicle_id,
            "vehicle_plate": veh_map.get(ex.vehicle_id),
            "category": ex.category,
            "merchant": ex.merchant,
            "description": ex.description,
            "amount_net": float(ex.amount_net or 0),
            "vat_rate": float(ex.vat_rate or 19),
            "amount_gross": float(ex.amount_gross or 0),
            "currency": ex.currency,
            "expense_date": ex.expense_date.isoformat() if ex.expense_date else None,
            "document_id": ex.document_id,
            "receipt_url": doc_url,
            "status": ex.status,
            "approved_by_name": emp_map.get(ex.approved_by) if ex.approved_by else None,
            "n8n_sync_status": ex.n8n_sync_status,
            "created_at": ex.created_at.isoformat() if ex.created_at else None,
        })
    return results


@router.post("/expenses")
def submit_expense(
    payload: schemas.ExpenseCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = ensure_employee_linked(db, current_user)
    gross = float(payload.amount_gross)
    vat = float(payload.vat_rate if payload.vat_rate is not None else 19.0)
    net = float(payload.amount_net) if payload.amount_net is not None else round(gross / (1.0 + vat / 100.0), 2)

    ex = models.Expense(
        id=str(uuid.uuid4()),
        employee_id=emp.id,
        project_id=payload.project_id,
        vehicle_id=payload.vehicle_id,
        category=payload.category,
        merchant=payload.merchant,
        description=payload.description,
        amount_net=net,
        vat_rate=vat,
        amount_gross=gross,
        expense_date=payload.expense_date,
        document_id=payload.document_id,
        status="Pending",
        n8n_sync_status="Ready_For_Webhook",
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    log_audit(db, "expenses", "INSERT", ex.id, current_user.email, None, {"amount_gross": gross, "category": payload.category})
    return {"id": ex.id, "status": ex.status, "amount_net": net, "amount_gross": gross}


@router.patch("/expenses/{expense_id}/status")
def review_expense(
    expense_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Only Management or HR & Finance Admin can approve/reject expenses.")

    ex = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Expense record not found")

    old_status = ex.status
    ex.status = payload.get("status", "Approved")
    ex.approved_by = current_user.employee_id
    if ex.status == "Approved":
        ex.n8n_sync_status = "Queued_For_DATEV_Export"
    db.commit()

    log_audit(db, "expenses", "UPDATE", ex.id, current_user.email, {"status": old_status}, {"status": ex.status})
    return {"id": ex.id, "status": ex.status, "n8n_sync_status": ex.n8n_sync_status}


@router.get("/summary")
def get_accounting_summary(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 2, 3):
        raise HTTPException(status_code=403, detail="Unauthorized for financial summary")

    expenses = db.query(models.Expense).all()
    sales = db.query(models.FieldSale).filter(models.FieldSale.status == "COMPLETED").all()
    payslips = db.query(models.Payslip).all()
    audit_entries = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(30).all()

    total_expenses_gross = sum(float(e.amount_gross or 0) for e in expenses)
    approved_expenses_gross = sum(float(e.amount_gross or 0) for e in expenses if e.status in ("Approved", "Reimbursed"))
    pending_expenses_count = sum(1 for e in expenses if e.status == "Pending")

    total_field_revenue = sum(float(s.total_revenue or 0) for s in sales)
    total_commissions = sum(float(s.total_commission or 0) for s in sales)
    total_payroll_gross = sum(float(p.gross_salary or 0) for p in payslips)

    by_category = {}
    for e in expenses:
        by_category[e.category] = round(by_category.get(e.category, 0.0) + float(e.amount_gross or 0), 2)

    return {
        "total_expenses_gross": round(total_expenses_gross, 2),
        "approved_expenses_gross": round(approved_expenses_gross, 2),
        "pending_expenses_count": pending_expenses_count,
        "total_field_sales_revenue": round(total_field_revenue, 2),
        "total_field_commissions": round(total_commissions, 2),
        "total_payroll_gross": round(total_payroll_gross, 2),
        "expenses_by_category": [{"category": k, "amount": v} for k, v in by_category.items()],
        "recent_audit_logs": [
            {
                "id": a.id,
                "table_name": a.table_name,
                "operation": a.operation,
                "record_id": a.record_id,
                "changed_by": a.changed_by,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_entries
        ],
    }


@router.get("/export-datev")
def export_datev_csv(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    if tier not in (1, 3):
        raise HTTPException(status_code=403, detail="Only Super Admin or HR & Finance can export DATEV ledgers.")

    emp_map = {e.id: f"{e.first_name} {e.last_name} ({e.employee_number})" for e in db.query(models.Employee).all()}
    expenses = db.query(models.Expense).order_by(models.Expense.expense_date.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["Belegdatum", "Mitarbeiter", "Kategorie", "Haendler", "Netto_EUR", "MwSt_Satz", "Brutto_EUR", "Status", "Beleg_ID"])
    for ex in expenses:
        writer.writerow([
            ex.expense_date.isoformat() if ex.expense_date else "",
            emp_map.get(ex.employee_id, ex.employee_id),
            ex.category,
            ex.merchant or "",
            f"{float(ex.amount_net or 0):.2f}",
            f"{float(ex.vat_rate or 19):.1f}",
            f"{float(ex.amount_gross or 0):.2f}",
            ex.status,
            ex.id,
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bruenel_datev_expenses_export.csv"},
    )
