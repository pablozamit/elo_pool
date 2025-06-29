from datetime import datetime
from typing import Dict, List
import uuid

from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session

from .achievements import (
    AchievementSystem, Badge, UserBadge, UserAchievements,
    BADGES_CATALOG, get_user_title
)
from .database import UserDB, MatchDB, UserAchievementDB

achievement_system = AchievementSystem()

async def get_user_achievements(db: Session, user_id: str) -> UserAchievements:
    result = await db.execute(
        select(UserAchievementDB).where(UserAchievementDB.user_id == user_id)
    )
    rows = result.scalars().all()

    badges = [
        UserBadge(
            badge_id=row.achievement_id,
            earned_at=row.earned_at,
            progress=float(row.progress),
        )
        for row in rows
    ]

    total_points = sum(
        achievement_system.badges[b.badge_id].points
        for b in badges
        if b.badge_id in achievement_system.badges
    )
    experience = total_points
    level, next_level_exp = achievement_system.calculate_level(experience)

    return UserAchievements(
        user_id=user_id,
        badges=badges,
        total_points=total_points,
        level=level,
        experience=experience,
        next_level_exp=next_level_exp,
    )

async def calculate_user_stats(db: Session, user_id: str) -> Dict:
    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {}

    stats = {
        "matches_played": user.matches_played,
        "matches_won": user.matches_won,
        "elo_rating": user.elo_rating,
        "created_at": user.created_at,
    }

    result = await db.execute(
        select(MatchDB).where(
            and_(
                or_(MatchDB.player1_id == user_id, MatchDB.player2_id == user_id),
                MatchDB.status == "confirmed",
            )
        )
    )
    matches = result.scalars().all()
    stats["total_matches"] = len(matches)
    stats["total_wins"] = len([m for m in matches if m.winner_id == user_id])

    current_streak = 0
    max_streak = 0
    for m in sorted(matches, key=lambda x: x.confirmed_at or x.created_at):
        if m.winner_id == user_id:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    stats["win_streak"] = current_streak
    stats["max_win_streak"] = max_streak

    for m in matches:
        key_played = f"{m.match_type}_played"
        stats[key_played] = stats.get(key_played, 0) + 1
        if m.winner_id == user_id:
            key_wins = f"{m.match_type}_wins"
            stats[key_wins] = stats.get(key_wins, 0) + 1

    return stats

async def check_user_achievements(db, user_id: str) -> Dict:
    user_stats = await calculate_user_stats(db, user_id)
    user_achievements = await get_user_achievements(db, user_id)
    earned_badge_ids = [ub.badge_id for ub in user_achievements.badges]

    new_badges: List[Badge] = []
    total_new_points = 0
    for badge in BADGES_CATALOG:
        if badge.id not in earned_badge_ids:
            if achievement_system.check_badge_requirements(badge, user_stats):
                new_badge = UserBadge(
                    badge_id=badge.id,
                    earned_at=datetime.utcnow(),
                    progress=100.0,
                )
                user_achievements.badges.append(new_badge)
                new_badges.append(badge)
                total_new_points += badge.points

    user_achievements.total_points += total_new_points
    user_achievements.experience += total_new_points
    new_level, next_level_exp = achievement_system.calculate_level(
        user_achievements.experience
    )
    old_level = user_achievements.level
    user_achievements.level = new_level
    user_achievements.next_level_exp = next_level_exp

    if new_badges:
        for badge in new_badges:
            db.add(
                UserAchievementDB(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    achievement_id=badge.id,
                    earned_at=datetime.utcnow(),
                    progress=100,
                )
            )
        await db.flush()

    return {
        "new_badges": new_badges,
        "total_new_points": total_new_points,
        "level_up": new_level > old_level,
        "new_level": new_level,
        "new_title": get_user_title(new_level) if new_level > old_level else None,
    }

async def check_achievements_after_match(db, user_id: str):
    return await check_user_achievements(db, user_id)
