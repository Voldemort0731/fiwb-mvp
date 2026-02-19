from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Material, User
import json

from app.supermemory.client import SupermemoryClient

router = APIRouter()

@router.get("/materials")
async def search_materials(q: str, user_email: str, db: Session = Depends(get_db)):
    """Search across all materials for a user (Local DB + Supermemory)."""
    from app.utils.email import standardize_email
    email = standardize_email(user_email)
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return []
    
    # 1. Search in local database
    from sqlalchemy import or_
    materials = db.query(Material).filter(
        or_(Material.user_id == user.id, Material.user_id == None),
        or_(
            Material.title.ilike(f"%{q}%"),
            Material.content.ilike(f"%{q}%")
        )
    ).order_by(Material.created_at.desc()).limit(50).all()
    
    results = []
    seen_ids = set()

    for m in materials:
        try:
            atts = json.loads(m.attachments) if m.attachments else []
        except:
            atts = []
        
        results.append({
            "id": m.id,
            "title": m.title,
            "type": m.type,
            "date": m.created_at or "Recent",
            "description": m.content[:200] if m.content else "",
            "source": "Academic Engine",
            "course_id": m.course_id,
            "source_link": m.source_link,
            "attachments": atts
        })
        seen_ids.add(m.id)
    
    # 2. Search in Supermemory (Digital Twin)
    try:
        sm_client = SupermemoryClient()
        filters = {
            "AND": [
                {"key": "user_id", "value": user_email}
            ]
        }
        sm_results = await sm_client.search(query=q, filters=filters, limit=10)
        
        # In V3, results are usually in 'results' or 'chunks'
        items = sm_results.get('results', []) or sm_results.get('chunks', [])
        
        for item in items:
            meta = item.get('metadata', {})
            source_id = meta.get('source_id')
            
            # Skip if we already found this in local DB
            if source_id and source_id in seen_ids:
                continue
                
            title = item.get('title') or meta.get('title') or "Neural Insight"
            results.append({
                "id": source_id or "sm_" + str(hash(title)),
                "title": f"🧠 {title}",
                "type": meta.get('type', 'document'),
                "date": meta.get('created_at', 'Digital Twin Insight'),
                "description": item.get('content', '')[:200] or item.get('text', '')[:200],
                "source": "Supermemory Memory",
                "course_id": meta.get('course_id'),
                "source_link": meta.get('source_link'),
                "attachments": []
            })
    except Exception as e:
        print(f"Supermemory search error: {e}")

    return results[:30] # Broader result set for hybrid search
