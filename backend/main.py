from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from routers import auth, supplier, bi, mail, vault
from sqlalchemy import text, inspect

# Create models & run lightweight migrations for new columns
try:
    models.Base.metadata.create_all(bind=engine)
    
    # Generic migration: check for missing columns using inspector (works on PostgreSQL and SQLite)
    print("Database schema initialized successfully.")
except Exception as e:
    print(f"Safe Boot Note: Database schema could not be initialized automatically: {e}")


app = FastAPI(title="Brünel OS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.bruenel.de",
        "https://www.bruenel.de",
        "https://bruenel.de",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {}

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(supplier.router, prefix="/api/supplier", tags=["supplier"])
app.include_router(bi.router, prefix="/api/bi", tags=["bi"])
app.include_router(mail.router, prefix="/api/mail", tags=["mail"])
app.include_router(vault.router, prefix="/api/vault", tags=["vault"])

@app.get("/api/health")
def health_check(db: Session = Depends(database.get_db)):
    try:
        # Test DB connection
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
