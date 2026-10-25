from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
import uuid
import os

import models
from core.security import get_password_hash, ensure_employee_linked
from core.storage import get_local_file_path


def seed_initial_erp_data(db: Session):
    """
    Ensure the local/production database has initial Owner account, sample employees across all 5 RBAC tiers,
    regions, projects, building objects, lagers, vehicles, tools, materials, sales catalog, and sample payslips.
    Idempotent: only inserts when tables are empty.
    """
    # 1. Ensure Owner account exists
    owner = db.query(models.User).filter(models.User.email == "sam.rastegar@bruenel.de").first()
    if not owner:
        owner = models.User(
            email="sam.rastegar@bruenel.de",
            hashed_password=get_password_hash("Lattel-Macchiato!986"),
            role=models.RoleEnum.OWNER,
            role_tier=1,
            allowed_kst=[0, 1000, 2000, 3000, 4000],
            allowed_modules=models.ALL_MODULE_KEYS,
            can_access_app=True,
            can_access_portal=True,
        )
        db.add(owner)
        db.commit()
        db.refresh(owner)
    else:
        owner.role_tier = 1
        owner.can_access_app = True
        owner.can_access_portal = True
        if not owner.allowed_modules:
            owner.allowed_modules = models.ALL_MODULE_KEYS
        db.commit()

    owner_emp = ensure_employee_linked(db, owner)
    if owner_emp:
        owner_emp.first_name = "Sam"
        owner_emp.last_name = "Rastegar"
        owner_emp.role = "Super Admin / Managing Director"
        owner_emp.role_tier = 1
        owner_emp.department = "Executive Management"
        owner_emp.base_salary = 8500.00
        db.commit()

    # Incremental v2.1+ seed: Ensure Teams, German Arbeitsrecht HR attributes, and Subunternehmer exist
    if db.query(models.Region).count() > 0:
        if db.query(models.Team).count() == 0:
            _seed_teams_and_enhanced_tasks(db, owner_emp)
        _ensure_german_hr_attributes(db)
        return

    print("Seeding initial Brünel ERP & Field Operations dataset...")

    # 2. Seed Employees across all 5 RBAC Tiers
    pm_id = str(uuid.uuid4())
    hr_id = str(uuid.uuid4())
    lead_id = str(uuid.uuid4())
    tech1_id = str(uuid.uuid4())
    tech2_id = str(uuid.uuid4())

    demo_employees = [
        models.Employee(
            id=pm_id,
            employee_number="BRN-1002",
            first_name="Markus",
            last_name="Weber",
            email="markus.weber@bruenel.de",
            phone="+49 151 23456701",
            department="Project Management",
            employment_type="Full-time",
            role="Project Manager",
            role_tier=2,
            base_salary=5800.00,
            hourly_rate=36.50,
            annual_leave_days=30,
        ),
        models.Employee(
            id=hr_id,
            employee_number="BRN-1003",
            first_name="Sabine",
            last_name="Keller",
            email="sabine.keller@bruenel.de",
            phone="+49 151 23456702",
            department="HR & Finance",
            employment_type="Full-time",
            role="HR & Finance Admin",
            role_tier=3,
            base_salary=4900.00,
            hourly_rate=31.00,
            annual_leave_days=30,
        ),
        models.Employee(
            id=lead_id,
            employee_number="BRN-1004",
            first_name="Lukas",
            last_name="schmidt",
            email="lukas.schmidt@bruenel.de",
            phone="+49 151 23456703",
            department="Field Operations",
            employment_type="Full-time",
            role="Team Lead (Vorarbeiter)",
            role_tier=4,
            base_salary=4200.00,
            hourly_rate=26.50,
            annual_leave_days=28,
        ),
        models.Employee(
            id=tech1_id,
            employee_number="BRN-1005",
            first_name="Ali",
            last_name="Yilmaz",
            email="ali.yilmaz@bruenel.de",
            phone="+49 151 23456704",
            department="Fiber & Cabling",
            employment_type="Full-time",
            role="Field Technician",
            role_tier=5,
            base_salary=3600.00,
            hourly_rate=22.50,
            annual_leave_days=28,
        ),
        models.Employee(
            id=tech2_id,
            employee_number="BRN-1006",
            first_name="Milan",
            last_name="Kovac",
            email="milan.kovac@bruenel.de",
            phone="+49 151 23456705",
            department="Fiber & Cabling",
            employment_type="Freelancer",
            role="Field Technician",
            role_tier=5,
            base_salary=0.00,
            hourly_rate=32.00,
            annual_leave_days=0,
        ),
    ]
    for emp in demo_employees:
        emp.last_name = emp.last_name.capitalize()
        db.add(emp)
    db.flush()

    # Create User logins for demo accounts (Password: Bruenel2026!)
    demo_users = [
        ("markus.weber@bruenel.de", models.RoleEnum.PROJECT_MANAGER, 2, pm_id, True, ["mod_dashboard", "mod_projects", "mod_inventory", "mod_fleet", "mod_calendar", "mod_hr", "mod_sales"]),
        ("sabine.keller@bruenel.de", models.RoleEnum.HR_FINANCE, 3, hr_id, True, ["mod_dashboard", "mod_hr", "mod_accounting", "mod_calendar", "mod_sales", "mod_vault"]),
        ("lukas.schmidt@bruenel.de", models.RoleEnum.TEAM_LEAD, 4, lead_id, True, ["mod_dashboard", "mod_projects", "mod_inventory", "mod_fleet", "mod_calendar", "mod_sales"]),
        ("ali.yilmaz@bruenel.de", models.RoleEnum.FIELD_EMPLOYEE, 5, tech1_id, False, []),
    ]
    for email, r_enum, tier, eid, app_access, mods in demo_users:
        if not db.query(models.User).filter(models.User.email == email).first():
            db.add(models.User(
                email=email,
                hashed_password=get_password_hash("Bruenel2026!"),
                role=r_enum,
                role_tier=tier,
                employee_id=eid,
                allowed_kst=[1000, 2000],
                allowed_modules=mods,
                can_access_app=app_access,
                can_access_portal=True,
            ))

    # 3. Seed Regions (PLZ)
    reg_ffm = models.Region(id=str(uuid.uuid4()), name="Frankfurt am Main Nord", postal_code="60435", city="Frankfurt")
    reg_karben = models.Region(id=str(uuid.uuid4()), name="Karben / Wetterau", postal_code="61184", city="Karben")
    reg_offenbach = models.Region(id=str(uuid.uuid4()), name="Offenbach Zentrum", postal_code="63065", city="Offenbach")
    db.add_all([reg_ffm, reg_karben, reg_offenbach])
    db.flush()

    # 4. Seed Projects & Building Objects
    proj1 = models.Project(
        id=str(uuid.uuid4()),
        name="FTTH Rollout Frankfurt Nord (NE3/NE4)",
        code="PRJ-FFM-01",
        client_name="Deutsche Glasfaser / Telekom Partner",
        kst=1000,
        status="Active",
        manager_id=pm_id,
        region_id=reg_ffm.id,
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=90),
        budget=185000.00,
    )
    proj2 = models.Project(
        id=str(uuid.uuid4()),
        name="Karben Smart Building & Fiber Grid",
        code="PRJ-KRB-02",
        client_name="Stadtwerke Karben",
        kst=4000,
        status="Active",
        manager_id=owner_emp.id if owner_emp else pm_id,
        region_id=reg_karben.id,
        start_date=date.today() - timedelta(days=14),
        end_date=date.today() + timedelta(days=60),
        budget=92000.00,
    )
    db.add_all([proj1, proj2])
    db.flush()

    obj1 = models.BuildingObject(
        id=str(uuid.uuid4()),
        project_id=proj1.id,
        region_id=reg_ffm.id,
        address="Eckenheimer Landstr. 142, 60435 Frankfurt",
        units_count=18,
        cabling_type="FTTH Singlemode 12-Fiber",
        status="In Progress",
        notes="Basement HÜP installed. Riser channels open on floors 1-4.",
    )
    obj2 = models.BuildingObject(
        id=str(uuid.uuid4()),
        project_id=proj1.id,
        region_id=reg_ffm.id,
        address="Marbachweg 88, 60435 Frankfurt",
        units_count=12,
        cabling_type="FTTH Microduct 7mm",
        status="Hausbegehung",
        notes="Owner protocol signed. Waiting for fire-stop collar delivery.",
    )
    obj3 = models.BuildingObject(
        id=str(uuid.uuid4()),
        project_id=proj2.id,
        region_id=reg_karben.id,
        address="Ramonville Str. 28, 61184 Karben",
        units_count=8,
        cabling_type="Cat7A + OM4 Duplex",
        status="Tested",
        notes="OTDR measurement passed at 1310nm/1550nm.",
    )
    db.add_all([obj1, obj2, obj3])
    db.flush()

    # 5. Seed Assignments (Employee Tasks)
    today = date.today()
    db.add_all([
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=lead_id,
            project_id=proj1.id,
            region_id=reg_ffm.id,
            object_id=obj1.id,
            date=today,
            title="NE4 Riser Splicing & OTO Box Mounting (18 WE)",
            instructions="Complete splicing in basement distribution box and mount OTO outlets in apartments 1-8. Upload OTDR test video.",
            priority="High",
            task_status="In Progress",
            checklist=[
                {"label": "Verify HÜP splice tray", "done": True},
                {"label": "Install riser microducts Fl 1-3", "done": True},
                {"label": "Splice OTO sockets & upload test photo/video", "done": False},
            ],
        ),
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=tech1_id,
            project_id=proj1.id,
            region_id=reg_ffm.id,
            object_id=obj1.id,
            date=today,
            title="Apartment Fiber Termination & Modem Upsell",
            instructions="Assist Team Lead at Eckenheimer Landstr. 142. Offer Fritz!Box 5590 Fiber to tenants upon activation.",
            priority="High",
            task_status="In Progress",
            checklist=[
                {"label": "Check vehicle stock for Fritz!Box 5590", "done": True},
                {"label": "Mount OTO boxes on 2nd floor", "done": False},
            ],
        ),
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=owner_emp.id if owner_emp else pm_id,
            project_id=proj2.id,
            region_id=reg_karben.id,
            object_id=obj3.id,
            date=today,
            title="Final Acceptance Inspection (Abnahmeprotokoll)",
            instructions="Inspect completed cabling & OTDR test protocol at Ramonville Str. 28.",
            priority="Normal",
            task_status="Assigned",
            checklist=[{"label": "Sign final acceptance PDF", "done": False}],
        ),
    ])

    # 6. Seed Vehicles & High-Value Equipment
    veh1 = models.Vehicle(
        id=str(uuid.uuid4()),
        plate_number="FB-BR 101",
        model="Mercedes-Benz Sprinter 317 CDI",
        vin="W1V9076331N123456",
        mileage_km=34210,
        next_inspection_date=today + timedelta(days=180),
        assigned_team_lead_id=lead_id,
        is_active=True,
    )
    veh2 = models.Vehicle(
        id=str(uuid.uuid4()),
        plate_number="FB-BR 202",
        model="VW Transporter T6.1 Kasten",
        vin="WV1ZZZ7HZNH654321",
        mileage_km=51890,
        next_inspection_date=today + timedelta(days=95),
        assigned_team_lead_id=tech1_id,
        is_active=True,
    )
    db.add_all([veh1, veh2])
    db.flush()

    eq1 = models.Equipment(
        id=str(uuid.uuid4()),
        name="Fujikura 90S+ Core Alignment Fusion Splicer",
        category="Splicer",
        serial_number="FUJI-90S-88412",
        condition_status="Good",
        assigned_employee_id=lead_id,
        assigned_vehicle_id=None,
    )
    eq2 = models.Equipment(
        id=str(uuid.uuid4()),
        name="EXFO MaxTester 730C OTDR Fiber Meter",
        category="Measurement",
        serial_number="EXFO-730C-19204",
        condition_status="Good",
        assigned_employee_id=None,
        assigned_vehicle_id=veh1.id,
    )
    eq3 = models.Equipment(
        id=str(uuid.uuid4()),
        name="Hilti TE 60-ATC/AVR Rotary Hammer",
        category="Power Tool",
        serial_number="HILTI-TE60-55301",
        condition_status="Good",
        assigned_employee_id=None,
        assigned_vehicle_id=veh2.id,
    )
    db.add_all([eq1, eq2, eq3])

    # 7. Seed Lagers, Materials, Sales Catalog & Initial Stock Transactions
    lager_main = models.Lager(
        id=str(uuid.uuid4()),
        name="Zentrallager Karben HQ",
        location="Ramonville Str. 28, 61184 Karben",
        manager_id=pm_id,
    )
    db.add(lager_main)
    db.flush()

    mat_cable = models.Material(
        id=str(uuid.uuid4()),
        name="Singlemode FTTH Drop Cable G.657.A2 (500m Drum)",
        sku="MAT-FIB-500",
        category="Cabling",
        unit="m",
        min_stock_threshold=200,
        unit_cost=0.85,
    )
    mat_oto = models.Material(
        id=str(uuid.uuid4()),
        name="Glasfaser Teilnehmeranschlussdose (GF-TA / OTO 4-Port)",
        sku="MAT-OTO-04",
        category="Termination",
        unit="pcs",
        min_stock_threshold=25,
        unit_cost=11.50,
    )
    mat_modem1 = models.Material(
        id=str(uuid.uuid4()),
        name="AVM FRITZ!Box 5590 Fiber Wi-Fi 6",
        sku="UPS-FB-5590",
        category="Hardware",
        unit="pcs",
        min_stock_threshold=5,
        unit_cost=165.00,
    )
    mat_modem2 = models.Material(
        id=str(uuid.uuid4()),
        name="AVM FRITZ!Repeater 3000 AX Mesh",
        sku="UPS-FR-3000",
        category="Hardware",
        unit="pcs",
        min_stock_threshold=5,
        unit_cost=89.00,
    )
    db.add_all([mat_cable, mat_oto, mat_modem1, mat_modem2])
    db.flush()

    cat1 = models.SalesCatalog(
        id=str(uuid.uuid4()),
        item_name="AVM FRITZ!Box 5590 Fiber Wi-Fi 6",
        sku="UPS-FB-5590",
        category="Fiber Router",
        buy_price=165.00,
        sell_price=269.00,
        commission_amount=25.00,
        is_active=True,
    )
    cat2 = models.SalesCatalog(
        id=str(uuid.uuid4()),
        item_name="AVM FRITZ!Repeater 3000 AX Mesh",
        sku="UPS-FR-3000",
        category="Mesh Wi-Fi",
        buy_price=89.00,
        sell_price=159.00,
        commission_amount=15.00,
        is_active=True,
    )
    db.add_all([cat1, cat2])
    db.flush()

    # Initial stock transactions (StaticLager & Vehicles)
    stock_txs = [
        (mat_cable.id, "StaticLager", lager_main.id, "Return", 2500, "Initial warehouse stock"),
        (mat_oto.id, "StaticLager", lager_main.id, "Return", 180, "Initial warehouse stock"),
        (mat_modem1.id, "StaticLager", lager_main.id, "Return", 40, "Initial warehouse stock"),
        (mat_modem2.id, "StaticLager", lager_main.id, "Return", 35, "Initial warehouse stock"),
        # Vehicle 1 stock
        (mat_cable.id, "Vehicle", veh1.id, "Return", 500, "Loaded onto FB-BR 101"),
        (mat_oto.id, "Vehicle", veh1.id, "Return", 36, "Loaded onto FB-BR 101"),
        (mat_modem1.id, "Vehicle", veh1.id, "Return", 12, "Upsell stock FB-BR 101"),
        (mat_modem2.id, "Vehicle", veh1.id, "Return", 10, "Upsell stock FB-BR 101"),
        # Vehicle 2 stock
        (mat_modem1.id, "Vehicle", veh2.id, "Return", 8, "Upsell stock FB-BR 202"),
        (mat_modem2.id, "Vehicle", veh2.id, "Return", 6, "Upsell stock FB-BR 202"),
    ]
    for mid, ltype, lid, ttype, qty, note in stock_txs:
        db.add(models.MaterialTransaction(
            id=str(uuid.uuid4()),
            material_id=mid,
            employee_id=pm_id,
            project_id=proj1.id,
            source_lager_type=ltype,
            source_lager_id=lid,
            transaction_type=ttype,
            quantity=qty,
            note=note,
        ))

    # 8. Seed Leave Requests, Sickness, Expenses, Field Sale & Payslips
    db.add_all([
        models.LeaveRequest(
            id=str(uuid.uuid4()),
            employee_id=tech1_id,
            start_date=today + timedelta(days=5),
            end_date=today + timedelta(days=7),
            type="Long-term",
            reason="Family visit",
            approved_by=pm_id,
            status="Approved",
        ),
        models.LeaveRequest(
            id=str(uuid.uuid4()),
            employee_id=lead_id,
            start_date=today + timedelta(days=10),
            end_date=today + timedelta(days=10),
            type="Daily",
            reason="Personal appointment",
            status="Pending",
        ),
        models.SicknessRecord(
            id=str(uuid.uuid4()),
            employee_id=tech2_id,
            start_date=today - timedelta(days=2),
            end_date=today,
            symptoms_note="Flu / fever, doctor AU certificate submitted",
            doctor_visited=True,
            status="Acknowledged",
        ),
        models.Expense(
            id=str(uuid.uuid4()),
            employee_id=lead_id,
            project_id=proj1.id,
            vehicle_id=veh1.id,
            category="Fuel",
            merchant="Aral Tankstelle Frankfurt",
            description="Diesel refuel FB-BR 101 (72L)",
            amount_net=105.04,
            vat_rate=19.00,
            amount_gross=125.00,
            expense_date=today - timedelta(days=1),
            status="Approved",
            approved_by=hr_id,
            n8n_sync_status="Queued_For_DATEV_Export",
        ),
        models.Expense(
            id=str(uuid.uuid4()),
            employee_id=tech1_id,
            project_id=proj1.id,
            vehicle_id=veh2.id,
            category="Material",
            merchant="Bauhaus Frankfurt",
            description="Fire-stop foam & drill bits",
            amount_net=48.74,
            vat_rate=19.00,
            amount_gross=58.00,
            expense_date=today,
            status="Pending",
            n8n_sync_status="Ready_For_Webhook",
        ),
        models.FieldSale(
            sale_id=str(uuid.uuid4()),
            employee_id=tech1_id,
            vehicle_id=veh1.id,
            project_id=proj1.id,
            object_id=obj1.id,
            catalog_item_id=cat1.id,
            customer_name="Herr Hoffmann",
            customer_unit="WE 04 (2. OG)",
            quantity=1,
            payment_method="CARD",
            total_revenue=269.00,
            total_commission=25.00,
            status="COMPLETED",
        ),
    ])

    # Create a sample Payslip PDF/text file on local S3 storage so Payslip download works immediately
    sample_key = f"lohnabrechnung/{tech1_id}/Lohnabrechnung_2026_09_Ali_Yilmaz.txt"
    sample_path = get_local_file_path(sample_key)
    with open(sample_path, "w", encoding="utf-8") as f:
        f.write(
            "=========================================================\n"
            "BRÜNEL DEUTSCHLAND UG - LOHNABRECHNUNG (SALARY STATEMENT)\n"
            "=========================================================\n"
            "Mitarbeiter: Ali Yilmaz (BRN-1005)\n"
            "Abrechnungszeitraum: 09/2026\n"
            "---------------------------------------------------------\n"
            "Grundgehalt (Brutto):                    3.600,00 EUR\n"
            "Field Sales Provision (Bonus):             125,00 EUR\n"
            "Gesamt-Brutto:                           3.725,00 EUR\n"
            "Steuern & Sozialversicherung:           -1.145,00 EUR\n"
            "---------------------------------------------------------\n"
            "AUSZAHLUNGSBETRAG (NETTO):               2.580,00 EUR\n"
            "=========================================================\n"
        )

    slip_doc = models.DocumentRecord(
        id=str(uuid.uuid4()),
        reference_type="Lohnabrechnung",
        reference_id=tech1_id,
        employee_id=tech1_id,
        title="Lohnabrechnung 09/2026 — Ali Yilmaz",
        file_name="Lohnabrechnung_2026_09_Ali_Yilmaz.txt",
        mime_type="text/plain",
        file_size=os.path.getsize(sample_path),
        storage_provider="local_s3",
        storage_key=sample_key,
        drive_file_id=f"s3://{sample_key}",
        status="Uploaded",
    )
    db.add(slip_doc)
    db.flush()

    for emp_target_id, gross, net, comm in [
        (tech1_id, 3600.00, 2455.00, 125.00),
        (lead_id, 4200.00, 2810.00, 90.00),
        (owner_emp.id if owner_emp else pm_id, 8500.00, 5420.00, 0.00),
    ]:
        db.add(models.Payslip(
            id=str(uuid.uuid4()),
            employee_id=emp_target_id,
            period_month=9,
            period_year=2026,
            gross_salary=gross,
            net_salary=net,
            commission_bonus=comm,
            hours_worked=168.0,
            document_id=slip_doc.id if emp_target_id == tech1_id else None,
            status="Paid",
            notes="Monthly salary + Field Sales Provision",
        ))

    db.commit()
    _seed_teams_and_enhanced_tasks(db, owner_emp)
    print("✅ Seeded Brünel ERP demo dataset successfully.")


def _seed_teams_and_enhanced_tasks(db: Session, owner_emp):
    if db.query(models.Team).count() > 0:
        return
    emps = db.query(models.Employee).all()
    if not emps:
        return
    lead = next((e for e in emps if "Lukas" in (e.first_name or "")), emps[0])
    tech1 = next((e for e in emps if "Ali" in (e.first_name or "")), emps[-1])
    tech2 = next((e for e in emps if "Milan" in (e.first_name or "")), emps[-1])
    pm = next((e for e in emps if "Markus" in (e.first_name or "")), emps[0])
    owner_id = owner_emp.id if owner_emp else pm.id

    projs = db.query(models.Project).all()
    regs = db.query(models.Region).all()
    objs = db.query(models.BuildingObject).all()
    if not projs or not regs:
        return

    team_alpha = models.Team(
        id=str(uuid.uuid4()),
        name="Team Alpha — FTTH Splicing",
        leader_id=lead.id,
        member_ids=list(dict.fromkeys([lead.id, tech1.id, owner_id])),
        project_id=projs[0].id,
        notes="Primary NE3/NE4 fiber splicing & OTO installation crew",
    )
    team_beta = models.Team(
        id=str(uuid.uuid4()),
        name="Team Beta — Civil & Riser",
        leader_id=pm.id,
        member_ids=list(dict.fromkeys([pm.id, tech2.id, owner_id])),
        project_id=projs[-1].id,
        notes="Building inspection (Hausbegehung) & microduct deployment",
    )
    db.add_all([team_alpha, team_beta])
    db.flush()

    today = date.today()
    # Update existing assignments to normalized statuses & team links
    existing_tasks = db.query(models.Assignment).all()
    for idx, t in enumerate(existing_tasks):
        t.team_id = team_alpha.id
        t.assigned_employee_ids = list(dict.fromkeys([t.employee_id, lead.id, tech1.id, owner_id]))
        t.task_status = "Remaining" if idx == 0 else ("Planned" if idx == 1 else "Completed")
        if not t.comments:
            t.comments = [
                {
                    "id": str(uuid.uuid4()),
                    "employee_id": lead.id,
                    "author_name": f"{lead.first_name} {lead.last_name}",
                    "text": "Basement distribution box mounted. Floors 1-2 spliced, Floor 3 remaining.",
                    "status_at_comment": t.task_status,
                    "created_at": (datetime.utcnow() - timedelta(hours=3)).isoformat(),
                }
            ]

    # Add past & upcoming tasks across the current week so Week Calendar shows all 4 color statuses
    extra_tasks = [
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=owner_id,
            team_id=team_alpha.id,
            assigned_employee_ids=list(dict.fromkeys([owner_id, lead.id, tech1.id])),
            project_id=projs[0].id,
            region_id=regs[0].id,
            object_id=objs[0].id if objs else None,
            date=today - timedelta(days=2),
            title="HÜP Core Drilling & Duct Seal (18 WE)",
            instructions="Complete core entry sealing and pressure test.",
            priority="Normal",
            task_status="Completed",
            checklist=[{"label": "Core drill sealed", "done": True}],
            comments=[
                {
                    "id": str(uuid.uuid4()),
                    "employee_id": tech1.id,
                    "author_name": f"{tech1.first_name} {tech1.last_name}",
                    "text": "Completed ahead of schedule. Pressure test passed at 10 bar.",
                    "status_at_comment": "Completed",
                    "created_at": (datetime.utcnow() - timedelta(days=2, hours=2)).isoformat(),
                }
            ],
        ),
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=owner_id,
            team_id=team_alpha.id,
            assigned_employee_ids=list(dict.fromkeys([owner_id, lead.id, tech1.id])),
            project_id=projs[0].id,
            region_id=regs[0].id,
            object_id=objs[1].id if len(objs) > 1 else None,
            date=today - timedelta(days=1),
            title="Fire-Stop Collar Installation Fl. 1–4",
            instructions="Install Hilti CFS-C P collars on vertical risers.",
            priority="High",
            task_status="Not Completed",
            checklist=[{"label": "Inspect riser shaft access", "done": True}],
            comments=[
                {
                    "id": str(uuid.uuid4()),
                    "employee_id": lead.id,
                    "author_name": f"{lead.first_name} {lead.last_name}",
                    "text": "Basement key was unavailable from janitor. Needs rescheduling.",
                    "status_at_comment": "Not Completed",
                    "created_at": (datetime.utcnow() - timedelta(days=1, hours=4)).isoformat(),
                }
            ],
        ),
        models.Assignment(
            id=str(uuid.uuid4()),
            employee_id=owner_id,
            team_id=team_alpha.id,
            assigned_employee_ids=list(dict.fromkeys([owner_id, lead.id, tech1.id])),
            project_id=projs[-1].id,
            region_id=regs[-1].id,
            object_id=objs[-1].id if objs else None,
            date=today + timedelta(days=1),
            title="OTDR Bi-Directional Fiber Acceptance Test",
            instructions="Perform 1310nm & 1550nm measurements on all 12 fibers.",
            priority="High",
            task_status="Planned",
            checklist=[{"label": "Calibrate EXFO 730C launch cable", "done": False}],
            comments=[],
        ),
    ]
    db.add_all(extra_tasks)

    # Seed sample TimeLogs in current month if empty
    if db.query(models.TimeLog).count() == 0:
        for offset, hrs, brk, st in [
            (4, 8.5, 30, "Approved"),
            (3, 8.0, 30, "Approved"),
            (2, 9.0, 45, "Approved"),
            (1, 7.5, 30, "Completed"),
        ]:
            d = today - timedelta(days=offset)
            if d.month != today.month:
                d = date(today.year, today.month, max(1, min(offset, 25)))
            cin = datetime(d.year, d.month, d.day, 7, 30, 0)
            cout = cin + timedelta(hours=hrs, minutes=brk)
            db.add(models.TimeLog(
                id=str(uuid.uuid4()),
                employee_id=owner_id,
                project_id=projs[0].id,
                object_id=objs[0].id if objs else None,
                date=d,
                check_in_time=cin,
                check_out_time=cout,
                break_minutes=brk,
                total_hours=hrs,
                status=st,
                approved_by=pm.id if st == "Approved" else None,
                approved_at=datetime.utcnow() if st == "Approved" else None,
                check_in_data={"notes": "Standard field deployment shift", "gps_location": "50.1109° N, 8.6821° E"},
            ))
    db.commit()


def _ensure_german_hr_attributes(db: Session):
    """
    Populate realistic German Arbeitsrecht, tax, social security, emergency contact, and contract attributes
    for all existing employees and ensure sample Freelancer, Subunternehmer, Candidate, and Weekly Overtime exist.
    """
    from sqlalchemy.orm.attributes import flag_modified
    projs = db.query(models.Project).all()
    default_proj = projs[0] if projs else None
    second_proj = projs[1] if len(projs) > 1 else default_proj

    emps = db.query(models.Employee).all()
    for idx, e in enumerate(emps):
        attrs = dict(e.attributes or {})
        is_freelance = e.employment_type in ("Freelancer", "Subunternehmer")
        if not attrs.get("assigned_project_id") and default_proj:
            p_target = second_proj if idx % 2 == 1 and second_proj else default_proj
            attrs["assigned_project_id"] = p_target.id
            attrs["assigned_project_name"] = f"{p_target.code} — {p_target.name}"
        if not attrs.get("steuer_id"):
            attrs.update({
                "birth_date": attrs.get("birth_date") or "1989-04-14",
                "nationality": attrs.get("nationality") or "Deutsch",
                "street": attrs.get("street") or "Ramonville Straße 28",
                "postal_code": attrs.get("postal_code") or "61184",
                "city": attrs.get("city") or "Karben",
                "country": attrs.get("country") or "Deutschland",
                "sos_contact_name": attrs.get("sos_contact_name") or f"Familie {e.last_name}",
                "sos_contact_relation": attrs.get("sos_contact_relation") or "Ehepartner / Familie",
                "sos_contact_phone": attrs.get("sos_contact_phone") or "+49 172 9988776",
                "steuer_id": attrs.get("steuer_id") or "48 921 304 519",
                "steuerklasse": attrs.get("steuerklasse") or ("—" if is_freelance else "I"),
                "kinderfreibetrag": attrs.get("kinderfreibetrag") or "0.0",
                "kirchensteuer": attrs.get("kirchensteuer") or "Nein",
                "sozialversicherungsnummer": attrs.get("sozialversicherungsnummer") or "65 140489 Y 018",
                "krankenversicherung_name": attrs.get("krankenversicherung_name") or ("Debeka Private Krankenversicherung" if is_freelance else "TK — Techniker Krankenkasse"),
                "krankenversicherung_nummer": attrs.get("krankenversicherung_nummer") or "X110492837",
                "krankenversicherung_typ": attrs.get("krankenversicherung_typ") or ("Privat (PKV)" if is_freelance else "Gesetzlich (GKV)"),
                "iban": attrs.get("iban") or "DE89 3704 0044 0532 0130 00",
                "bic": attrs.get("bic") or "COBADEFFXXX",
                "bank_name": attrs.get("bank_name") or "Commerzbank Frankfurt",
                "contract_model": attrs.get("contract_model") or ("Freier Mitarbeitervertrag" if is_freelance else "Unbefristet (Vollzeit)"),
                "contract_signed_date": attrs.get("contract_signed_date") or "2026-01-15",
                "contract_start_date": attrs.get("contract_start_date") or "2026-02-01",
                "probezeit_end_date": attrs.get("probezeit_end_date") or "2026-07-31",
                "monthly_contract_hours": attrs.get("monthly_contract_hours") or (160 if not is_freelance else 140),
                "weekly_hours": attrs.get("weekly_hours") or (40 if not is_freelance else 35),
                "overtime_rate": attrs.get("overtime_rate") or round(float(e.hourly_rate or 25.0) * 1.25, 2),
                "tagessatz": attrs.get("tagessatz") or (640.0 if is_freelance else 0.0),
                "stundensatz": attrs.get("stundensatz") or (80.0 if is_freelance else float(e.hourly_rate or 25.0)),
                "registration_status": attrs.get("registration_status") or "Angemeldet (ELStAM & SV aktiv)",
                "work_permit_status": attrs.get("work_permit_status") or "EU / Unbeschränkt",
                "drivers_license": attrs.get("drivers_license") or "Klasse B, BE",
                "company_name": attrs.get("company_name") or (f"{e.last_name} FiberTech" if is_freelance else ""),
                "ust_id": attrs.get("ust_id") or ("DE319482710" if is_freelance else ""),
                "gewerbeanmeldung": attrs.get("gewerbeanmeldung") or ("Vorhanden (§14 GewO)" if is_freelance else ""),
                "freistellungsbescheinigung_until": attrs.get("freistellungsbescheinigung_until") or ("2026-12-31" if is_freelance else ""),
            })
        if is_freelance and not attrs.get("freelancer_contracts"):
            attrs["tagessatz"] = float(attrs.get("tagessatz") or 640.0)
            attrs["stundensatz"] = float(attrs.get("stundensatz") or float(e.hourly_rate or 80.0))
            attrs["freelancer_contracts"] = [
                {
                    "id": "FC-2026-01",
                    "title": "Rahmenvertrag FTTH Spleiß- & Messtechnik Q1-Q4",
                    "project_name": default_proj.name if default_proj else "FTTH Rollout Frankfurt Nord",
                    "start_date": "2026-01-15",
                    "end_date": "2026-12-31",
                    "tagessatz": attrs["tagessatz"],
                    "stundensatz": attrs["stundensatz"],
                    "status": "Aktiv",
                    "file_url": "/uploads/hr_docs/Sample_Freelancer_Vertrag_2026.pdf",
                }
            ]
        e.attributes = attrs
        flag_modified(e, "attributes")

    # Ensure at least one Subunternehmer record exists
    if not db.query(models.Employee).filter(models.Employee.employment_type == "Subunternehmer").first():
        sub_emp = models.Employee(
            id=str(uuid.uuid4()),
            employee_number="BRN-SUB-01",
            first_name="Dragan",
            last_name="Petrovic",
            email="info@petrovic-tiefbau.de",
            phone="+49 160 8844221",
            department="Tiefbau & Einblastechnik (Sub)",
            employment_type="Subunternehmer",
            role="Subunternehmer (Tiefbau & Glasfaser)",
            role_tier=5,
            base_salary=0.00,
            hourly_rate=55.00,
            annual_leave_days=0,
            attributes={
                "assigned_project_id": default_proj.id if default_proj else "",
                "assigned_project_name": f"{default_proj.code} — {default_proj.name}" if default_proj else "",
                "company_name": "Petrovic Glasfaser & Tiefbau GmbH",
                "ust_id": "DE348192045",
                "steuernummer": "014 241 55812",
                "steuer_id": "52 819 402 118",
                "gewerbeanmeldung": "HRB 118492 Amtsgericht Frankfurt",
                "freistellungsbescheinigung_until": "2027-12-31",
                "bg_bau_unbedenklichkeit": "Gültig bis 31.12.2026",
                "a1_bescheinigung": "Geprüft",
                "street": "Hanauer Landstraße 291",
                "postal_code": "60314",
                "city": "Frankfurt am Main",
                "country": "Deutschland",
                "sos_contact_name": "Nikola Petrovic (Bauleiter)",
                "sos_contact_relation": "Stellvertreter / Notfallkontakt",
                "sos_contact_phone": "+49 160 8844229",
                "contract_model": "Rahmenwerkvertrag (§631 BGB / VOB)",
                "contract_signed_date": "2026-03-01",
                "contract_start_date": "2026-03-01",
                "probezeit_end_date": "—",
                "monthly_contract_hours": 160,
                "weekly_hours": 40,
                "tagessatz": 440.00,
                "stundensatz": 55.00,
                "overtime_rate": 65.00,
                "registration_status": "Geprüft & Freigegeben (§48b EStG)",
                "iban": "DE44 5001 0517 5407 3249 31",
                "bic": "INGDDEFFXXX",
                "bank_name": "ING-DiBa Frankfurt",
            },
        )
        db.add(sub_emp)

    # Ensure at least one Candidate (Bewerber / IT Projects) exists
    if not db.query(models.Employee).filter(models.Employee.employment_type == "Candidate").first():
        cand_emp = models.Employee(
            id=str(uuid.uuid4()),
            employee_number="BRN-CAND-01",
            first_name="Jonas",
            last_name="Bergmann",
            email="jonas.bergmann@it-consulting.de",
            phone="+49 151 4492810",
            department="IT & Cloud Infrastructure",
            employment_type="Candidate",
            role="Senior Cloud & FTTH Network Architect",
            role_tier=5,
            base_salary=0.00,
            hourly_rate=92.00,
            annual_leave_days=0,
            attributes={
                "is_candidate": True,
                "candidate_stage": "Neu eingegangen (Website IT-Portal)",
                "assigned_project_id": second_proj.id if second_proj else "",
                "assigned_project_name": f"{second_proj.code} — {second_proj.name}" if second_proj else "",
                "birth_date": "1991-08-22",
                "nationality": "Deutsch",
                "city": "Frankfurt am Main",
                "postal_code": "60329",
                "country": "Deutschland",
                "experience_years": "8+ Jahre",
                "work_history_summary": "Lead Network & Cloud Engineer bei Carrier-Projekten (FTTH Backbone, MPLS, Kubernetes, Cisco/Nokia). Erfahrung in Projektleitung und Netzplanung.",
                "skills": "FTTH Netzplanung, Cloud DevOps, Cisco IOS-XR, Python Automation, GIS Dokumentation",
                "interested_projects": ["FTTH & Glasfaser Engineering", "Enterprise Cloud & IT Infrastructure"],
                "preferred_contract_model": "Freelancer",
                "availability_date": "Sofort / nach Vereinbarung",
                "remote_preference": "Hybrid (Rhein-Main / Remote)",
                "tagessatz": 740.00,
                "stundensatz": 92.00,
                "weekly_hours": 40,
                "monthly_contract_hours": 160,
                "registration_status": "Bewerber (DSGVO akzeptiert)",
                "dsgvo_accepted": True,
                "dsgvo_accepted_at": datetime.utcnow().isoformat(),
                "datenschutz_accepted": True,
                "documents": [
                    {
                        "id": str(uuid.uuid4()),
                        "title": "Lebenslauf / CV — Jonas Bergmann",
                        "category": "Lebenslauf / CV",
                        "file_url": "/uploads/hr_docs/CV_Jonas_Bergmann_IT_Architect.pdf",
                        "uploaded_at": datetime.utcnow().isoformat(),
                    }
                ],
            },
        )
        db.add(cand_emp)

    # Ensure sample weekly overtime logs exist in the current month for Lukas Schmidt (BRN-1004) so Weekly Alert & Überstunden are visible
    today = date.today()
    tech_emp = db.query(models.Employee).filter(models.Employee.employee_number == "BRN-1004").first()
    if tech_emp and default_proj:
        existing_tech_logs = db.query(models.TimeLog).filter(
            models.TimeLog.employee_id == tech_emp.id
        ).count()
        if existing_tech_logs == 0:
            # Find a Monday in the current month
            monday_d = date(today.year, today.month, 5)
            while monday_d.weekday() != 0:
                monday_d += timedelta(days=1)
            # 5 days x 9.5 hours = 47.5 hours in a single calendar week (> 40h limit -> +7.5h Überstunden & Weekly Exceeded Alert!)
            for day_idx in range(5):
                work_d = monday_d + timedelta(days=day_idx)
                cin = datetime(work_d.year, work_d.month, work_d.day, 7, 0, 0)
                cout = datetime(work_d.year, work_d.month, work_d.day, 17, 15, 0)  # 10h15m - 45m break = 9.5h
                db.add(models.TimeLog(
                    id=str(uuid.uuid4()),
                    employee_id=tech_emp.id,
                    project_id=default_proj.id,
                    date=work_d,
                    check_in_time=cin,
                    check_out_time=cout,
                    break_minutes=45,
                    total_hours=9.5,
                    status="Approved",
                    check_in_data={"notes": "Sonderschicht Trassenbau & Muffenspleißung (Überstunden genehmigt)"},
                ))

    # Ensure 09/2026 payslips have an uploaded document_id while 10/2026 has no document_id yet (to demonstrate both active & greyed-out states)
    existing_doc = db.query(models.DocumentRecord).filter(models.DocumentRecord.reference_type == "Lohnabrechnung").first()
    if existing_doc:
        for slip in db.query(models.Payslip).filter(models.Payslip.period_month == 9, models.Payslip.period_year == 2026).all():
            if not slip.document_id:
                slip.document_id = existing_doc.id

    db.commit()
