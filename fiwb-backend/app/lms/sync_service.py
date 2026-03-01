from app.lms.google_classroom import GoogleClassroomClient
from app.database import SessionLocal
from app.models import User, Course, Material
from datetime import datetime
import asyncio
import json
import logging
import traceback

from app.intelligence.usage import UsageTracker
from app.utils.email import standardize_email
from app.utils.clients import SharedClients

logger = logging.getLogger("uvicorn.error")

class LMSSyncService:
    def __init__(self, access_token: str, user_email: str, refresh_token: str = None):
        self.gc_client = GoogleClassroomClient(access_token, refresh_token)
        self.user_email = standardize_email(user_email)
        self.sm_client = SharedClients.get_supermemory()
        self.access_token = access_token
        self.refresh_token = refresh_token

    async def sync_all_courses(self, force_reindex: bool = False):
        """
        PHASE 1 (Fast, ~2s): Fetch course list, update DB, return.
        PHASE 2 (Background): Deep content sync, fire-and-forget.
        """
        db = SessionLocal()
        courses_data = []
        user_id = None

        try:
            logger.info(f"[Sync] Phase 1 starting for {self.user_email}")
            # Ensure user exists (self-healing race condition check)
            user = db.query(User).filter(User.email == self.user_email).first()
            if not user:
                logger.warning(f"[Sync] User {self.user_email} not found. Creating placeholder.")
                user = User(
                    email=self.user_email,
                    google_id=self.user_email, # temporary ID until next login
                    access_token=self.access_token,
                    refresh_token=self.refresh_token
                )
                db.add(user)
                db.commit()
                db.refresh(user)

            user_id = user.id

            # Fetch courses with timeout
            try:
                courses_data = await asyncio.wait_for(self.gc_client.get_courses(), timeout=20.0)
                logger.info(f"[Sync] Got {len(courses_data)} courses from Google for {self.user_email}")
            except asyncio.TimeoutError:
                logger.error(f"[Sync] Google API timed out for {self.user_email}")
                return
            except Exception as e:
                logger.error(f"[Sync] Google API error for {self.user_email}: {e}")
                return

            # Upsert courses into DB
            active_ids = set()
            for c in courses_data:
                cid = c['id']
                active_ids.add(cid)
                db_course = db.query(Course).filter(Course.id == cid).first()
                if not db_course:
                    db_course = Course(
                        id=cid,
                        name=c['name'],
                        professor="Loading...",
                        platform="Google Classroom"
                    )
                    db.add(db_course)
                else:
                    db_course.name = c['name']

                if db_course not in user.courses:
                    user.courses.append(db_course)
                db_course.last_synced = datetime.utcnow()

            # Cleanup: Remove courses not in Google anymore.
            # SAFETY GUARD: Only run cleanup if we actually got data back.
            # If Google returns [] (due to error/timeout), DO NOT WIPE the database.
            if len(courses_data) > 0:
                active_ids = {c['id'] for c in courses_data}
                
                # Refresh user to ensure we have latest state
                db.refresh(user)
                
                for uc in list(user.courses):
                    if uc.platform == "Google Classroom" and uc.id not in active_ids:
                        logger.warning(f"[Sync] Removing course {uc.name} (no longer in Google)")
                        user.courses.remove(uc)
                db.commit()
            else:
                logger.warning("[Sync] Google returned 0 courses. Skipping cleanup to prevent accidental data wipe.")
            
            user.last_synced = datetime.utcnow()
            db.commit()
            logger.info(f"[Sync] Phase 1 DONE for {self.user_email} — {len(courses_data)} courses in DB")

        except Exception as e:
            logger.error(f"[Sync] Phase 1 failed for {self.user_email}: {e}")
            traceback.print_exc()
            try:    
                db.rollback()
            except:
                pass
            return
        finally:
            # ALWAYS release DB before Phase 2
            try:
                db.close()
            except:
                pass

        if not courses_data or not user_id:
            return

        # PHASE 2: Fire and forget — throttled by GlobalSyncManager
        from app.utils.concurrency import GlobalSyncManager

        async def deep_sync():
            async with GlobalSyncManager._user_semaphore:
                logger.info(f"[Sync] Phase 2 starting for {self.user_email}")
                for course_data in courses_data:
                    task_db = SessionLocal()
                    try:
                        cid = course_data['id']
                        cname = course_data['name']

                        # Get professor name (best effort, 403 is silently ignored)
                        professor = "Unknown Professor"
                        try:
                            teachers = await asyncio.wait_for(
                                self.gc_client.get_teachers(cid),
                                timeout=5.0
                            )
                            if teachers:
                                professor = teachers[0].get('profile', {}).get('name', {}).get('fullName', 'Unknown')
                            db_c = task_db.query(Course).filter(Course.id == cid).first()
                            if db_c and professor != "Unknown Professor":
                                db_c.professor = professor
                                task_db.commit()
                        except Exception:
                            pass

                        await self._sync_course_content(task_db, cid, cname, professor, user_id, force_reindex=force_reindex)

                    except Exception as e:
                        logger.error(f"[Sync] Phase 2 error [{course_data.get('name')}]: {e}")
                    finally:
                        try:
                            task_db.close()
                        except:
                            pass
                        await asyncio.sleep(0.5)  # Gentle gap between courses

                logger.info(f"[Sync] Phase 2 COMPLETE for {self.user_email}")

        asyncio.create_task(deep_sync())

    async def _sync_course_content(self, db, course_id: str, course_name: str, professor: str, user_id: int, force_reindex: bool = False):
        """Sync all content for a single course. Uses local DB for dedup (no Supermemory round-trip)."""
        try:
            # Fast local dedup — one SQL query, no network call
            existing_local_ids = set(
                row[0] for row in db.query(Material.id).filter(Material.course_id == course_id).all()
            )

            # Fetch content types SEQUENTIALLY — httplib2 is not thread-safe.
            # asyncio.gather with to_thread on the same service object = segfault.
            coursework = []
            materials_list = []
            announcements = []

            try:
                coursework = await self.gc_client.get_coursework(course_id)
                UsageTracker.log_lms_request(self.user_email)
            except Exception as e:
                logger.warning(f"[Sync] Coursework fetch failed for {course_id}: {e}")

            try:
                materials_list = await self.gc_client.get_materials(course_id)
                UsageTracker.log_lms_request(self.user_email)
            except Exception as e:
                logger.warning(f"[Sync] Materials fetch failed for {course_id}: {e}")

            try:
                announcements = await asyncio.wait_for(self.gc_client.get_announcements(course_id), timeout=15.0)
                UsageTracker.log_lms_request(self.user_email)
            except Exception as e:
                logger.warning(f"[Sync] Announcements fetch failed for {course_id}: {e}")

            new_materials = []

            # --- Assignments ---
            for work in coursework:
                item_id = work.get('id')
                if not item_id: continue
                
                title = work.get('title', 'Assignment')
                desc = work.get('description', '')[:1000]
                due = self._format_date(work.get('dueDate'))
                content, attachments = self._format_rich_item(work, due, "Assignment")

                # Index the assignment
                if force_reindex or item_id not in existing_local_ids:
                    asyncio.create_task(self._index_item(
                        content, title, desc, item_id, course_id, course_name, professor, "assignment", work.get('alternateLink')
                    ))

                if item_id in existing_local_ids:
                    # HEAL: If existing item is missing attachments or has old content style, update it
                    existing = db.query(Material).filter(Material.id == item_id).first()
                    if existing:
                        updated = False
                        if attachments and (not existing.attachments or existing.attachments == '[]'):
                            existing.attachments = json.dumps(attachments)
                            updated = True
                        if existing.content != content:
                            existing.content = content
                            updated = True
                        if updated:
                            db.commit()
                            logger.info(f"[Sync] HEALED assignment: {title}")
                    continue

                new_materials.append(Material(
                    id=item_id,
                    user_id=user_id,
                    course_id=course_id,
                    title=title,
                    content=content, # Use rich content
                    type="assignment",
                    due_date=due,
                    created_at=work.get('creationTime'),
                    attachments=json.dumps(attachments),
                    source_link=work.get('alternateLink')
                ))
                existing_local_ids.add(item_id)

            # --- Materials ---
            for mat in materials_list:
                item_id = mat.get('id')
                if not item_id: continue
                
                title = mat.get('title', 'Material')
                desc = mat.get('description', '')[:1000]
                content, attachments = self._format_rich_item(mat, None, "Course Material")

                if force_reindex or item_id not in existing_local_ids:
                    asyncio.create_task(self._index_item(
                        content, title, desc, item_id, course_id, course_name, professor, "material", mat.get('alternateLink')
                    ))

                if item_id in existing_local_ids:
                    # HEAL: If existing item is missing attachments or has old content style, update it
                    existing = db.query(Material).filter(Material.id == item_id).first()
                    if existing:
                        updated = False
                        if attachments and (not existing.attachments or existing.attachments == '[]'):
                            existing.attachments = json.dumps(attachments)
                            updated = True
                        if existing.content != content:
                            existing.content = content
                            updated = True
                        if updated:
                            db.commit()
                            logger.info(f"[Sync] HEALED material: {title}")
                    continue

                new_materials.append(Material(
                    id=item_id,
                    user_id=user_id,
                    course_id=course_id,
                    title=title,
                    content=content,
                    type="material",
                    due_date=None,
                    created_at=mat.get('creationTime'),
                    attachments=json.dumps(attachments),
                    source_link=mat.get('alternateLink')
                ))
                existing_local_ids.add(item_id)

            # --- Announcements ---
            for ann in announcements:
                item_id = ann.get('id')
                if not item_id: continue
                
                text = ann.get('text', '')
                ann_materials = ann.get('materials', [])
                
                # LOGGING: Help us debug exactly what Classroom is sending
                logger.info(f"[Sync] Processing announcement {item_id}. Text: {len(text)} chars. Materials: {len(ann_materials)}")

                # If no text AND no materials, skip
                if not text and not ann_materials:
                    continue
                
                title = f"Announcement from {professor}" if professor else "Announcement"
                
                # Build rich content
                # We only keep the raw text because the frontend now handles attachments visually
                content = text
                attachments = []
                if ann_materials:
                    _, attachments = self._format_materials(ann_materials)
                    logger.info(f"[Sync] Found {len(attachments)} attachments for announcement {item_id}")

                # Index the announcement text itself
                if force_reindex or item_id not in existing_local_ids:
                    # Index with announcement title
                    idx_title = f"{course_name}: {title}"
                    asyncio.create_task(self._index_item(
                        content, idx_title, content[:1000], item_id, course_id, course_name, professor, "announcement", ann.get('alternateLink')
                    ))

                    # Index every Drive file attached to this announcement
                    if ann_materials:
                        asyncio.create_task(self._index_announcement_drive_files(
                            ann_materials, item_id, text, course_id, course_name, professor
                        ))

                if item_id in existing_local_ids:
                    # HEAL: If existing item is missing attachments or has old content style, update it
                    existing = db.query(Material).filter(Material.id == item_id).first()
                    if existing:
                        updated = False
                        if attachments and (not existing.attachments or existing.attachments == '[]'):
                            existing.attachments = json.dumps(attachments)
                            updated = True
                        if existing.content != content:
                            existing.content = content
                            updated = True
                        if existing.title != title:
                            existing.title = title
                            updated = True
                        if updated:
                            db.commit()
                            logger.info(f"[Sync] HEALED announcement for {course_name}")
                    continue

                new_materials.append(Material(
                    id=item_id,
                    user_id=user_id,
                    course_id=course_id,
                    title=title,
                    content=content, # Save richer content (full text + attachment references)
                    type="announcement",
                    due_date=None,
                    created_at=ann.get('creationTime'),
                    attachments=json.dumps(attachments),
                    source_link=ann.get('alternateLink')
                ))
                existing_local_ids.add(item_id)


            # Bulk insert all new items in one transaction
            if new_materials:
                for m in new_materials:
                    db.add(m)
                db.commit()
                logger.info(f"[Sync] Saved {len(new_materials)} new items for '{course_name}'")
            else:
                logger.info(f"[Sync] No new items for '{course_name}' (already up to date)")

        except Exception as e:
            logger.error(f"[Sync] Content sync error for {course_id}: {e}")
            traceback.print_exc()
            try:
                db.rollback()
            except:
                pass

    async def _index_item(self, content, title, desc, item_id, course_id, course_name, professor, item_type, source_link):
        """Fire-and-forget Supermemory indexing. Errors here never affect the main sync."""
        try:
            metadata = {
                "title": title, # ESSENTIAL: Used for source labeling in the UI
                "user_id": self.user_email,
                "course_id": course_id,
                "course_name": course_name,
                "professor": professor,
                "type": item_type,
                "source_id": item_id,
                "source": "google_classroom",
                "source_link": source_link
            }
            await self.sm_client.add_document(content, metadata, title=title, description=desc[:200])
            UsageTracker.log_index_event(self.user_email, content)
        except Exception as e:
            logger.warning(f"[Sync] Supermemory index failed for {item_id}: {e}")

    async def _index_announcement_drive_files(
        self, materials: list, ann_id: str, ann_text: str,
        course_id: str, course_name: str, professor: str
    ):
        """
        Finds and indexes ALL Drive files referenced by an announcement:
          1. Proper driveFile attachments (pinned from Google Drive)
          2. Link-type attachments whose URL is a Google Drive/Docs URL
          3. Raw Google Drive / Docs URLs pasted directly in the announcement text
        Each file is downloaded, extracted (PDF/Docs/Sheets/etc.), and indexed
        into Supermemory with full course + professor context.
        """
        import re
        from app.lms.drive_service import DriveSyncService
        from app.utils.locks import GLOBAL_API_LOCK

        drive_svc = DriveSyncService(self.access_token, self.user_email, self.refresh_token)

        # Collect {file_id: {title, link, mime}} — dict deduplicates across all sources
        files_to_process = {}

        # ── SOURCE 1: Proper driveFile attachments ───────────────────────────────
        for mat in materials:
            if 'driveFile' in mat:
                df = mat['driveFile'].get('driveFile', {})
                fid = df.get('id', '')
                if fid and fid not in files_to_process:
                    files_to_process[fid] = {
                        'title': df.get('title', 'Drive File'),
                        'link':  df.get('alternateLink', ''),
                        'mime':  df.get('mimeType', ''),
                    }

            # ── SOURCE 2: Link-type attachment with a Google Drive/Docs URL ──────
            elif 'link' in mat:
                url = mat['link'].get('url', '')
                fid, mime = self._extract_drive_file_id_and_mime(url)
                if fid and fid not in files_to_process:
                    files_to_process[fid] = {
                        'title': mat['link'].get('title', 'Drive File'),
                        'link':  url,
                        'mime':  mime,   # may be empty — resolved via API below
                    }

        # ── SOURCE 3: Raw Drive URLs pasted directly in the announcement text ────
        drive_url_re = re.compile(
            r'https://(?:'
            r'docs\.google\.com/(?:document|spreadsheets|presentation|forms)/d/'
            r'|drive\.google\.com/(?:file/d/|open\?id=)'
            r')([a-zA-Z0-9_-]+)',
            re.IGNORECASE
        )
        for m in drive_url_re.finditer(ann_text):
            full_url = m.group(0)
            fid, mime = self._extract_drive_file_id_and_mime(full_url)
            if fid and fid not in files_to_process:
                files_to_process[fid] = {
                    'title': 'Drive File from Announcement',
                    'link':  full_url,
                    'mime':  mime,
                }

        if not files_to_process:
            return

        # ── Process each unique file ──────────────────────────────────────────────
        for file_id, info in files_to_process.items():
            file_title = info['title']
            file_link  = info['link']
            mime       = info['mime']
            try:
                # If MIME is unknown, resolve it via Drive API
                if not mime:
                    try:
                        service = await drive_svc._get_service()
                        async with GLOBAL_API_LOCK:
                            meta = await asyncio.to_thread(
                                lambda: service.files().get(
                                    fileId=file_id,
                                    fields='id,name,mimeType,webViewLink'
                                ).execute()
                            )
                        mime = meta.get('mimeType', '')
                        if file_title in ('Drive File from Announcement', 'Drive File'):
                            file_title = meta.get('name', file_title)
                        if not file_link:
                            file_link = meta.get('webViewLink', '')
                    except Exception as e:
                        logger.warning(f"[Sync] Could not resolve Drive metadata for {file_id}: {e}")
                        continue   # Skip file if we can't even determine its type

                file_meta = {'id': file_id, 'mimeType': mime, 'name': file_title}
                extracted = await drive_svc._get_file_content(file_meta)

                if extracted and len(extracted.strip()) >= 50:
                    full_content = (
                        f"Course Material (Drive File) shared by {professor} in {course_name}\n"
                        f"From Announcement: {ann_text[:400]}\n\n"
                        f"--- File: {file_title} ---\n{extracted}"
                    )
                else:
                    # Unextractable (image, empty) — index metadata so AI knows it exists
                    full_content = (
                        f"Drive file '{file_title}' shared by {professor} in {course_name}.\n"
                        f"Announcement: {ann_text[:600]}"
                    )

                metadata = {
                    "title":                  file_title, # ADDED: Crucial for UI source labeling
                    "user_id":                self.user_email,
                    "course_id":              course_id,
                    "course_name":            course_name,
                    "professor":              professor,
                    "type":                   "announcement_drive_attachment",
                    "source_id":              f"ann_att_{file_id}",
                    "source":                 "google_classroom",
                    "source_link":            file_link,
                    "file_title":             file_title,
                    "mime_type":              mime,
                    "parent_announcement_id": ann_id,
                }

                # --- Step 2: Persist to Local Database ---
                try:
                    from app.database import SessionLocal
                    from app.models import Material
                    import json
                    from datetime import datetime

                    db = SessionLocal()
                    try:
                        # Check if already exists in this course
                        existing = db.query(Material).filter(
                            Material.id == f"ann_att_{file_id}",
                            Material.course_id == course_id
                        ).first()

                        if not existing:
                            new_mat = Material(
                                id=f"ann_att_{file_id}",
                                user_id=None, # Will be fixed by sync_service's orphan cleaner
                                course_id=course_id,
                                title=file_title,
                                content=full_content,
                                type="drive_file",
                                created_at=datetime.utcnow().isoformat() + "Z",
                                attachments=json.dumps([{
                                    "type": "drive", 
                                    "file_type": "pdf" if "pdf" in mime else "document",
                                    "title": file_title, "url": file_link, "file_id": file_id
                                }]),
                                source_link=file_link
                            )
                            db.add(new_mat)
                            db.commit()
                            logger.info(f"[Sync] Saved announcement attachment '{file_title}' to database")
                    finally:
                        db.close()
                except Exception as db_err:
                    logger.warning(f"[Sync] Failed to save Drive attachment to DB: {db_err}")

                logger.info(f"[Sync] Indexed Drive file '{file_title}' from announcement {ann_id} ({course_name})")

            except Exception as e:
                logger.warning(f"[Sync] Failed to index Drive file '{file_title}' (ann={ann_id}): {e}")

    def _extract_drive_file_id_and_mime(self, url: str) -> tuple:
        """
        Parse a Google Drive / Docs URL and return (file_id, mime_type).
        mime_type is empty for drive.google.com/file URLs — caller must resolve via API.
        """
        import re
        MIME_MAP = {
            'document':     'application/vnd.google-apps.document',
            'spreadsheets': 'application/vnd.google-apps.spreadsheet',
            'presentation': 'application/vnd.google-apps.presentation',
            'forms':        'application/vnd.google-apps.form',
        }
        # docs.google.com/{type}/d/{id}
        m = re.search(
            r'docs\.google\.com/(document|spreadsheets|presentation|forms)/d/([a-zA-Z0-9_-]+)',
            url, re.IGNORECASE
        )
        if m:
            return m.group(2), MIME_MAP.get(m.group(1), '')

        # drive.google.com/file/d/{id}
        m = re.search(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', url, re.IGNORECASE)
        if m:
            return m.group(1), ''   # MIME unknown

        # drive.google.com/open?id={id}
        m = re.search(r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)', url, re.IGNORECASE)
        if m:
            return m.group(1), ''   # MIME unknown

        return '', ''

    def _format_date(self, date_dict: dict) -> str:
        if not date_dict:
            return None
        try:
            return f"{date_dict.get('year')}-{date_dict.get('month'):02d}-{date_dict.get('day'):02d}"
        except:
            return None

    def _format_rich_item(self, item: dict, due_date_str: str, label: str) -> tuple:
        # Only store the raw description in the content field, avoiding redundant prefixes or material lists.
        # The frontend now handles attachments visually.
        description = item.get('description', '')
        
        content = description
        attachments = []
        materials = item.get('materials', [])
        if materials:
            _, attachments = self._format_materials(materials)
        return content, attachments

    def _format_materials(self, materials: list) -> tuple:
        lines = []
        attachments = []
        for m in materials:
            if 'driveFile' in m:
                df = m['driveFile'].get('driveFile', {})
                title = df.get('title', 'Drive File')
                link = df.get('alternateLink', '')
                mime = df.get('mimeType', '')
                fid = df.get('id', '')
                thumb = df.get('thumbnailUrl', '')
                ftype = 'pdf' if 'pdf' in mime else 'document' if 'document' in mime else 'presentation' if 'presentation' in mime else 'spreadsheet' if 'spreadsheet' in mime else 'file'
                lines.append(f"- [Drive] {title}: {link}")
                attachments.append({
                    "type": "drive", "file_type": ftype, "title": title,
                    "url": link, "file_id": fid, "thumbnail": thumb, "mime_type": mime
                })
            elif 'youtubeVideo' in m:
                yt = m['youtubeVideo']
                title = yt.get('title', 'Video')
                link = yt.get('alternateLink', '')
                vid = yt.get('id', '')
                lines.append(f"- [Video] {title}: {link}")
                attachments.append({
                    "type": "video", "file_type": "youtube", "title": title,
                    "url": link, "video_id": vid,
                    "thumbnail": f"https://img.youtube.com/vi/{vid}/mqdefault.jpg" if vid else ''
                })
            elif 'link' in m:
                l = m['link']
                title = l.get('title', 'Link')
                url = l.get('url', '')
                lines.append(f"- [Web] {title}: {url}")
                attachments.append({"type": "link", "file_type": "web", "title": title, "url": url})
            elif 'form' in m:
                f = m['form']
                title = f.get('title', 'Form')
                url = f.get('formUrl', '')
                lines.append(f"- [Form] {title}: {url}")
                attachments.append({"type": "form", "file_type": "google_form", "title": title, "url": url})
        return "\n".join(lines) or "None", attachments
