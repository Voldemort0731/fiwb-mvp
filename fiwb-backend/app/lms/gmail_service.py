from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.models import Material, Course, User
from app.database import SessionLocal
from app.config import settings
from app.supermemory.client import SupermemoryClient
from openai import AsyncOpenAI
import datetime
import base64
import json
import logging
import asyncio

from app.utils.email import standardize_email

logger = logging.getLogger("uvicorn.error")

class GmailSyncService:

    def __init__(self, access_token: str, user_email: str, refresh_token: str = None):
        self.creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )
        self.user_email = standardize_email(user_email)
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.sm_client = SupermemoryClient()
        self.service = None 

    async def _get_service(self):
        """Thread-safe and async-safe service builder for the current instance."""
        if self.service is None:
            from app.utils.google_lock import GoogleApiLock
            async with GoogleApiLock.get_lock(): # Protect global SSL resources on macOS
                if self.service is None:
                    logger.info(f"Initializing Gmail Service for {self.user_email}...")
                    try:
                        self.service = await asyncio.to_thread(
                            lambda: build('gmail', 'v1', credentials=self.creds, static_discovery=True)
                        )
                    except Exception as e:
                        logger.error(f"Failed to initialize Gmail service for {self.user_email}: {e}")
                        raise e
        return self.service

    async def sync_recent_emails(self, limit=50):
        """
        Fetches only new emails, processes them up to the limit, 
        and maintains a strict recent-25 window in both local DB and Supermemory.
        """
        from app.intelligence.memory_agent import MemoryAgent
        
        db = SessionLocal()
        gmail_course = db.query(Course).filter(Course.id == "GMAIL_INBOX").first()
        if not gmail_course:
            gmail_course = Course(
                id="GMAIL_INBOX",
                name="Gmail",
                professor="Mail Service",
                platform="Gmail"
            )
            db.add(gmail_course)
            db.commit()

        user = db.query(User).filter(User.email == self.user_email).first()
        if user and gmail_course not in user.courses:
            user.courses.append(gmail_course)
            db.commit()

        # Capture all recent activity - 
        query = "-label:SPAM -label:TRASH"

        try:
            service = await self._get_service()
            from app.utils.google_lock import GoogleApiLock
            async with GoogleApiLock.get_lock():
                results = await asyncio.to_thread(
                    lambda: service.users().messages().list(userId='me', q=query, maxResults=limit).execute()
                )
        except Exception as e:
            logger.error(f"Gmail list failed: {e}")
            db.close()
            return 0

        messages = results.get('messages', [])
        
        # 1. Identify only NEW messages
        # Bulk query existing message IDs to avoid N+1 queries
        existing_ids = {m[0] for m in db.query(Material.id).filter(
            Material.course_id == "GMAIL_INBOX",
            Material.id.in_([m['id'] for m in messages])
        ).all()}
        
        new_messages = [m for m in messages if m['id'] not in existing_ids]
            
        if not new_messages:
            logger.info(f"No new emails for {self.user_email}")
            db.close()
            return 0

        logger.info(f"Syncing {len(new_messages)} new emails for {self.user_email}")
        stats = {"synced_count": 0}

        async def process_message(msg):
                msg_id = msg['id']
                task_db = SessionLocal()
                try:
                    # Fetch full content
                    service = await self._get_service()
                    from app.utils.google_lock import GoogleApiLock
                    async with GoogleApiLock.get_lock():
                        message = await asyncio.to_thread(
                            lambda: service.users().messages().get(userId='me', id=msg_id).execute()
                        )
                    
                    payload = message.get('payload', {})
                    headers = payload.get('headers', [])
                    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), "No Subject")
                    sender = next((h['value'] for h in headers if h['name'] == 'From'), "Unknown")
                    body_content = self._get_email_body(payload)
                    
                    # Extract Internal Date
                    internal_date_ms = int(message.get('internalDate', 0))
                    email_date = datetime.datetime.fromtimestamp(internal_date_ms / 1000.0).isoformat()
                    
                    # Analyze
                    try:
                        analysis = await asyncio.wait_for(
                            self._analyze_email_as_assistant(subject, sender, body_content, db=task_db),
                            timeout=15.0
                        )
                    except:
                        analysis = {"is_relevant": False}

                    # Save to Local DB
                    new_material = Material(
                        id=msg_id,
                        user_id=user.id,
                        course_id="GMAIL_INBOX",
                        title=f"Email: {subject}",
                        content=body_content[:2000],
                        type=analysis.get('label', 'context'),
                        created_at=email_date,
                        attachments=json.dumps(analysis.get('attachments', [])),
                        source_link=f"https://mail.google.com/mail/u/0/#inbox/{msg_id}"
                    )
                    task_db.add(new_material)
                    task_db.commit()
                    stats["synced_count"] += 1

                    # Index in Supermemory
                    if analysis.get('is_relevant'):
                        await self.sm_client.add_document(
                            content=f"SUBJECT: {subject}\nFROM: {sender}\n\n{analysis.get('summary')}\n\nDEEP CONTEXT:\n{analysis.get('deep_context')}\n\nBODY PREVIEW:\n{body_content[:1000]}",
                            title=f"Email: {subject}",
                            description=analysis.get('summary'),
                            metadata={
                                "user_id": self.user_email,
                                "gmail_id": msg_id,
                                "type": "assistant_knowledge",
                                "source": "gmail",
                                "category": analysis.get('label'),
                                "date": email_date,
                                "source_link": f"https://mail.google.com/mail/u/0/#inbox/{msg_id}"
                            }
                        )
                        # Log SM usage with the current task_db
                        UsageTracker.log_usage(self.user_email, 500, is_input=True, category="supermemory", db=task_db)
                except Exception as e:
                    logger.error(f"Error processing message {msg_id}: {e}")
                finally:
                    task_db.close()

        # Process new messages in batches with a semaphore to prevent pool exhaustion
        semaphore = asyncio.Semaphore(3)
        
        async def process_with_semaphore(msg):
            async with semaphore:
                await process_message(msg)

        batch_size = 10 # Process more at once but limited by semaphore
        for i in range(0, len(new_messages), batch_size):
            batch = new_messages[i:i + batch_size]
            await asyncio.gather(*(process_with_semaphore(m) for m in batch))
            await asyncio.sleep(0.1)
        
        # Update user last_synced
        if user:
            user.last_synced = datetime.datetime.utcnow()
            db.commit()
            
        db.close()
        return stats["synced_count"]

    async def _analyze_email_as_assistant(self, subject, sender, body, db=None):
        """Deep assistant analysis to extract actionable knowledge and context."""
        prompt = f"""
        You are an elite Personal Intelligence Assistant. 
        Extract any information that would help you better assist the user.
        
        SUBJECT: {subject}
        SENDER: {sender}
        BODY: {body[:2000]}
        
        IDENTIFY:
        1. DEEP CONTEXT: Personal appointments, travel plans, projects, or professional context.
        2. TASKS/DEADLINES: Anything the user needs to do or remember.
        3. INTEL: Sentiment (is the user stressed?), relationships (who is this person?), or preferences.
        
        JSON FORMAT:
        {{
            "is_relevant": true,
            "label": "appointment|task|project|context|alert",
            "summary": "Concise summary for the user",
            "deep_context": "Detailed background info for your memory",
            "deadline": "YYYY-MM-DD or null",
            "synthesize_to_memory": boolean // set to true if this reveals a long-term preference or life event
        }}
        """
        try:
            from app.intelligence.usage import UsageTracker
            UsageTracker.log_usage(self.user_email, UsageTracker.count_tokens(prompt), is_input=True, category="slm", db=db)
            
            response = await self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            res_content = response.choices[0].message.content
            UsageTracker.log_usage(self.user_email, UsageTracker.count_tokens(res_content), is_input=False, category="slm", db=db)
            return json.loads(res_content)
        except:
            return {"is_relevant": False}

    async def setup_watch(self, db):
        """Register for Gmail push notifications via Pub/Sub."""
        from app.config import settings
        topic_name = settings.GOOGLE_PUBSUB_TOPIC
        if not topic_name:
            logger.warning(f"No Pub/Sub topic configured. Gmail real-time sync disabled for {self.user_email}")
            return False

        try:
            request = {
                'topicName': topic_name
            }
            from app.utils.google_lock import GoogleApiLock
            async with GoogleApiLock.get_lock():
                service = await self._get_service()
                res = await asyncio.to_thread(
                    lambda: service.users().watch(userId='me', body=request).execute()
                )
            logger.info(f"✅ Gmail Watch active for {self.user_email}. History ID: {res.get('historyId')}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to setup Gmail Watch for {self.user_email}: {e}")
            return False

    def _get_email_body(self, payload):
        """Extract plain text body from email payload recursively."""
        body = ""
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body'].get('data')
                    if data:
                        # Pad base64 string
                        padding = len(data) % 4
                        if padding:
                            data += "=" * (4 - padding)
                        body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif 'parts' in part:
                    body += self._get_email_body(part) # Recursive call for nested parts
        else:
            data = payload['body'].get('data')
            if data:
                # Pad base64 string
                padding = len(data) % 4
                if padding:
                    data += "=" * (4 - padding)
                body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        return body
