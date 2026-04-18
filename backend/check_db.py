from database import SessionLocal
import models

db = SessionLocal()
users = db.query(models.User).all()
for u in users:
    print(f"User: {u.email}, imap_host: {u.imap_host}, role: {u.role}")
db.close()
