from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from app.config import settings
import asyncio
import logging

logger = logging.getLogger("uvicorn.error")

class GoogleClassroomClient:
    def __init__(self, token: str, refresh_token: str = None):
        """Initialize with access token and optional refresh token."""
        # Build credentials with all necessary fields for refresh
        self.creds = Credentials(
            token=token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET
        )
        
        # Attempt to refresh if token is expired
        if refresh_token and (self.creds.expired or not self.creds.valid):
            try:
                logger.info(f"Refreshing expired token for user...")
                self.creds.refresh(Request())
            except Exception as e:
                logger.error(f"Token refresh failed: {e}")
        self.user_email = "me" # Default for instance scope
        self._service = None

    async def _get_service(self):
        """Thread-safe and async-safe service builder."""
        if self._service is None:
            from app.utils.google_lock import GoogleApiLock
            # Ensure token is valid before building service
            if self.creds.expired and self.creds.refresh_token:
                try:
                    await asyncio.to_thread(self.creds.refresh, Request())
                except Exception as e:
                    logger.error(f"Failed to refresh token in _get_service: {e}")
            
            async with GoogleApiLock.get_lock():
                if self._service is None:
                    try:
                        self._service = await asyncio.to_thread(
                            lambda: build('classroom', 'v1', credentials=self.creds, static_discovery=True)
                        )
                    except Exception as e:
                        print(f"Failed to initialize Classroom service: {e}")
                        raise e
        return self._service

    async def get_courses(self):
        """Fetch all courses the user is enrolled in or teaching in parallel."""
        from app.utils.google_lock import GoogleApiLock
        service = await self._get_service()
        
        async def fetch_student_courses():
            async with GoogleApiLock.get_lock():
                results = await asyncio.to_thread(
                    lambda: service.courses().list(
                        studentId='me',
                        courseStates=['ACTIVE']
                    ).execute()
                )
            return results.get('courses', [])

        async def fetch_teacher_courses():
            async with GoogleApiLock.get_lock():
                results = await asyncio.to_thread(
                    lambda: service.courses().list(
                        teacherId='me',
                        courseStates=['ACTIVE']
                    ).execute()
                )
            return results.get('courses', [])

        # 🚀 Parallel Execution
        # Let exceptions bubble up to the sync service for proper handling
        res_student, res_teacher = await asyncio.gather(
            fetch_student_courses(),
            fetch_teacher_courses()
        )
        
        all_courses = res_student + res_teacher
        
        # Deduplicate by ID
        unique_courses = {c['id']: c for c in all_courses}.values()
        return list(unique_courses)

    async def get_coursework(self, course_id: str):
        """Fetch assignments for a course."""
        from app.utils.google_lock import GoogleApiLock
        service = await self._get_service()
        async with GoogleApiLock.get_lock():
            results = await asyncio.to_thread(
                lambda: service.courses().courseWork().list(
                    courseId=course_id
                ).execute()
            )
        return results.get('courseWork', [])

    async def get_announcements(self, course_id: str):
        """Fetch announcements for a course."""
        from app.utils.google_lock import GoogleApiLock
        service = await self._get_service()
        async with GoogleApiLock.get_lock():
            results = await asyncio.to_thread(
                lambda: service.courses().announcements().list(
                    courseId=course_id
                ).execute()
            )
        return results.get('announcements', [])

    async def get_materials(self, course_id: str):
        """Fetch course materials."""
        from app.utils.google_lock import GoogleApiLock
        service = await self._get_service()
        async with GoogleApiLock.get_lock():
            results = await asyncio.to_thread(
                lambda: service.courses().courseWorkMaterials().list(
                    courseId=course_id
                ).execute()
            )
        return results.get('courseWorkMaterial', [])

