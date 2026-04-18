from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import models, database
from routers.auth import get_current_user

router = APIRouter()

def check_kst_access(user: models.User, kst: int):
    if user.role == models.RoleEnum.OWNER:
        return True
    if user.allowed_kst and kst in user.allowed_kst:
        return True
    raise HTTPException(status_code=403, detail="Not authorized for this Cost Center (KST)")

@router.post("/", response_model=None)
def create_supplier(
    supplier: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    from pydantic import BaseModel
    kst = supplier.get('kst', 0)
    check_kst_access(current_user, kst)
    
    new_supplier = models.SupplierMatrix(
        kst=kst,
        supplier_name=supplier.get('supplier_name', ''),
        status=supplier.get('status', 'Negotiating'),
        pricing=supplier.get('price') or supplier.get('pricing'),
        moq=supplier.get('moq'),
        notes=supplier.get('notes'),
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return {
        "id": new_supplier.id,
        "kst": new_supplier.kst,
        "supplier_name": new_supplier.supplier_name,
        "status": new_supplier.status,
        "pricing": new_supplier.pricing,
        "moq": new_supplier.moq,
        "notes": new_supplier.notes,
        "lead_time": new_supplier.lead_time,
        "created_at": str(new_supplier.created_at),
    }

@router.get("/")
def get_suppliers(
    kst: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.SupplierMatrix)
    
    if current_user.role != models.RoleEnum.OWNER:
        if not current_user.allowed_kst:
            return []
        query = query.filter(models.SupplierMatrix.kst.in_(current_user.allowed_kst))
        
    if kst:
        if current_user.role != models.RoleEnum.OWNER and kst not in (current_user.allowed_kst or []):
            raise HTTPException(status_code=403, detail="Not authorized for this KST")
        query = query.filter(models.SupplierMatrix.kst == kst)
    
    results = query.all()
    return [
        {
            "id": s.id,
            "kst": s.kst,
            "supplier_name": s.supplier_name,
            "status": s.status,
            "pricing": s.pricing,
            "moq": s.moq,
            "notes": s.notes,
            "lead_time": s.lead_time,
            "created_at": str(s.created_at),
        }
        for s in results
    ]

import re
from routers.mail import get_folder_emails

@router.post("/sync_ai")
def trigger_ai_sync(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        inbox_emails = get_folder_emails("INBOX", limit=10, current_user=current_user)
    except:
        inbox_emails = []
        
    try:
        sent_emails = get_folder_emails("Sent", limit=10, current_user=current_user)
    except:
        sent_emails = []

    all_emails = inbox_emails + sent_emails
    extracted_suppliers = {}
    
    for email in all_emails:
        from_str = email.get("from", "")
        match = re.search(r'([^<]+)<([^>]+)>', from_str)
        if match:
            name = match.group(1).strip().replace('"', '')
            address = match.group(2).strip()
            domain = address.split('@')[-1] if '@' in address else ""
            
            company = domain.split('.')[0].capitalize() if domain else "Unknown Company"
            if company.lower() in ['gmail', 'yahoo', 'hotmail', 'strato']:
                company = name
                
            if address not in extracted_suppliers and current_user.email not in address:
                extracted_suppliers[address] = {
                    "supplier_name": company,
                    "contact_person": name,
                    "status": "In Communication (AI)",
                    "notes": f"AI Extracted Communication Step:\nSubject: {email.get('subject')}\nDate: {email.get('date')}\n"
                }

    added_count = 0
    updated_count = 0
    for address, data in extracted_suppliers.items():
        existing = db.query(models.SupplierMatrix).filter(models.SupplierMatrix.supplier_name.ilike(f"%{data['supplier_name']}%")).first()
        if existing:
            existing.status = data["status"]
            if data["notes"] not in (existing.notes or ""):
                existing.notes = (existing.notes or "") + "\n\n" + data["notes"]
            updated_count += 1
        else:
            new_sup = models.SupplierMatrix(
                kst=1000,
                supplier_name=data["supplier_name"],
                status=data["status"],
                notes=f"Contact: {data['contact_person']} ({address})\n\n" + data["notes"]
            )
            db.add(new_sup)
            added_count += 1
            
    db.commit()
    return {"message": f"AI Extractor finished. Found {added_count} new suppliers, updated {updated_count} existing."}
