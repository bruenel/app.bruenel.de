from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import List, Optional
from datetime import timedelta, datetime
from jose import jwt, JWTError
from passlib.context import CryptContext

import os
import models, schemas, database

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "super_secret_bruenel_os_key_change_me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day
ADMIN_REGISTRATION_TOKEN = os.environ.get("ADMIN_REGISTRATION_TOKEN", "")

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

@router.post("/register", response_model=schemas.UserOut)
def register_user(
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    x_admin_token: Optional[str] = Header(default=None),
):
    # Require a server-side ADMIN_REGISTRATION_TOKEN to prevent public self-registration.
    # Set ADMIN_REGISTRATION_TOKEN in Vercel environment variables.
    if ADMIN_REGISTRATION_TOKEN and x_admin_token != ADMIN_REGISTRATION_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin registration token required.",
        )
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        hashed_password=hashed_pwd,
        role=user.role,
        allowed_kst=user.allowed_kst
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.put("/me/password")
def change_own_password(data: schemas.PasswordChange, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"status": "success", "message": "Password updated successfully"}

@router.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(models.User).all()

@router.post("/users", response_model=schemas.UserOut)
def admin_create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        email=user.email,
        hashed_password=get_password_hash(user.password),
        role=user.role,
        allowed_kst=user.allowed_kst
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/users/{user_id}/password")
def admin_reset_password(user_id: int, data: schemas.AdminPasswordReset, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"status": "success", "message": "User password reset successfully"}

@router.put("/users/{user_id}", response_model=schemas.UserOut)
def admin_update_user(user_id: int, user_update: schemas.UserUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_update.email:
        user.email = user_update.email
    if user_update.role:
        user.role = user_update.role
    if user_update.allowed_kst is not None:
        user.allowed_kst = user_update.allowed_kst
        
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}")
def admin_delete_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "User deleted"}
