import os
import time
import logging
import asyncio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import settings

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="FIWB AI - Personal Intelligence Hub",
    description="Institutional-grade academic AI backbone",
    version="1.5.0"
)

# 1. SCALE: Bandwidth Optimization
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 2. CORS Optimization
# NOTE: Cannot use allow_origins=["*"] with allow_credentials=True — browsers reject this combination.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.fiwbai.xyz",
        "https://fiwb-a-local.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Middleware for Request Timing (Scale Observability)
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    if process_time > 2.0:
        logger.warning(f"🐢 Slow Request: {request.url.path} took {process_time:.2f}s")
    return response

# 4. Global Exception Safety
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"🚨 CRITICAL SYSTEM ERROR: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Neural Link failed. Our engineers have been notified.", "error_type": type(exc).__name__}
    )

# Routers
from app.api import chat, courses, auth, notifications, drive, moodle, gmail, admin, search

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
app.include_router(gmail.router, prefix="/api/gmail", tags=["gmail"])
app.include_router(drive.router, prefix="/api/drive", tags=["drive"])
app.include_router(moodle.router, prefix="/api/moodle", tags=["moodle"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

@app.on_event("startup")
async def on_startup():
    try:
        from app.database import engine
        from app.models import Base
        # Offload sync DB creation to a thread to avoid blocking the whole app startup
        await asyncio.to_thread(Base.metadata.create_all, bind=engine)
        logger.info("✅ Institutional Infrastructure Ready (Database Connected)")
    except Exception as e:
        logger.error(f"❌ Database initialization error: {e}")

@app.get("/")
async def root():
    return {
        "message": "FIWB AI Backbone Active",
        "status": "online",
        "region": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local")
    }

@app.get("/health")
async def health_check():
    """Health check endpoint with system status for monitoring"""
    from app.database import SessionLocal
    from app.models import User, Course
    
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        return {
            "status": "healthy",
            "tier": "enterprise-ready",
            "users": user_count,
            "latency_target": "<200ms"
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
    finally:
        db.close()
