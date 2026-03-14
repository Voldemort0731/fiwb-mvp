import os
from dotenv import load_dotenv
from typing import Optional

load_dotenv(override=True)

class Settings:
    PROJECT_NAME: str = "FIWB AI"
    SUPERMEMORY_URL: str = os.getenv("SUPERMEMORY_URL", "https://api.supermemory.ai")
    SUPERMEMORY_API_KEY: str = os.getenv("SUPERMEMORY_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    GOOGLE_PUBSUB_TOPIC: Optional[str] = os.getenv("GOOGLE_PUBSUB_TOPIC")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://localhost/fiwb")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    OWNER_EMAIL: str = "owaissayyed2007@gmail.com"

settings = Settings()
