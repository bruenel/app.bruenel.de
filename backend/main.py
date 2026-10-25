from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
import models
import database
from database import engine, SessionLocal
from routers import (
    auth,
    supplier,
    bi,
    mail,
    vault,
    media,
    hr,
    projects,
    inventory,
    fleet,
    calendar_mod,
    accounting,
    sales,
)
from core.seed import seed_initial_erp_data

# Create models & run lightweight migrations for new columns
try:
    models.Base.metadata.create_all(bind=engine)

    insp = inspect(engine)
    for table_name, table_obj in models.Base.metadata.tables.items():
        if insp.has_table(table_name):
            existing_cols = {c["name"] for c in insp.get_columns(table_name)}
            for col in table_obj.columns:
                if col.name not in existing_cols:
                    col_type = col.type.compile(engine.dialect)
                    with engine.begin() as conn:
                        conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {col_type}'))
                    print(f"Migration: added column {col.name} to {table_name}")

    # Seed initial owner and ERP demo data
    if SessionLocal is not None:
        db_init = SessionLocal()
        try:
            seed_initial_erp_data(db_init)
        finally:
            db_init.close()

    print("Database schema initialized successfully.")
except Exception as e:
    print(f"Safe Boot Note: Database schema could not be initialized automatically: {e}")


app = FastAPI(
    title="Brünel ERP & Field Operations Platform API",
    version="2.0.0",
    description="Unified REST API for app.bruenel.de (Management Portal) and portal.bruenel.de (Employee Field PWA)",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.bruenel.de",
        "https://portal.bruenel.de",
        "https://www.bruenel.de",
        "https://bruenel.de",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {}


# Legacy & Shared Routes (/api/*)
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(supplier.router, prefix="/api/supplier", tags=["Supplier Matrix"])
app.include_router(bi.router, prefix="/api/bi", tags=["BI Telemetry"])
app.include_router(mail.router, prefix="/api/mail", tags=["Internal Mail"])
app.include_router(vault.router, prefix="/api/vault", tags=["Legal Vault"])

# Chapter 6 Blueprint REST API v1 Routes (/api/v1/*)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["v1 Auth & RBAC"])
app.include_router(media.router, prefix="/api/v1/media", tags=["v1 S3 & Video Media Storage"])
app.include_router(hr.router, prefix="/api/v1/hr", tags=["v1 Module 1: HR, Time, Leave, Sickness & Payslips"])
app.include_router(projects.router, prefix="/api/v1", tags=["v1 Module 2: Projects, Regions, Objects & Tasks"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["v1 Module 3: Inventory & Material Ledger"])
app.include_router(fleet.router, prefix="/api/v1/fleet", tags=["v1 Module 4: Vehicles & Equipment Fleet"])
app.include_router(calendar_mod.router, prefix="/api/v1/calendar", tags=["v1 Module 5: Master Interactive Calendar"])
app.include_router(accounting.router, prefix="/api/v1/accounting", tags=["v1 Module 6: Accounting & Expenses"])
app.include_router(sales.router, prefix="/api/v1/sales", tags=["v1 Module 7: Field Sales & Upselling"])


@app.get("/api/health")
@app.get("/api/v1/health")
def health_check(db: Session = Depends(database.get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "engine": "postgresql" if database.is_postgres() else "sqlite_local",
            "version": "2.0.0",
        }
    except Exception as e:
        return {"status": "error", "database": str(e)}
