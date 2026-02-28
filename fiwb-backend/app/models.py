from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime

# Association table for User-Course many-to-many relationship
user_courses = Table(
    "user_courses",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("course_id", String, ForeignKey("courses.id"), primary_key=True),
    Column("last_synced", DateTime, default=datetime.utcnow)
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    google_id = Column(String, unique=True, index=True)
    access_token = Column(Text)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    moodle_url = Column(String, nullable=True)
    moodle_token = Column(String, nullable=True)
    watched_drive_folders = Column(Text, default="[]") # JSON list of folder IDs
    registration_id = Column(String, nullable=True) # For mapping Classroom notifications
    last_synced = Column(DateTime, nullable=True)
    
    # Cost & Usage Tracking
    openai_tokens_used = Column(Integer, default=0)
    supermemory_docs_indexed = Column(Integer, default=0)
    supermemory_requests_count = Column(Integer, default=0)
    lms_api_requests_count = Column(Integer, default=0)
    estimated_cost_usd = Column(Text, default="0.00") # Total estimated cost in USD
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    courses = relationship("Course", secondary=user_courses, back_populates="users")
    threads = relationship("ChatThread", back_populates="user", cascade="all, delete-orphan")
    materials = relationship("Material", back_populates="user", cascade="all, delete-orphan")

class Course(Base):
    __tablename__ = "courses"

    id = Column(String, primary_key=True, index=True) # Google Classroom ID
    name = Column(String)
    professor = Column(String, nullable=True)
    platform = Column(String, default="Google Classroom")
    last_synced = Column(DateTime, nullable=True)
    
    # Many-to-many relationship
    users = relationship("User", secondary=user_courses, back_populates="courses")
    materials = relationship("Material", back_populates="course", cascade="all, delete-orphan")

class Material(Base):
    __tablename__ = "materials"

    id = Column(String, primary_key=True, index=True) # Google Classroom ID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True) 
    course_id = Column(String, ForeignKey("courses.id"), index=True)
    title = Column(String)
    content = Column(Text) # Description or text content
    type = Column(String, index=True) # assignment, material, announcement
    due_date = Column(String, nullable=True) # ISO Date string
    created_at = Column(String, nullable=True) # ISO Timestamp
    attachments = Column(Text, default="[]") # JSON string of attachments
    source_link = Column(String, nullable=True)

    course = relationship("Course", back_populates="materials")
    user = relationship("User", back_populates="materials")

class ChatThread(Base):
    __tablename__ = "chat_threads"
    
    id = Column(String, primary_key=True, index=True) # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String)
    material_id = Column(String, nullable=True, index=True) # Links to source doc for analysis threads
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="threads")
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(String, ForeignKey("chat_threads.id"), index=True)
    role = Column(String) # user, assistant, system
    content = Column(Text)
    attachment = Column(Text, nullable=True) # Base64 or URL
    attachment_type = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    sources = Column(Text, nullable=True) # JSON string of sources/citations
    created_at = Column(DateTime, default=datetime.utcnow)

    thread = relationship("ChatThread", back_populates="messages")
