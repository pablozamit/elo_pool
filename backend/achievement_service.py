from datetime import datetime
from typing import Dict, List

from .achievements import (
    AchievementSystem, Badge, UserBadge, UserAchievements,
    BADGES_CATALOG, get_user_title
)

achievement_system = AchievementSystem()

async def get_user_achievements(db, user_id: str) -> UserAchievements:
    achievements_doc = await db.user_achievements.find_one({"user_id": user_id})
    if not achievements_doc:
        new_achievements = UserAchievements(user_id=user_id)
        await db.user_achievements.insert_one(new_achievements.dict())
        return new_achievements
    return UserAchievements(**achievements_doc)

async def calculate_user_stats(db, user_id: str) -> Dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        return {}
    stats = {
        "matches_played": user.get("matches_played", 0),
        "matches_won": user.get("matches_won", 0),
        "elo_rating": user.get("elo_rating", 1200),
        "created_at": user.get("created_at"),
    }
    matches = await db.matches.find({
        "$or": [{"player1_id": user_id}, {"player2_id": user_id}],
        "status": "confirmed",
    }).to_list(length=None)
    stats["total_matches"] = len(matches)
    stats["total_wins"] = len([m for m in matches if m["winner_id"] == user_id])
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
        await db.user_achievements.update_one(
            {"user_id": user_id}, {"$set": user_achievements.dict()}, upsert=True
        )

    return {
        "new_badges": new_badges,
        "total_new_points": total_new_points,
        "level_up": new_level > old_level,
        "new_level": new_level,
        "new_title": get_user_title(new_level) if new_level > old_level else None,
    }

async def check_achievements_after_match(db, user_id: str):
    return await check_user_achievements(db, user_id)
