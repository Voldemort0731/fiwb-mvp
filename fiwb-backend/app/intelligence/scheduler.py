import asyncio
import logging
import json
from datetime import datetime, timedelta
from app.database import SessionLocal
from app.models import User
from app.lms.sync_service import LMSSyncService
from app.lms.moodle_sync import MoodleSyncService
from app.lms.drive_service import DriveSyncService

logger = logging.getLogger("uvicorn.error")

async def sync_all_for_user(user_email: str):
    """Run all sync services for a single user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            return

        logger.info(f"🔄 [Auto-Sync] Starting background cycle for {user_email}")
        
        # Extract necessary data to allow closing the session
        access_token = user.access_token
        refresh_token = user.refresh_token
        moodle_url = user.moodle_url
        moodle_token = user.moodle_token
        watched_drive_folders = user.watched_drive_folders
        
        # Close main session so we don't hold a pool connection during long API calls
        db.close()

        # 1. Google Classroom Sync
        try:
            classroom_service = LMSSyncService(access_token, user_email, refresh_token)
            await classroom_service.sync_all_courses()
            
            # Update token if refreshed
            new_token = classroom_service.gc_client.creds.token
            if new_token and new_token != access_token:
                update_db = SessionLocal()
                try:
                    u = update_db.query(User).filter(User.email == user_email).first()
                    if u:
                        u.access_token = new_token
                        update_db.commit()
                        logger.info(f"🔄 [Auto-Sync] Access token updated for {user_email}")
                finally:
                    update_db.close()
        except Exception as e:
            logger.error(f"❌ [Auto-Sync] Classroom failed for {user_email}: {e}")

        # 2. Moodle Sync
        if moodle_url and moodle_token:
            try:
                moodle_service = MoodleSyncService(moodle_url, moodle_token, user_email)
                await moodle_service.sync_all()
            except Exception as e:
                logger.error(f"❌ [Auto-Sync] Moodle failed for {user_email}: {e}")

        # 3. Google Drive Sync (Watched Folders)
        if watched_drive_folders:
            try:
                folder_ids = json.loads(watched_drive_folders)
                if folder_ids:
                    drive_service = DriveSyncService(access_token, user_email, refresh_token)
                    for fid in folder_ids:
                        await drive_service.sync_folder(fid)
            except Exception as e:
                logger.error(f"❌ [Auto-Sync] Drive failed for {user_email}: {e}")

        # Gmail sync removed
        pass

        # Final Update
        last_db = SessionLocal()
        try:
            u = last_db.query(User).filter(User.email == user_email).first()
            if u:
                u.last_synced = datetime.utcnow()
                last_db.commit()
            logger.info(f"💎 [Auto-Sync] Full Cycle Successful for {user_email}")
        finally:
            last_db.close()

    finally:
        try:
            db.close()
        except:
            pass

async def global_sync_loop():
    """Infinite loop that syncs all users periodically."""
    # Wait for app to fully start
    await asyncio.sleep(60)
    
    interval_seconds = 60 * 60 * 6 // 1 # 6 hours backup
    
    while True:
        try:
            logger.info("🌍 [Auto-Sync] Starting global background safety-net cycle...")
            db = SessionLocal()
            users = db.query(User).all()
            user_emails = [u.email for u in users]
            db.close()

            for email in user_emails:
                from app.utils.concurrency import GlobalSyncManager
                # Defer to global manager to prevent overwhelming the server
                asyncio.create_task(GlobalSyncManager.run_deep_task(sync_all_for_user(email)))
                # Small gap between task submissions
                await asyncio.sleep(2)

            logger.info(f"😴 [Auto-Sync] Cycle complete. Sleeping for {interval_seconds//60} mins.")
        except Exception as e:
            logger.error(f"🚨 [Auto-Sync] Critical error in global loop: {e}")
        
        await asyncio.sleep(interval_seconds)

def start_scheduler():
    """Start the background sync loop."""
    asyncio.create_task(global_sync_loop())
