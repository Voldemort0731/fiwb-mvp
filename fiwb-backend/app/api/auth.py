import os
import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.config import settings
from app.utils.email import standardize_email

os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

class LoginRequest(BaseModel):
    code: str

@router.post("/login")
async def login(request: LoginRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Login endpoint: exchange Google code for tokens, upsert user, trigger background sync."""
    try:
        from app.utils.clients import SharedClients
        http = SharedClients.get_http_client()

        # 1. Exchange auth code for tokens
        logger.info(f"Token exchange starting...")
        token_resp = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": request.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
            timeout=15.0
        )
        if not token_resp.is_success:
            logger.error(f"Token exchange failed: {token_resp.text}")
            raise HTTPException(status_code=400, detail="Google authentication failed")

        tokens = token_resp.json()
        access_token = tokens.get('access_token')
        refresh_token = tokens.get('refresh_token')
        logger.info(f"Token exchange OK. Has refresh_token: {bool(refresh_token)}")

        # 2. Get user profile
        ui_resp = await http.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0
        )
        if not ui_resp.is_success:
            raise HTTPException(status_code=400, detail="Failed to retrieve Google profile")

        user_info = ui_resp.json()
        email = standardize_email(user_info.get('email', ''))
        google_id = str(user_info.get('id') or user_info.get('sub', ''))

        if not email:
            raise HTTPException(status_code=400, detail="No email in Google response")

        logger.info(f"Login: {email}")

        # 3. Upsert user in DB (synchronous — safe with injected session)
        user = db.query(User).filter(User.google_id == google_id).first()
        if not user:
            user = db.query(User).filter(User.email == email).first()

        if not user:
            logger.info(f"Creating new user: {email}")
            user = User(
                email=email,
                google_id=google_id,
                access_token=access_token,
                refresh_token=refresh_token
            )
            db.add(user)
        else:
            logger.info(f"Updating existing user: {email}")
            user.email = email
            user.google_id = google_id
            user.access_token = access_token
            # Only overwrite refresh_token if we got a new one (Google only sends it on first auth)
            if refresh_token:
                user.refresh_token = refresh_token

        user.last_synced = datetime.utcnow()
        db.commit()
        db.refresh(user)
        user_id = user.id
        logger.info(f"User {email} saved to DB (id={user_id}). Queuing background sync.")

        # 4. Background sync — uses the tokens we just got (fresh and valid)
        async def run_initial_sync():
            try:
                logger.info(f"[BG Sync] Starting classroom sync for {email}")
                from app.lms.sync_service import LMSSyncService
                svc = LMSSyncService(access_token, email, refresh_token)
                await svc.sync_all_courses()
                logger.info(f"[BG Sync] Classroom done for {email}")

                # Gmail sync removed
            except Exception as e:
                logger.error(f"[BG Sync] Failed for {email}: {e}", exc_info=True)

        background_tasks.add_task(run_initial_sync)

        return {
            "status": "success",
            "user_id": user_id,
            "email": email,
            "name": user_info.get('name'),
            "picture": user_info.get('picture')
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
