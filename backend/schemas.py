from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from uuid import UUID
from models import RoleEnum, UnitStatusEnum

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
    code: Optional[str] = None
    type: Optional[str] = "Zentrallager"
    street: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    capacity: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "Active"
    attributes: Optional[dict] = None


class MaterialCreate(BaseModel):
    name: str
    sku: str
    category: str = "Cabling"
    unit: str = "Stück"
    min_stock_threshold: int = 10
    unit_cost: float = 0.0
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    ean_barcode: Optional[str] = None
    shelf_location: Optional[str] = None
    package_size: Optional[str] = None
    description: Optional[str] = None
    initial_lager_id: Optional[str] = None
    initial_stock: Optional[int] = 0
    attributes: Optional[dict] = None


class MaterialBuchenRequest(BaseModel):
    material_id: str
    source_lager_type: str  # StaticLager, Vehicle
    source_lager_id: str
    target_lager_type: Optional[str] = None
    target_lager_id: Optional[str] = None
    transaction_type: str   # CheckOut, Return, Restock, Consume, Schwund, InventorySet
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


# ==============================================================================
# MODULE 8: UGG HAUSBEGEHUNGSPROTOKOLL (PDF EXTRACTOR & MASTER-DETAIL)
# ==============================================================================

class UnitProtocolSchema(BaseModel):
    etage: str = Field(..., description="Floor level, e.g., 'EG', 'OG1'")
    unit_id: str = Field(..., description="Unit identifier, e.g., '001', '002'")
    status: UnitStatusEnum = Field(default=UnitStatusEnum.OFFEN)
    we_ausbau_art: Optional[str] = Field(default="TA Installation", description="TA Installation | Reserve | Ohne")
    ta_installiert: bool = Field(default=True)
    reserve: bool = Field(default=False)
    ohne: bool = Field(default=False)
    spleissen_fertig: bool = Field(default=False)
    flexrohr: bool = Field(default=False)


class ProtocolExtractedResponse(BaseModel):
    """Returned by POST /api/v1/protocol/upload for Human-in-the-Loop verification (not yet saved to DB)."""
    adress_id: str = Field(default="", description="Address ID, e.g., 'ABW007413530'")
    projektnummer: str = Field(default="", description="UGG-Projektnummer / WE Nummer, e.g., 'N4E241593436'")
    project_id: Optional[str] = Field(default="")
    project_name: Optional[str] = Field(default="UGG")
    datum: str = Field(default="", description="HBG Datum/Uhrzeit of inspection")
    hausbegeher: str = Field(default="", description="Name of field inspector")
    team: str = Field(default="", description="Assigned team, e.g., 'Team Lorch'")
    building_status: str = Field(default="Ausbau terminiert", description="Building status")
    is_priority: bool = Field(default=False)
    ausbau_typ: str = Field(default="Metalkanal", description="Metalkanal | Leerrohr-Kamin | Kabelkanal")
    ausbautermin: str = Field(default="", description="Ausbau Datum (AB-Termin) from calendar")
    abgeschlossen_datum: str = Field(default="", description="Abgeschlossen Datum from calendar")
    restarbeit_termin: str = Field(default="", description="Restarbeit Termin from calendar")
    plz: str = Field(default="", description="Postal code, e.g., '73547'")
    ort: str = Field(default="", description="City/Town, e.g., 'Lorch'")
    strasse: str = Field(default="", description="Street name, e.g., 'AUSTRABE'")
    hausnummer: str = Field(default="", description="House number, e.g., '71'")
    owner_name: str = Field(default="", description="Combined Vorname + Nachname of owner")
    owner_telefon: str = Field(default="", description="Owner phone number")
    owner_email: str = Field(default="", description="Owner email address")
    total_we: int = Field(default=1, ge=1, description="Total number of Wohneinheiten (WE)")
    ne3_status: str = Field(default="", description="Extracted checkbox status for NE3")
    loesungsoption: str = Field(default="", description="Extracted text below Lösungsoption 1")
    metalkanal_installiert: bool = Field(default=False)
    flexrohr: bool = Field(default=False)
    huep_installiert: bool = Field(default=False)
    spleissen_fertig: bool = Field(default=False)
    upload_done: bool = Field(default=False)
    genehmigt: bool = Field(default=False)
    rechnung_erstellt: bool = Field(default=False)
    rechnung_bezahlt: bool = Field(default=False)
    pdf_filename: Optional[str] = Field(default=None)
    pdf_base64: Optional[str] = Field(default=None)
    units: List[UnitProtocolSchema] = Field(default_factory=list, description="Extracted Zählung table rows")
    extraction_warnings: List[str] = Field(default_factory=list, description="Non-fatal parser warnings for operator attention")


class ProtocolConfirmRequest(BaseModel):
    """Payload submitted to POST /api/v1/protocol/confirm after Human-in-the-Loop verification."""
    adress_id: Optional[str] = Field(default="")
    projektnummer: str = Field(..., min_length=1)
    project_id: Optional[str] = Field(default="")
    project_name: Optional[str] = Field(default="UGG")
    datum: str = Field(default="")
    hausbegeher: str = Field(default="")
    team: Optional[str] = Field(default="")
    building_status: Optional[str] = Field(default="Ausbau terminiert")
    is_priority: Optional[bool] = Field(default=False)
    ausbau_typ: Optional[str] = Field(default="Metalkanal")
    ausbautermin: Optional[str] = Field(default="")
    abgeschlossen_datum: Optional[str] = Field(default="")
    restarbeit_termin: Optional[str] = Field(default="")
    plz: str = Field(..., min_length=1)
    ort: str = Field(..., min_length=1)
    strasse: str = Field(..., min_length=1)
    hausnummer: str = Field(..., min_length=1)
    owner_name: str = Field(default="")
    owner_telefon: str = Field(default="")
    owner_email: str = Field(default="")
    total_we: int = Field(..., ge=1)
    ne3_status: str = Field(default="")
    loesungsoption: str = Field(default="")
    metalkanal_installiert: Optional[bool] = Field(default=False)
    flexrohr: Optional[bool] = Field(default=False)
    huep_installiert: Optional[bool] = Field(default=False)
    spleissen_fertig: Optional[bool] = Field(default=False)
    upload_done: Optional[bool] = Field(default=False)
    genehmigt: Optional[bool] = Field(default=False)
    rechnung_erstellt: Optional[bool] = Field(default=False)
    rechnung_bezahlt: Optional[bool] = Field(default=False)
    pdf_filename: Optional[str] = Field(default=None)
    pdf_base64: Optional[str] = Field(default=None)
    comments: Optional[List[Dict[str, Any]]] = Field(default=None)
    units: List[UnitProtocolSchema] = Field(default_factory=list)


class AddressPatchRequest(BaseModel):
    """Partial update payload for a Master Building Address."""
    adress_id: Optional[str] = None
    projektnummer: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    datum: Optional[str] = None
    hausbegeher: Optional[str] = None
    team: Optional[str] = None
    building_status: Optional[str] = None
    is_priority: Optional[bool] = None
    ausbau_typ: Optional[str] = None
    ausbautermin: Optional[str] = None
    abgeschlossen_datum: Optional[str] = None
    restarbeit_termin: Optional[str] = None
    plz: Optional[str] = None
    ort: Optional[str] = None
    strasse: Optional[str] = None
    hausnummer: Optional[str] = None
    owner_name: Optional[str] = None
    owner_telefon: Optional[str] = None
    owner_email: Optional[str] = None
    total_we: Optional[int] = None
    ne3_status: Optional[str] = None
    loesungsoption: Optional[str] = None
    metalkanal_installiert: Optional[bool] = None
    flexrohr: Optional[bool] = None
    huep_installiert: Optional[bool] = None
    spleissen_fertig: Optional[bool] = None
    upload_done: Optional[bool] = None
    genehmigt: Optional[bool] = None
    rechnung_erstellt: Optional[bool] = None
    rechnung_bezahlt: Optional[bool] = None


class AddressCommentCreate(BaseModel):
    text: str = Field(..., min_length=1)
    author: Optional[str] = Field(default="Brünel Team")


class UnitUpdateRequest(BaseModel):
    """Payload for live interactive row updates in the Master-Detail Wohnung table."""
    etage: Optional[str] = None
    unit_id: Optional[str] = None
    status: Optional[UnitStatusEnum] = None
    we_ausbau_art: Optional[str] = None
    ta_installiert: Optional[bool] = None
    reserve: Optional[bool] = None
    ohne: Optional[bool] = None
    spleissen_fertig: Optional[bool] = None
    flexrohr: Optional[bool] = None


class UnitOut(BaseModel):
    id: UUID
    address_id: UUID
    etage: str
    unit_id: str
    status: UnitStatusEnum
    we_ausbau_art: Optional[str] = "TA Installation"
    ta_installiert: bool = False
    reserve: Optional[bool] = False
    ohne: Optional[bool] = False
    spleissen_fertig: bool = False
    flexrohr: bool = False

    class Config:
        from_attributes = True


class AddressOut(BaseModel):
    id: UUID
    adress_id: Optional[str] = ""
    projektnummer: str
    project_id: Optional[str] = ""
    project_name: Optional[str] = "UGG"
    datum: str
    hausbegeher: Optional[str] = ""
    team: Optional[str] = ""
    building_status: Optional[str] = "Ausbau terminiert"
    is_priority: Optional[bool] = False
    ausbau_typ: Optional[str] = "Metalkanal"
    ausbautermin: Optional[str] = ""
    abgeschlossen_datum: Optional[str] = ""
    restarbeit_termin: Optional[str] = ""
    plz: str
    ort: str
    strasse: str
    hausnummer: str
    owner_name: Optional[str] = ""
    owner_telefon: Optional[str] = ""
    owner_email: Optional[str] = ""
    total_we: int
    ne3_status: Optional[str] = ""
    loesungsoption: Optional[str] = ""
    metalkanal_installiert: Optional[bool] = False
    flexrohr: Optional[bool] = False
    huep_installiert: Optional[bool] = False
    spleissen_fertig: Optional[bool] = False
    upload_done: Optional[bool] = False
    genehmigt: Optional[bool] = False
    rechnung_erstellt: Optional[bool] = False
    rechnung_bezahlt: Optional[bool] = False
    pdf_filename: Optional[str] = None
    has_pdf: bool = False
    comments: Optional[List[Dict[str, Any]]] = []
    created_at: Optional[datetime] = None
    units: List[UnitOut] = []

    class Config:
        from_attributes = True


class ProtocolInvoiceCreate(BaseModel):
    rechnungsnummer: Optional[str] = ""
    titel: Optional[str] = ""
    project_id: Optional[str] = ""
    project_name: Optional[str] = "UGG"
    gemeinde: Optional[str] = ""
    rechnungsdatum: Optional[str] = ""
    faelligkeitsdatum: Optional[str] = ""
    bezahlt_datum: Optional[str] = ""
    betrag_netto: Optional[float] = 0.0
    status: Optional[str] = "Waiting for Payment"
    bezahlt: Optional[bool] = False
    address_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""


class ProtocolInvoicePatch(BaseModel):
    rechnungsnummer: Optional[str] = None
    titel: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    gemeinde: Optional[str] = None
    rechnungsdatum: Optional[str] = None
    faelligkeitsdatum: Optional[str] = None
    bezahlt_datum: Optional[str] = None
    betrag_netto: Optional[float] = None
    status: Optional[str] = None
    bezahlt: Optional[bool] = None
    address_ids: Optional[List[str]] = None
    notes: Optional[str] = None


class ProtocolInvoiceOut(BaseModel):
    id: str
    rechnungsnummer: str
    titel: Optional[str] = ""
    project_id: Optional[str] = ""
    project_name: Optional[str] = "UGG"
    gemeinde: Optional[str] = ""
    rechnungsdatum: Optional[str] = ""
    faelligkeitsdatum: Optional[str] = ""
    bezahlt_datum: Optional[str] = ""
    betrag_netto: Optional[float] = 0.0
    status: str = "Waiting for Payment"
    bezahlt: bool = False
    address_ids: List[str] = []
    objects: List[Dict[str, Any]] = []
    total_objects: int = 0
    total_we: int = 0
    notes: Optional[str] = ""
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

