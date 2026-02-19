from fastapi import APIRouter, Depends, File, UploadFile, Form, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import base64
import pypdf
import io
import uuid
import json
import asyncio
import logging
from datetime import datetime

from app.database import get_db, SessionLocal
from app.models import User, ChatThread, ChatMessage
from app.intelligence.triage_agent import classify_query
from app.intelligence.retrieval import RetrievalOrchestrator
from app.intelligence.prompt_architect import PromptArchitect
from app.intelligence.memory_agent import MemoryAgent
from app.intelligence.usage import UsageTracker
from app.config import settings
from app.utils.email import standardize_email
from app.utils.clients import SharedClients

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

async def extract_text_from_file_threaded(file: UploadFile) -> str:
    """Extract text from PDF or TXT files using a thread pool to avoid blocking the event loop."""
    content = await file.read()
    
    def extract():
        if file.filename.endswith(".pdf"):
            try:
                pdf_reader = pypdf.PdfReader(io.BytesIO(content))
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() or ""
                return text
            except Exception as e:
                logger.error(f"PDF extraction failed: {e}")
                return ""
        elif file.filename.endswith(".txt"):
            return content.decode("utf-8", errors="ignore")
        return ""
    
    return await asyncio.to_thread(extract)

@router.get("/threads")
async def list_threads(user_email: str, db: Session = Depends(get_db)):
    actual_email = standardize_email(user_email)
    user = db.query(User).filter(User.email == actual_email).first()
    if not user: return []
    threads = db.query(ChatThread).filter(ChatThread.user_id == user.id).order_by(ChatThread.updated_at.desc()).all()
    return [{
        "id": t.id,
        "title": t.title,
        "updated_at": t.updated_at
    } for t in threads]

@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str, user_email: str, db: Session = Depends(get_db)):
    actual_email = standardize_email(user_email)
    user = db.query(User).filter(User.email == actual_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    thread = db.query(ChatThread).filter(ChatThread.id == thread_id, ChatThread.user_id == user.id).first()
    if not thread:
        raise HTTPException(status_code=403, detail="Not authorized")

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread_id).order_by(ChatMessage.created_at.asc()).all()
    return [{
        "role": m.role,
        "content": m.content,
        "file_name": m.file_name,
        "attachment_type": m.attachment_type,
        "attachment": m.attachment
    } for m in messages]

@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user_email: str, db: Session = Depends(get_db)):
    actual_email = standardize_email(user_email)
    user = db.query(User).filter(User.email == actual_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    thread = db.query(ChatThread).filter(ChatThread.id == thread_id, ChatThread.user_id == user.id).first()
    if not thread:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.query(ChatMessage).filter(ChatMessage.thread_id == thread_id).delete()
    db.delete(thread)
    db.commit()
    return {"status": "deleted"}

@router.post("/stream")
async def chat_stream(
    background_tasks: BackgroundTasks,
    message: str = Form(...),
    user_email: str = Form(...),
    thread_id: str = Form("new"), 
    history: str = Form(None), 
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    """Chat endpoint refactored for institutional high-concurrency scale."""
    actual_email = standardize_email(user_email)
    user = db.query(User).filter(User.email == actual_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User registration required.")
        
    # 1. Atomic Thread Logic
    if thread_id == "new":
        thread_id = str(uuid.uuid4())
        thread = ChatThread(id=thread_id, user_id=user.id, title=message[:40])
        db.add(thread)
    else:
        thread = db.query(ChatThread).filter(ChatThread.id == thread_id).first()
        if not thread:
            thread_id = str(uuid.uuid4())
            thread = ChatThread(id=thread_id, user_id=user.id, title=message[:40])
            db.add(thread)

    attachment_text, attachment_base64 = None, None
    file_name, file_type = None, None

    if file:
        file_name = file.filename
        file_type = file.content_type
        if file_type.startswith("image/"):
            raw_content = await file.read()
            base64_img = base64.b64encode(raw_content).decode("utf-8")
            attachment_base64 = f"data:{file_type};base64,{base64_img}"
        else:
            attachment_text = await extract_text_from_file_threaded(file)
            sm = SharedClients.get_supermemory()
            background_tasks.add_task(
                sm.add_document, 
                content=attachment_text,
                title=f"Chat Asset: {file_name}",
                metadata={"user_id": actual_email, "type": "chat_attachment", "thread_id": thread_id}
            )

    # 2. Persistence (Save user message)
    user_msg_db = ChatMessage(
        thread_id=thread_id, role="user", content=message,
        attachment=attachment_base64, attachment_type=file_type, file_name=file_name
    )
    db.add(user_msg_db)
    thread.updated_at = datetime.utcnow()
    db.commit()
    
    # Release core DB session before long-running streaming
    db.close() 

    # 3. Intelligence Multi-tasking
    async def generate():
        full_response = ""
        openai_client = SharedClients.get_openai()
        retriever = RetrievalOrchestrator(actual_email)
        
        try:
            yield f"data: THREAD_ID:{thread_id}\n\n"
            
            # Classification and Retrieval (Async Parallel)
            short_term_history = []
            if history:
                try: short_term_history = json.loads(history)
                except: pass

            # 1. Classification first to decide if we need retrieval
            yield f"data: EVENT:THINKING:Classifying intent...\n\n"
            q_type = await classify_query(message, attachment_base64)
            
            # 2. Retrieval (Skip if general chat)
            c_data = {}
            if q_type != "general_chat":
                yield f"data: EVENT:THINKING:Searching your academic vault...\n\n"
                c_data = await retriever.retrieve_context(message, q_type, history=short_term_history)
            else:
                yield f"data: EVENT:THINKING:Personalizing response...\n\n"
                # Even for general chat, we still fetch the profile for personalization
                c_data = await retriever.retrieve_context(message, "general_chat", history=short_term_history)
            
            # BROADCAST SOURCES (Dynamic) - ONLY if not general chat
            sources_dict = {}
            if q_type != "general_chat":
                prefixes = {"course_context": "📚 ", "assistant_knowledge": "📧 ", "chat_assets": "📎 ", "memories": "🧠 "}
                
                for cat, prefix in prefixes.items():
                    for item in c_data.get(cat, []):
                        meta = item.get("metadata", {})
                        
                        # Unified Title Logic (Matched with PromptArchitect)
                        course_name = meta.get('course_name') or meta.get('course_id') or ""
                        base_title = meta.get('title') or meta.get('file_name') or "Institutional Document"
                        full_title = f"{base_title} [{course_name}]" if course_name else base_title
                        
                        if full_title not in sources_dict:
                            sources_dict[full_title] = {
                                "title": full_title,
                                "display": f"{prefix}{full_title}",
                                "link": meta.get("source_link") or meta.get("url") or meta.get("webViewLink") or meta.get("link"),
                                "snippets": [item.get("content", "")],
                                "source_type": meta.get("type", "document")
                            }
                        else:
                            # Append more snippets (up to 3) for more complete context
                            if len(sources_dict[full_title]["snippets"]) < 3:
                                sources_dict[full_title]["snippets"].append(item.get("content", ""))

            # Convert to final sources list and join snippets
            final_sources = []
            for s in sources_dict.values():
                s["snippet"] = "\n--- [Next Section] ---\n".join([snp for snp in s["snippets"] if snp])
                del s["snippets"]
                final_sources.append(s)
            
            if final_sources and q_type != "general_chat":
                yield f"data: EVENT:THINKING:Broadcasting relevant sources...\n\n"
                yield f"data: EVENT:SOURCES:{json.dumps(final_sources[:15])}\n\n"
            yield f"data: EVENT:THINKING:Synthesizing response...\n\n"

            # CONSTRUCT SYSTEM PROMPT
            prompt_messages = PromptArchitect.build_prompt(
                user_query=message,
                retrieved_chunks=c_data.get("course_context", []),
                assistant_knowledge=c_data.get("assistant_knowledge", []),
                chat_assets=c_data.get("chat_assets", []),
                memories=c_data.get("memories", []),
                profile=c_data.get("profile", []),
                history=short_term_history,
                attachment_text=attachment_text,
                base64_image=attachment_base64 if file_type and file_type.startswith("image/") else None,
                query_type=q_type
            )

            # TOKEN ACCOUNTING
            input_tokens = UsageTracker.count_tokens(json.dumps(prompt_messages))
            
            # STREAM LLM
            response = await openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=prompt_messages,
                stream=True,
                temperature=0.7
            )
            
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    full_response += token
                    yield f"data: {json.dumps({'token': token})}\n\n"

            # OFFLOAD DEEP PERSISTENCE
            background_tasks.add_task(finalize_stream, thread_id, full_response, actual_email, message, short_term_history, q_type, input_tokens)
            
        except Exception as e:
            logger.error(f"Critical System Stream Failure: {e}", exc_info=True)
            yield f"data: {json.dumps({'token': '\n\n[Neural Link Reset]: The system encounterd a capacity issue. Please refresh.'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

async def finalize_stream(thread_id, response, email, query, history, q_type, in_tokens):
    """Offload heavy DB and AI tasks to background to unblock the main thread."""
    db = SessionLocal()
    try:
        # 1. Persist AI Message
        msg = ChatMessage(thread_id=thread_id, role="assistant", content=response)
        db.add(msg)
        db.commit()
        
        # 2. Token Auditing
        out_tokens = UsageTracker.count_tokens(response)
        UsageTracker.log_usage(email, in_tokens, is_input=True, category="llm", db=db)
        UsageTracker.log_usage(email, out_tokens, is_input=False, category="llm", db=db)
        
        # 3. Learning Synthesis (Digital Twin update)
        await MemoryAgent.synthesize_and_save(
            user_email=email, query=query, response=response,
            additional_context={"thread_id": thread_id, "type": q_type},
            conversation_history=history
        )
    except Exception as e:
        logger.error(f"Post-stream finalization failed: {e}")
    finally:
        db.close()
