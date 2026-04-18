from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    # Default to local SQLite if .env is missing or DATABASE_URL not set
    DATABASE_URL: str = "sqlite:///./bruenel_os.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

try:
    settings = Settings()
    DATABASE_URL = settings.DATABASE_URL
except Exception as e:
    # Fallback if pydantic-settings fails or .env is malformed
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bruenel_os.db")

# Database URL Sanitization for SQLAlchemy 2.0 + pg8000
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+pg8000://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)

# Neon works automatically with pg8000 via the URL parameters
connect_args = {}

try:
    engine = create_engine(
        DATABASE_URL, 
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=3600
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"Engine creation failed: {e}")
    # Fallback to a dummy object so the app doesn't crash on import
    SessionLocal = None

Base = declarative_base()

def get_db():
    if SessionLocal is None:
        raise Exception("Database configuration is invalid or missing.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
