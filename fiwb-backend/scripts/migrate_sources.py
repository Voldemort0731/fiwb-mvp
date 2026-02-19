import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import engine
from sqlalchemy import text

def migrate():
    print("Starting migration: Adding 'sources' column to 'chat_messages' table...")
    try:
        with engine.connect() as conn:
            # Check if column exists (Postgres)
            check_sql = text("SELECT column_name FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='sources'")
            result = conn.execute(check_sql).fetchone()
            
            if not result:
                print("Column 'sources' not found. Adding it...")
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN sources TEXT"))
                conn.commit()
                print("Successfully added 'sources' column.")
            else:
                print("Column 'sources' already exists. Skipping.")
    except Exception as e:
        print(f"Migration failed: {e}")
        # Try sqlite fallback if postgres info_schema fails
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN sources TEXT"))
                conn.commit()
                print("Successfully added 'sources' column (Fallback/SQLite).")
        except Exception as e2:
            print(f"Fallback migration also failed: {e2}")

if __name__ == "__main__":
    migrate()
