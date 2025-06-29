from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict

from .server import get_current_user, User
from .database import get_db
from .achievement_service import (
    check_user_achievements,
    get_user_achievements,
)
from .achievements import UserAchievements

achievement_router = APIRouter(prefix="/api/achievements", tags=["Achievements"])

@achievement_router.post("/check", response_model=Dict)
async def check_and_award_achievements(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Check and award new achievements for the current user."""
    return await check_user_achievements(db, current_user.id)

@achievement_router.get("/me", response_model=UserAchievements)
async def get_my_achievements(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve achievements for the current user."""
    return await get_user_achievements(db, current_user.id)
