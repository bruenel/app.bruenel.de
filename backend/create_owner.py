import os
import sys

# Ensure the backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_initial_owner():
    models.Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    
    email = "sam.rastegar@bruenel.de"
    password = "Lattel-Macchiato!986"
    
    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        print(f"✅ User {email} already exists. No action needed.")
        db.close()
        return

    hashed_password = pwd_context.hash(password)
    new_user = models.User(
        email=email,
        hashed_password=hashed_password,
        role=models.RoleEnum.OWNER,
        allowed_kst=[0, 1000, 2000, 3000, 4000]
    )
    
    try:
        db.add(new_user)
        db.commit()
        print(f"✅ Successfully created Owner account: {email}")
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_initial_owner()
