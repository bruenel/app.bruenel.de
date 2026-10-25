from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import uuid
import mimetypes

import models
import database
from core.security import get_current_user, get_effective_tier
from core.storage import (
    get_local_file_path,
    create_presigned_upload,
    create_presigned_download,
    verify_presigned_token,
    delete_storage_file,
    STORAGE_PROVIDER,
)
from core.audit import log_audit

router = APIRouter()


@router.post("/presign")
def request_presigned_upload(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Request a Pre-Signed URL to upload large videos, site photos, receipts, or PDFs directly.
    """
    reference_type = payload.get("reference_type", "ObjectMedia")
    reference_id = payload.get("reference_id") or (current_user.employee_id or str(uuid.uuid4()))
    file_name = payload.get("file_name", "upload.bin").replace(" ", "_")
    title = payload.get("title") or file_name
    mime_type = payload.get("mime_type") or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    file_size = int(payload.get("file_size") or 0)

    doc_id = str(uuid.uuid4())
    storage_key = f"{reference_type.lower()}/{reference_id}/{doc_id}_{file_name}"

    doc = models.DocumentRecord(
        id=doc_id,
        reference_type=reference_type,
        reference_id=str(reference_id),
        employee_id=current_user.employee_id,
        title=title,
        file_name=file_name,
        mime_type=mime_type,
        file_size=file_size,
        storage_provider=STORAGE_PROVIDER,
        storage_key=storage_key,
        drive_file_id=f"s3://{storage_key}",
        status="Pending_Upload",
        metadata_json=payload.get("metadata", {}),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    presign_info = create_presigned_upload(storage_key, mime_type)
    return {
        "document_id": doc.id,
        "reference_type": doc.reference_type,
        "reference_id": doc.reference_id,
        "storage_key": storage_key,
        **presign_info,
    }


@router.put("/upload-stream/{storage_key:path}")
async def upload_stream_target(
    storage_key: str,
    token: str,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """
    Local S3-compatible PUT stream receiver for pre-signed uploads (supports large video files without multipart overhead).
    """
    if not verify_presigned_token(storage_key, token):
        raise HTTPException(status_code=403, detail="Invalid or expired pre-signed upload token")

    full_path = get_local_file_path(storage_key)
    total_bytes = 0
    with open(full_path, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
            total_bytes += len(chunk)

    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.storage_key == storage_key).first()
    if doc:
        doc.status = "Uploaded"
        doc.file_size = total_bytes
        db.commit()

    return {"status": "Uploaded", "storage_key": storage_key, "bytes_written": total_bytes}


@router.post("/upload")
async def direct_multipart_upload(
    reference_type: str = Form("ObjectMedia"),
    reference_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    employee_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Convenient single-step multipart upload for photos, PDFs, receipts, and videos.
    """
    ref_id = reference_id or employee_id or current_user.employee_id or str(uuid.uuid4())
    safe_name = (file.filename or "file.bin").replace(" ", "_")
    doc_id = str(uuid.uuid4())
    storage_key = f"{reference_type.lower()}/{ref_id}/{doc_id}_{safe_name}"
    full_path = get_local_file_path(storage_key)

    total_bytes = 0
    with open(full_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)  # 1MB chunks for large video memory safety
            if not chunk:
                break
            out_file.write(chunk)
            total_bytes += len(chunk)

    mime_type = file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"

    doc = models.DocumentRecord(
        id=doc_id,
        reference_type=reference_type,
        reference_id=str(ref_id),
        employee_id=employee_id or current_user.employee_id,
        title=title or safe_name,
        file_name=safe_name,
        mime_type=mime_type,
        file_size=total_bytes,
        storage_provider="local_s3",
        storage_key=storage_key,
        drive_file_id=f"s3://{storage_key}",
        status="Uploaded",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    log_audit(db, "documents", "INSERT", doc.id, current_user.email, None, {"file_name": safe_name, "type": reference_type})

    return {
        "id": doc.id,
        "title": doc.title,
        "file_name": doc.file_name,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size,
        "reference_type": doc.reference_type,
        "reference_id": doc.reference_id,
        "url": create_presigned_download(doc.storage_key),
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/stream/{storage_key:path}")
def stream_media_file(storage_key: str, token: Optional[str] = None):
    """
    Stream media/video/PDF with HTTP Range support (automatic via FileResponse).
    """
    if not token or not verify_presigned_token(storage_key, token):
        raise HTTPException(status_code=403, detail="Invalid or expired media access token")

    full_path = get_local_file_path(storage_key)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Media file not found on storage volume")

    mime_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
    return FileResponse(full_path, media_type=mime_type, filename=os.path.basename(full_path))


@router.get("/list")
def list_media_documents(
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = get_effective_tier(current_user)
    query = db.query(models.DocumentRecord)
    if reference_type:
        query = query.filter(models.DocumentRecord.reference_type == reference_type)
    if reference_id:
        query = query.filter(models.DocumentRecord.reference_id == reference_id)

    # RLS enforcement for Tier 5 Field Employees on sensitive HR/Expense docs
    if tier == 5 and reference_type in ("Lohnabrechnung", "Expense", "Krankmeldung", "Contract"):
        query = query.filter(models.DocumentRecord.employee_id == current_user.employee_id)

    docs = query.order_by(models.DocumentRecord.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "file_name": d.file_name,
            "mime_type": d.mime_type,
            "file_size": d.file_size,
            "reference_type": d.reference_type,
            "reference_id": d.reference_id,
            "employee_id": d.employee_id,
            "status": d.status,
            "url": create_presigned_download(d.storage_key),
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.delete("/{document_id}")
def delete_media_document(
    document_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Delete a document record and its underlying physical storage file.
    Only Tier 1-3 (Management / HR / PM) can delete arbitrary documents,
    Tier 4-5 can only delete their own uploaded documents.
    """
    tier = get_effective_tier(current_user)
    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if tier > 3 and doc.employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    # Remove physical file from S3 / R2 or local storage
    if doc.storage_key:
        delete_storage_file(doc.storage_key)

    # Detach from referenced records if linked
    db.query(models.Payslip).filter(models.Payslip.document_id == doc.id).update({"document_id": None})
    db.query(models.Expense).filter(models.Expense.document_id == doc.id).update({"document_id": None})
    db.query(models.SickLeaveRecord).filter(models.SickLeaveRecord.au_document_id == doc.id).update({"au_document_id": None})

    doc_info = {"title": doc.title, "file_name": doc.file_name, "reference_type": doc.reference_type, "reference_id": doc.reference_id}

    db.delete(doc)
    db.commit()

    log_audit(db, "documents", "DELETE", document_id, current_user.email, doc_info, None)
    return {"status": "success", "message": "Document deleted successfully", "id": document_id}


@router.patch("/{document_id}")
def update_media_document(
    document_id: str,
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Update document metadata (title, custom label, or category).
    """
    tier = get_effective_tier(current_user)
    doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if tier > 3 and doc.employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this document")

    if "title" in payload and payload["title"]:
        doc.title = str(payload["title"]).strip()
    if "reference_type" in payload and payload["reference_type"]:
        doc.reference_type = str(payload["reference_type"]).strip()

    db.commit()
    db.refresh(doc)
    download_link = create_presigned_download(doc.storage_key)
    return {
        "id": doc.id,
        "title": doc.title,
        "reference_type": doc.reference_type,
        "file_name": doc.file_name,
        "file_size": doc.file_size or 0,
        "mime_type": doc.mime_type,
        "url": download_link,
        "download_url": download_link,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


