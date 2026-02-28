from typing import List, Dict
import json

class PromptArchitect:
    @staticmethod
    def build_prompt(
        user_query: str,
        retrieved_chunks: List[Dict],
        assistant_knowledge: List[Dict] = None,
        chat_assets: List[Dict] = None,
        memories: List[Dict] = None,
        profile: List[Dict] = None,
        history: List[Dict] = None,
        attachment_text: str = None,
        base64_image: str = None,
        query_type: str = "academic_question",
        rewritten_query: str = None
    ) -> List[Dict]:
        """
        Builds a high-fidelity, multi-message conversation for the Socratic Institutional Mentor.
        """
        
        # 1. ORCHESTRATE ACADEMIC CONTEXT (Grouped by Document)
        context_blocks = []
        docs = {}
        
        # Inject immediate attachment text if provided (e.g., Analysis mode)
        if attachment_text:
            docs["CURRENT_DOCUMENT"] = {
                "title": "Currently Viewed Document",
                "course": "Analysis Workspace",
                "category": "PRIMARY SOURCE",
                "author": "Academic Faculty",
                "link": None,
                "chunks": [attachment_text]
            }

        for c in retrieved_chunks:
            meta = c.get('metadata', {})
            # Use unique file identifiers to prevent merging different materials
            base_title = meta.get('title') or meta.get('file_name') or "Institutional Document"
            course_name = meta.get('course_name') or meta.get('course_id') or ""
            unique_name = f"{base_title} [{course_name}]" if course_name else base_title
            
            doc_key = meta.get('documentId') or meta.get('file_name') or unique_name
            
            if doc_key not in docs:
                docs[doc_key] = {
                    "title": unique_name,
                    "course": course_name or "General Workspace",
                    "category": meta.get('type', 'Institutional Material').upper(),
                    "author": meta.get('professor', 'Academic Faculty'),
                    "link": meta.get('source_link') or meta.get('url'),
                    "chunks": []
                }
            docs[doc_key]["chunks"].append(c.get('content', ''))
        
        for d_info in docs.values():
            content = "\n\n".join(d_info["chunks"])
            block = f"[{d_info['category']} | {d_info['course']}]\n"
            block += f"DOCUMENT: {d_info['title']}\n"
            if d_info['link']: block += f"LINK: {d_info['link']}\n"
            block += f"CONTENT: {content}"
            context_blocks.append(block)
        
        knowledge_base = "\n\n---\n\n".join(context_blocks) if context_blocks else "General academic intelligence."

        # 2. ORCHESTRATE ASSISTANT KNOWLEDGE (WORKSPACE/ASSETS)
        assistant_blocks = []
        if assistant_knowledge:
            # Group assistant knowledge too
            ak_docs = {}
            for ak in assistant_knowledge:
                meta = ak.get('metadata', {})
                ak_key = meta.get('documentId') or meta.get('subject') or meta.get('id')
                if ak_key not in ak_docs:
                    label = meta.get('category', 'INTEL').upper()
                    subject = meta.get('subject') or meta.get('title') or "Workspace Item"
                    ak_docs[ak_key] = {
                        "title": subject,
                        "header": f"[{label} | TITLE: {subject}]",
                        "chunks": []
                    }
                ak_docs[ak_key]["chunks"].append(ak.get('content', ''))
            
            for ak_info in ak_docs.values():
                ak_content = "\n".join(ak_info["chunks"])
                assistant_blocks.append(f"{ak_info['header']}\nCONTEXT: {ak_content}")
        
        if chat_assets:
            for asset in chat_assets:
                meta = asset.get('metadata', {})
                fname = meta.get('file_name', 'Previous Asset')
                assistant_blocks.append(f"[PAST ASSET | {fname}]\nCONTENT: {asset.get('content')}")

        assistant_workspace = "\n\n".join(assistant_blocks) if assistant_blocks else "No proprietary workspace context detected."

        # 3. ORCHESTRATE LONG-TERM COGNITION
        memory_vault = "\n".join([f"• {m['content']}" for m in memories]) if memories else "Establish prior student context."
        
        # 4. ORCHESTRATE USER IDENTITY
        identity_logic = "\n".join([f"• {p['content']}" for p in profile]) if profile else "Analyze learning behavior."

        # 5. DEFINE CORE INSTRUCTION
        if query_type == "general_chat":
            SYSTEM_PROMPT = f"""
# IDENTITY: FIWB Digital Companion
You are the student's supportive, witty, and deeply empathetic Digital Twin. 
You act as a personal assistant and friend, using a warm and relatable tone.

# PROPRIETARY WORKSPACE (Institutional Intel):
{assistant_workspace}

# ACADEMIC / DRIVE CONTEXT:
{knowledge_base}

# COGNITIVE CONTEXT (Your Memory of User):
- Learned Identity: {identity_logic}
- Past Insights: {memory_vault}

# DIRECTIVE:
1. Be empathetic and supportive. Reference their tasks or events from the workspace if relevant.
2. Use **bold** for important dates or tasks.
3. If referencing institutional items, use their full titles: Title [Course].
"""
        elif query_type == "notebook_analysis":
            SYSTEM_PROMPT = f"""
# IDENTITY: Institutional Notebook Analysis (NotebookMode)
You are an advanced academic synthesizing engine. You are analyzing one or more SPECIFIC documents provided in the [ACADEMIC VAULT].

# [CRITICAL] ACADEMIC VAULT:
{knowledge_base}

# OPERATIONAL DIRECTIVES:
1. **Source-Grounded Responses**: ONLY answer using the provided vault. If the answer is not in the text, say "The provided documents do not contain this information." 
2. **Inline Citations**: You MUST use numerical inline citations for every key claim, e.g., "The experiment showed X [1]". Always use square brackets.
3. **Citation Formatting**: At the VERY END of your response, list the citations matching those numbers. 
   Format: [n] Full Title [Page m].
4. **Page Precision**: Use the `--- [PAGE m] ---` markers in the vault to identify EXACTLY which page you are citing. If a claim spans multiple pages, cite them all: [Page 4-5].
5. **Contextual Linking**: If the user is starting a session or asking for a summary, provide:
   - "Executive Summary": 3-4 bullet points.
   - "Suggested Inquiries": 3-4 follow-up questions starting with "What", "How", or "Why" based on the content.
6. **No Hallucinations**: Do not bring in external knowledge not found in the documents.

# FORMAT:
- Response content with [1], [2] citations.
- FOOTNOTES at the bottom with: [1] DOCUMENT_TITLE [Page m]
"""
        else:
            SYSTEM_PROMPT = f"""
# IDENTITY: FIWB Institutional Intelligence (FIWB-II)
You are an elite academic mentor and Socratic tutor. 

# [CRITICAL] ACADEMIC VAULT (Verified Peer-Reviewed/Course Materials):
{knowledge_base}

# [SECONDARY] ASSISTANT WORKSPACE (Life/Context/Workspace):
{assistant_workspace}

# [DIGITAL TWIN] PERSONALIZED INTELLIGENCE (Your Memory of the Student):
- Student Profile & Preferences: {identity_logic}
- Behavioral Patterns & Past Memories: {memory_vault}

# OPERATIONAL DIRECTIVES:
1. **Grounded Reasoning**: PRIORITIZE the [ACADEMIC VAULT]. Quote materials directly (use "quotation marks").
2. **Topic Precision**: ONLY use information strictly requested in the current query. Even if the retrieved context contains related topics (e.g., you see 'Doubly' but were asked for 'Singly'), DISCARD the unrelated information.
3. **Category Isolation**: Do NOT confuse academic materials with past chat assets.
4. **Pedagogical Fidelity**: If the student asks to "solve", "calculate", "derive" or "explain", you MUST:
    - Provide a **Step-by-Step Breakdown** of the logic.
    - Offer a **Neural Benchmark Example**: If the [ACADEMIC VAULT] doesn't have a direct example, synthesize a clear, illustrative one.
    - Explain the "Why" before the "How"—establish theoretical foundations before showing the solution.
5. **Page Fidelity**: If a document contains markers like `--- [PAGE n] ---`, you MUST identify which pages you are using and include them in your final reference list as `Full Title [Page n, m]`.
6. **Fidelity**: When referring to a document, use the code: DOCUMENT: [Full Title]. 
7. **Socratic Bridge**: Guide the student. Do not just provide the answer; explain the path to it and probe with a clarifying "Bridge Question" at the end to ensure comprehension.
8. **TAGGING (START)**: You MUST start your response with exactly: [PERSONAL_REASONING: key_insights].
9. **TAGGING (END)**: You MUST conclude your response with exactly: [DOCUMENTS_REFERENCED: Full Title (Pages), ...]. Use the EXACT titles provided in the DOCUMENT: ... field.

# VISUAL EXCELLENCE:
- Use # H1 and ## H2 for hierarchy.
- Use bullet points and **bold** terminology for emphasis.
- Use `inline code` for variables and formulas.
- For complex solutions, use a "Solution Architecture" block (a bulleted list of steps).
"""
        messages = [{"role": "system", "content": SYSTEM_PROMPT.strip()}]

        # 6. INTEGRATE CONVERSATION HISTORY
        if history:
            for msg in history[-10:]:
                role = "user" if msg.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": msg.get("content")})

        # 7. ATTACH THE LATEST QUERY WITH ASSETS
        final_query_content = []
        # Pulled attachment_text into knowledge_base above for better grounding
        
        if base64_image:
            final_query_content.append({
                "type": "image_url",
                "image_url": {"url": base64_image}
            })
            
        final_query_content.append({"type": "text", "text": user_query})
        
        messages.append({"role": "user", "content": final_query_content})

        return messages
