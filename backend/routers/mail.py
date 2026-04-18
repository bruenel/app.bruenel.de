from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import models, database
from routers.auth import get_current_user

router = APIRouter()

@router.get("/inbox")
def get_inbox(current_user: models.User = Depends(get_current_user)):
    """
    Returns demo inbox items. Replace with real imaplib integration
    once IMAP credentials are set in user profile.
    """
    # If user has IMAP configured, fetch real email in future
    # For now return structured demo data that works immediately
    return [
        {
            "id": 1,
            "subject": "MoQ Updates - China Supplier",
            "from": "liwei@supplier-cn.com",
            "date": "2026-04-17",
            "body": "Dear Mr. Rastegar,\n\nWe reviewed the design requirements for KST 2000.\nThe revised MoQ is 5,000 units. The unit price remains stable at 0.45$/pc.\n\nBest regards,\nLi Wei"
        },
        {
            "id": 2,
            "subject": "Invoice Delivery - KST 1000",
            "from": "billing@logistik-partner.de",
            "date": "2026-04-16",
            "body": "Dear Mr. Rastegar,\n\nAttached is your monthly KST 1000 invoice for Logistics Services.\nTotal: EUR 3,240.00\n\nKind regards,\nLogistik Partner GmbH"
        },
        {
            "id": 3,
            "subject": "HRB Registerauszug Update",
            "from": "notar@registry.de",
            "date": "2026-04-15",
            "body": "Sehr geehrter Herr Rastegar,\n\nIhr aktueller Registerauszug ist nun verfügbar.\nBitte prüfen Sie die Angaben im angehängten Dokument.\n\nMit freundlichen Grüßen,\nNotar Kanzlei Berlin"
        }
    ]

@router.post("/configure")
def configure_mail(
    imap_host: str,
    imap_port: int,
    smtp_host: str,
    smtp_port: int,
    email_password: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    current_user.imap_host = imap_host
    current_user.imap_port = imap_port
    current_user.smtp_host = smtp_host
    current_user.smtp_port = smtp_port
    current_user.email_password = email_password  # Encrypt in production
    db.commit()
    return {"message": "Mail configuration saved successfully"}
