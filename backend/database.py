from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings
import os
import re

class Settings(BaseSettings):
    # Default to local SQLite if .env is missing or USE_LOCAL_DB=1
    DATABASE_URL: str = "sqlite:///./bruenel_os.db"
    USE_LOCAL_DB: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

try:
    settings = Settings()
    # Allow explicit override via environment variable
    env_use_local = os.getenv("USE_LOCAL_DB")
    if env_use_local is not None:
        use_local = env_use_local.lower() in ("1", "true", "yes")
    else:
        # When running on Vercel or when USE_LOCAL_DB=false, use cloud DATABASE_URL
        use_local = False if os.getenv("VERCEL") else settings.USE_LOCAL_DB

    if use_local:
        DATABASE_URL = os.getenv("LOCAL_DATABASE_URL", "sqlite:///./bruenel_os.db")
    else:
        DATABASE_URL = settings.DATABASE_URL
except Exception:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bruenel_os.db")

# Database URL Sanitization for SQLAlchemy 2.0 + pg8000
if DATABASE_URL.startswith("postgres"):
    DATABASE_URL = re.sub(r'^postgres(ql)?(\+[^:]+)?://', 'postgresql+pg8000://', DATABASE_URL)

# pg8000 does not support 'sslmode' or 'channel_binding' in the URL string
if "?" in DATABASE_URL and "pg8000" in DATABASE_URL:
    base_url, query_str = DATABASE_URL.split("?", 1)
    params = [
        p for p in query_str.split("&")
        if not p.startswith("sslmode=") and not p.startswith("channel_binding=")
    ]
    DATABASE_URL = f"{base_url}?{'&'.join(params)}" if params else base_url

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

try:
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=3600
    )
    if DATABASE_URL.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"Engine creation failed: {e}")
    engine = None
    SessionLocal = None

Base = declarative_base()

def is_postgres() -> bool:
    return DATABASE_URL.startswith("postgres")

def get_db():
    if SessionLocal is None:
        raise Exception("Database configuration is invalid or missing.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
