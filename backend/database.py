from sqlalchemy import create_engine, Column, String, Float, Integer, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime
import os

# SQLite database URL
DATABASE_URL = "sqlite+aiosqlite:///./billiard_club.db"

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

# User model
class UserDB(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    elo_rating = Column(Float, default=1200.0)
    matches_played = Column(Integer, default=0)
    matches_won = Column(Integer, default=0)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Match model
class MatchDB(Base):
    __tablename__ = "matches"
    
    id = Column(String, primary_key=True)
    player1_id = Column(String)
    player2_id = Column(String)
    player1_username = Column(String)
    player2_username = Column(String)
    match_type = Column(String)
    result = Column(String)
    winner_id = Column(String)
    status = Column(String, default="pending")
    player1_elo_before = Column(Float)
    player2_elo_before = Column(Float)
    player1_elo_after = Column(Float, nullable=True)
    player2_elo_after = Column(Float, nullable=True)
    submitted_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)

# User achievements model
class UserAchievementDB(Base):
    __tablename__ = "user_achievements"
    
    id = Column(String, primary_key=True)
    user_id = Column(String)
    badges = Column(Text)  # JSON string
    total_points = Column(Integer, default=0)
    level = Column(Integer, default=1)
    experience = Column(Integer, default=0)
    next_level_exp = Column(Integer, default=100)

# Database dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Create tables
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)