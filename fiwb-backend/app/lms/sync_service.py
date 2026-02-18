from app.lms.google_classroom import GoogleClassroomClient
from app.supermemory.client import SupermemoryClient
from app.database import SessionLocal
from app.models import User, Course, Material
from datetime import datetime
import traceback
import asyncio
import json

import logging
from app.intelligence.usage import UsageTracker

from app.utils.email import standardize_email

logger = logging.getLogger("uvicorn.error")

class LMSSyncService:
    def __init__(self, access_token: str, user_email: str, refresh_token: str = None):
        self.gc_client = GoogleClassroomClient(access_token, refresh_token)
        # Standardize email to full version
        self.user_email = standardize_email(user_email)
        self.sm_client = SupermemoryClient()

    async def setup_push_notifications(self, db):
        """Register the user for Google Classroom push notifications."""
        from app.config import settings
        topic_name = settings.GOOGLE_PUBSUB_TOPIC
        if not topic_name:
            logger.warning(f"No Pub/Sub topic configured. Real-time sync disabled for {self.user_email}")
            return False

        try:
            # We register for course-work changes globally for the user
            # Note: This requires a Google Cloud project with Pub/Sub enabled
            body = {
                "feed": {
                    "feedType": "COURSE_WORK_CHANGES"
                },
                "cloudPubsubTopic": {
                    "topicName": topic_name
                }
            }
            # Many classroom notifications require courseId. 
            # For simplicity, we register for coursework changes which is user-wide.
            reg = await asyncio.to_thread(
                lambda: self.gc_client.service.registrations().create(body=body).execute()
            )
            
            registration_id = reg.get('registrationId')
            if registration_id:
                # If no DB provided, create a fresh one for the background task
                task_db = db if db else SessionLocal()
                try:
                    user = task_db.query(User).filter(User.email == self.user_email).first()
                    if user:
                        user.registration_id = registration_id
                        task_db.commit()
                        logger.info(f"✅ Real-time notifications enabled for {self.user_email}. ID: {registration_id}")
                        return True
                finally:
                    if not db:
                        task_db.close()
        except Exception as e:
            logger.error(f"❌ Failed to setup push notifications for {self.user_email}: {e}")
        return False

    async def sync_all_courses(self):
        """Main sync function: Fetches from Google, updates DB, pushes to Supermemory."""
        db = SessionLocal()
        try:
            logger.info(f"Starting sync for {self.user_email}...")
            user = db.query(User).filter(User.email == self.user_email).first()
            if not user:
                logger.error(f"User {self.user_email} not found in DB.")
                return

            # PHASE 1: Metadata Sync (Fast)
            # Fetch courses first to show them in the UI ASAP
            try:
                UsageTracker.log_lms_request(self.user_email, 2, db=db)
                courses_data = await self.gc_client.get_courses()
                logger.info(f"PHASE 1: Found {len(courses_data)} courses for {self.user_email}")
            except Exception as e:
                logger.error(f"Metadata fetch failed: {e}")
                return

            active_course_ids = set()
            for c_data in courses_data:
                c_id = c_data['id']
                active_course_ids.add(c_id)
                
                db_course = db.query(Course).filter(Course.id == c_id).first()
                if not db_course:
                    # Initial skeleton course
                    db_course = Course(id=c_id, name=c_data['name'], professor="Loading...", platform="Google Classroom")
                    db.add(db_course)
                else:
                    db_course.name = c_data['name']
                
                if db_course not in user.courses:
                    user.courses.append(db_course)
                db_course.last_synced = datetime.utcnow()

            # PHASE 3: Cleanup (Un-enrolled courses)
            # SAFETY CHECK: Only prune if we fetched courses successfully.
            # If courses_data is empty but user had many courses, it might be a transient API failure.
            existing_classroom_courses = [c for c in user.courses if c.platform == "Google Classroom"]
            
            if len(courses_data) == 0 and len(existing_classroom_courses) > 0:
                logger.warning(f"⚠️ API returned 0 courses for {self.user_email} (previously had {len(existing_classroom_courses)}). Skipping cleanup to prevent accidental data loss.")
            else:
                try:
                    removed_count = 0
                    for user_course in list(user.courses):
                        if user_course.platform == "Google Classroom" and user_course.id not in active_course_ids:
                            logger.info(f"🗑️ Removing un-enrolled course {user_course.name} ({user_course.id}) for {self.user_email}")
                            user.courses.remove(user_course)
                            removed_count += 1
                    
                    if removed_count > 0:
                        db.commit()
                        logger.info(f"✅ Cleanup complete: Removed {removed_count} courses.")
                except Exception as cleanup_err:
                    logger.error(f"Cleanup failed for {self.user_email}: {cleanup_err}")

            # Commit Phase 1 results
            db.commit()
            logger.info(f"✅ PHASE 1 COMPLETE: {len(courses_data)} courses visible for {self.user_email}")
            
            # CRITICAL: Release the session before starting Phase 2 (Content Sync)
            # This allows other users to use the connection while this user is doing deep sync
            user_id = user.id
            db.close()

            # PHASE 2: Content Sync (Deep)
            # Use a semaphored approach to prevent overwhelming the DB/API
            semester_semaphore = asyncio.Semaphore(1) 
            
            async def deep_sync_course(course_data):
                async with semester_semaphore:
                    task_db = SessionLocal()
                    try:
                        c_id = course_data['id']
                        c_name = course_data['name']
                        
                        # Fetch/Update professor name
                        professor_name = "Unknown Professor"
                        try:
                            service = await self.gc_client._get_service()
                            from app.utils.google_lock import GoogleApiLock
                            async with GoogleApiLock.get_lock():
                                teachers_result = await asyncio.to_thread(
                                    lambda: service.courses().teachers().list(courseId=c_id).execute()
                                )
                            teachers = teachers_result.get('teachers', [])
                            if teachers:
                                professor_name = teachers[0].get('profile', {}).get('name', {}).get('fullName', 'Unknown')
                                
                                # Update DB immediately
                                dbc = task_db.query(Course).filter(Course.id == c_id).first()
                                if dbc:
                                    dbc.professor = professor_name
                                    task_db.commit()
                        except Exception as prof_err:
                            logger.error(f"  Error fetching prof for {c_name}: {prof_err}")

                        logger.info(f"  PHASE 2: Syncing content for {c_name}...")
                        await self._sync_course_content(task_db, c_id, c_name, professor_name, user_id)
                    except Exception as e:
                        logger.error(f"  PHASE 2 ERROR [{c_name}]: {e}")
                    finally:
                        task_db.close()

            # Run content sync tasks in parallel
            await asyncio.gather(*(deep_sync_course(c) for c in courses_data))
            logger.info(f"✅ FULL SYNC COMPLETE for {self.user_email}")
            return
            
        except Exception as e:
            logger.error(f"Sync failed for {self.user_email}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Safety net closure
            try:
                db.close()
            except:
                pass

    async def _sync_course_content(self, db, course_id: str, course_name: str, professor_name: str, user_id: int):
        """Sync a single course's content to Supermemory, avoiding duplicates."""
        try:
            # 1. Fetch existing source IDs to prevent duplicates
            existing_ids = await self._get_existing_source_ids(course_id)
            logger.info(f"  Existing items in Supermemory for {course_id}: {len(existing_ids)}")

            # Build a set of existing local material IDs for fast upsert checks
            try:
                existing_local_ids = set(
                    row[0] for row in db.query(Material.id).filter(Material.course_id == course_id).all()
                )
                logger.info(f"  Existing local materials for course {course_id}: {len(existing_local_ids)}")
            except Exception as e:
                logger.error(f"Failed to query existing local materials for course {course_id}: {e}")
                existing_local_ids = set()

            # Sync Coursework (Assignments)
            UsageTracker.log_lms_request(self.user_email, 1, db=db)
            coursework = await self.gc_client.get_coursework(course_id)
            for work in coursework:
                item_id = work.get('id')
                due_date_str = self._format_date(work.get('dueDate'))
                title = work.get('title', 'Classroom Assignment')
                desc = work.get('description', '')[:500]
                content, attachments = self._format_rich_item(work, due_date_str, "Assignment")

                # 1. Save to local DB (upsert: skip if exists, ensure user_id is set)
                try:
                    if item_id in existing_local_ids:
                        # Update user_id if missing
                        existing_mat = db.query(Material).filter(Material.id == item_id).first()
                        if existing_mat and not existing_mat.user_id:
                            existing_mat.user_id = user_id
                    else:
                        db_mat = Material(
                            id=item_id,
                            user_id=user_id,
                            course_id=course_id,
                            title=title,
                            content=desc,
                            type="assignment",
                            due_date=due_date_str,
                            created_at=work.get('creationTime'),
                            attachments=json.dumps(attachments),
                            source_link=work.get('alternateLink')
                        )
                        db.add(db_mat)
                        existing_local_ids.add(item_id)
                except Exception as db_e:
                    logger.error(f"Failed to prepare assignment for DB: {db_e}")
                    db.rollback()

                    # PHASE 2.5: Deep Parsing of Attachments (New logic)
                    attachment_text = ""
                    if work.get('materials'):
                        logger.info(f"    🔍 Parsing attachments for assignment: {title}")
                        attachment_text = await self._get_attachments_content(work.get('materials'))
                    
                    full_content = content
                    if attachment_text:
                        full_content += f"\n\n--- DOCUMENT CONTENT ---\n{attachment_text}"

                    # 2. Sync to Supermemory if not already exists
                    if item_id not in existing_ids:
                        metadata = {
                            "user_id": self.user_email,
                            "course_id": course_id,
                            "course_name": course_name,
                            "professor": professor_name,
                            "type": "assignment",
                            "due_date": due_date_str,
                            "source": "google_classroom",
                            "source_id": item_id,
                            "created_at": work.get('creationTime'),
                            "attachments": json.dumps(attachments),
                            "source_link": work.get('alternateLink')
                        }
                        if await self.sm_client.add_document(full_content, metadata, title=title, description=desc[:200]):
                            logger.info(f"  -> Synced Assignment to Supermemory: {title}")
                            existing_ids.add(item_id)
                            UsageTracker.log_index_event(self.user_email, content=full_content)
            
            # Batch commit for assignments
            try:
                await asyncio.to_thread(db.commit)
            except Exception as e:
                logger.error(f"Failed to commit assignments batch: {e}")
                db.rollback()

            # Sync Course Materials
            UsageTracker.log_lms_request(self.user_email, 1, db=db)
            materials_list = await self.gc_client.get_materials(course_id)
            for mat in materials_list:
                item_id = mat.get('id')
                title = mat.get('title', 'Course Material')
                desc = mat.get('description', '')[:500]
                content, attachments = self._format_rich_item(mat, None, "Course Material")

                # 1. Save to local DB (upsert: skip if exists, ensure user_id is set)
                try:
                    if item_id in existing_local_ids:
                        existing_mat = db.query(Material).filter(Material.id == item_id).first()
                        if existing_mat and not existing_mat.user_id:
                            existing_mat.user_id = user_id
                    else:
                        db_mat = Material(
                            id=item_id,
                            user_id=user_id,
                            course_id=course_id,
                            title=title,
                            content=desc,
                            type="material",
                            due_date=None,
                            created_at=mat.get('creationTime'),
                            attachments=json.dumps(attachments),
                            source_link=mat.get('alternateLink')
                        )
                        db.add(db_mat)
                        existing_local_ids.add(item_id)
                        logger.info(f"  + Added Material to Local DB: {title}")
                except Exception as db_e:
                    logger.error(f"Failed to prepare material for DB: {db_e}")
                    db.rollback()

                    # PHASE 2.5: Deep Parsing
                    attachment_text = ""
                    if mat.get('materials'):
                        logger.info(f"    🔍 Parsing attachments for material: {title}")
                        attachment_text = await self._get_attachments_content(mat.get('materials'))
                    
                    full_content = content
                    if attachment_text:
                        full_content += f"\n\n--- DOCUMENT CONTENT ---\n{attachment_text}"

                    # 2. Sync to Supermemory if not already exists
                    if item_id not in existing_ids:
                        metadata = {
                            "user_id": self.user_email,
                            "course_id": course_id,
                            "course_name": course_name,
                            "professor": professor_name,
                            "type": "material",
                            "source": "google_classroom",
                            "source_id": item_id,
                            "created_at": mat.get('creationTime'),
                            "attachments": json.dumps(attachments),
                            "source_link": mat.get('alternateLink')
                        }
                        if await self.sm_client.add_document(full_content, metadata, title=title, description=desc[:200]):
                            logger.info(f"  -> Synced Material to Supermemory: {title}")
                            existing_ids.add(item_id)
                            UsageTracker.log_index_event(self.user_email, content=full_content)
            
            # Batch commit for materials
            try:
                await asyncio.to_thread(db.commit)
            except Exception as e:
                logger.error(f"Failed to commit materials batch: {e}")
                db.rollback()

            # Sync Announcements
            UsageTracker.log_lms_request(self.user_email, 1, db=db)
            announcements = await self.gc_client.get_announcements(course_id)
            for ann in announcements:
                item_id = ann.get('id')
                text = ann.get('text', '')
                if not text: continue
                
                title = f"Announcement in {course_name}"
                desc = text[:500]
                content = f"Announcement from {professor_name} in {course_name}:\n{text}"
                
                mats = ann.get('materials', [])
                attachments = []
                if mats:
                    mat_text, attachments = self._format_materials(mats)
                    content += "\nAttached Resources:\n" + mat_text

                # 1. Save to local DB (upsert: skip if exists, ensure user_id is set)
                if item_id:
                    try:
                        if item_id in existing_local_ids:
                            existing_mat = db.query(Material).filter(Material.id == item_id).first()
                            if existing_mat and not existing_mat.user_id:
                                existing_mat.user_id = user_id
                        else:
                            db_mat = Material(
                                id=item_id,
                                user_id=user_id,
                                course_id=course_id,
                                title=title,
                                content=desc,
                                type="announcement",
                                due_date=None,
                                created_at=ann.get('creationTime'),
                                attachments=json.dumps(attachments),
                                source_link=ann.get('alternateLink')
                            )
                            db.add(db_mat)
                            existing_local_ids.add(item_id)
                            logger.info(f"  + Added Announcement to Local DB: {text[:20]}...")
                    except Exception as db_e:
                        logger.error(f"Failed to prepare announcement for DB: {db_e}")
                        db.rollback()

                    # PHASE 2.5: Deep Parsing
                    attachment_text = ""
                    if mats:
                        logger.info(f"    🔍 Parsing attachments for announcement...")
                        attachment_text = await self._get_attachments_content(mats)
                    
                    full_content = content
                    if attachment_text:
                        full_content += f"\n\n--- DOCUMENT CONTENT ---\n{attachment_text}"

                    # 2. Sync to Supermemory if not already exists
                    if item_id and item_id not in existing_ids:
                        metadata = {
                            "user_id": self.user_email,
                            "course_id": course_id,
                            "course_name": course_name,
                            "professor": professor_name,
                            "type": "announcement",
                            "source": "google_classroom",
                            "source_id": item_id,
                            "created_at": ann.get('creationTime'),
                            "attachments": json.dumps(attachments),
                            "source_link": ann.get('alternateLink')
                        }
                         
                        if await self.sm_client.add_document(full_content, metadata, title=title, description=desc[:200]):
                            logger.info(f"  -> Synced Announcement to Supermemory: {text[:20]}...")
                            existing_ids.add(item_id)
                            UsageTracker.log_index_event(self.user_email, content=full_content)
            
            # Batch commit for announcements
            try:
                await asyncio.to_thread(db.commit)
            except Exception as e:
                logger.error(f"Failed to commit announcements batch: {e}")
                db.rollback()
            
        except Exception as e:
            logger.error(f"Error syncing content for {course_id}: {e}")
            traceback.print_exc()

    async def _get_existing_source_ids(self, course_id: str) -> set:
        """Query Supermemory for existing items in this course to avoid duplicates."""
        existing_ids = set()
        try:
            # We filter by course_id and user_id
            filters = {
                "AND": [
                    {"key": "course_id", "value": course_id},
                    {"key": "user_id", "value": self.user_email}
                ]
            }
            # Fetch a reasonable number of items. 
            # Ideally we paginate, but for now we fetch up to 100 recent items.
            results = await self.sm_client.search(query="*", filters=filters, limit=100)
            items = results.get("results", [])
            
            for item in items:
                meta = item.get("metadata", {})
                sid = meta.get("source_id")
                if sid:
                    existing_ids.add(sid)
                    
        except Exception as e:
            logger.error(f"Error fetching existing IDs from Supermemory: {e}")
            
        return existing_ids

    def _format_date(self, date_dict: dict) -> str:
        """Convert Google Date dict to ISO string YYYY-MM-DD."""
        if not date_dict:
            return None
        try:
            return f"{date_dict.get('year')}-{date_dict.get('month'):02d}-{date_dict.get('day'):02d}"
        except:
            return None

    def _format_rich_item(self, item: dict, due_date_str: str, label: str) -> tuple[str, list]:
        """Format an item including its materials/attachments. Returns (content_text, attachments_list)."""
        title = item.get('title', 'Untitled')
        description = item.get('description', 'No description')
        points = item.get('maxPoints', 'N/A')
        
        content = f"""
        {label}: {title}
        Description: {description}
        """
        if due_date_str:
            content += f"Due Date: {due_date_str}\n"
        if points != 'N/A':
            content += f"Max Points: {points}\n"
            
        materials = item.get('materials', [])
        attachments = []
        if materials:
            content += "\nAttachments & Resources:\n"
            mat_text, attachments = self._format_materials(materials)
            content += mat_text
            
        return content, attachments

    def _format_materials(self, materials: list) -> tuple[str, list]:
        """Helper to format Google Classroom material items into text and structured data."""
        lines = []
        attachments = []
        
        for m in materials:
            if 'driveFile' in m:
                df = m['driveFile']
                file_info = df.get('driveFile', {})
                title = file_info.get('title', 'Drive File')
                link = file_info.get('alternateLink', '')
                file_id = file_info.get('id', '')
                thumbnail = file_info.get('thumbnailUrl', '')
                mime_type = file_info.get('mimeType', 'application/octet-stream')
                
                # Determine file type from MIME type
                file_type = 'file'
                if 'pdf' in mime_type:
                    file_type = 'pdf'
                elif 'image' in mime_type:
                    file_type = 'image'
                elif 'document' in mime_type or 'word' in mime_type:
                    file_type = 'document'
                elif 'spreadsheet' in mime_type or 'excel' in mime_type:
                    file_type = 'spreadsheet'
                elif 'presentation' in mime_type or 'powerpoint' in mime_type:
                    file_type = 'presentation'
                
                lines.append(f"- [Drive] {title}: {link}")
                attachments.append({
                    "type": "drive",
                    "file_type": file_type,
                    "title": title,
                    "url": link,
                    "file_id": file_id,
                    "thumbnail": thumbnail,
                    "mime_type": mime_type,
                    "icon": "file"
                })
            elif 'youtubeVideo' in m:
                yt = m['youtubeVideo']
                title = yt.get('title', 'Video')
                link = yt.get('alternateLink', '')
                video_id = yt.get('id', '')
                thumbnail = f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg" if video_id else ''
                
                lines.append(f"- [Video] {title}: {link}")
                attachments.append({
                    "type": "video",
                    "file_type": "youtube",
                    "title": title,
                    "url": link,
                    "video_id": video_id,
                    "thumbnail": thumbnail,
                    "icon": "youtube"
                })
            elif 'link' in m:
                l = m['link']
                title = l.get('title', 'Link')
                url = l.get('url', '')
                thumbnail = l.get('thumbnailUrl', '')
                
                lines.append(f"- [Web] {title}: {url}")
                attachments.append({
                    "type": "link",
                    "file_type": "web",
                    "title": title,
                    "url": url,
                    "thumbnail": thumbnail,
                    "icon": "link"
                })
            elif 'form' in m:
                f = m['form']
                title = f.get('title', 'Form')
                url = f.get('formUrl', '')
                form_id = f.get('formId', '')
                thumbnail = f.get('thumbnailUrl', '')
                
                lines.append(f"- [Form] {title}: {url}")
                attachments.append({
                    "type": "form",
                    "file_type": "google_form",
                    "title": title,
                    "url": url,
                    "form_id": form_id,
                    "thumbnail": thumbnail,
                    "icon": "form"
                })
        
        text = "\n".join(lines) if lines else "None"
        return text, attachments

    async def _get_attachments_content(self, materials: list) -> str:
        """Fetch and parse text from attachments if they are Drive files (PDFs, Docs, etc.)."""
        from app.lms.drive_service import DriveSyncService
        
        drive_service = DriveSyncService(
            self.gc_client.creds.token, 
            self.user_email, 
            self.gc_client.creds.refresh_token
        )
        
        extracted_texts = []
        for m in materials:
            if 'driveFile' in m:
                df = m['driveFile']
                file_info = df.get('driveFile', {})
                file_id = file_info.get('id')
                if not file_id: continue
                
                try:
                    # Classroom metadata doesn't always have mimeType. Fetch full meta if needed.
                    if 'mimeType' not in file_info:
                        service = await drive_service._get_service()
                        from app.utils.google_lock import GoogleApiLock
                        async with GoogleApiLock.get_lock():
                            file_info = await asyncio.to_thread(
                                lambda: service.files().get(fileId=file_id, fields="id, name, mimeType").execute()
                            )
                    
                    # Reuse DriveSyncService's complex extraction logic
                    content = await drive_service._get_file_content(file_info)
                    if content and len(content.strip()) > 50:
                        extracted_texts.append(f"--- Document Attachment: {file_info.get('name', 'Untitled')} ---\n{content}\n")
                except Exception as e:
                    logger.warning(f"Failed to parse classroom attachment {file_id}: {e}")
        
        return "\n".join(extracted_texts) if extracted_texts else ""

