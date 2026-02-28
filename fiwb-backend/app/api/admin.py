from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import User, Course, Material
from sqlalchemy import delete
import asyncio
import logging

from app.config import settings
from app.utils.email import standardize_email

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

def verify_admin(admin_email: str):
    if admin_email != settings.OWNER_EMAIL:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return admin_email

@router.get("/users")
def get_users(admin_email: str, db: Session = Depends(get_db)):
    verify_admin(admin_email)
    users = db.query(User).all()
    results = []
    for u in users:
        # Get latest document titles for this user (exclude announcements)
        materials = db.query(Material).filter(
            Material.user_id == u.id,
            Material.type.in_(['assignment', 'material'])
        ).order_by(Material.id.desc()).all()
        titles = [m.title for m in materials]
        results.append({
            "id": u.id,
            "email": u.email,
            "last_synced": u.last_synced,
            "created_at": u.created_at,
            "openai_tokens_used": u.openai_tokens_used,
            "supermemory_docs_indexed": u.supermemory_docs_indexed,
            "supermemory_requests_count": u.supermemory_requests_count,
            "lms_api_requests_count": u.lms_api_requests_count,
            "estimated_cost_usd": u.estimated_cost_usd,
            "document_titles": titles
        })
    return results

@router.get("/courses")
def get_all_courses(admin_email: str, db: Session = Depends(get_db)):
    verify_admin(admin_email)
    return db.query(Course).all()

async def _run_full_sync(user_email: str, force_reindex: bool = False):
    """Background sync task that uses the stored token from DB."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_email).first()
        if not user or not user.access_token:
            logger.error(f"[Admin Sync] No token for {user_email}")
            return
        access_token = user.access_token
        refresh_token = user.refresh_token
    finally:
        db.close()

    # 1. Classroom sync
    try:
        from app.lms.sync_service import LMSSyncService
        svc = LMSSyncService(access_token, user_email, refresh_token)
        await svc.sync_all_courses(force_reindex=force_reindex)
        logger.info(f"[Admin Sync] Classroom sync triggered for {user_email} (force={force_reindex})")
    except Exception as e:
        logger.error(f"[Admin Sync] Classroom failed for {user_email}: {e}")

    # Gmail sync removed
    pass

@router.post("/sync/{user_email}")
async def trigger_sync(user_email: str, background_tasks: BackgroundTasks, force_reindex: bool = False, db: Session = Depends(get_db)):
    """Manually trigger a full sync (Classroom) for a specific user."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.access_token:
        raise HTTPException(status_code=400, detail="No access token stored for user.")

    background_tasks.add_task(_run_full_sync, email, force_reindex=force_reindex)
    return {"status": "sync_started", "user": email, "force_reindex": force_reindex}

@router.post("/resync-all-data")
async def resync_all_data(
    background_tasks: BackgroundTasks,
    admin_email: str,
    target_email: str = None,
    force_reindex: bool = False,
    db: Session = Depends(get_db)
):
    """
    Triggers a full re-sync (Google Classroom) for users.
    Pass target_email to sync one user, or omit to sync ALL users.
    """
    verify_admin(admin_email)

    if target_email:
        email = standardize_email(target_email)
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        background_tasks.add_task(_run_full_sync, email, force_reindex=force_reindex)
        return {"status": "started", "users": [email], "force_reindex": force_reindex}

    # All users with tokens
    users = db.query(User).filter(User.access_token.isnot(None)).all()
    for u in users:
        background_tasks.add_task(_run_full_sync, u.email, force_reindex=force_reindex)
    
    return {"status": "started", "users": [u.email for u in users], "force_reindex": force_reindex}

@router.post("/cleanup/{user_email}")
async def cleanup_user_data(user_email: str, db: Session = Depends(get_db)):
    """Remove all mock data for a user."""
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    mock_courses = [c for c in user.courses if c.id.startswith("mock")]
    for course in mock_courses:
        user.courses.remove(course)
        if len(course.users) == 0:
            db.delete(course)

    db.commit()
    return {"status": f"Cleaned up {len(mock_courses)} mock courses for {user_email}"}

@router.get("/status/{user_email}")
def get_sync_status(user_email: str, db: Session = Depends(get_db)):
    """Get sync status and material counts for a user."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    material_count = db.query(Material).filter(Material.user_id == user.id).count()
    course_count = len(user.courses)

    return {
        "email": user.email,
        "last_synced": user.last_synced,
        "courses": course_count,
        "materials": material_count,
        "supermemory_docs": user.supermemory_docs_indexed,
        "api_requests": user.lms_api_requests_count,
        "estimated_cost": user.estimated_cost_usd,
        "has_token": bool(user.access_token),
        "has_refresh_token": bool(user.refresh_token)
    }

async def _resync_announcement_drives_for_user(user_email: str):
    """
    Re-fetches every Google Classroom announcement for a user and runs
    _index_announcement_drive_files on each one. This picks up Drive files
    that were missed before the feature was added.
    Safe to run multiple times — source_ids are deterministic, so Supermemory
    will overwrite duplicates instead of creating new entries.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_email).first()
        if not user or not user.access_token:
            logger.warning(f"[ResyncDrives] Skipping {user_email} — no token")
            return
        access_token  = user.access_token
        refresh_token = user.refresh_token
        courses       = [c for c in user.courses if c.platform == "Google Classroom"]
    finally:
        db.close()

    if not courses:
        logger.info(f"[ResyncDrives] No GC courses for {user_email}")
        return

    from app.lms.google_classroom import GoogleClassroomClient
    from app.lms.sync_service import LMSSyncService

    gc  = GoogleClassroomClient(access_token, refresh_token)
    svc = LMSSyncService(access_token, user_email, refresh_token)

    total_indexed = 0
    for course in courses:
        try:
            announcements = await asyncio.wait_for(
                gc.get_announcements(course.id), timeout=20.0
            )
        except Exception as e:
            logger.warning(f"[ResyncDrives] Could not fetch announcements for {course.name}: {e}")
            continue

        for ann in announcements:
            ann_id       = ann.get('id', '')
            ann_text     = ann.get('text', '')
            ann_materials = ann.get('materials', [])

            if not ann_id:
                continue

            # Only process announcements that have drive files OR text Drive URLs
            has_drive_attachments = any('driveFile' in m or 'link' in m for m in ann_materials)
            has_drive_urls_in_text = (
                'docs.google.com/' in ann_text or
                'drive.google.com/' in ann_text
            )

            if not has_drive_attachments and not has_drive_urls_in_text:
                continue

            try:
                await svc._index_announcement_drive_files(
                    ann_materials, ann_id, ann_text,
                    course.id, course.name, course.professor or 'Professor'
                )
                total_indexed += 1
                await asyncio.sleep(0.3)   # gentle throttle
            except Exception as e:
                logger.warning(f"[ResyncDrives] Failed ann {ann_id} in {course.name}: {e}")

    logger.info(f"[ResyncDrives] Done for {user_email} — processed {total_indexed} announcements with Drive content")


@router.post("/resync-announcement-drives")
async def resync_announcement_drives(
    background_tasks: BackgroundTasks,
    admin_email: str,
    target_email: str = None,
    db: Session = Depends(get_db)
):
    """
    Retroactively index Drive files attached to (or linked from) announcements.
    Pass target_email to process one user, or omit to process ALL users.
    """
    verify_admin(admin_email)

    if target_email:
        email = standardize_email(target_email)
        user  = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        background_tasks.add_task(_resync_announcement_drives_for_user, email)
        return {"status": "started", "users": [email]}

    # All users
    users = db.query(User).filter(User.access_token.isnot(None)).all()
    for u in users:
        background_tasks.add_task(_resync_announcement_drives_for_user, u.email)
    return {"status": "started", "users": [u.email for u in users]}
