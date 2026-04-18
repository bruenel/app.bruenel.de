from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from database import Base
import enum
from datetime import datetime

class RoleEnum(str, enum.Enum):
    OWNER = "Owner"
    PARTNER = "Partner"
    MITARBEITER = "Mitarbeiter"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), nullable=False)
    # KST restrictions: simple comma-separated or JSON list of integers e.g. [1000, 2000]
    allowed_kst = Column(JSON, nullable=True) 

    # IMAP Configuration securely stored
    imap_host = Column(String, nullable=True)
    imap_port = Column(Integer, nullable=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    email_password = Column(String, nullable=True) # Needs encryption in prod
    signature_html = Column(Text, nullable=True)

class SupplierMatrix(Base):
    __tablename__ = "supplier_matrix"
    id = Column(Integer, primary_key=True, index=True)
    kst = Column(Integer, index=True, nullable=False)
    supplier_name = Column(String, nullable=False)
    status = Column(String, default="Negotiating") # Negotiating, Samples, Production
    pricing = Column(String, nullable=True)
    lead_time = Column(String, nullable=True)
    moq = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class LegalDocument(Base):
    __tablename__ = "legal_documents"
    id = Column(Integer, primary_key=True, index=True)
    kst = Column(Integer, index=True, nullable=False)
    title = Column(String, nullable=False)
    folder = Column(String, nullable=False) # e.g. 'Notary', 'HRB', 'Invoices'
    file_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class BITracking(Base):
    __tablename__ = "bi_tracking"
    id = Column(Integer, primary_key=True, index=True)
    ip_hash = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)  # Stored for internal ERP view only
    referral = Column(String, nullable=True)
    device_type = Column(String, nullable=True)
    mapped_kst_interest = Column(Integer, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    page_url = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    session_id = Column(String, nullable=True, index=True)
    event_type = Column(String, default="pageview")  # pageview, click, scroll, time_spent
    consent_given = Column(Integer, default=0) # 0 for false, 1 for true (or Boolean)
    duration_seconds = Column(Integer, nullable=True) # for time_spent events
    created_at = Column(DateTime, default=datetime.utcnow)


