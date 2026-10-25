# BRÜNEL ERP & FIELD OPERATIONS PLATFORM
## Comprehensive System Architecture Blueprint & Development Specification

> **Target Audience:** AI Development Agents (e.g., Antigravity Agent, Claude 3.5 Sonnet, Gemini 1.5 Pro) & Software Engineering Teams.  
> **Document Purpose:** Complete, self-contained technical specification and execution guide for building the Brünel ERP system end-to-end without requiring additional architectural queries.

---

## CHAPTER 1: DEVELOPMENT DIRECTIVES & AI AGENT METHODOLOGY

### 1.1 Context Window & Execution Strategy
To guarantee code consistency and prevent cross-module conflicts, development agents must maintain the entire database schema, system dependencies, and architectural rules within active memory.

### 1.2 Three-Phase Modular Development Methodology
Development must follow a strict modular paradigm. No downstream module may be started until the upstream module passes complete unit and schema validation.

1. **Phase 1: Isolated Module Build**
   - Build backend logic, PostgreSQL schemas, and frontend UI components for each module independently.
   - Maintain zero direct compile-time dependencies between modules.
2. **Phase 2: Independent Validation & Testing**
   - Execute isolated unit tests, trigger validations, and Row-Level Security (RLS) query tests per module.
   - Verify DB state integrity and API response formats before proceeding.
3. **Phase 3: Modular Integration via Core APIs**
   - Connect independent modules exclusively via standard RESTful API endpoints.
   - Enforce central JSON Web Token (JWT) authorization across all module boundaries.

### 1.3 Non-Negotiable Software Engineering Laws
* **API-First Design:** Modules must never directly query another module's database tables. All cross-module data exchange occurs via internal REST APIs.
* **DRY Principle (Don't Repeat Yourself):** Shared utility functions (JWT parsers, audit logging handlers, date utilities, response formatters) must reside in a single shared core directory (`/src/core`).
* **Enforced Row-Level Security (RLS):** All database migration scripts must explicitly enable RLS and attach security policies.

---

## CHAPTER 2: HIGH-LEVEL SYSTEM ARCHITECTURE & INFRASTRUCTURE

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|                  Progressive Web App (PWA) - React / Next.js / Vue                |
+-----------------------------------------------------------------------------------+
                                          |
                                 REST APIs (JWT Auth)
                                          v
+-----------------------------------------------------------------------------------+
|                                BACKEND API LAYER                                  |
|                            Node.js / Python (FastAPI)                             |
+-----------------------------------------------------------------------------------+
       |                         |                           |                  |
       v                         v                           v                  v
+--------------+    +-----------------------+    +--------------------+    +--------+
|  PostgreSQL  |    | S3 Object Storage     |    | Google Drive API   |    |  n8n   |
| (Relational  |    | (AWS S3 / MinIO)      |    | (Service Account)  |    | Engine |
|   + JSONB)   |    | High-frequency media  |    | HR Docs / Payslips |    +--------+
+--------------+    +-----------------------+    +--------------------+        |
       ^                                                                       |
       |------------------------ Audit Logs & Triggers ------------------------|
```

### 2.1 Tech Stack Components
* **Frontend:** Web-based Progressive Web App (PWA) using React.js, Vue.js, or Next.js, optimized for desktop management and field-worker mobile viewports.
* **Backend API:** Node.js (Express/NestJS) or Python (FastAPI) exposing RESTful JSON API endpoints.
* **Database:** PostgreSQL (Relational core with JSONB for dynamic Entity-Attribute-Value properties).
* **High-Frequency Media Storage:** S3-compatible Object Storage (AWS S3 or self-hosted MinIO) for daily site photos, receipts, and operational media to prevent API throttling.
* **Document & HR Storage:** Google Drive API via background Service Accounts, restricted strictly to final compiled PDF reports and HR payroll documents (`Lohnabrechnung`).
* **Automation Engine:** n8n workflow middleware for asynchronous background tasks, banking API connections (DATEV/Lexware), and system integrations.
* **Operational Alerts:** Telegram Bot API connected via Webhooks to n8n, restricted strictly to non-sensitive operational notifications (low-stock alerts, status shifts) to ensure German DSGVO/GDPR compliance.

---

## CHAPTER 3: SECURITY, AUTHENTICATION & ACCESS CONTROL

### 3.1 Authentication & Session Architecture
* **Token Standard:** Stateless JSON Web Tokens (JWT).
* **Access Tokens:** Short-lived (15 minutes expiry), passed in the `Authorization: Bearer <token>` HTTP header.
* **Refresh Tokens:** Long-lived (7 days expiry), stored in HTTP-only, Secure, SameSite cookies.
* **Password Hashing:** `bcrypt` with a minimum salt rounds factor of 12.
* **Transit Security:** Enforced TLS 1.3 across all client-server interactions.

### 3.2 Row-Level Security (RLS) & Delegation Framework
PostgreSQL Row-Level Security guarantees that query results are restricted at the database level based on the authenticated user's `employee_id`.

```sql
-- Enable RLS on core operational tables
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_sales ENABLE ROW LEVEL SECURITY;

-- Sample Employee RLS Policy
CREATE POLICY employee_self_select ON time_logs
    FOR SELECT
    USING (employee_id = NULLIF(current_setting('app.current_employee_id', true), '')::uuid);
```

#### Time-Bound Delegation Entity (`Vertretung`)
To handle temporary absences without granting permanent administrative rights, the delegation engine allows temporary transfer of Row-Level Security scope between Project Managers:

```sql
CREATE TABLE delegation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id UUID NOT NULL REFERENCES employees(id),
    delegatee_id UUID NOT NULL REFERENCES employees(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_delegation_dates CHECK (end_date >= start_date)
);
```

### 3.3 Trigger-Based Audit Logging
All `UPDATE` and `DELETE` operations on critical system tables generate immutable audit trail entries automatically.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    record_id UUID NOT NULL,
    changed_by UUID,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 5-Tier Role-Based Access Control (RBAC) Matrix

| Tier | Role Title | System Permissions & Access Scope | Restrictions |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Super Admin / Managing Director** | Absolute CRUD access across all modules, schema dynamic attributes, system settings, financial reports, and project manager allocations. | None. |
| **Tier 2** | **Project Manager (`Projektleiter`)** | Full read/write for assigned Projects, Objects, and Regions. Team allocation, Lager/Vehicle inventory monitoring, Leave approval for assigned team. | No access to global HR salary details or accounting settings. |
| **Tier 3** | **HR & Finance Admin** | Full access to employee profiles, payslips (`Lohnabrechnung`), expense processing, and n8n accounting integration. | No access to site project execution or technical object data. |
| **Tier 4** | **Team Lead (`Vorarbeiter`)** | Execute team check-in/check-out, material bookings (`Buchen`), Object status updates, equipment take-overs. | Restricted to actively assigned project teams and vehicles. |
| **Tier 5** | **Field Employee (Technician/Worker)** | Read-only personal calendar, individual check-in/out, submit leave requests/expenses, view own payslips, execute field sales. | Strictly restricted to data matching their `employee_id`. |
| **Service**| **System Bot (n8n / Telegram)** | API Service Account scoped to specific document IDs, expense records, and system trigger webhooks. | Restricted to non-sensitive DSGVO-compliant operations. |

---

## CHAPTER 4: COMPLETE POSTGRESQL DATABASE SCHEMA

```sql
-- ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM DEFINITIONS
CREATE TYPE employment_type_enum AS ENUM ('Freelancer', 'Full-time', 'Part-time', 'Daily');
CREATE TYPE project_status_enum AS ENUM ('Active', 'Paused', 'Completed');
CREATE TYPE object_status_enum AS ENUM ('Planned', 'Hausbegehung', 'In Progress', 'Tested', 'Completed');
CREATE TYPE lager_type_enum AS ENUM ('StaticLager', 'Vehicle');
CREATE TYPE transaction_type_enum AS ENUM ('CheckOut', 'Return', 'Consume', 'Schwund', 'FIELD_SALE');
CREATE TYPE leave_type_enum AS ENUM ('Daily', 'Half-day', 'Long-term');
CREATE TYPE request_status_enum AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE document_ref_enum AS ENUM ('Expense', 'Lohnabrechnung', 'Invoice', 'ObjectMedia');
CREATE TYPE payment_method_enum AS ENUM ('CASH', 'CARD');
CREATE TYPE sale_status_enum AS ENUM ('COMPLETED', 'REFUNDED', 'DISPUTED');

-- 1. EMPLOYEES & REGIONS
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    employment_type employment_type_enum NOT NULL,
    role VARCHAR(100) NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb
);

-- 2. PROJECTS & OBJECTS
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    status project_status_enum DEFAULT 'Active',
    manager_id UUID REFERENCES employees(id),
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id),
    address VARCHAR(255) NOT NULL,
    units_count INT NOT NULL DEFAULT 1,
    cabling_type VARCHAR(100) NOT NULL,
    status object_status_enum DEFAULT 'Planned',
    drive_folder_id VARCHAR(255),
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id),
    date DATE NOT NULL,
    UNIQUE(employee_id, date)
);

-- 3. VEHICLES & EQUIPMENT
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    attributes JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT equipment_exclusive_assignment CHECK (
        (assigned_employee_id IS NOT NULL AND assigned_vehicle_id IS NULL) OR
        (assigned_employee_id IS NULL AND assigned_vehicle_id IS NOT NULL) OR
        (assigned_employee_id IS NULL AND assigned_vehicle_id IS NULL)
    )
);

-- 4. INVENTORY & MATERIALS
CREATE TABLE lagers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    location VARCHAR(255) NOT NULL
);

CREATE TABLE materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    lager_type lager_type_enum NOT NULL,
    lager_id UUID NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(material_id, lager_type, lager_id)
);

CREATE TABLE material_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    project_id UUID REFERENCES projects(id),
    object_id UUID REFERENCES objects(id),
    source_lager_type lager_type_enum NOT NULL,
    source_lager_id UUID NOT NULL,
    transaction_type transaction_type_enum NOT NULL,
    quantity INT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    note TEXT
);

-- 5. TIME LOGGING & MAPPING TABLES
CREATE TABLE time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL,
    check_out_time TIMESTAMPTZ,
    check_in_data JSONB DEFAULT '{}'::jsonb,
    check_out_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE time_log_team (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    team_member_id UUID REFERENCES employees(id),
    PRIMARY KEY (time_log_id, team_member_id)
);

CREATE TABLE time_log_vehicles (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id),
    PRIMARY KEY (time_log_id, vehicle_id)
);

CREATE TABLE time_log_tools (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    equipment_id UUID REFERENCES equipment(id),
    PRIMARY KEY (time_log_id, equipment_id)
);

-- 6. LEAVES & DOCUMENTS
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type leave_type_enum NOT NULL,
    status request_status_enum DEFAULT 'Pending'
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type document_ref_enum NOT NULL,
    reference_id UUID NOT NULL,
    drive_file_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Uploaded'
);

-- 7. FIELD SALES & UPSELLING
CREATE TABLE sales_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    buy_price DECIMAL(10,2) NOT NULL,
    sell_price DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE field_sales (
    sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    project_id UUID REFERENCES projects(id),
    catalog_item_id UUID NOT NULL REFERENCES sales_catalog(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    payment_method payment_method_enum NOT NULL,
    total_revenue DECIMAL(10,2) NOT NULL,
    total_commission DECIMAL(10,2) NOT NULL,
    sale_timestamp TIMESTAMPTZ DEFAULT NOW(),
    status sale_status_enum DEFAULT 'COMPLETED'
);

-- AUTOMATIC STOCK DEDUCTION TRIGGER ON FIELD SALE
CREATE OR REPLACE FUNCTION process_field_sale_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_material_id UUID;
BEGIN
    SELECT id INTO v_material_id FROM materials WHERE sku = (
        SELECT sku FROM sales_catalog WHERE id = NEW.catalog_item_id
    );

    IF v_material_id IS NOT NULL THEN
        INSERT INTO material_transactions (
            material_id, employee_id, project_id, source_lager_type,
            source_lager_id, transaction_type, quantity, note
        ) VALUES (
            v_material_id, NEW.employee_id, NEW.project_id, 'Vehicle',
            NEW.vehicle_id, 'FIELD_SALE', -NEW.quantity,
            CONCAT('Field Sale ID: ', NEW.sale_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_field_sale_inventory
AFTER INSERT ON field_sales
FOR EACH ROW
EXECUTE FUNCTION process_field_sale_inventory();
```

---

## CHAPTER 5: MODULE SPECIFICATIONS & FUNCTIONAL WORKFLOWS

### Module 1: HR & Employee Management
* **Smart Check-in:** Records check-in timestamp and opens dynamic prompt: "Assigned Project", "Vehicle License Plate", "Selected Tools", "Assigned Team Members". Inserts records into `time_logs`, `time_log_team`, `time_log_vehicles`, and `time_log_tools`.
* **Smart Check-out:** Records check-out timestamp, collects tool location confirmations, and initiates material return/consumption prompt.
* **Urlaub (Leave) System:** Submissions create `leave_requests` entries (`Pending`). Approval updates the status to `Approved`, automatically populating the master calendar.

### Module 2: Project & Object Management
* **Hierarchical Structure:** `Region (PLZ) -> Project -> Object (Building)`.
* **Building Lifecycle:** `Planned -> Hausbegehung (Site Survey) -> In Progress -> Tested -> Completed`.
* **Flexible Assignments:** Employees can be assigned dynamically to different projects and postal codes per day via the `assignments` matrix.

### Module 3: Material Management & Event-Sourced Ledger
* **Inventory Stock Calculation:** Stock levels are calculated dynamically via sum aggregation over `material_transactions` to eliminate concurrency race conditions.
```sql
SELECT SUM(quantity) AS current_stock
FROM material_transactions
WHERE source_lager_type = 'Vehicle' AND source_lager_id = 'vehicle-uuid' AND material_id = 'material-uuid';
```
* **Wastage Reconciliation (`Schwund`):** Unaccounted variances during site check-out must be explicitly recorded under the `Schwund` transaction type with mandatory text justification.

### Module 4: Equipment & Fleet Tracking
* Vehicles act as Mobile Lagers.
* High-value tools enforce exclusive possession via database check constraints (`assigned_employee_id` OR `assigned_vehicle_id`).

### Module 5: Centralized Interactive Master Calendar
* Reads directly from `assignments`, `leave_requests`, and `objects`.
* Color Coding:
  * **Solid Yellow:** Approved Leave (`Approved`).
  * **Faded Yellow:** Pending Leave (`Pending`).
  * **Green:** Tested/Completed Building Object.
  * **Blue:** Active Site Survey / Cabling execution.

### Module 6: Accounting Automation & DSGVO Middleware
* High-frequency media (photos/receipts) streamed to S3 Object Storage.
* n8n automatically compiles approved expenses and routes final PDFs to Google Drive.
* Telegram Bot restricted entirely to operational alerts (e.g., low stock).

### Module 7: Field Sales & Hardware Upselling
* Technicians perform on-site sales (e.g., Modems) directly in the PWA.
* **Validation:** Validates that the active `vehicle_id` has sufficient inventory of the catalog item SKU before allowing checkout.
* **Payment Methods:** CASH or PORTABLE CARD TERMINAL.
* **Auto-Trigger:** Deducts mobile stock instantly and generates commission records for monthly payroll line items (`Provision`).

---

## CHAPTER 6: CORE REST API ENDPOINTS SPECIFICATION

```
====================================================================================
HTTP METHOD | API ENDPOINT ROUTE            | DESCRIPTION & ACCESS LEVEL
====================================================================================
POST        | /api/v1/auth/login            | Authenticate user & return JWT token pair.
POST        | /api/v1/auth/refresh          | Exchange refresh token for new access token.
------------+-------------------------------+---------------------------------------
POST        | /api/v1/hr/checkin            | Submit smart check-in payload & logs.
POST        | /api/v1/hr/checkout           | Submit smart check-out & tool status.
GET         | /api/v1/hr/leave-requests     | Retrieve user/team leave requests.
POST        | /api/v1/hr/leave-requests     | Submit new Urlaub request.
------------+-------------------------------+---------------------------------------
GET         | /api/v1/projects              | Fetch active projects (RLS scoped).
GET         | /api/v1/objects/:id           | Fetch object details & media references.
PATCH       | /api/v1/objects/:id/status    | Update object cabling status.
------------+-------------------------------+---------------------------------------
POST        | /api/v1/inventory/buchen      | Execute material transfer/consumption log.
GET         | /api/v1/inventory/stock       | Fetch current aggregated stock levels.
------------+-------------------------------+---------------------------------------
GET         | /api/v1/sales/catalog         | Fetch active field sales items & prices.
POST        | /api/v1/sales/transaction     | Process field sale (CASH/CARD) & deduct stock.
GET         | /api/v1/sales/dashboard       | Fetch aggregated sales analytics (Admin).
GET         | /api/v1/sales/commissions/:id | Fetch monthly earned commissions.
====================================================================================
```

---

## CHAPTER 7: STEP-BY-STEP IMPLEMENTATION ROADMAP FOR AI AGENTS

1. **Step 1: Database Initialization**
   - Execute Chapter 4 SQL DDL script against PostgreSQL instance.
   - Verify triggers (`process_field_sale_inventory`) and RLS constraints.
2. **Step 2: Core Auth & Shared Utilities (`/src/core`)**
   - Implement JWT signing/validation, password hashing, and error handlers.
3. **Step 3: Isolated Module Builds**
   - Build Module 1 (HR), Module 2 (Projects), Module 3 (Inventory), Module 4 (Equipment), Module 6 (Accounting), Module 7 (Field Sales).
4. **Step 4: API Wiring & Modular Integration**
   - Expose REST API routes as defined in Chapter 6.
   - Enforce JWT authentication and RLS parameters on all endpoints.
5. **Step 5: Frontend PWA Implementation**
   - Implement technician mobile viewports (Check-in, Upsell tab, My Calendar).
   - Implement admin management dashboards (Projects, Live Sales feed, Commission reports).
