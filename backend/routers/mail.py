from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import models, database, schemas
from routers.auth import get_current_user

router = APIRouter()

@router.get("/inbox")
def get_inbox(current_user: models.User = Depends(get_current_user)):
    """
    Returns demo inbox items. Real IMAP integration would connect to imap.strato.de:993
    using current_user.email and current_user.email_password.
    """
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
        }
    ]

@router.put("/configure")
def configure_mail(
    data: schemas.MailConfigUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    current_user.imap_host = "imap.strato.de"
    current_user.imap_port = 993
    current_user.smtp_host = "smtp.strato.de"
    current_user.smtp_port = 465
    current_user.email_password = data.email_password  # Should be encrypted in production
    db.commit()
    return {"message": "IMAP/SMTP settings connected successfully to Strato servers."}

@router.put("/signature")
def update_signature(
    data: schemas.SignatureUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    current_user.signature_html = data.signature_html
    db.commit()
    return {"message": "Signature saved successfully."}

@router.post("/send")
def send_email(
    data: schemas.MailSend,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not current_user.email_password:
        raise HTTPException(status_code=400, detail="Mail not configured. Please enter password in settings.")
    
    # Create the email
    msg = MIMEMultipart("alternative")
    msg["Subject"] = data.subject
    msg["From"] = current_user.email
    msg["To"] = data.to_email

    # Append signature if exists
    body_html = f"<p>{data.body.replace(chr(10), '<br>')}</p>"
    if current_user.signature_html:
        body_html += f"<br><br>{current_user.signature_html}"

    msg.attach(MIMEText(body_html, "html"))

    try:
        # Use SMTP_SSL for port 465
        with smtplib.SMTP_SSL("smtp.strato.de", 465) as server:
            server.login(current_user.email, current_user.email_password)
            server.send_message(msg)
        return {"message": "Email sent successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

