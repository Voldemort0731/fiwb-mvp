from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io
import pypdf
from app.models import Material, Course, User
from app.database import SessionLocal
from app.supermemory.client import SupermemoryClient
import datetime
import json
import asyncio

from app.utils.locks import GLOBAL_API_LOCK

class DriveSyncService:
    def __init__(self, access_token: str, user_email: str, refresh_token: str = None):
        from app.config import settings
        self.creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )
        self.service = None
        self.user_email = user_email
        from app.utils.clients import SharedClients
        self.sm_client = SharedClients.get_supermemory()

    async def _get_service(self):
        """Thread-safe and async-safe service builder."""
        if self.service is None:
            try:
                async with GLOBAL_API_LOCK:
                    self.service = await asyncio.to_thread(
                        lambda: build('drive', 'v3', credentials=self.creds, static_discovery=True)
                    )
            except Exception as e:
                print(f"Failed to initialize Drive service: {e}")
                raise e
        return self.service

    async def list_root_folders(self):
        """List folders in the root of Google Drive."""
        service = await self._get_service()
        async with GLOBAL_API_LOCK:
            results = await asyncio.to_thread(
                lambda: service.files().list(
                    q="mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false",
                    fields="files(id, name, webViewLink)",
                    pageSize=50
                ).execute()
            )
        return results.get('files', [])

    async def sync_folder(self, folder_id: str):
        # ... (course/db setup omitted for brevity, unchanged) ...
        # Ensure a virtual "Google Drive" course exists in DB for grouping
        db = SessionLocal()
        drive_course = db.query(Course).filter(Course.id == "GOOGLE_DRIVE").first()
        if not drive_course:
            drive_course = Course(
                id="GOOGLE_DRIVE",
                name="Personal Google Drive",
                professor="Self",
                platform="Google Drive"
            )
            db.add(drive_course)
            db.commit()

        # Link user to this virtual course
        user = db.query(User).filter(User.email == self.user_email).first()
        if user and drive_course not in user.courses:
            user.courses.append(drive_course)
            db.commit()
        
        user_id = user.id if user else None
        db.close()

        # Fetch files in folder - support many file types with pagination
        mime_types = [
            'application/pdf', 'text/plain', 'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
            'image/jpeg', 'image/png', 'image/gif', 'text/html', 'text/csv', 'text/markdown'
        ]
        
        files = await self._get_all_files_recursive(folder_id, mime_types)
        print(f"[Production-Drive] Found {len(files)} files for {self.user_email}")
        synced_count = 0

        batch_size = 2
        for i in range(0, len(files), batch_size):
            batch = files[i:i + batch_size]
            for file in batch:
                file_id = file['id']
                check_db = SessionLocal()
                try:
                    existing = check_db.query(Material).filter(Material.id == file_id).first()
                    if existing: continue
                finally:
                    check_db.close()

                try:
                    content = await self._get_file_content(file)
                    if not content: continue
                    
                    write_db = SessionLocal()
                    try:
                        new_material = Material(
                            id=file_id,
                            user_id=user_id,
                            course_id="GOOGLE_DRIVE",
                            title=file['name'],
                            content=content[:5000], 
                            type="drive_file",
                            created_at=file.get('createdTime'),
                            source_link=file.get('webViewLink'),
                            attachments=json.dumps([{"id": file_id, "title": file['name'], "url": file.get('webViewLink'), "type": "drive_file"}])
                        )
                        write_db.add(new_material)
                        write_db.commit()

                        await self.sm_client.add_document(
                            content=content,
                            title=file['name'],
                            description=f"File from Google Drive",
                            metadata={"user_id": self.user_email, "source": "google_drive", "file_id": file_id}
                        )
                        synced_count += 1
                    finally:
                        write_db.close()
                except Exception as e:
                    print(f"Failed to extract content for {file['name']}: {e}")
            await asyncio.sleep(0.5)
        return synced_count

    async def _get_file_content(self, file_meta):
        file_id = file_meta['id']
        mime_type = file_meta['mimeType']
        service = await self._get_service()
        
        # Google Docs / Sheets / Slides
        async with GLOBAL_API_LOCK:
            if 'google-apps' in mime_type:
                target_mime = 'text/plain' if 'document' in mime_type or 'presentation' in mime_type else 'text/csv'
                request = service.files().export_media(fileId=file_id, mimeType=target_mime)
            else:
                request = service.files().get_media(fileId=file_id)

            try:
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while done is False:
                    # Downloading chunks MUST be locked as it uses httplib2 transport
                    status, done = await asyncio.to_thread(downloader.next_chunk)
                
                if mime_type == 'application/pdf':
                    pdf_reader = pypdf.PdfReader(io.BytesIO(fh.getvalue()))
                    return "\n".join([page.extract_text() for page in pdf_reader.pages])
                
                return fh.getvalue().decode('utf-8', errors='ignore')
            except:
                return ""
    
    async def _get_all_files_recursive(self, folder_id: str, mime_types: list) -> list:
        all_files = []
        folders_to_process = [folder_id]
        processed_folders = set()
        service = await self._get_service()
        mime_query = ' or '.join([f"mimeType = '{mt}'" for mt in mime_types])
        
        while folders_to_process:
            current_folder_id = folders_to_process.pop(0)
            if current_folder_id in processed_folders: continue
            processed_folders.add(current_folder_id)
            
            query = f"'{current_folder_id}' in parents and (mimeType = 'application/vnd.google-apps.folder' or {mime_query}) and trashed = false"
            page_token = None
            while True:
                async with GLOBAL_API_LOCK:
                    results = await asyncio.to_thread(
                        lambda: service.files().list(q=query, fields="nextPageToken, files(id, name, mimeType, webViewLink, createdTime)", pageToken=page_token).execute()
                    )
                items = results.get('files', [])
                for item in items:
                    if item['mimeType'] == 'application/vnd.google-apps.folder':
                        folders_to_process.append(item['id'])
                    else:
                        all_files.append(item)
                page_token = results.get('nextPageToken')
                if not page_token: break
            await asyncio.sleep(0.1)
        return all_files

