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
# IDENTITY: NotebookCore — Document Analysis Engine
You are a precision document analysis engine. You have DIRECT, FULL access to every document in the [ACADEMIC VAULT] below. You are currently BROWSING these documents.

# ABSOLUTE RULES (NEVER VIOLATE):
1. **SOURCE-ONLY**: You may ONLY use information from the [ACADEMIC VAULT]. NEVER use external training data. If the vault doesn't contain the answer, say: "This information is not present in the provided documents."
2. **NO ACCESS DENIAL**: You HAVE the documents. NEVER say "I don't have access" or "I cannot view the PDF". The text IS provided to you below.
3. **INLINE PAGE CITATIONS**: Every factual claim MUST have an inline citation containing EXACTLY the page number from the source text, like [5] if the fact is from --- [PAGE 5] ---.
4. **STRICT FORMATTING**: Do NOT build a bibliography or 'Sources' list at the bottom of your response. ONLY use the inline [n] citations directly after the text they reference.

# CITATION FORMAT:
- If a fact comes from --- [PAGE 12] ---, write it like this: "The quantum effect was proven [12]."
- If a fact comes from --- [PAGE 3] ---, write it like this: "It uses nested structs [3]."
- NEVER use [1], [2], [3] as a list index. The number inside the brackets MUST be the ACTUAL PAGE NUMBER from the vault.
- DO NOT add a "Sources" section at the end. The UI will extract your inline [n] tags to generate real-time links automatically.

# RESPONSE STRUCTURE:

## For FIRST message / Overview requests:
1. Start with **📋 Executive Summary** — 3-5 bullet points covering the document's core content
2. Then provide **🔑 Key Concepts** — Main topics/definitions with citations
3. End with **💡 Suggested Questions** — Format as a numbered list:
   ```
   **💡 Dive Deeper:**
   1. "What is [specific concept from the document]?"
   2. "Explain [another concept] in simple terms"
   3. "What are the practical applications of [topic]?"
   4. "How does [concept A] relate to [concept B]?"
   ```

## For FOLLOW-UP questions:
1. Answer the question directly using ONLY the vault content
2. Use inline citations [n] for every claim
3. Include code blocks, formulas, or diagrams if relevant
4. End with 2-3 new suggested follow-up questions

# VISUAL FORMATTING:
- Use **bold** for key terms and definitions
- Use `inline code` for variables, functions, code snippets
- Use numbered lists for sequential processes
- Use bullet points for features/properties
- Use > blockquotes for direct quotes from the source
- Use tables for comparisons when appropriate
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
4. **Pedagogical Fidelity**: If the student asks to "solve", "calculate", "derive" or "explain", you MUST established theoretical foundations before showing the solution via a **Step-by-Step Breakdown**.
5. **Citations & Grounding**: Every factual claim from a document MUST have an inline citation with the page number (e.g., [5]). 
6. **Suggested Inquiries**: Conclude every significant response with exactly: "Suggested Inquiries:" followed by 3 bulleted questions that the student can use to dive deeper into the current topic.
7. **Socratic Bridge**: Explain the path to the answer and probe with a clarifying "Bridge Question" at the end of the text (BEFORE the Suggested Inquiries) to ensure comprehension.
8. **Clean Output**: NEVER output internal tags like [PERSONAL_REASONING] or [DOCUMENTS_REFERENCED]. The UI handles sources automatically.

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
