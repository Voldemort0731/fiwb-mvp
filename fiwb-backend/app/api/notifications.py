from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db
from app.models import User, Material, Course
import base64
import json
import asyncio
import logging
from datetime import datetime, timedelta
from app.utils.email import standardize_email

logger = logging.getLogger("uvicorn.error")

router = APIRouter()

@router.post("/webhook")
async def receive_notification(request: Request):
    """
    Handle Google Classroom Push Notifications via Pub/Sub.
    """
    try:
        body = await request.json()
        message = body.get("message", {})
        data = message.get("data")
        
        if data:
            # Decode the message
            decoded_data = base64.b64decode(data).decode("utf-8")
            notification = json.loads(decoded_data)
            
            registration_id = notification.get('registrationId')

            
            print(f"Received Notification: {notification}")
            
            db = SessionLocal()
            try:
                if registration_id:
                    user = db.query(User).filter(User.registration_id == registration_id).first()
                    if user:
                        logger.info(f"🚀 [Real-Time Sync] Triggering Classroom sync for {user.email}")
                        from app.intelligence.scheduler import sync_all_for_user
                        asyncio.create_task(sync_all_for_user(user.email))
                else:
                    logger.warning(f"❓ [Webhook] Received unknown notification type: {notification}")
            finally:
                db.close()
            
            return {"status": "received"}
            
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid notification")

@router.get("/urgent")
def get_urgent_notifications(user_email: str, db: Session = Depends(get_db)):
    """Fetch urgent AI recommended notifications for the user."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return []

    # 1. Fetch upcoming assignments (Due in next 7 days)
    # Note: Classroom due_date is often a ISO string or human readable depending on sync
    # For now, we'll fetch all assignments and filter locally for simplicity in this demo
    materials = db.query(Material).filter(
        Material.user_id == user.id,
        Material.type == 'assignment'
    ).all()

    urgent_items = []
    
    # Simple urgency heuristic
    for m in materials:
        if m.due_date:
            urgent_items.append({
                "id": m.id,
                "title": m.title,
                "type": "assignment",
                "subtitle": f"Due: {m.due_date}",
                "priority": "high",
                "timestamp": m.created_at,
                "link": f"/course/{m.course_id}"
            })

    # 2. Latest announcements or "AI Insights"
    announcements = db.query(Material).filter(
        Material.user_id == user.id,
        Material.type == 'announcement'
    ).order_by(Material.created_at.desc()).limit(3).all()

    for a in announcements:
        urgent_items.append({
            "id": a.id,
            "title": a.title,
            "type": "announcement",
            "subtitle": "New Course Announcement",
            "priority": "medium",
            "timestamp": a.created_at,
            "link": f"/course/{a.course_id}"
        })

    # 3. Add a "Progress" mock if no data exists
    if not urgent_items:
        urgent_items.append({
            "id": "progress_1",
            "title": "Weekly Progress Report",
            "type": "progress",
            "subtitle": "You completed 85% of goals this week!",
            "priority": "low",
            "timestamp": datetime.utcnow().isoformat(),
            "link": "/dashboard"
        })

    # Sort by priority and recency
    priority_map = {"high": 0, "medium": 1, "low": 2}
    urgent_items.sort(key=lambda x: priority_map.get(x["priority"], 3))

    return urgent_items[:8] # Return top 8 urgent notifications
