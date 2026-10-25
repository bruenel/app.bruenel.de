from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from models import RoleEnum

# ==============================================================================
# AUTH & USER MANAGEMENT SCHEMAS
# ==============================================================================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: RoleEnum
    role_tier: Optional[int] = None
    allowed_kst: Optional[List[int]] = None
    allowed_modules: Optional[List[str]] = None
    can_access_app: Optional[bool] = None
    can_access_portal: Optional[bool] = True
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    employment_type: Optional[str] = "Full-time"
    department: Optional[str] = "Field Operations"


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[RoleEnum] = None
    role_tier: Optional[int] = None
    allowed_kst: Optional[List[int]] = None
    allowed_modules: Optional[List[str]] = None
    can_access_app: Optional[bool] = None
    can_access_portal: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: RoleEnum
    role_tier: Optional[int] = 5
    employee_id: Optional[str] = None
    allowed_kst: Optional[List[int]] = None
    allowed_modules: Optional[List[str]] = None
    effective_modules: Optional[List[str]] = None
    can_access_app: Optional[bool] = False
    can_access_portal: Optional[bool] = True
    preferred_language: Optional[str] = "de"
    must_change_password: Optional[bool] = False
    signature_html: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
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


# ==============================================================================
# MODULE 1: HR, EMPLOYEES, CHECK-IN/OUT, LEAVE, SICKNESS, PAYSLIPS
# ==============================================================================

class EmployeeCreate(BaseModel):
    employee_number: Optional[str] = None
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = "Field Operations"
    employment_type: str = "Full-time"  # Full-time, Part-time, Minijob, Werkstudent, Azubi, Freelancer, Subunternehmer
    role: str = "Field Employee"
    role_tier: int = 5
    base_salary: Optional[float] = 0.0
    hourly_rate: Optional[float] = 0.0
    annual_leave_days: Optional[int] = 30
    one_time_password: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = {}


class SmartCheckInRequest(BaseModel):
    project_id: Optional[str] = None
    object_id: Optional[str] = None
    vehicle_ids: List[str] = []
    equipment_ids: List[str] = []
    team_member_ids: List[str] = []
    notes: Optional[str] = None
    gps_location: Optional[str] = None


class SmartCheckOutRequest(BaseModel):
    time_log_id: Optional[str] = None
    break_minutes: int = 30
    tool_confirmations: Dict[str, str] = {}
    notes: Optional[str] = None
    materials_consumed: List[Dict[str, Any]] = []


class LeaveRequestCreate(BaseModel):
    start_date: date
    end_date: date
    type: str = "Daily"  # Daily, Half-day, Long-term
    reason: Optional[str] = None


class SicknessCreate(BaseModel):
    start_date: date
    end_date: date
    symptoms_note: Optional[str] = None
    doctor_visited: bool = False
    au_document_id: Optional[str] = None


class PayslipCreate(BaseModel):
    employee_id: str
    period_month: int
    period_year: int
    gross_salary: float
    net_salary: float
    commission_bonus: float = 0.0
    hours_worked: float = 160.0
    document_id: Optional[str] = None
    notes: Optional[str] = None


# ==============================================================================
# MODULE 2: PROJECTS, REGIONS, OBJECTS, ASSIGNMENTS & DELEGATION
# ==============================================================================

class RegionCreate(BaseModel):
    name: str
    postal_code: str
    city: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = {}


class ProjectCreate(BaseModel):
    name: str
    code: Optional[str] = None
    client_name: Optional[str] = None
    kst: int = 1000
    status: str = "Active"
    manager_id: Optional[str] = None
    region_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[float] = 0.0
    attributes: Optional[Dict[str, Any]] = {}


class ObjectCreate(BaseModel):
    project_id: str
    region_id: str
    address: str
    units_count: int = 1
    cabling_type: str = "FTTH Fiber"
    status: str = "Planned"
    drive_folder_id: Optional[str] = None
    notes: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = {}


class TeamCreate(BaseModel):
    name: str
    leader_id: Optional[str] = None
    member_ids: List[str] = []
    project_id: Optional[str] = None
    notes: Optional[str] = None


class AssignmentCreate(BaseModel):
    employee_id: Optional[str] = None
    team_id: Optional[str] = None
    assigned_employee_ids: Optional[List[str]] = []
    project_id: str
    region_id: str
    object_id: Optional[str] = None
    date: date
    title: Optional[str] = None
    instructions: Optional[str] = None
    priority: str = "Normal"
    task_status: str = "Planned"  # Planned, Remaining, Completed, Not Completed
    checklist: Optional[List[Dict[str, Any]]] = []


class DelegationCreate(BaseModel):
    delegator_id: str
    delegatee_id: str
    start_date: date
    end_date: date
    scope_note: Optional[str] = None


# ==============================================================================
# MODULE 3 & 4: INVENTORY, MATERIALS, VEHICLES & EQUIPMENT
# ==============================================================================

class LagerCreate(BaseModel):
    name: str
    location: str
    manager_id: Optional[str] = None


class MaterialCreate(BaseModel):
    name: str
    sku: str
    category: str = "Cabling"
    unit: str = "pcs"
    min_stock_threshold: int = 10
    unit_cost: float = 0.0


class MaterialBuchenRequest(BaseModel):
    material_id: str
    source_lager_type: str  # StaticLager, Vehicle
    source_lager_id: str
    target_lager_type: Optional[str] = None
    target_lager_id: Optional[str] = None
    transaction_type: str   # CheckOut, Return, Consume, Schwund
    quantity: int
    project_id: Optional[str] = None
    object_id: Optional[str] = None
    note: Optional[str] = None


class VehicleCreate(BaseModel):
    plate_number: str
    model: str
    vin: Optional[str] = None
    mileage_km: int = 0
    next_inspection_date: Optional[date] = None
    assigned_team_lead_id: Optional[str] = None
    is_active: bool = True


class EquipmentCreate(BaseModel):
    name: str
    category: str = "Tool"
    serial_number: str
    condition_status: str = "Good"
    assigned_employee_id: Optional[str] = None
    assigned_vehicle_id: Optional[str] = None


# ==============================================================================
# MODULE 6 & 7: ACCOUNTING EXPENSES & FIELD SALES
# ==============================================================================

class ExpenseCreate(BaseModel):
    project_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    category: str = "Fuel"
    merchant: Optional[str] = None
    description: Optional[str] = None
    amount_net: Optional[float] = None
    vat_rate: float = 19.0
    amount_gross: float
    expense_date: date
    document_id: Optional[str] = None


class SalesCatalogCreate(BaseModel):
    item_name: str
    sku: str
    category: str = "Hardware"
    buy_price: float
    sell_price: float
    commission_amount: float
    is_active: bool = True


class FieldSaleCreate(BaseModel):
    vehicle_id: str
    project_id: Optional[str] = None
    object_id: Optional[str] = None
    catalog_item_id: str
    customer_name: Optional[str] = None
    customer_unit: Optional[str] = None
    quantity: int = 1
    payment_method: str = "CARD"  # CASH, CARD
