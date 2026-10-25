from sqlalchemy import (
    Column, Integer, String, Enum, ForeignKey, DateTime, Date, Text, JSON,
    Boolean, Numeric, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base
import enum
import uuid
from datetime import datetime, date

def gen_uuid() -> str:
    return str(uuid.uuid4())

# ==============================================================================
# ENUMS (Legacy + Blueprint 5-Tier ERP Enums)
# ==============================================================================

class RoleEnum(str, enum.Enum):
    OWNER = "Owner"
    PARTNER = "Partner"
    MITARBEITER = "Mitarbeiter"
    SUPER_ADMIN = "Super Admin"
    PROJECT_MANAGER = "Project Manager"
    HR_FINANCE = "HR & Finance Admin"
    TEAM_LEAD = "Team Lead"
    FIELD_EMPLOYEE = "Field Employee"
    SYSTEM_BOT = "System Bot"

class EmploymentTypeEnum(str, enum.Enum):
    FREELANCER = "Freelancer"
    FULL_TIME = "Full-time"
    PART_TIME = "Part-time"
    DAILY = "Daily"

class ProjectStatusEnum(str, enum.Enum):
    ACTIVE = "Active"
    PAUSED = "Paused"
    COMPLETED = "Completed"

class ObjectStatusEnum(str, enum.Enum):
    PLANNED = "Planned"
    HAUSBEGEHUNG = "Hausbegehung"
    IN_PROGRESS = "In Progress"
    TESTED = "Tested"
    COMPLETED = "Completed"

class LagerTypeEnum(str, enum.Enum):
    STATIC_LAGER = "StaticLager"
    VEHICLE = "Vehicle"

class TransactionTypeEnum(str, enum.Enum):
    CHECK_OUT = "CheckOut"
    RETURN = "Return"
    CONSUME = "Consume"
    SCHWUND = "Schwund"
    FIELD_SALE = "FIELD_SALE"

class LeaveTypeEnum(str, enum.Enum):
    DAILY = "Daily"
    HALF_DAY = "Half-day"
    LONG_TERM = "Long-term"

class RequestStatusEnum(str, enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"

class DocumentRefEnum(str, enum.Enum):
    EXPENSE = "Expense"
    LOHNABRECHNUNG = "Lohnabrechnung"
    INVOICE = "Invoice"
    OBJECT_MEDIA = "ObjectMedia"
    KRANKMELDUNG = "Krankmeldung"
    CONTRACT = "Contract"

class PaymentMethodEnum(str, enum.Enum):
    CASH = "CASH"
    CARD = "CARD"

class SaleStatusEnum(str, enum.Enum):
    COMPLETED = "COMPLETED"
    REFUNDED = "REFUNDED"
    DISPUTED = "DISPUTED"

# Default Module Keys for app.bruenel.de
ALL_MODULE_KEYS = [
    "mod_dashboard",
    "mod_hr",
    "mod_projects",
    "mod_inventory",
    "mod_fleet",
    "mod_calendar",
    "mod_accounting",
    "mod_sales",
    "mod_suppliers",
    "mod_vault",
    "mod_bi",
    "mod_mail",
    "mod_users",
]

# ==============================================================================
# CORE AUTH & LEGACY TABLES
# ==============================================================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.MITARBEITER)
    # 5-Tier RBAC level: 1=Super Admin, 2=Project Manager, 3=HR/Finance, 4=Team Lead, 5=Field Employee
    role_tier = Column(Integer, default=5, nullable=False)
    # Link to employee record (UUID string)
    employee_id = Column(String(36), nullable=True, index=True)
    # Allowed KST cost centers
    allowed_kst = Column(JSON, nullable=True)
    # Granular module access list for app.bruenel.de, e.g. ["mod_projects", "mod_inventory"]
    allowed_modules = Column(JSON, nullable=True)
    # Portal access flags
    can_access_app = Column(Boolean, default=False)     # Management portal (app.bruenel.de)
    can_access_portal = Column(Boolean, default=True)   # Employee portal (portal.bruenel.de)
    preferred_language = Column(String(10), default="de")  # Persistent account language: 'de' or 'en'
    must_change_password = Column(Boolean, default=False)  # Forces OTP password change on first login

    # IMAP Configuration
    imap_host = Column(String, nullable=True)
    imap_port = Column(Integer, nullable=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    email_password = Column(String, nullable=True)
    signature_html = Column(Text, nullable=True)


class SupplierMatrix(Base):
    __tablename__ = "supplier_matrix"
    id = Column(Integer, primary_key=True, index=True)
    kst = Column(Integer, index=True, nullable=False)
    supplier_name = Column(String, nullable=False)
    status = Column(String, default="Negotiating")
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
    folder = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class BITracking(Base):
    __tablename__ = "bi_tracking"
    id = Column(Integer, primary_key=True, index=True)
    ip_hash = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    referral = Column(String, nullable=True)
    device_type = Column(String, nullable=True)
    mapped_kst_interest = Column(Integer, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    page_url = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    session_id = Column(String, nullable=True, index=True)
    event_type = Column(String, default="pageview")
    consent_given = Column(Integer, default=0)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ==============================================================================
# CHAPTER 4 ERP & FIELD OPERATIONS TABLES
# ==============================================================================

# 1. EMPLOYEES & REGIONS
class Employee(Base):
    __tablename__ = "employees"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_number = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    department = Column(String(100), default="Field Operations")
    employment_type = Column(String(50), nullable=False, default="Full-time")
    role = Column(String(100), nullable=False, default="Field Employee")
    role_tier = Column(Integer, nullable=False, default=5)
    base_salary = Column(Numeric(10, 2), default=0.00)
    hourly_rate = Column(Numeric(10, 2), default=0.00)
    annual_leave_days = Column(Integer, default=30)
    is_active = Column(Boolean, default=True)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class Region(Base):
    __tablename__ = "regions"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(100), nullable=False)
    postal_code = Column(String(20), nullable=False, index=True)
    city = Column(String(100), nullable=True)
    attributes = Column(JSON, default=dict)


# 2. PROJECTS, OBJECTS, ASSIGNMENTS & DELEGATION
class Project(Base):
    __tablename__ = "projects"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(150), nullable=False)
    code = Column(String(50), nullable=True)
    client_name = Column(String(150), nullable=True)
    kst = Column(Integer, default=1000)
    status = Column(String(50), default="Active")  # Active, Paused, Completed
    manager_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    region_id = Column(String(36), ForeignKey("regions.id", ondelete="SET NULL"), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    budget = Column(Numeric(12, 2), default=0.00)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class BuildingObject(Base):
    __tablename__ = "objects"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    region_id = Column(String(36), ForeignKey("regions.id"), nullable=False, index=True)
    address = Column(String(255), nullable=False)
    units_count = Column(Integer, nullable=False, default=1)
    cabling_type = Column(String(100), nullable=False)
    status = Column(String(50), default="Planned")  # Planned, Hausbegehung, In Progress, Tested, Completed
    drive_folder_id = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class Team(Base):
    __tablename__ = "teams"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(150), nullable=False)
    leader_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    member_ids = Column(JSON, default=list)  # List of employee UUIDs in this team
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=True, index=True)
    team_id = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_employee_ids = Column(JSON, default=list)  # All employee UUIDs assigned to this single shared task
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    region_id = Column(String(36), ForeignKey("regions.id"), nullable=False)
    object_id = Column(String(36), ForeignKey("objects.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False, index=True)
    title = Column(String(200), nullable=True)
    instructions = Column(Text, nullable=True)
    priority = Column(String(30), default="Normal")  # Low, Normal, High, Urgent
    task_status = Column(String(30), default="Planned")  # Planned (Blue), Remaining (Yellow), Completed (Green), Not Completed (Red)
    checklist = Column(JSON, default=list)
    comments = Column(JSON, default=list)  # [{id, employee_id, author_name, text, created_at}]


class Delegation(Base):
    __tablename__ = "delegation"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    delegator_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    delegatee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    scope_note = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# 3. VEHICLES & EQUIPMENT
class Vehicle(Base):
    __tablename__ = "vehicles"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    plate_number = Column(String(50), unique=True, nullable=False, index=True)
    model = Column(String(100), nullable=False)
    vin = Column(String(100), nullable=True)
    mileage_km = Column(Integer, default=0)
    next_inspection_date = Column(Date, nullable=True)
    assigned_team_lead_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True)
    attributes = Column(JSON, default=dict)


class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(150), nullable=False)
    category = Column(String(100), default="Tool")
    serial_number = Column(String(100), unique=True, nullable=False, index=True)
    condition_status = Column(String(50), default="Good")  # Good, Maintenance, Damaged
    assigned_employee_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    assigned_vehicle_id = Column(String(36), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    attributes = Column(JSON, default=dict)
    __table_args__ = (
        CheckConstraint(
            "(assigned_employee_id IS NOT NULL AND assigned_vehicle_id IS NULL) OR "
            "(assigned_employee_id IS NULL AND assigned_vehicle_id IS NOT NULL) OR "
            "(assigned_employee_id IS NULL AND assigned_vehicle_id IS NULL)",
            name="equipment_exclusive_assignment"
        ),
    )


# 4. INVENTORY & MATERIALS
class Lager(Base):
    __tablename__ = "lagers"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(150), nullable=False)
    location = Column(String(255), nullable=False)
    manager_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    attributes = Column(JSON, default=dict)


class Material(Base):
    __tablename__ = "materials"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(150), nullable=False)
    sku = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(100), default="Cabling")
    unit = Column(String(30), default="pcs")  # pcs, m, roll, box
    min_stock_threshold = Column(Integer, default=10)
    unit_cost = Column(Numeric(10, 2), default=0.00)
    attributes = Column(JSON, default=dict)


class InventoryStock(Base):
    __tablename__ = "inventory_stock"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    material_id = Column(String(36), ForeignKey("materials.id", ondelete="CASCADE"), nullable=False)
    lager_type = Column(String(50), nullable=False)  # StaticLager, Vehicle
    lager_id = Column(String(36), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)


class MaterialTransaction(Base):
    __tablename__ = "material_transactions"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    material_id = Column(String(36), ForeignKey("materials.id"), nullable=False, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    object_id = Column(String(36), ForeignKey("objects.id"), nullable=True)
    source_lager_type = Column(String(50), nullable=False)  # StaticLager, Vehicle
    source_lager_id = Column(String(36), nullable=False, index=True)
    transaction_type = Column(String(50), nullable=False)   # CheckOut, Return, Consume, Schwund, FIELD_SALE
    quantity = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    note = Column(Text, nullable=True)


# 5. TIME LOGGING & MAPPING TABLES
class TimeLog(Base):
    __tablename__ = "time_logs"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    object_id = Column(String(36), ForeignKey("objects.id"), nullable=True)
    date = Column(Date, nullable=False, index=True)
    check_in_time = Column(DateTime, nullable=False)
    check_out_time = Column(DateTime, nullable=True)
    pause_start_time = Column(DateTime, nullable=True)
    break_minutes = Column(Integer, default=0)
    total_hours = Column(Numeric(6, 2), nullable=True)
    check_in_data = Column(JSON, default=dict)
    check_out_data = Column(JSON, default=dict)
    status = Column(String(30), default="Active")  # Active, Paused, Completed, Approved
    approved_by = Column(String(36), nullable=True)
    approved_at = Column(DateTime, nullable=True)


class TimeLogTeam(Base):
    __tablename__ = "time_log_team"
    time_log_id = Column(String(36), ForeignKey("time_logs.id", ondelete="CASCADE"), primary_key=True)
    team_member_id = Column(String(36), ForeignKey("employees.id"), primary_key=True)


class TimeLogVehicle(Base):
    __tablename__ = "time_log_vehicles"
    time_log_id = Column(String(36), ForeignKey("time_logs.id", ondelete="CASCADE"), primary_key=True)
    vehicle_id = Column(String(36), ForeignKey("vehicles.id"), primary_key=True)


class TimeLogTool(Base):
    __tablename__ = "time_log_tools"
    time_log_id = Column(String(36), ForeignKey("time_logs.id", ondelete="CASCADE"), primary_key=True)
    equipment_id = Column(String(36), ForeignKey("equipment.id"), primary_key=True)


# 6. LEAVES, SICKNESS, PAYSLIPS, EXPENSES & DOCUMENTS
class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    type = Column(String(50), nullable=False, default="Daily")  # Daily, Half-day, Long-term
    reason = Column(Text, nullable=True)
    approved_by = Column(String(36), ForeignKey("employees.id"), nullable=True)
    status = Column(String(50), default="Pending")  # Pending, Approved, Rejected
    created_at = Column(DateTime, default=datetime.utcnow)


class SicknessRecord(Base):
    __tablename__ = "sickness_records"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    symptoms_note = Column(Text, nullable=True)
    doctor_visited = Column(Boolean, default=False)
    au_document_id = Column(String(36), nullable=True)
    status = Column(String(50), default="Reported")  # Reported, AU_Uploaded, Acknowledged
    created_at = Column(DateTime, default=datetime.utcnow)


class DocumentRecord(Base):
    __tablename__ = "documents"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    reference_type = Column(String(50), nullable=False, index=True)  # Expense, Lohnabrechnung, Invoice, ObjectMedia, Krankmeldung, Contract
    reference_id = Column(String(36), nullable=False, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), default="application/octet-stream")
    file_size = Column(Integer, default=0)
    storage_provider = Column(String(50), default="local_s3")  # local_s3, s3, r2, gdrive
    storage_key = Column(String(500), nullable=False)
    drive_file_id = Column(String(255), nullable=False)
    status = Column(String(50), default="Uploaded")
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class Payslip(Base):
    __tablename__ = "payslips"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    period_month = Column(Integer, nullable=False)  # 1-12
    period_year = Column(Integer, nullable=False)   # e.g. 2026
    gross_salary = Column(Numeric(10, 2), nullable=False, default=0.00)
    net_salary = Column(Numeric(10, 2), nullable=False, default=0.00)
    commission_bonus = Column(Numeric(10, 2), nullable=False, default=0.00)
    hours_worked = Column(Numeric(6, 2), default=0.00)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="Issued")  # Draft, Issued, Paid
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    vehicle_id = Column(String(36), ForeignKey("vehicles.id"), nullable=True)
    category = Column(String(100), nullable=False)  # Fuel, Material, Parking, Hotel, Tool, Other
    merchant = Column(String(150), nullable=True)
    description = Column(Text, nullable=True)
    amount_net = Column(Numeric(10, 2), nullable=False)
    vat_rate = Column(Numeric(5, 2), default=19.00)
    amount_gross = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="EUR")
    expense_date = Column(Date, nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="Pending")  # Pending, Approved, Rejected, Reimbursed
    approved_by = Column(String(36), ForeignKey("employees.id"), nullable=True)
    n8n_sync_status = Column(String(50), default="Pending_Manual")
    created_at = Column(DateTime, default=datetime.utcnow)


# 7. FIELD SALES & UPSELLING
class SalesCatalog(Base):
    __tablename__ = "sales_catalog"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    item_name = Column(String(150), nullable=False)
    sku = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(100), default="Hardware")
    buy_price = Column(Numeric(10, 2), nullable=False)
    sell_price = Column(Numeric(10, 2), nullable=False)
    commission_amount = Column(Numeric(10, 2), nullable=False)
    is_active = Column(Boolean, default=True)


class FieldSale(Base):
    __tablename__ = "field_sales"
    sale_id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    vehicle_id = Column(String(36), ForeignKey("vehicles.id"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    object_id = Column(String(36), ForeignKey("objects.id"), nullable=True)
    catalog_item_id = Column(String(36), ForeignKey("sales_catalog.id"), nullable=False)
    customer_name = Column(String(150), nullable=True)
    customer_unit = Column(String(50), nullable=True)
    quantity = Column(Integer, nullable=False)
    payment_method = Column(String(30), nullable=False)  # CASH, CARD
    total_revenue = Column(Numeric(10, 2), nullable=False)
    total_commission = Column(Numeric(10, 2), nullable=False)
    sale_timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="COMPLETED")  # COMPLETED, REFUNDED, DISPUTED


# 8. AUDIT LOGS
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    table_name = Column(String(50), nullable=False, index=True)
    operation = Column(String(10), nullable=False)  # INSERT, UPDATE, DELETE
    record_id = Column(String(100), nullable=False, index=True)
    changed_by = Column(String(100), nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
