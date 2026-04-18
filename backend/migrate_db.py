import os
from sqlalchemy import create_engine, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)

columns = [
    ("imap_host", "VARCHAR"),
    ("imap_port", "INTEGER"),
    ("smtp_host", "VARCHAR"),
    ("smtp_port", "INTEGER"),
    ("email_password", "VARCHAR"),
    ("signature_html", "TEXT")
]

with engine.connect() as conn:
    for col_name, col_type in columns:
        try:
            print(f"Checking column {col_name}...")
            # PostgreSQL syntax to check if column exists
            query = text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            conn.execute(query)
            conn.commit()
            print(f"Column {col_name} added.")
        except Exception as e:
            print(f"Column {col_name} probably already exists or error: {e}")

print("Migration check complete.")
