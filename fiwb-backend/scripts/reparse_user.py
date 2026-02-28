import sys
import os
import asyncio
import json

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal
from app.models import User
from app.lms.drive_service import DriveSyncService
from app.utils.locks import GLOBAL_API_LOCK

async def reparse(email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User {email} not found.")
            return

        print(f"Found user: {user.email}")
        
        try:
            folder_ids = json.loads(user.watched_drive_folders) if user.watched_drive_folders else []
        except:
            folder_ids = []

        if not folder_ids:
            print(f"No watched folders/files found for {email}.")
            return

        print(f"Attempting to re-sync {len(folder_ids)} target items...")
        
        access_token = user.access_token
        refresh_token = user.refresh_token

        svc = DriveSyncService(access_token, email, refresh_token)
        await svc.sync_items(folder_ids)

        print("Sync complete.")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/reparse_user.py <user_email>")
        sys.exit(1)
    asyncio.run(reparse(sys.argv[1]))
