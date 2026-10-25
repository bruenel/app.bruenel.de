from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from sqlalchemy.exc import IntegrityError
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

ALLOWED_CORS_ORIGINS = [
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
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


def _cors_headers_for(request: Request) -> dict:
    req_origin = request.headers.get("origin") or ""
    cors_origin = req_origin if req_origin in ALLOWED_CORS_ORIGINS else "*"
    return {
        "Access-Control-Allow-Origin": cors_origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    headers = _cors_headers_for(request)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    headers = _cors_headers_for(request)
    err_str = str(exc.orig if hasattr(exc, "orig") else exc)
    if "unique constraint" in err_str.lower() or "duplicate key" in err_str.lower():
        msg = "Ein Datensatz mit dieser E-Mail-Adresse oder Mitarbeiternummer existiert bereits."
    else:
        msg = "Datenbankintegritätsfehler bei der Verarbeitung der Anfrage."
    return JSONResponse(
        status_code=400,
        content={"detail": msg},
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    headers = _cors_headers_for(request)
    err_str = str(exc)
    if "unique constraint" in err_str.lower() or "duplicate key" in err_str.lower():
        return JSONResponse(
            status_code=400,
            content={"detail": "Ein Datensatz mit dieser E-Mail-Adresse oder Mitarbeiternummer existiert bereits."},
            headers=headers,
        )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Interner Serverfehler: {err_str}"},
        headers=headers,
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
