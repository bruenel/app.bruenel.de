from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import smtplib
import imaplib
import email
from email.header import decode_header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import models, database, schemas
from routers.auth import get_current_user

router = APIRouter()

def decode_mime_header(s):
    if not s:
        return ""
    decoded_parts = decode_header(s)
    result = ""
    for content, encoding in decoded_parts:
        if isinstance(content, bytes):
            result += content.decode(encoding or "utf-8", errors="replace")
        else:
            result += content
    return result

def get_imap_connection(user: models.User):
    if not user.email_password or not user.imap_host:
        raise HTTPException(status_code=400, detail="Mail not configured.")
    try:
        mail = imaplib.IMAP4_SSL(user.imap_host, user.imap_port or 993)
        mail.login(user.email, user.email_password)
        return mail
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"IMAP login failed: {str(e)}")

@router.get("/folders")
def get_folders(current_user: models.User = Depends(get_current_user)):
    mail = get_imap_connection(current_user)
    status, messages = mail.list()
    folders = []
    if status == "OK":
        for folder in messages:
            try:
                # Format is usually: b'(\\HasNoChildren) "/" "INBOX"'
                parts = folder.decode().split(' "/" ')
                if len(parts) == 2:
                    name = parts[1].strip('"')
                    folders.append(name)
            except:
                pass
    mail.logout()
    return folders if folders else ["INBOX", "Sent", "Drafts", "Trash"]

@router.get("/folder/{folder_name}")
def get_folder_emails(folder_name: str, limit: int = 20, current_user: models.User = Depends(get_current_user)):
    mail = get_imap_connection(current_user)
    
    # Select folder (default INBOX)
    try:
        mail.select(f'"{folder_name}"', readonly=True)
    except:
        mail.logout()
        raise HTTPException(status_code=404, detail="Folder not found")

    status, messages = mail.search(None, 'ALL')
    if status != 'OK':
        mail.logout()
        return []

    email_ids = messages[0].split()
    email_ids = email_ids[-limit:] # Get last N emails
    email_ids.reverse() # Newest first
    
    emails = []
    for e_id in email_ids:
        status, msg_data = mail.fetch(e_id, '(RFC822)')
        if status == 'OK':
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    subject = decode_mime_header(msg.get("Subject"))
                    from_ = decode_mime_header(msg.get("From"))
                    date_ = msg.get("Date")
                    
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition"))
                            if content_type == "text/plain" and "attachment" not in content_disposition:
                                body = part.get_payload(decode=True).decode(errors="replace")
                                break
                    else:
                        body = msg.get_payload(decode=True).decode(errors="replace")
                    
                    emails.append({
                        "id": e_id.decode(),
                        "subject": subject,
                        "from": from_,
                        "date": date_,
                        "body": body
                    })
    mail.logout()
    return emails

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

