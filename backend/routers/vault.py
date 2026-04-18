from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import os
import models, database
from routers.auth import get_current_user

router = APIRouter()
# Use /tmp for uploads on Vercel because the regular file system is Read-Only
if os.environ.get("VERCEL"):
    UPLOAD_DIR = "/tmp/secure_vault"
else:
    UPLOAD_DIR = "./secure_vault"

try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except Exception as e:
    print(f"Warning: Could not create upload directory: {e}")

@router.post("/upload")
def upload_secure_document(
    kst: int, 
    folder: str, 
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role == models.RoleEnum.MITARBEITER:
        raise HTTPException(status_code=403, detail="Employees cannot upload to Legal Vault")
        
    if current_user.role == models.RoleEnum.PARTNER and kst not in (current_user.allowed_kst or []):
        raise HTTPException(status_code=403, detail="Partner not authorized for this KST Vault")
        
    safe_filename = file.filename.replace(" ", "_")
    file_location = f"{UPLOAD_DIR}/{kst}_{folder}_{safe_filename}"
    
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())
        
    new_doc = models.LegalDocument(
        kst=kst,
        title=safe_filename,
        folder=folder,
        file_path=file_location
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@router.get("/")
def list_documents(kst: int = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == models.RoleEnum.MITARBEITER:
        return []
        
    query = db.query(models.LegalDocument)
    if kst:
        if current_user.role == models.RoleEnum.PARTNER and kst not in (current_user.allowed_kst or []):
            raise HTTPException(status_code=403, detail="Not authorized")
        query = query.filter(models.LegalDocument.kst == kst)
    elif current_user.role == models.RoleEnum.PARTNER:
        query = query.filter(models.LegalDocument.kst.in_(current_user.allowed_kst or []))
        
    return query.all()
