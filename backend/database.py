from sqlalchemy import create_engine, Column, String, Float, Integer, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database URL - using SQLite for simplicity
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./pool_club.db")

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=True)

# Create async session
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Base class for models
Base = declarative_base()

# Database Models
class UserDB(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    elo_rating = Column(Float, default=1200.0)
    matches_played = Column(Integer, default=0)
    matches_won = Column(Integer, default=0)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class MatchDB(Base):
    __tablename__ = "matches"
    
    id = Column(String, primary_key=True)
    player1_id = Column(String, nullable=False)
    player2_id = Column(String, nullable=False)
    player1_username = Column(String, nullable=False)
    player2_username = Column(String, nullable=False)
    match_type = Column(String, nullable=False)
    result = Column(String, nullable=False)
    winner_id = Column(String, nullable=False)
    status = Column(String, default="pending")
    player1_elo_before = Column(Float, nullable=False)
    player2_elo_before = Column(Float, nullable=False)
    player1_elo_after = Column(Float, nullable=True)
    player2_elo_after = Column(Float, nullable=True)
    submitted_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)

class UserAchievementDB(Base):
    __tablename__ = "user_achievements"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    achievement_id = Column(String, nullable=False)
    earned_at = Column(DateTime, default=datetime.utcnow)
    progress = Column(Integer, default=0)

# Database functions
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)