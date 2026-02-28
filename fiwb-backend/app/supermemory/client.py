import httpx
from app.config import settings
import json
import asyncio
import random
import logging

logger = logging.getLogger("uvicorn.error")

class SupermemoryClient:
    """
    Supermemory API client.
    Always creates its own httpx client with correct auth headers.
    The shared HTTP client is NOT used here because Supermemory needs
    specific Authorization headers that differ from Google API calls.
    """
    def __init__(self, client: httpx.AsyncClient = None):
        self.base_url = settings.SUPERMEMORY_URL.rstrip('/')
        self._headers = {
            "User-Agent": "FIWB-AI/1.0",
            "Content-Type": "application/json",
        }
        if settings.SUPERMEMORY_API_KEY:
            self._headers["Authorization"] = f"Bearer {settings.SUPERMEMORY_API_KEY}"

        # Always use a dedicated client with the correct auth headers
        # (shared client doesn't have SM auth headers)
        self.client = httpx.AsyncClient(
            headers=self._headers,
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=10) 
            
        )

    async def add_document(self, content: str, metadata: dict, title: str = None, description: str = None):
        """Add a document to Supermemory with retry on rate limit."""
        if not settings.SUPERMEMORY_API_KEY:
            logger.warning("[SM] No API key configured — skipping add_document")
            return None

        max_retries = 3
        for attempt in range(max_retries):
            try:
                safe_content = content[:60000] + "\n[TRUNCATED]" if len(content) > 60000 else content
                clean_meta = {k: v for k, v in metadata.items() if v is not None}
                # Safe-guard: Ensure every document uploaded to Supermemory has a "type"
                if "type" not in clean_meta:
                    clean_meta["type"] = "document"

                payload = {"content": safe_content, "metadata": clean_meta}
                if title:
                    payload["title"] = title
                if description:
                    payload["description"] = description[:500]

                response = await self.client.post(f"{self.base_url}/v3/documents", json=payload)

                if response.status_code == 429:
                    wait = (2 ** attempt) + random.random()
                    logger.warning(f"[SM] Rate limited. Retrying in {wait:.1f}s (attempt {attempt+1})")
                    await asyncio.sleep(wait)
                    continue

                if response.status_code == 400:
                    logger.warning(f"[SM] 400 Bad Request: {response.text[:200]}")
                    return None

                if response.status_code == 401:
                    logger.error(f"[SM] 401 Unauthorized — check SUPERMEMORY_API_KEY env var")
                    return None

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    continue
                logger.error(f"[SM] HTTP {e.response.status_code} on add_document")
                return None
            except Exception as e:
                logger.error(f"[SM] add_document error: {e}")
                return None

        return None

    async def search(self, query: str, filters: dict = None, limit: int = 5):
        """Search Supermemory."""
        if not settings.SUPERMEMORY_API_KEY:
            return {"results": []}

        try:
            final_query = query.strip() if query and query.strip() else "*"
            payload = {"q": final_query, "limit": limit}
            if filters:
                payload["filters"] = filters

            response = await self.client.post(f"{self.base_url}/v3/search", json=payload)

            if response.status_code == 401:
                logger.error("[SM] 401 Unauthorized on search — check SUPERMEMORY_API_KEY")
                return {"results": []}

            if response.status_code != 200:
                logger.warning(f"[SM] Search returned {response.status_code}: {response.text[:200]}")
                return {"results": []}

            result = response.json()
            logger.info(f"[SM] Search found {len(result.get('results', []))} results")
            return result

        except Exception as e:
            logger.error(f"[SM] Search error: {e}")
            return {"results": []}

    async def delete_document(self, document_id: str):
        """Delete a document from Supermemory."""
        try:
            response = await self.client.delete(f"{self.base_url}/v3/documents/{document_id}")
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"[SM] Delete error for {document_id}: {e}")
            return False
