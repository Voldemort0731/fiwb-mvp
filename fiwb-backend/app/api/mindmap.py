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
5. Optionally create 1 to 2 detail nodes per subtopic (level 3) for the most important concepts.
6. Total nodes: between 15 and 50.
7. Every node must have a concise definition (1 sentence).
8. For each edge, include a relationship label (e.g. "includes", "requires", "leads to").
9. Mark which materials each concept appears in (use the material titles as source labels).

JSON FORMAT (return exactly this structure):
{
  "title": "Course/Topic Name",
  "nodes": [
    {
      "id": "root",
      "label": "Main Topic",
      "level": 0,
      "definition": "Brief 1-sentence definition",
      "sources": ["Material Title 1", "Material Title 2"]
    },
    {
      "id": "n1",
      "label": "Subtopic Name",
      "level": 1,
      "definition": "Brief 1-sentence definition",
      "sources": ["Material Title 1"]
    }
  ],
  "edges": [
    {
      "id": "e-root-n1",
      "source": "root",
      "target": "n1",
      "label": "includes",
      "type": "hierarchical"
    }
  ]
}

edge types: "hierarchical" (parent-child), "related" (conceptual link), "prerequisite" (must learn first)

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

    # Initialize Drive service for extracting content from attachments
    drive_service = DriveSyncService(user.access_token, user.email, user.refresh_token)

    # Build content blocks — cap each at 3000 chars to stay within context
    content_blocks = []
    source_list = []
    total_chars = 0
    MAX_CHARS = 40000

    for m in materials:
        if total_chars >= MAX_CHARS:
            break
        
        material_text = f"[MATERIAL: {m.title}]\n"
        if m.content:
            material_text += m.content[:5000] # Use more text if available
        else:
            material_text += "(No text content)"

        # ── EXTRACT CONTENT FROM ATTACHMENTS ───────────────────────
        if m.attachments and m.attachments != "[]":
            try:
                attachments = json.loads(m.attachments)
                # Limit to 3 attachments per material to avoid timeouts
                for att in attachments[:3]:
                    # Handle both Classroom driveFile and standard Drive format
                    file_id = att.get("file_id") or att.get("id")
                    mime_type = att.get("mime_type") or att.get("mimeType")
                    
                    if file_id and (att.get("type") in ["drive", "drive_file"] or "google-apps" in str(mime_type) or "pdf" in str(mime_type)):
                        logger.info(f"[MindMap] Fetching content for attachment: {att.get('title')}")
                        doc_content = await drive_service._get_file_content({"id": file_id, "mimeType": mime_type or ""})
                        if doc_content:
                            material_text += f"\n--- [ATTACHMENT: {att.get('title')}] ---\n"
                            material_text += doc_content[:5000] # Cap text from attachment
            except Exception as e:
                logger.warning(f"[MindMap] Failed to extract attachment content for {m.id}: {e}")

        material_text += "\n---\n"
        content_blocks.append(material_text)
        source_list.append({
            "id": m.id,
            "title": m.title,
            "type": m.type
        })
        total_chars += len(material_text)

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

    return {
        "title": graph_data.get("title", course.name),
        "nodes": graph_data.get("nodes", []),
        "edges": graph_data.get("edges", []),
        "sources": source_list,
        "course_name": course.name,
        "total_materials": len(materials)
    }


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

    return [{"id": m.id, "title": m.title, "type": m.type} for m in materials]
