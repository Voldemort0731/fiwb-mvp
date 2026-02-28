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
        atts = json.loads(m.attachments) if m.attachments else []
    except:
        atts = []

    return {
        "id": m.id,
        "title": m.title,
        "type": m.type,
        "content": m.content or "",
        "attachments": atts,
        "course_id": m.course_id,
        "source_link": m.source_link
    }

@router.get("/proxy/drive/{file_id}")
async def proxy_drive_file(file_id: str, user_email: str, db: Session = Depends(get_db)):
    """Backend proxy to serve Google Drive files directly, bypassing iframe login issues."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="Unauthorized: Google credentials missing")

    # Sync with DriveService logic
    drive = DriveSyncService(user.access_token, email, user.refresh_token)
    service = await drive._get_service()
    
    try:
        # 1. Get Metadata for MimeType
        meta = await asyncio.to_thread(service.files().get(fileId=file_id, fields="mimeType, name").execute)
        mime_type = meta.get('mimeType', 'application/octet-stream')
        
        # 2. Prepare Download/Export Request
        if 'google-apps' in mime_type:
            # Export Google Docs to PDF for viewing
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            final_mime = 'application/pdf'
        else:
            request = service.files().get_media(fileId=file_id)
            final_mime = mime_type

        # 3. Stream the content
        from googleapiclient.http import MediaIoBaseDownload
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        
        async def stream_generator():
            done = False
            while not done:
                status, done = await asyncio.to_thread(downloader.next_chunk)
            
            fh.seek(0)
            yield fh.read()

        return StreamingResponse(
            stream_generator(), 
            media_type=final_mime,
            headers={"Content-Disposition": f"inline; filename={meta.get('name', 'file')}"}
        )
    except Exception as e:
        logger.error(f"Proxy failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
