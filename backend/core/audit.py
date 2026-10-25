from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
import models

def log_audit(
    db: Session,
    table_name: str,
    operation: str,
    record_id: str,
    changed_by: Optional[str] = None,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
):
    """Write an immutable entry to audit_logs (Chapter 3.3)."""
    try:
        entry = models.AuditLog(
            table_name=table_name,
            operation=operation.upper(),
            record_id=str(record_id),
            changed_by=str(changed_by) if changed_by else "system",
            old_values=old_values,
            new_values=new_values,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"Audit log warning: {e}")
        db.rollback()
