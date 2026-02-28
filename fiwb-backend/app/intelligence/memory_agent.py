from openai import AsyncOpenAI
from app.config import settings
from app.supermemory.client import SupermemoryClient
from app.intelligence.usage import UsageTracker
from app.utils.email import standardize_email
import datetime
import json
import hashlib

def get_openai():
    from app.utils.clients import SharedClients
    return SharedClients.get_openai()

def get_sm():
    from app.utils.clients import SharedClients
    return SharedClients.get_supermemory()

ENHANCED_MEMORY_PROMPT = """
You are an Advanced Memory Synthesis Engine for a personalized academic AI assistant.
Your goal is to create a RICH, MULTI-DIMENSIONAL memory that builds a comprehensive digital twin of the user.

Analyze the user-AI interaction and extract:

**OUTPUT FORMAT (JSON):**
{
    "title": "Concise topic (e.g., 'Recursion in Python')",
    "summary": "2-3 sentence summary of the interaction",
    
    "learning_insights": {
        "understanding_level": "beginner|intermediate|advanced",
        "knowledge_gaps": ["Specific gaps identified"],
        "strengths": ["What the user demonstrated mastery of"],
        "misconceptions": ["Any incorrect assumptions corrected"]
    },
    
    "user_profile": {
        "learning_style": "visual|auditory|kinesthetic|reading|mixed",
        "communication_preference": "concise|detailed|step-by-step|conceptual",
        "engagement_signals": ["Questions asked", "Follow-ups", "Confusion points"],
        "emotional_context": "curious|frustrated|confident|struggling|excited"
    },
    
    "academic_context": {
        "topics": ["Primary", "Topics", "Covered"],
        "difficulty_level": "easy|medium|hard",
        "related_courses": ["Potential course connections"],
        "prerequisites": ["Concepts this builds on"]
    },
    
    "actionable_insights": {
        "follow_up_suggestions": ["What to study next"],
        "practice_recommendations": ["Exercises or resources"],
        "review_needed": ["Topics to revisit"]
    },
    
    "metadata": {
        "interaction_type": "question|explanation|debugging|brainstorming|review",
        "session_context": "assignment|exam_prep|concept_learning|project|general",
        "confidence_score": 0.0-1.0
    }
}
"""

class MemoryAgent:
    @staticmethod
    async def synthesize_and_save(user_email: str, query: str, response: str, additional_context: dict = None, conversation_history: list = None):
        """Synthesize memory for user using shared scale-ready clients."""
        user_email = standardize_email(user_email)
        user_name = user_email.split("@")[0].replace(".", " ").title()
        
        openai_client = get_openai()
        sm_client = get_sm()
        
        try:
            if not settings.OPENAI_API_KEY: return

            # Build context
            context_str = f"USER: {query}\n\nAI: {response}"
            if conversation_history:
                recent = "\n".join([f"{msg['role'].upper()}: {msg['content'][:200]}" for msg in conversation_history[-3:]])
                context_str = f"RECENT CONTEXT:\n{recent}\n\nCURRENT:\n{context_str}"

            # 1. Synthesize
            UsageTracker.log_usage(user_email, UsageTracker.count_tokens(ENHANCED_MEMORY_PROMPT + context_str), is_input=True, category="slm")
            completion = await openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": ENHANCED_MEMORY_PROMPT}, {"role": "user", "content": context_str}],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            memory_data = json.loads(completion.choices[0].message.content)
            UsageTracker.log_usage(user_email, UsageTracker.count_tokens(json.dumps(memory_data)), is_input=False, category="slm")
            
            # 2. Rich Block Construction
            learning = memory_data.get('learning_insights', {})
            profile = memory_data.get('user_profile', {})
            academic = memory_data.get('academic_context', {})
            actionable = memory_data.get('actionable_insights', {})
            meta = memory_data.get('metadata', {})
            
            content_block = f"""
## {memory_data.get('title')}
**Summary**: {memory_data.get('summary')}

### 🎓 Learning Insights
- **Level**: {learning.get('understanding_level')}
- **Gaps**: {', '.join(learning.get('knowledge_gaps', []))}
- **Strengths**: {', '.join(learning.get('strengths', []))}

### 👤 Profile signals
- **Style**: {profile.get('learning_style')}
- **Communication**: {profile.get('communication_preference')}
- **Emotional**: {profile.get('emotional_context')}

### 🎯 Actionable
- **Suggestions**: {', '.join(actionable.get('follow_up_suggestions', []))}

### 💬 Raw Snapshot
**User**: {query}
**AI**: {response[:300]}...
"""

            # 3. Scale-Optimized Save
            metadata = {
                "user_id": user_email,
                "type": "enhanced_memory",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "topics": academic.get('topics', []),
                "interaction_type": meta.get('interaction_type'),
                "learning_style": profile.get('learning_style')
            }
            if additional_context:
                metadata.update(additional_context)

            await sm_client.add_document(
                content=content_block,
                metadata=metadata,
                title=f"💭 [{user_name}'s Memory] {memory_data.get('title')}",
                description=memory_data.get("summary")
            )
            
            # 4. Global Twin Evolution
            if learning.get('strengths') or learning.get('knowledge_gaps'):
                await MemoryAgent._update_profile(user_email, user_name, learning.get('strengths', []), learning.get('knowledge_gaps', []), profile.get('learning_style'), profile.get('communication_preference'))
            
        except Exception as e:
            print(f"⚠️ Memory Evolution Failed: {e}")

    @staticmethod
    async def _update_profile(user_email, user_name, strengths, gaps, style, prefs):
        sm_client = get_sm()
        try:
            profile_content = f"""# {user_name}'s Portfolio Profile\nStrengths: {strengths}\nGaps: {gaps}\nStyle: {style}\nPrefs: {prefs}"""
            metadata = {"user_id": user_email, "type": "user_profile", "strengths": strengths, "gaps": gaps}
            await sm_client.add_document(content=profile_content, metadata=metadata, title=f"🧠 {user_name}'s Portfolio")
        except: pass
