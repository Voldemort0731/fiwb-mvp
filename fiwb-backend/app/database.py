from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Configuration for different database types
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # SQLite configuration
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args=connect_args
    )
    
    # Enable WAL mode for SQLite
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()
else:
    # PostgreSQL configuration (Production ready)
    # Fix for Railway/Render which might provide 'postgres://' instead of 'postgresql://'
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
        
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=5,  # Reduced for Railway/Hobby DB limits
        max_overflow=2,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
