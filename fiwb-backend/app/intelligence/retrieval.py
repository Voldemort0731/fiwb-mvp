from app.supermemory.client import SupermemoryClient
from typing import List, Dict
from openai import AsyncOpenAI
from app.config import settings
from app.intelligence.usage import UsageTracker
import json
import asyncio
from app.utils.email import standardize_email

class RetrievalOrchestrator:
    def __init__(self, user_email: str):
        # Standardize email to full version
        self.user_email = standardize_email(user_email)
        from app.utils.clients import SharedClients
        self.sm_client = SharedClients.get_supermemory()
        self.client = SharedClients.get_openai()
    
    async def _contextualize_query(self, query: str, history: List[Dict]) -> str:
        """Rewrite the query to be self-contained based on conversation history."""
        if not history or len(history) == 0:
            return query
            
        history_str = "\n".join([f"{m['role']}: {m['content'][:300]}" for m in history[-5:]])
        
        prompt = f"""Review the conversation history and the follow-up question below. 
Rewrite the question into a highly focused, standalone search query. 
Rules:
1. Preserve specific keywords, product names, or core technical terms.
2. Only include context from history if it is DIRECTLY RELEVANT to the new question.
3. If the user is SWITCHING topics (e.g., from 'Doubly' to 'Singly'), discard the old topic in the search query.
4. If the question is a greeting or meta-question, return the original.

**HISTORY:**
{history_str}

**FOLLOW-UP QUESTION:**
{query}

**STANDALONE SEARCH QUERY:**"""

        try:
            # Log input tokens
            UsageTracker.log_usage(self.user_email, UsageTracker.count_tokens(prompt), is_input=True)

            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=100
            )
            contextualized = response.choices[0].message.content.strip()

            # Log output tokens
            UsageTracker.log_usage(self.user_email, UsageTracker.count_tokens(contextualized), is_input=False)

            print(f"🔍 Rewriting: '{query}' -> '{contextualized}'")
            return contextualized
        except Exception as e:
            print(f"⚠️ Contextualization failed: {e}")
            return query

    async def retrieve_context(
        self, 
        query: str, 
        query_type: str,
        history: List[Dict] = None,
        course_filter: str = None,
        material_id: str = None
    ) -> Dict[str, List[Dict]]:
        """Optimized parallel retrieval of course context, assistant knowledge, and memories."""
        
        # 0. Contextualize first (sequential as it's the search key)
        search_query = await self._contextualize_query(query, history) if history else query

        # Course Filters
        course_filters = [
            {"key": "user_id", "value": self.user_email, "negate": False},
            {"key": "type", "value": "enhanced_memory", "negate": True}
        ]
        if course_filter:
            course_filters.append({"key": "course_id", "value": course_filter, "negate": False})

        # Memory Filters
        memory_filters = [{"key": "user_id", "value": self.user_email, "negate": False}, {"key": "type", "value": "enhanced_memory", "negate": False}]
        
        # Assistant Knowledge Filters
        assistant_filters = [{"key": "user_id", "value": self.user_email, "negate": False}, {"key": "type", "value": "assistant_knowledge", "negate": False}]

        # Chat Attachment Filters
        chat_filters = [{"key": "user_id", "value": self.user_email, "negate": False}, {"key": "type", "value": "chat_attachment", "negate": False}]

        # Profile Filters
        profile_filters = [{"key": "user_id", "value": self.user_email, "negate": False}, {"key": "type", "value": "user_profile", "negate": False}]

        # Focused search (Direct Material + Attachments)
        focused_filters = []
        if material_id:
            focused_filters.append({"key": "user_id", "value": self.user_email, "negate": False})
            
            # 1. Base ID
            or_conditions = [{"key": "source_id", "value": material_id, "negate": False}]
            
            # 2. Extract Drive ID for fuzzy matching
            import re
            drive_id_match = re.search(r'([a-zA-Z0-9_-]{25,})', material_id)
            if drive_id_match:
                did = drive_id_match.group(1)
                or_conditions.extend([
                    {"key": "source_id", "value": did, "negate": False},
                    {"key": "source_id", "value": f"ann_att_{did}", "negate": False}
                ])

            # 3. Handle announcements (parent-child relationship)
            ann_id_only = material_id.replace("ann_", "") if material_id.startswith("ann_") else None
            if ann_id_only:
                or_conditions.append({"key": "parent_announcement_id", "value": ann_id_only, "negate": False})
            
            # Finalize OR block
            focused_filters.append({"OR": or_conditions})

        # Helper to skip tasks safely
        async def skip(): return {"results": []}

        # 2. Parallel Search Execution
        UsageTracker.log_sm_request(self.user_email) # Log once for the batch
        
        tasks = [
            # Course search
            self.sm_client.search(query=search_query, filters={"AND": course_filters}, limit=15) if query_type != "general_chat" else skip(),
            # Focused search (Direct Material + Attachments) 
            self.sm_client.search(
                query=search_query, 
                filters={"AND": focused_filters}, 
                limit=25
            ) if material_id else skip(),
            # Memory search
            self.sm_client.search(query=search_query, filters={"AND": memory_filters}, limit=5) if query_type != "general_chat" else skip(),
            # Assistant knowledge search
            self.sm_client.search(query=search_query, filters={"AND": assistant_filters}, limit=5) if query_type != "general_chat" else skip(),
            # Chat Assets search
            self.sm_client.search(query=search_query, filters={"AND": chat_filters}, limit=5) if query_type != "general_chat" else skip(),
            # Profile search (Always run for personalization)
            self.sm_client.search(query="User learning style preferences personal context assistant profile", filters={"AND": profile_filters}, limit=3)
        ]

        results = await asyncio.gather(*tasks)
        
        course_res, focused_res, memory_res, assistant_res, chat_res, profile_res = results
        
        def flatten_v3(res):
            if not res or not isinstance(res, dict): return []
            all_chunks = []
            
            # Supermemory V3 can return results as a list of 'results' or 'docs'
            results_list = res.get('results') or res.get('docs') or []
            
            for item in results_list:
                # Grouped Format (V3 default grouped)
                if 'chunks' in item and isinstance(item['chunks'], list):
                    doc_id = item.get('documentId') or item.get('id')
                    doc_meta = item.get('metadata', {})
                    for chunk in item['chunks']:
                        chunk_meta = chunk.get('metadata', {})
                        # Merge: Document metadata (authoritative) + Chunk metadata (contextual)
                        merged = {**chunk_meta, **doc_meta}
                        merged['documentId'] = doc_id
                        # Ensure presence of critical fields from the doc level
                        for key in ['source_id', 'title', 'source_link', 'course_id', 'type']:
                            if doc_meta.get(key):
                                merged[key] = doc_meta[key]
                        
                        all_chunks.append({
                            'content': chunk.get('content', '') or chunk.get('text', ''),
                            'metadata': merged
                        })
                
                # Flat Format (V3 default flat)
                else:
                    chunk_meta = item.get('metadata', {})
                    chunk_meta['documentId'] = item.get('documentId') or item.get('id')
                    all_chunks.append({
                        'content': item.get('content') or item.get('text', ''),
                        'metadata': chunk_meta
                    })
            
            # logger is available via self.logger or import
            return all_chunks

        # Combine focused results into course_context
        all_course_chunks = flatten_v3(course_res) + flatten_v3(focused_res)


        return {
            "course_context": all_course_chunks,
            "assistant_knowledge": flatten_v3(assistant_res),
            "chat_assets": flatten_v3(chat_res),
            "memories": flatten_v3(memory_res),
            "profile": flatten_v3(profile_res),
            "rewritten_query": search_query
        }
