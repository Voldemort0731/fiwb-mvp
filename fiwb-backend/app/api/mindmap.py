"""
mindmap.py — FIWB AI Mind Map Generation API
Extracts hierarchical concepts from course materials using GPT and returns
a graph structure suitable for ReactFlow visualization.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.models import User, Course, Material
from app.utils.email import standardize_email
from app.utils.clients import SharedClients
import json
import logging
import asyncio
from app.lms.drive_service import DriveSyncService

logger = logging.getLogger("uvicorn.error")
router = APIRouter()


MINDMAP_PROMPT = """You are an expert academic knowledge graph builder.

Analyze the following course materials and extract a hierarchical concept map.

STRICT RULES:
1. Return ONLY valid JSON — no markdown, no code blocks, no prose.
2. Create 1 root node (the course/topic name).
3. Create 3 to 6 main topic nodes (level 1).
4. Create 2 to 4 subtopic nodes per main topic (level 2).
5. Every node must have a concise definition (1 sentence).
6. **PRECISE CITATIONS**: For every concept, you MUST identify which document it came from and the EXACT page number.
   - Look for `--- [PAGE n] ---` and `--- [ATTACHMENT: title] ---` markers in the provided content.
   - The 'source' in JSON must match the [MATERIAL: title] or [ATTACHMENT: title] provided.
   - The 'page' must be a number (e.g. 5) extracted from the closest preceding `--- [PAGE n] ---` marker.

JSON FORMAT:
{{
  "title": "Course/Topic Name",
  "nodes": [
    {{
      "id": "node-unique-id",
      "label": "Concept Name",
      "level": 0,
      "definition": "...",
      "citations": [
        {{ "source": "Material Title", "page": 5, "snippet": "..." }}
      ]
    }}
  ],
  "edges": [
    {{
       "id": "edge-id",
       "source": "source-id",
       "target": "target-id",
       "label": "relationship",
       "type": "hierarchical"
    }}
  ]
}}

COURSE MATERIALS:
{content}
"""


@router.post("/generate")
async def generate_mindmap(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Generate a mind map for a given course.
    Accepts: { course_id, user_email, material_ids (optional) }
    Returns: { nodes, edges, title, sources }
    """
    user_email = payload.get("user_email")
    course_id = payload.get("course_id")
    material_ids = payload.get("material_ids", [])  # Optional: subset of materials

    if not user_email or not course_id:
        raise HTTPException(status_code=400, detail="user_email and course_id are required")

    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course not in user.courses:
        raise HTTPException(status_code=403, detail="Course not found or access denied")

    # Fetch materials
    query = db.query(Material).filter(
        Material.course_id == course_id,
        or_(Material.user_id == user.id, Material.user_id == None)
    )
    if material_ids:
        query = query.filter(Material.id.in_(material_ids))

    materials = query.order_by(Material.created_at.desc()).limit(20).all()

    if not materials:
        raise HTTPException(status_code=404, detail="No materials found for this course. Please sync your course first.")

    # ── CACHING LOGIC ──────────────────────────────────────
    from app.models import ChatThread
    target_thread = None
    # If single document, try to reuse cached mindmap from its analysis thread
    if material_ids and len(material_ids) == 1:
        target_thread = db.query(ChatThread).filter(
            ChatThread.user_id == user.id, 
            ChatThread.material_id == material_ids[0]
        ).order_by(ChatThread.updated_at.desc()).first()
    # Otherwise, check for a course-wide "Global" thread if no subset filter active
    elif not material_ids:
        target_thread = db.query(ChatThread).filter(
            ChatThread.user_id == user.id,
            ChatThread.course_id == course_id,
            ChatThread.material_id == None
        ).order_by(ChatThread.updated_at.desc()).first()

    if target_thread and target_thread.mindmap_data:
        logger.info(f"[MindMap] Returning cached mind map for context: {material_ids[0] if material_ids else 'Course Global'}")
        try:
            return json.loads(target_thread.mindmap_data)
        except:
            pass

    # Initialize Drive service for extracting content from attachments
    drive_service = DriveSyncService(user.access_token, user.email, user.refresh_token)

    # Build content blocks — cap each at 3000 chars to stay within context
    content_blocks = []
    source_list = []
    total_chars = 0
    MAX_CHARS = 40000

    async def process_material(m):
        material_text = f"[MATERIAL: {m.title}]\n"
        if m.content:
            material_text += m.content[:5000]
        else:
            material_text += "(No text content)"

        if m.attachments and m.attachments != "[]":
            try:
                attachments = json.loads(m.attachments)
                # Limit to 3 attachments per material
                tasks = []
                for att in attachments[:3]:
                    file_id = att.get("file_id") or att.get("id")
                    mime_type = att.get("mime_type") or att.get("mimeType")
                    if file_id and (att.get("type") in ["drive", "drive_file"] or "google-apps" in str(mime_type) or "pdf" in str(mime_type)):
                        tasks.append((att.get("title"), drive_service._get_file_content({"id": file_id, "mimeType": mime_type or ""})))
                
                if tasks:
                    results = await asyncio.gather(*(t[1] for t in tasks), return_exceptions=True)
                    for i, doc_content in enumerate(results):
                        if isinstance(doc_content, str) and doc_content:
                            title = tasks[i][0]
                            material_text += f"\n--- [ATTACHMENT: {title}] ---\n"
                            material_text += doc_content[:5000]
            except Exception as e:
                logger.warning(f"[MindMap] Failed to extract attachments for {m.id}: {e}")
        
        material_text += "\n---\n"
        return material_text

    # Extract all material content in parallel (limited to first 10 materials to avoid blowing up)
    extraction_tasks = [process_material(m) for m in materials[:10]]
    content_blocks = await asyncio.gather(*extraction_tasks)
    
    for i, block in enumerate(content_blocks):
        total_chars += len(block)
        if total_chars > MAX_CHARS:
            content_blocks = content_blocks[:i]
            break

    # Build source list correctly
    source_list = [{"id": m.id, "title": m.title, "type": m.type} for m in materials[:len(content_blocks)]]

    combined_content = "\n".join(content_blocks)
    prompt = MINDMAP_PROMPT.format(content=combined_content)

    # Call OpenAI
    openai_client = SharedClients.get_openai()
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a knowledge graph extraction engine. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=4000,
            response_format={"type": "json_object"}
        )
        raw = response.choices[0].message.content
        graph_data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"Mind map JSON parse error: {e}. Raw: {raw[:500]}")
        raise HTTPException(status_code=500, detail="AI returned malformed graph data. Please try again.")
    except Exception as e:
        logger.error(f"Mind map generation error: {e}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    # ── MAP SOURCES TO GOOGLE FILE IDs FOR FRONTEND READER ─────────
    # We want to map the material title back to the ACTUAL Google Drive file_id
    # so the frontend split-view reader can open it.
    title_to_file_id = {}
    for m in materials:
        if m.attachments and m.attachments != "[]":
            try:
                atts = json.loads(m.attachments)
                if atts:
                    # Prefer PDF/Drive file IDs
                    primary = atts[0]
                    fid = primary.get("file_id") or primary.get("id")
                    if fid:
                        title_to_file_id[m.title] = fid
            except:
                pass
        # Fallback to database ID if no attachment (though proxy won't work for text-only anyway)
        if m.title not in title_to_file_id:
            title_to_file_id[m.title] = m.id

    nodes = graph_data.get("nodes", [])
    for n in nodes:
        citations = n.get("citations", [])
        for c in citations:
            c["material_id"] = title_to_file_id.get(c["source"])

    final_output = {
        "title": graph_data.get("title", course.name),
        "nodes": nodes,
        "edges": graph_data.get("edges", []),
        "sources": source_list,
        "course_name": course.name,
        "total_materials": len(materials)
    }

    # Save to thread if applicable (Individual Material or Global Course context)
    if not material_ids or (material_ids and len(material_ids) == 1):
        try:
            import uuid
            # If we don't have a target thread yet (for a global course map), create one
            if not target_thread and not material_ids:
                target_thread = ChatThread(
                    id=str(uuid.uuid4()),
                    user_id=user.id,
                    course_id=course_id,
                    title=f"Course Map: {course.name}",
                    updated_at=db.query(Course).filter(Course.id == course_id).first().last_synced or datetime.utcnow()
                )
                db.add(target_thread)
                logger.info(f"[MindMap] Created new Global Course Thread for {course_id}")

            if target_thread:
                target_thread.mindmap_data = json.dumps(final_output)
                db.commit()
                logger.info(f"[MindMap] Saved mind map to thread {target_thread.id}")
        except Exception as e:
            logger.error(f"[MindMap] Failed to save mindmap to thread: {e}")
    
    return final_output


@router.get("/sources/{course_id}")
def get_mindmap_sources(course_id: str, user_email: str, db: Session = Depends(get_db)):
    """List all available course materials the user can toggle for the mind map."""
    email = standardize_email(user_email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course not in user.courses:
        raise HTTPException(status_code=403, detail="Access denied")

    materials = db.query(Material).filter(
        Material.course_id == course_id,
        or_(Material.user_id == user.id, Material.user_id == None)
    ).order_by(Material.created_at.desc()).all()

    results = []
    for m in materials:
        fid = None
        if m.attachments and m.attachments != "[]":
            try:
                atts = json.loads(m.attachments)
                if atts:
                    primary = atts[0]
                    fid = primary.get("file_id") or primary.get("id")
            except:
                pass
        results.append({
            "id": m.id, 
            "title": m.title, 
            "type": m.type,
            "file_id": fid
        })
    return results
