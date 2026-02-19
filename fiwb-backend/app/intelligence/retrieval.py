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
        course_filter: str = None
    ) -> Dict[str, List[Dict]]:
        """Optimized parallel retrieval of course context, assistant knowledge, and memories."""
        
        # 0. Contextualize first (sequential as it's the search key)
        search_query = await self._contextualize_query(query, history) if history else query

        # 1. Define Filter sets
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

        # 2. Parallel Search Execution
        UsageTracker.log_sm_request(self.user_email) # Log once for the batch
        
        tasks = [
            # Course search
            self.sm_client.search(query=search_query, filters={"AND": course_filters}, limit=10) if query_type != "general_chat" else asyncio.sleep(0, result={}),
            # Memory search
            self.sm_client.search(query=search_query, filters={"AND": memory_filters}, limit=10),
            # Assistant knowledge search
            self.sm_client.search(query=search_query, filters={"AND": assistant_filters}, limit=5),
            # Chat Assets search
            self.sm_client.search(query=search_query, filters={"AND": chat_filters}, limit=5),
            # Profile search
            self.sm_client.search(query="User learning style preferences personal context assistant profile", filters={"AND": profile_filters}, limit=3)
        ]

        results = await asyncio.gather(*tasks)
        
        course_res, memory_res, assistant_res, chat_res, profile_res = results

        def flatten_v3(res):
            if not res or not isinstance(res, dict): return []
            all_chunks = []
            for doc in res.get('results', []):
                doc_id = doc.get('documentId')
                meta = doc.get('metadata', {})
                for chunk in doc.get('chunks', []):
                    # Combine doc metadata, chunk metadata, and doc_id
                    chunk_meta = {**meta, **chunk.get('metadata', {})}
                    if doc_id:
                        chunk_meta['documentId'] = doc_id
                    
                    all_chunks.append({
                        "content": chunk.get('content', ''),
                        "metadata": chunk_meta
                    })
            return all_chunks

        return {
            "course_context": flatten_v3(course_res),
            "assistant_knowledge": flatten_v3(assistant_res),
            "chat_assets": flatten_v3(chat_res),
            "memories": flatten_v3(memory_res),
            "profile": flatten_v3(profile_res),
            "rewritten_query": search_query
        }
