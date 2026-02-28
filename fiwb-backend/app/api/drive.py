from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Material
from app.lms.drive_service import DriveSyncService
from app.utils.locks import GLOBAL_API_LOCK
from pydantic import BaseModel
from typing import List
import asyncio
import json
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

class DriveSyncRequest(BaseModel):
    user_email: str
    folder_ids: List[str]

class DriveUnsyncRequest(BaseModel):
    user_email: str
    folder_ids: List[str]

async def drive_sync_task(user_email: str, access_token: str, refresh_token: str, item_ids: List[str]):
    service = DriveSyncService(access_token, user_email, refresh_token)
    try:
        await service.sync_items(item_ids)
    except Exception as e:
        print(f"Error syncing items {item_ids} for {user_email}: {e}")

@router.get("/folders")
async def get_folders(user_email: str, db: Session = Depends(get_db)):
    """List all root-level folders from the user's Google Drive."""
    from app.utils.email import standardize_email
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    service = DriveSyncService(user.access_token, user.email, user.refresh_token)
    try:
        folders = await service.list_root_folders()
        return folders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list Drive folders: {str(e)}")

@router.get("/synced-folders")
async def get_synced_folders(user_email: str, db: Session = Depends(get_db)):
    """Get the list of currently synced (watched) Drive folders with their names."""
    from app.utils.email import standardize_email
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Parse stored folder IDs
    try:
        folder_ids = json.loads(user.watched_drive_folders) if user.watched_drive_folders else []
    except:
        folder_ids = []
    
    if not folder_ids:
        return []
    
    # Try to get item names from Google Drive API
    synced_items = []
    try:
        service = DriveSyncService(user.access_token, user.email, user.refresh_token)
        drive_svc = await service._get_service()
        
        for fid in folder_ids:
            try:
                async with GLOBAL_API_LOCK:
                    item_meta = await asyncio.to_thread(
                        lambda fid=fid: drive_svc.files().get(fileId=fid, fields="id, name, mimeType").execute()
                    )
                synced_items.append({"id": fid, "name": item_meta.get('name'), "type": item_meta.get('mimeType')})
            except:
                # Item might have been deleted or access lost
                synced_items.append({"id": fid, "name": f"Item ({fid[:8]}...)", "type": "unknown"})
    except Exception as e:
        logger.error(f"Failed to resolve item names: {e}")
        for fid in folder_ids:
            synced_items.append({"id": fid, "name": f"Item ({fid[:8]}...)", "type": "unknown"})
    
    return synced_items

@router.post("/sync")
async def sync_drive(request: DriveSyncRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Sync selected Drive folders. Merges with existing watched folders."""
    from app.utils.email import standardize_email
    email = standardize_email(request.user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Merge new folder IDs with existing ones (don't replace)
    try:
        existing_ids = json.loads(user.watched_drive_folders) if user.watched_drive_folders else []
    except:
        existing_ids = []
    
    merged_ids = list(set(existing_ids + request.folder_ids))
    user.watched_drive_folders = json.dumps(merged_ids)
    db.commit()
    
    background_tasks.add_task(
        drive_sync_task, 
        user.email, 
        user.access_token, 
        user.refresh_token, 
        request.folder_ids
    )
    
    return {"status": "sync_started", "folders_queued": len(request.folder_ids)}

@router.post("/unsync")
async def unsync_drive(request: DriveUnsyncRequest, db: Session = Depends(get_db)):
    """Remove Drive folders from sync and delete their associated materials."""
    from app.utils.email import standardize_email
    email = standardize_email(request.user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove folder IDs from watched list
    try:
        existing_ids = json.loads(user.watched_drive_folders) if user.watched_drive_folders else []
    except:
        existing_ids = []
    
    removed_ids = set(request.folder_ids)
    updated_ids = [fid for fid in existing_ids if fid not in removed_ids]
    user.watched_drive_folders = json.dumps(updated_ids)
    
    # Delete materials that came from these Drive folders
    # Drive materials have course_id = "GOOGLE_DRIVE" and are linked to the user
    deleted_count = 0
    try:
        # Get all Drive materials for this user
        drive_materials = db.query(Material).filter(
            Material.course_id == "GOOGLE_DRIVE",
            Material.user_id == user.id
        ).all()
        
        # We need to check which materials came from the removed folders
        # Since we don't store folder_id on materials directly, we need to use the Drive API
        # For now, if ALL folders are being removed, delete all Drive materials
        if not updated_ids:
            deleted_count = db.query(Material).filter(
                Material.course_id == "GOOGLE_DRIVE",
                Material.user_id == user.id
            ).delete()
        else:
            # Try to identify and remove materials from removed folders using the Drive API
            try:
                service = DriveSyncService(user.access_token, user.email, user.refresh_token)
                drive_svc = await service._get_service()
                
                for folder_id in request.folder_ids:
                    from app.utils.google_lock import GoogleApiLock
                    async with GoogleApiLock.get_lock():
                        results = await asyncio.to_thread(
                            lambda fid=folder_id: drive_svc.files().list(
                                q=f"'{fid}' in parents and trashed = false",
                                fields="files(id)",
                                pageSize=500
                            ).execute()
                        )
                    
                    file_ids = [f['id'] for f in results.get('files', [])]
                    if file_ids:
                        count = db.query(Material).filter(
                            Material.id.in_(file_ids),
                            Material.course_id == "GOOGLE_DRIVE"
                        ).delete(synchronize_session='fetch')
                        deleted_count += count
            except Exception as e:
                logger.error(f"Error cleaning up materials for removed folders: {e}")
                # Fallback: if we can't resolve files, at least update the watched list
    except Exception as e:
        logger.error(f"Error deleting materials during unsync: {e}")
    
    db.commit()
    logger.info(f"Unsynced {len(request.folder_ids)} folders for {email}, deleted {deleted_count} materials")
    
    return {
        "status": "unsynced",
        "folders_removed": len(request.folder_ids),
        "materials_deleted": deleted_count,
        "remaining_folders": len(updated_ids)
    }
