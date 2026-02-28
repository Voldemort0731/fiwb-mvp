from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from app.database import get_db
from app.models import Course, User, Material
from app.utils.email import standardize_email
from app.lms.drive_service import DriveSyncService
import io
from datetime import datetime
import json
import logging
import asyncio

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

@router.get("/")
def get_courses(user_email: str, db: Session = Depends(get_db)):
    """Fetch all courses for a user from the local database."""
    email = standardize_email(user_email)
    logger.info(f"[API] FETCH COURSES for: {user_email} -> {email}")

    user = db.query(User).filter(User.email == email).options(selectinload(User.courses)).first()
    if not user:
        logger.warning(f"[API] User not found: {email}")
        return []

    count = len(user.courses)
    logger.info(f"[API] Found user {user.id} ({user.email}), returning {count} courses")
    
    results = []
    for c in user.courses:
        latest = db.query(Material).filter(
            Material.course_id == c.id,
            or_(Material.user_id == user.id, Material.user_id == None)
        ).order_by(Material.created_at.desc()).first()
        
        latest_text = None
        lat_atts = []
        if latest:
            try:
                lat_atts = json.loads(latest.attachments) if latest.attachments else []
            except:
                pass
                
            if latest.content:
                latest_text = f"[{latest.type.capitalize()}] {latest.content[:100]}..."
            else:
                if lat_atts and isinstance(lat_atts, list):
                    latest_text = f"[{latest.type.capitalize()}] 📎 {lat_atts[0].get('title', 'Attachment')}"
                else:
                    latest_text = f"[{latest.type.capitalize()}] {latest.title}"

        results.append({
            "id": c.id,
            "name": c.name,
            "professor": c.professor or "Unknown",
            "platform": c.platform,
            "last_synced": c.last_synced.isoformat() if c.last_synced else None,
            "latest_update": latest_text,
            "latest_attachment_count": len(lat_atts) if isinstance(lat_atts, list) else 0
        })
        
    return results

@router.get("/{course_id}")
def get_course(course_id: str, user_email: str, db: Session = Depends(get_db)):
    """Fetch details for a specific course."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"error": "User not found"}

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course not in user.courses:
        return {"error": "Course not found or access denied"}

    return {
        "id": course.id,
        "name": course.name,
        "professor": course.professor or "Unknown",
        "platform": course.platform
    }

@router.get("/{course_id}/materials")
def get_course_materials(course_id: str, user_email: str, db: Session = Depends(get_db)):
    """
    Fetch all materials for a course from the local DB.
    """
    email = standardize_email(user_email)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"error": "User not found"}

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course not in user.courses:
        return {"error": "Access denied"}

    # 1. Query materials explicitly assigned to this course
    db_materials = db.query(Material).filter(
        Material.course_id == course_id,
        or_(Material.user_id == user.id, Material.user_id == None)
    ).all()

    # 2. Query Google Drive materials that are semantically related (mention course name)
    if course and course_id != "GOOGLE_DRIVE":
        # Search for "GOOGLE_DRIVE" materials that mention the course name
        drive_related = db.query(Material).filter(
            Material.course_id == "GOOGLE_DRIVE",
            or_(Material.user_id == user.id, Material.user_id == None),
            or_(
                Material.title.ilike(f"%{course.name}%"),
                Material.content.ilike(f"%{course.name}%")
            )
        ).all()
        db_materials.extend(drive_related)

    # Sort everything by date
    db_materials.sort(key=lambda x: x.created_at or "", reverse=True)

    # Fix orphaned materials (assign user_id where missing)
    orphans_fixed = False
    for m in db_materials:
        if m.user_id is None:
            m.user_id = user.id
            orphans_fixed = True
    if orphans_fixed:
        try:
            db.commit()
        except:
            db.rollback()

    if not db_materials:
        return []

    results = []
    for m in db_materials:
        try:
            atts = json.loads(m.attachments) if m.attachments else []
        except:
            atts = []

        source_name = "Google Drive" if course_id == "GOOGLE_DRIVE" else "Google Classroom"

        results.append({
            "id": m.id,
            "title": m.title,
            "type": m.type,
            "created_at": m.created_at or datetime.utcnow().isoformat(),
            "due_date": m.due_date,
            "content": m.content or "",
            "source": source_name,
            "attachments": atts,
            "category": m.type,
            "source_link": m.source_link
        })

    return results

@router.get("/material/{material_id}")
def get_material(material_id: str, user_email: str, db: Session = Depends(get_db)):
    """Fetch details for a specific classwork material/assignment."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"error": "User not found"}

    m = db.query(Material).filter(
        Material.id == material_id,
        or_(Material.user_id == user.id, Material.user_id == None)
    ).first()
    
    if not m:
        return {"error": "Material not found"}

    try:
        raw_atts = json.loads(m.attachments) if m.attachments else []
        # Normalize: ensure id exists even if it's file_id
        atts = []
        for a in raw_atts:
            atts.append({
                "id": a.get("id") or a.get("file_id"),
                "title": a.get("title") or "Attachment",
                "url": a.get("url") or a.get("alternateLink"),
                "type": a.get("type") or a.get("type"),
                "file_type": a.get("file_type") or ("pdf" if "pdf" in (a.get("mime_type") or "").lower() else "document")
            })
    except:
        atts = []

    return {
        "id": m.id,
        "title": m.title,
        "type": m.type,
        "content": m.content or m.title,
        "attachments": atts,
        "course_id": m.course_id,
        "source_link": m.source_link
    }

@router.get("/proxy/drive/{file_id}")
async def proxy_drive_file(file_id: str, user_email: str, db: Session = Depends(get_db)):
    """
    Robust backend proxy that:
    1. Forces token refresh to prevent session expiry during stream.
    2. Streams chunks directly from Google to unblock the browser.
    """
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Force token refresh to ensure it lasts for the whole stream
    drive = DriveSyncService(user.access_token, email, user.refresh_token)
    try:
        await drive.get_refreshed_access_token()
    except Exception as e:
        logger.error(f"Token refresh failed for proxy: {e}")
        # If refresh fails, we can't proxy. 
        raise HTTPException(status_code=401, detail="Session expired. Please re-authenticate.")

    service = await drive._get_service()
    
    try:
        # 2. Get Metadata
        meta = await asyncio.to_thread(service.files().get(fileId=file_id, fields="mimeType, name").execute)
        mime_type = meta.get('mimeType', 'application/octet-stream')
        
        # 3. Handle Media Request
        if 'google-apps' in mime_type:
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            final_mime = 'application/pdf'
        else:
            request = service.files().get_media(fileId=file_id)
            final_mime = mime_type

        # 4. CHUNKED STREAMING (Fixes "running out" and timeout issues)
        async def stream_generator():
            from googleapiclient.http import MediaIoBaseDownload
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024) # 1MB chunks
            
            done = False
            last_pos = 0
            while not done:
                # downloader.next_chunk returns (status, done)
                try:
                    status, done = await asyncio.to_thread(downloader.next_chunk)
                    
                    # Yield ONLY the new bytes since last chunk
                    fh.seek(last_pos)
                    chunk_data = fh.read()
                    if chunk_data:
                        yield chunk_data
                        last_pos = fh.tell()
                except Exception as stream_err:
                    logger.error(f"Streaming error mid-way: {stream_err}")
                    break

        return StreamingResponse(
            stream_generator(), 
            media_type=final_mime,
            headers={
                "Content-Disposition": f"inline; filename={meta.get('name', 'file')}",
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff"
            }
        )
    except Exception as e:
        logger.error(f"Proxy failed for {file_id}: {e}")
        # Explicitly avoid returning HTML (like Google login page) 
        # By raising HTTPException, FastAPI ensures an application/json or simple text error
        raise HTTPException(status_code=500, detail="Failed to retrieve document stream.")
