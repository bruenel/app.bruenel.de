import sys
import os
from sqlalchemy import text, inspect

# Add the current directory to sys.path to ensure we can import local modules
sys.path.append(os.getcwd())

try:
    from database import engine, DATABASE_URL, Base
    import models
except ImportError as e:
    print(f"\n[ERROR] Could not import database or models: {e}")
    print("Ensure you are running this script from the 'backend' directory.")
    sys.exit(1)

def initialize_neon():
    print("=" * 60)
    print("BRÜNEL OS: NEON POSTGRESQL INITIALIZATION")
    print("=" * 60)
    
    # Log the target (masking credentials for safety)
    safe_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "Local SQLite"
    print(f"\n[1/3] Target Database: {safe_url}")
    
    if "sqlite" in DATABASE_URL.lower():
        print("\n[WARNING] You are currently pointed to SQLITE.")
        print("To use Neon, ensure your '.env' file contains the DATABASE_URL.")
    
    try:
        print("\n[2/3] Connecting to Neon...")
        with engine.connect() as conn:
            # Test basic connectivity
            result = conn.execute(text("SELECT version();")).fetchone()
            print(f"      SUCCESS: Connected to {result[0]}")
            
            # Initialize tables
            print("\n[3/3] Initializing Schema...")
            Base.metadata.create_all(bind=engine)
            
            # Verify tables
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            
            if tables:
                print(f"      SUCCESS: Tables created: {', '.join(tables)}")
            else:
                print("      WARNING: No tables found after creation.")
                
        print("\n" + "=" * 60)
        print("STATUS: NEON DATABASE READY")
        print("=" * 60)
        print("\nNext Step: Run 'python3 create_owner.py' to initialize your admin account.")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[FATAL ERROR] Connection failed: {e}")
        print("\nPossible causes:")
        print("1. IP Whitelisting: Ensure your current IP is allowed in the Neon Console.")
        print("2. Connection String: Double-check the URL in your '.env' file.")
        print("3. Driver: Ensure 'psycopg2-binary' is installed in your venv.")
        sys.exit(1)

if __name__ == "__main__":
    initialize_neon()
