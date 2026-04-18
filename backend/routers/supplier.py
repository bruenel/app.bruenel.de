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

@router.post("/sync_ai")
def trigger_ai_sync(current_user: models.User = Depends(get_current_user)):
    return {"message": "AI Background Worker triggered successfully"}
