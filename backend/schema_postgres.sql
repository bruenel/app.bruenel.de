-- ====================================================================================
-- BRÜNEL ERP & FIELD OPERATIONS PLATFORM - COMPLETE POSTGRESQL DDL & RLS SPECIFICATION
-- ====================================================================================

-- ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM DEFINITIONS
DO $$ BEGIN
    CREATE TYPE employment_type_enum AS ENUM ('Freelancer', 'Full-time', 'Part-time', 'Daily');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE project_status_enum AS ENUM ('Active', 'Paused', 'Completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE object_status_enum AS ENUM ('Planned', 'Hausbegehung', 'In Progress', 'Tested', 'Completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE lager_type_enum AS ENUM ('StaticLager', 'Vehicle');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type_enum AS ENUM ('CheckOut', 'Return', 'Consume', 'Schwund', 'FIELD_SALE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE leave_type_enum AS ENUM ('Daily', 'Half-day', 'Long-term');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE request_status_enum AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE document_ref_enum AS ENUM ('Expense', 'Lohnabrechnung', 'Invoice', 'ObjectMedia', 'Krankmeldung', 'Contract');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM ('CASH', 'CARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sale_status_enum AS ENUM ('COMPLETED', 'REFUNDED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. EMPLOYEES & REGIONS
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(50),
    department VARCHAR(100) DEFAULT 'Field Operations',
    employment_type employment_type_enum NOT NULL DEFAULT 'Full-time',
    role VARCHAR(100) NOT NULL DEFAULT 'Field Employee',
    role_tier INT NOT NULL DEFAULT 5,
    base_salary DECIMAL(10,2) DEFAULT 0.00,
    hourly_rate DECIMAL(10,2) DEFAULT 0.00,
    annual_leave_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100),
    attributes JSONB DEFAULT '{}'::jsonb
);

-- 2. PROJECTS & OBJECTS
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    client_name VARCHAR(150),
    kst INT DEFAULT 1000,
    status project_status_enum DEFAULT 'Active',
    manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    start_date DATE,
    end_date DATE,
    budget DECIMAL(12,2) DEFAULT 0.00,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id),
    address VARCHAR(255) NOT NULL,
    units_count INT NOT NULL DEFAULT 1,
    cabling_type VARCHAR(100) NOT NULL,
    status object_status_enum DEFAULT 'Planned',
    drive_folder_id VARCHAR(255),
    notes TEXT,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    leader_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    member_ids JSONB DEFAULT '[]'::jsonb,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    assigned_employee_ids JSONB DEFAULT '[]'::jsonb,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id),
    object_id UUID REFERENCES objects(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    title VARCHAR(200),
    instructions TEXT,
    priority VARCHAR(30) DEFAULT 'Normal',
    task_status VARCHAR(30) DEFAULT 'Planned',
    checklist JSONB DEFAULT '[]'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb
);

-- DELEGATION (VERTRETUNG)
CREATE TABLE IF NOT EXISTS delegation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    delegatee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    scope_note VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_delegation_dates CHECK (end_date >= start_date)
);

-- 3. VEHICLES & EQUIPMENT
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(100) NOT NULL,
    vin VARCHAR(100),
    mileage_km INT DEFAULT 0,
    next_inspection_date DATE,
    assigned_team_lead_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) DEFAULT 'Tool',
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    condition_status VARCHAR(50) DEFAULT 'Good',
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
CREATE TABLE IF NOT EXISTS lagers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    location VARCHAR(255) NOT NULL,
    manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'Cabling',
    unit VARCHAR(30) DEFAULT 'pcs',
    min_stock_threshold INT DEFAULT 10,
    unit_cost DECIMAL(10,2) DEFAULT 0.00,
    attributes JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    lager_type lager_type_enum NOT NULL,
    lager_id UUID NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(material_id, lager_type, lager_id)
);

CREATE TABLE IF NOT EXISTS material_transactions (
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
CREATE TABLE IF NOT EXISTS time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    project_id UUID REFERENCES projects(id),
    object_id UUID REFERENCES objects(id),
    date DATE NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL,
    check_out_time TIMESTAMPTZ,
    break_minutes INT DEFAULT 0,
    total_hours DECIMAL(6,2),
    check_in_data JSONB DEFAULT '{}'::jsonb,
    check_out_data JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(30) DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS time_log_team (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    team_member_id UUID REFERENCES employees(id),
    PRIMARY KEY (time_log_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS time_log_vehicles (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id),
    PRIMARY KEY (time_log_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS time_log_tools (
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    equipment_id UUID REFERENCES equipment(id),
    PRIMARY KEY (time_log_id, equipment_id)
);

-- 6. LEAVES, SICKNESS, PAYSLIPS, EXPENSES & DOCUMENTS
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type leave_type_enum NOT NULL,
    reason TEXT,
    approved_by UUID REFERENCES employees(id),
    status request_status_enum DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sickness_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    symptoms_note TEXT,
    doctor_visited BOOLEAN DEFAULT FALSE,
    au_document_id UUID,
    status VARCHAR(50) DEFAULT 'Reported',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type document_ref_enum NOT NULL,
    reference_id UUID NOT NULL,
    employee_id UUID REFERENCES employees(id),
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) DEFAULT 'application/octet-stream',
    file_size INT DEFAULT 0,
    storage_provider VARCHAR(50) DEFAULT 'local_s3',
    storage_key VARCHAR(500) NOT NULL,
    drive_file_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Uploaded',
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_month INT NOT NULL,
    period_year INT NOT NULL,
    gross_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    net_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    commission_bonus DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    hours_worked DECIMAL(6,2) DEFAULT 0.00,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'Issued',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    project_id UUID REFERENCES projects(id),
    vehicle_id UUID REFERENCES vehicles(id),
    category VARCHAR(100) NOT NULL,
    merchant VARCHAR(150),
    description TEXT,
    amount_net DECIMAL(10,2) NOT NULL,
    vat_rate DECIMAL(5,2) DEFAULT 19.00,
    amount_gross DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    expense_date DATE NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status request_status_enum DEFAULT 'Pending',
    approved_by UUID REFERENCES employees(id),
    n8n_sync_status VARCHAR(50) DEFAULT 'Pending_Manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. FIELD SALES & UPSELLING
CREATE TABLE IF NOT EXISTS sales_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'Hardware',
    buy_price DECIMAL(10,2) NOT NULL,
    sell_price DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS field_sales (
    sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    project_id UUID REFERENCES projects(id),
    object_id UUID REFERENCES objects(id),
    catalog_item_id UUID NOT NULL REFERENCES sales_catalog(id),
    customer_name VARCHAR(150),
    customer_unit VARCHAR(50),
    quantity INT NOT NULL CHECK (quantity > 0),
    payment_method payment_method_enum NOT NULL,
    total_revenue DECIMAL(10,2) NOT NULL,
    total_commission DECIMAL(10,2) NOT NULL,
    sale_timestamp TIMESTAMPTZ DEFAULT NOW(),
    status sale_status_enum DEFAULT 'COMPLETED'
);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    changed_by VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
            material_id, employee_id, project_id, object_id, source_lager_type,
            source_lager_id, transaction_type, quantity, note
        ) VALUES (
            v_material_id, NEW.employee_id, NEW.project_id, NEW.object_id, 'Vehicle',
            NEW.vehicle_id, 'FIELD_SALE', -NEW.quantity,
            CONCAT('Field Sale ID: ', NEW.sale_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_field_sale_inventory ON field_sales;
CREATE TRIGGER trigger_field_sale_inventory
AFTER INSERT ON field_sales
FOR EACH ROW
EXECUTE FUNCTION process_field_sale_inventory();

-- ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_self_select_time ON time_logs;
CREATE POLICY employee_self_select_time ON time_logs
    FOR SELECT
    USING (
        current_setting('app.current_role_tier', true)::int <= 4
        OR employee_id = NULLIF(current_setting('app.current_employee_id', true), '')::uuid
    );

DROP POLICY IF EXISTS employee_self_select_leave ON leave_requests;
CREATE POLICY employee_self_select_leave ON leave_requests
    FOR SELECT
    USING (
        current_setting('app.current_role_tier', true)::int <= 4
        OR employee_id = NULLIF(current_setting('app.current_employee_id', true), '')::uuid
    );

DROP POLICY IF EXISTS employee_self_select_sales ON field_sales;
CREATE POLICY employee_self_select_sales ON field_sales
    FOR SELECT
    USING (
        current_setting('app.current_role_tier', true)::int <= 4
        OR employee_id = NULLIF(current_setting('app.current_employee_id', true), '')::uuid
    );
