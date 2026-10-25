from fastapi import APIRouter, Depends, HTTPException, Header, Response, Cookie, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from typing import List, Optional
from jose import jwt, JWTError
import os

import models
import schemas
import database
from core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_effective_tier,
    get_effective_modules,
    can_user_access_app_portal,
    ensure_employee_linked,
    SECRET_KEY,
    ALGORITHM,
    ROLE_TO_TIER,
)
from core.audit import log_audit

router = APIRouter()
ADMIN_REGISTRATION_TOKEN = os.environ.get("ADMIN_REGISTRATION_TOKEN", "")


def serialize_user(user: models.User) -> dict:
    tier = get_effective_tier(user)
    eff_modules = get_effective_modules(user)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "role_tier": tier,
        "employee_id": user.employee_id,
        "allowed_kst": user.allowed_kst,
        "allowed_modules": user.allowed_modules,
        "effective_modules": eff_modules,
        "can_access_app": can_user_access_app_portal(user),
        "can_access_portal": True if user.can_access_portal is None else user.can_access_app or user.can_access_portal,
        "preferred_language": getattr(user, "preferred_language", None) or "de",
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "signature_html": user.signature_html,
        "imap_host": user.imap_host,
        "imap_port": user.imap_port,
        "smtp_host": user.smtp_host,
        "smtp_port": user.smtp_port,
    }


@router.post("/register", response_model=schemas.UserOut)
def register_user(
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    x_admin_token: Optional[str] = Header(default=None),
):
    if ADMIN_REGISTRATION_TOKEN and x_admin_token != ADMIN_REGISTRATION_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin registration token required.",
        )
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    tier = user.role_tier or ROLE_TO_TIER.get(user.role, 5)
    can_app = user.can_access_app if user.can_access_app is not None else (tier <= 4)

    new_user = models.User(
        email=user.email,
        hashed_password=get_password_hash(user.password),
        role=user.role,
        role_tier=tier,
        allowed_kst=user.allowed_kst,
        allowed_modules=user.allowed_modules,
        can_access_app=can_app,
        can_access_portal=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    ensure_employee_linked(db, new_user)
    return serialize_user(new_user)


@router.post("/login", response_model=schemas.Token)
def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db),
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    ensure_employee_linked(db, user)
    tier = get_effective_tier(user)
    token_payload = {
        "sub": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "role_tier": tier,
        "employee_id": user.employee_id,
    }
    access_token = create_access_token(data=token_payload)
    refresh_token = create_refresh_token(data={"sub": user.email})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=schemas.Token)
def refresh_access_token(
    refresh_token: Optional[str] = Cookie(default=None),
    token_body: Optional[dict] = None,
    db: Session = Depends(database.get_db),
):
    raw_token = refresh_token or (token_body or {}).get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    ensure_employee_linked(db, user)
    tier = get_effective_tier(user)
    new_access = create_access_token(
        data={
            "sub": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "role_tier": tier,
            "employee_id": user.employee_id,
        }
    )
    return {"access_token": new_access, "refresh_token": raw_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return serialize_user(current_user)


@router.put("/me/language")
@router.patch("/me/language")
def update_preferred_language(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    lang = str(payload.get("preferred_language") or payload.get("language") or "de").lower()
    if lang not in ("de", "en"):
        lang = "de"
    current_user.preferred_language = lang
    if current_user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == current_user.employee_id).first()
        if emp:
            attrs = dict(emp.attributes or {})
            attrs["preferred_language"] = lang
            emp.attributes = attrs
    db.commit()
    return {"status": "updated", "preferred_language": lang}


@router.put("/me/password")
def change_own_password(
    data: schemas.PasswordChange,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not getattr(current_user, "must_change_password", False):
        if not verify_password(data.old_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect old password")
    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.must_change_password = False
    if current_user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == current_user.employee_id).first()
        if emp:
            attrs = dict(emp.attributes or {})
            attrs["must_change_password"] = False
            attrs.pop("last_generated_otp", None)
            emp.attributes = attrs
    db.commit()
    return {"status": "success", "message": "Password updated successfully", "must_change_password": False}


@router.post("/me/first-login-password")
def complete_first_login_password(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    new_pw = str(payload.get("new_password") or "").strip()
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    current_user.hashed_password = get_password_hash(new_pw)
    current_user.must_change_password = False
    if current_user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == current_user.employee_id).first()
        if emp:
            attrs = dict(emp.attributes or {})
            attrs["must_change_password"] = False
            attrs.pop("last_generated_otp", None)
            emp.attributes = attrs
    db.commit()
    log_audit(db, "users", "FIRST_LOGIN_PASSWORD_SET", str(current_user.id), current_user.email)
    return {"status": "success", "must_change_password": False}


@router.get("/users", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 1 and current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    users = db.query(models.User).order_by(models.User.id.asc()).all()
    for u in users:
        ensure_employee_linked(db, u)
    return [serialize_user(u) for u in users]


@router.post("/users", response_model=schemas.UserOut)
def admin_create_user(
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 1 and current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    tier = user.role_tier or ROLE_TO_TIER.get(user.role, 5)
    can_app = user.can_access_app if user.can_access_app is not None else (tier <= 4 or bool(user.allowed_modules))

    new_user = models.User(
        email=user.email,
        hashed_password=get_password_hash(user.password),
        role=user.role,
        role_tier=tier,
        allowed_kst=user.allowed_kst,
        allowed_modules=user.allowed_modules,
        can_access_app=can_app,
        can_access_portal=True if user.can_access_portal is None else user.can_access_portal,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    emp = ensure_employee_linked(db, new_user)
    if emp:
        if user.first_name:
            emp.first_name = user.first_name
        if user.last_name:
            emp.last_name = user.last_name
        if user.employment_type:
            emp.employment_type = user.employment_type
        if user.department:
            emp.department = user.department
        emp.role_tier = tier
        emp.role = user.role.value if hasattr(user.role, "value") else str(user.role)
        db.commit()

    log_audit(db, "users", "INSERT", str(new_user.id), current_user.email, None, {"email": new_user.email, "role": str(new_user.role)})
    return serialize_user(new_user)


@router.put("/users/{user_id}/password")
def admin_reset_password(
    user_id: int,
    data: schemas.AdminPasswordReset,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 1 and current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    log_audit(db, "users", "UPDATE_PASSWORD", str(user.id), current_user.email)
    return {"status": "success", "message": "User password reset successfully"}


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def admin_update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 1 and current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_vals = {"role": str(user.role), "role_tier": user.role_tier, "allowed_modules": user.allowed_modules}

    if user_update.email:
        user.email = user_update.email
    if user_update.role:
        user.role = user_update.role
        if user_update.role_tier is None:
            user.role_tier = ROLE_TO_TIER.get(user_update.role, user.role_tier or 5)
    if user_update.role_tier is not None:
        user.role_tier = user_update.role_tier
    if user_update.allowed_kst is not None:
        user.allowed_kst = user_update.allowed_kst
    if user_update.allowed_modules is not None:
        user.allowed_modules = user_update.allowed_modules
    if user_update.can_access_app is not None:
        user.can_access_app = user_update.can_access_app
    if user_update.can_access_portal is not None:
        user.can_access_portal = user_update.can_access_portal

    # Sync employee tier/role
    if user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == user.employee_id).first()
        if emp:
            emp.role_tier = user.role_tier or 5
            emp.role = user.role.value if hasattr(user.role, "value") else str(user.role)

    db.commit()
    db.refresh(user)
    log_audit(db, "users", "UPDATE", str(user.id), current_user.email, old_vals, {"role": str(user.role), "role_tier": user.role_tier, "allowed_modules": user.allowed_modules})
    return serialize_user(user)


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if get_effective_tier(current_user) > 1 and current_user.role != models.RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    log_audit(db, "users", "DELETE", str(user.id), current_user.email, {"email": user.email}, None)
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "User deleted"}
