from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime
from models import RoleEnum

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: RoleEnum
    allowed_kst: Optional[List[int]] = None

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[RoleEnum] = None
    allowed_kst: Optional[List[int]] = None

class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: RoleEnum
    allowed_kst: Optional[List[int]] = None
    signature_html: Optional[str] = None
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class AdminPasswordReset(BaseModel):
    new_password: str

class MailConfigUpdate(BaseModel):
    email_password: str

class SignatureUpdate(BaseModel):
    signature_html: str

class MailSend(BaseModel):
    to_email: str
    subject: str
    body: str

class SupplierMatrixCreate(BaseModel):
    kst: int
    supplier_name: str
    status: str
    pricing: Optional[str] = None
    lead_time: Optional[str] = None
    moq: Optional[int] = None
    notes: Optional[str] = None

class SupplierMatrixOut(SupplierMatrixCreate):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class BITrackCreate(BaseModel):
    referral: Optional[str] = None
    device_type: Optional[str] = None
    mapped_kst_interest: Optional[int] = None
    page_url: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None
    event_type: Optional[str] = "pageview"
    consent_given: Optional[int] = 0
    duration_seconds: Optional[int] = None
