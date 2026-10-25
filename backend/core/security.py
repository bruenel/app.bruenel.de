import os
from datetime import datetime, timedelta, date
from typing import Optional, List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import text
from jose import jwt, JWTError
from passlib.context import CryptContext

import models
import database

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "super_secret_bruenel_os_key_change_me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h for smooth local + PWA sessions
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Role to Tier mapping (Chapter 3.4 RBAC Matrix)
ROLE_TO_TIER = {
    models.RoleEnum.OWNER: 1,
    models.RoleEnum.SUPER_ADMIN: 1,
    models.RoleEnum.PROJECT_MANAGER: 2,
    models.RoleEnum.PARTNER: 2,
    models.RoleEnum.HR_FINANCE: 3,
    models.RoleEnum.TEAM_LEAD: 4,
    models.RoleEnum.FIELD_EMPLOYEE: 5,
    models.RoleEnum.MITARBEITER: 5,
    models.RoleEnum.SYSTEM_BOT: 3,
}

# Default modules granted by tier if user.allowed_modules is not explicitly set
DEFAULT_TIER_MODULES = {
    1: models.ALL_MODULE_KEYS,  # Super Admin / Owner gets all modules
    2: [
        "mod_dashboard", "mod_projects", "mod_inventory", "mod_fleet",
        "mod_calendar", "mod_hr", "mod_sales", "mod_suppliers", "mod_mail"
    ],
    3: [
        "mod_dashboard", "mod_hr", "mod_accounting", "mod_calendar",
        "mod_sales", "mod_vault", "mod_mail"
    ],
    4: [
        "mod_dashboard", "mod_projects", "mod_inventory", "mod_fleet",
        "mod_calendar", "mod_sales"
    ],
    5: [],  # Tier 5 Field Employees use portal.bruenel.de unless explicitly granted modules on app.bruenel.de
}


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_effective_tier(user: models.User) -> int:
    if user.role_tier and 1 <= user.role_tier <= 5:
        return user.role_tier
    return ROLE_TO_TIER.get(user.role, 5)


def get_effective_modules(user: models.User) -> List[str]:
    tier = get_effective_tier(user)
    if tier == 1 or user.role in (models.RoleEnum.OWNER, models.RoleEnum.SUPER_ADMIN):
        return list(models.ALL_MODULE_KEYS)
    if user.allowed_modules is not None and isinstance(user.allowed_modules, list):
        return user.allowed_modules
    return DEFAULT_TIER_MODULES.get(tier, [])


def can_user_access_app_portal(user: models.User) -> bool:
    tier = get_effective_tier(user)
    if tier <= 4:
        return True
    if user.can_access_app:
        return True
    if user.allowed_modules and len(user.allowed_modules) > 0:
        return True
    return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def apply_rls_context(db: Session, user: models.User):
    """Set PostgreSQL session variables for Row-Level Security if running on Postgres."""
    if database.is_postgres():
        try:
            emp_id = user.employee_id or ""
            tier = get_effective_tier(user)
            db.execute(text("SELECT set_config('app.current_employee_id', :emp_id, true)"), {"emp_id": str(emp_id)})
            db.execute(text("SELECT set_config('app.current_role_tier', :tier, true)"), {"tier": str(tier)})
        except Exception:
            pass


def ensure_employee_linked(db: Session, user: models.User) -> Optional[models.Employee]:
    """Ensure every User has a corresponding Employee profile linked for RLS and portal operations."""
    if user.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == user.employee_id).first()
        if emp:
            return emp

    # Check if an employee with this email already exists
    emp = db.query(models.Employee).filter(models.Employee.email == user.email).first()
    if emp:
        user.employee_id = emp.id
        db.commit()
        return emp

    # For Owner / Super Admin: do not auto-inject an employee row on login,
    # so that the employee directory can start completely clean/empty from scratch.
    if user.role == models.RoleEnum.OWNER or getattr(user, "role_tier", 1) == 1:
        return None

    name_part = user.email.split("@")[0]
    parts = name_part.replace(".", " ").replace("_", " ").split()
    first_name = parts[0].capitalize() if parts else "Brünel"
    last_name = " ".join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else "User"
    tier = get_effective_tier(user)
    emp_num = f"BRN-{1000 + (user.id or 1)}"
    # Avoid duplicate employee_number
    existing_num = db.query(models.Employee).filter(models.Employee.employee_number == emp_num).first()
    if existing_num:
        emp_num = f"BRN-{1000 + (user.id or 1)}-{int(datetime.utcnow().timestamp()) % 1000}"

    emp = models.Employee(
        employee_number=emp_num,
        first_name=first_name,
        last_name=last_name,
        email=user.email,
        employment_type="Full-time",
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        role_tier=tier,
        attributes={"auto_created": True}
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    user.employee_id = emp.id
    user.role_tier = get_effective_tier(user)
    if user.role_tier <= 3 and not user.can_access_app:
        user.can_access_app = True
    elif user.role_tier > 3:
        user.can_access_app = False
    db.commit()
    db.refresh(user)
    return emp


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)) -> models.User:
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

    ensure_employee_linked(db, user)
    apply_rls_context(db, user)
    return user


def get_delegated_manager_ids(db: Session, employee_id: Optional[str]) -> List[str]:
    """Return list of manager employee_ids including active Vertretung delegations."""
    if not employee_id:
        return []
    ids = [employee_id]
    today = date.today()
    delegations = db.query(models.Delegation).filter(
        models.Delegation.delegatee_id == employee_id,
        models.Delegation.is_active == True,
        models.Delegation.start_date <= today,
        models.Delegation.end_date >= today
    ).all()
    for d in delegations:
        if d.delegator_id not in ids:
            ids.append(d.delegator_id)
    return ids


def require_module_access(module_key: str):
    """Dependency generator to enforce per-account module access on app.bruenel.de."""
    def _guard(current_user: models.User = Depends(get_current_user)):
        tier = get_effective_tier(current_user)
        if tier == 1:
            return current_user
        mods = get_effective_modules(current_user)
        if module_key not in mods:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Account is not authorized for module '{module_key}'."
            )
        return current_user
    return _guard


def require_min_tier(max_tier_number: int):
    """Require user to have role_tier <= max_tier_number (e.g. 1=SuperAdmin, 2=PM, 3=HR, 4=TeamLead)."""
    def _guard(current_user: models.User = Depends(get_current_user)):
        tier = get_effective_tier(current_user)
        if tier > max_tier_number:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient authority tier (Required Tier <= {max_tier_number}, Your Tier = {tier})."
            )
        return current_user
    return _guard
