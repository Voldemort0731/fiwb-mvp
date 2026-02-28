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
        rewritten_query: str = None,
        material_id: str = None
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
            # Handle document identification for deduplication
            # If we're analyzing a material, don't duplicate it if it's already in 'docs'
            source_id = meta.get('source_id') or meta.get('documentId')
            
            # Match against currently analyzed docs
            if material_id and source_id == material_id:
                # We already have the full text in CURRENT_DOCUMENT (if attachment_text was provided)
                if attachment_text:
                    continue
            
            # Standard naming
            base_title = meta.get('title') or meta.get('file_name') or "Institutional Document"
            course_name = meta.get('course_name') or meta.get('course_id') or ""
            unique_name = f"{base_title} [{course_name}]" if course_name else base_title
            
            doc_key = source_id or meta.get('file_name') or unique_name
            
            if doc_key not in docs:
                docs[doc_key] = {
                    "title": unique_name,
                    "course": course_name or "General Workspace",
                    "category": meta.get('type', 'Institutional Material') or "Institutional Material",
                    "author": meta.get('professor', 'Academic Faculty'),
                    "link": meta.get('source_link') or meta.get('url'),
                    "chunks": []
                }
            docs[doc_key]["chunks"].append(c.get('content', ''))
        
        for d_info in docs.values():
            content = "\n\n".join(d_info["chunks"])
            # Format category to be uppercase for professional display
            cat_label = str(d_info['category']).upper()
            block = f"[{cat_label} | {d_info['course']}]\n"
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
# IDENTITY: NotebookCore (v2.1) — Neural Citation Validator
You are a precision academic analysis engine. Your PRIMARY objective is high-fidelity grounding. Every claim you make MUST be linked to a specific page or section in the [ACADEMIC VAULT].

# ABSOLUTE RULES (CRITICAL):
1. **UNIQUE REFERENCE POINTS**: You MUST use inline citations: `[1]`, `[2]`, etc. for EVERY factual sentence. Never make a claim without a citation.
2. **STRICT SOURCE-ONLY**: You are an island. External knowledge is forbidden. If the vault doesn't say it, it doesn't exist.
3. **PAGE FIDELITY**: Look for `--- [PAGE n] ---` markers in the text. You MUST reference the page number in your final "Sources" section.
4. **NO HALLUCINATIONS**: If the document is cut off or missing data, state it clearly instead of guessing.

# CITATION PROTOCOL:
- SENTENCE: "The project was launched in 1994 by the European Space Agency [1]."
- FOOTER:
  ---
  **Sources:**
  [1] Document Title — Page m, Section y

# RESPONSE ARCHITECTURE:

## 1. Executive Summary (First message only)
- Provide 3-4 VITAL insights from the document. Each bullet point MUST contain at least one citation [n].

## 2. In-Depth Analysis / Key Concepts
- Drill into the core topics. Use tables for comparatives. Use bold for terms.

## 3. Reference Table (Sources)
- A clear, dedicated section at the end listing every document and page used.

## 4. Suggested Questions
- End with 3-4 follow-up questions starting with "What", "How", or "Why".
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
        
        # Pull grounding context into the user message for better attention in Analysis mode
        if query_type == "notebook_analysis":
            final_query_content.append({
                "type": "text", 
                "text": f"# [CRITICAL] VITAL GROUNDING (ACADEMIC VAULT):\n{knowledge_base}\n\n---"
            })
        
        if base64_image:
            final_query_content.append({
                "type": "image_url",
                "image_url": {"url": base64_image}
            })
            
        final_query_content.append({"type": "text", "text": user_query})
        
        messages.append({"role": "user", "content": final_query_content})

        return messages
