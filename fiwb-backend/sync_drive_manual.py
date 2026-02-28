"""
Script to manually trigger a Google Drive sync for all files in a folder.
This will sync ALL supported file types from the specified folder.
"""
import asyncio
import sys
from app.lms.drive_service import DriveSyncService
from app.database import SessionLocal

async def sync_drive_folder(folder_id: str, user_email: str):
    """Sync a Google Drive folder for a user"""
    db = SessionLocal()
    try:
        service = DriveSyncService(user_email, db)
        print(f"🔄 Starting sync for folder: {folder_id}")
        print(f"👤 User: {user_email}")
        print("=" * 60)
        
        synced_count = await service.sync_folder(folder_id)
        
        print("=" * 60)
        print(f"✅ Sync complete! Synced {synced_count} files")
        
    except Exception as e:
        print(f"❌ Error during sync: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_drive_manual.py <folder_id> [user_email]")
        print("\nTo get your folder ID:")
        print("1. Open the folder in Google Drive")
        print("2. Copy the ID from the URL: https://drive.google.com/drive/folders/FOLDER_ID_HERE")
        sys.exit(1)
    
    folder_id = sys.argv[1]
    user_email = sys.argv[2] if len(sys.argv) > 2 else "owaissayyed2007@gmail.com"
    
    asyncio.run(sync_drive_folder(folder_id, user_email))
