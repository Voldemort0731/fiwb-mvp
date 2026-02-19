
import asyncio
import os
import json
from app.intelligence.retrieval import RetrievalOrchestrator
from app.utils.config import Config

async def test_retrieval():
    # Attempt to test with a dummy or real email if we can find one in logs
    email = "sidwadhwa07@gmail.com" # Common email in previous logs
    retriever = RetrievalOrchestrator(email)
    
    print(f"--- TESTING RETRIEVAL FOR {email} ---")
    query = "Syllabus"
    context = await retriever.retrieve_context(query, "academic_question")
    
    print("\n[COURSE CONTEXT]:")
    for chunk in context.get("course_context", []):
        meta = chunk.get("metadata", {})
        print(f"Title: {meta.get('title')} | File: {meta.get('file_name')} | Course: {meta.get('course_name')}")
        print(f"Content Preview: {chunk.get('content')[:100]}...\n")

if __name__ == "__main__":
    # Ensure env is loaded or config is accessible
    # This might need to be run from the backend directory
    asyncio.run(test_retrieval())
