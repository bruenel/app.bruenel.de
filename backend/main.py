from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from routers import auth, supplier, bi, mail, vault
from sqlalchemy import text, inspect

# Create models & run lightweight migrations for new columns
try:
    models.Base.metadata.create_all(bind=engine)
    
    # Generic migration: check for missing columns using inspector (works on PostgreSQL and SQLite)
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('bi_tracking')]
    
    with engine.connect() as conn:
        for col, typedef in [("country", "VARCHAR"), ("city", "VARCHAR"), ("ip_address", "VARCHAR")]:
            if col not in columns:
                conn.execute(text(f"ALTER TABLE bi_tracking ADD COLUMN {col} {typedef}"))
                conn.commit()
except Exception as e:
    print(f"Schema initialization note: {e}")


app = FastAPI(title="Brünel OS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://app.bruenel.de",
        "https://bruenel.de",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(supplier.router, prefix="/api/supplier", tags=["supplier"])
app.include_router(bi.router, prefix="/api/bi", tags=["bi"])
app.include_router(mail.router, prefix="/api/mail", tags=["mail"])
app.include_router(vault.router, prefix="/api/vault", tags=["vault"])

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
