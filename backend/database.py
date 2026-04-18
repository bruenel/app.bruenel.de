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

# Fix for Neon/PostgreSQL: SQLAlchemy requires 'postgresql+psycopg2://' for the sync driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# SQLite needs check_same_thread=False; PostgreSQL ignores this
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL.lower() else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
