from datetime import datetime
from typing import Dict, List
import uuid

from .database import get_db_ref
from .achievements import (
    AchievementSystem,
    Badge,
    UserBadge,
    UserAchievements,
    BADGES_CATALOG,
    get_user_title,
)

achievement_system = AchievementSystem()

async def get_user_achievements(user_id: str) -> UserAchievements:
    """
    Recupera los logros de un usuario desde Firebase.
    """
    achievements_ref = get_db_ref(f"user_achievements/{user_id}")
    achievements_data = achievements_ref.get()

    if not achievements_data:
        achievements_data = {}

    experience = achievements_data.pop("total_experience", 0)

    badges = [
        UserBadge(
            badge_id=badge_id,
            earned_at=badge_info["earned_at"],
            progress=float(badge_info.get("progress", 100.0)),
        )
        for badge_id, badge_info in achievements_data.items()
    ]

    total_points = sum(
        achievement_system.badges[b.badge_id].points
        for b in badges
        if b.badge_id in achievement_system.badges
    )
    level, next_level_exp = achievement_system.calculate_level(experience)

    return UserAchievements(
        user_id=user_id,
        badges=badges,
        total_points=total_points,
        level=level,
        experience=experience,
        next_level_exp=next_level_exp,
    )


async def calculate_user_stats(user_id: str) -> Dict:
    """
    Calcula las estadísticas de un usuario a partir de los datos en Firebase.
    """
    user_ref = get_db_ref(f"users/{user_id}")
    user = user_ref.get()
    if not user:
        return {}

    stats = {
        "matches_played": user.get("matches_played", 0),
        "matches_won": user.get("matches_won", 0),
        "elo_rating": user.get("elo_rating", 1200),
        "created_at": user.get("created_at"),
    }

    matches_ref = get_db_ref("matches")

    # Realizar dos consultas separadas para las estadísticas del usuario
    query1 = matches_ref.order_by_child('player1_id').equal_to(user_id).get()
    query2 = matches_ref.order_by_child('player2_id').equal_to(user_id).get()

    user_matches = []
    if query1:
        user_matches.extend(list(query1.values()))
    if query2:
        user_matches.extend(list(query2.values()))

    user_matches = [m for m in user_matches if m.get('status') == 'confirmed']

    stats["total_matches"] = len(user_matches)
    stats["total_wins"] = len(
        [m for m in user_matches if m.get("winner_id") == user_id]
    )

    current_streak = 0
    max_streak = 0
    # Ordenar partidos por fecha de confirmación
    sorted_matches = sorted(
        user_matches, key=lambda x: x.get("confirmed_at") or x.get("created_at")
    )
    for m in sorted_matches:
        if m.get("winner_id") == user_id:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    stats["win_streak"] = current_streak
    stats["max_win_streak"] = max_streak

    for m in user_matches:
        match_type = m.get("match_type")
        if match_type:
            key_played = f"{match_type}_played"
            stats[key_played] = stats.get(key_played, 0) + 1
            if m.get("winner_id") == user_id:
                key_wins = f"{match_type}_wins"
                stats[key_wins] = stats.get(key_wins, 0) + 1

    # Lógica de liderazgo (consulta ineficiente aislada)
    all_confirmed_matches = matches_ref.order_by_child('status').equal_to('confirmed').get()
    now = datetime.utcnow()
    from collections import Counter
    from datetime import timedelta

    def is_leader(start_date: datetime) -> bool:
        relevant_matches = [
            m for m in (all_confirmed_matches or {}).values()
            if m.get("confirmed_at") and datetime.fromisoformat(m["confirmed_at"]) >= start_date
        ]

        if not relevant_matches:
            return False

        winner_ids = [m["winner_id"] for m in relevant_matches]
        win_counts = Counter(winner_ids)

        if not win_counts:
            return False

        max_wins = max(win_counts.values())

        return win_counts.get(user_id, 0) == max_wins and max_wins > 0

    start_day = datetime(now.year, now.month, now.day)
    start_week = start_day - timedelta(days=start_day.weekday())
    start_month = datetime(now.year, now.month, 1)
    quarter_month = 3 * ((now.month - 1) // 3) + 1
    start_quarter = datetime(now.year, quarter_month, 1)
    start_year = datetime(now.year, 1, 1)

    stats["daily_wins_leader"] = is_leader(start_day)
    stats["weekly_wins_leader"] = is_leader(start_week)
    stats["monthly_wins_leader"] = is_leader(start_month)
    stats["quarter_wins_leader"] = is_leader(start_quarter)
    stats["yearly_wins_leader"] = is_leader(start_year)

    return stats


async def check_user_achievements(user_id: str) -> Dict:
    """
    Verifica si un usuario ha desbloqueado nuevos logros.
    """
    user_stats = await calculate_user_stats(user_id)
    user_achievements = await get_user_achievements(user_id)
    earned_badge_ids = {ub.badge_id for ub in user_achievements.badges}

    new_badges: List[Badge] = []
    total_new_points = 0

    for badge in BADGES_CATALOG:
        if badge.id not in earned_badge_ids:
            if achievement_system.check_badge_requirements(badge, user_stats):
                new_badge_data = {
                    "badge_id": badge.id,
                    "earned_at": datetime.utcnow().isoformat(),
                    "progress": 100.0,
                }

                # Guardar el nuevo logro en Firebase
                achievements_ref = get_db_ref(f"user_achievements/{user_id}/{badge.id}")
                achievements_ref.set(new_badge_data)

                new_badges.append(badge)
                total_new_points += badge.points

    level_up_info = {}
    if new_badges:
        old_level = user_achievements.level
        new_total_points = user_achievements.total_points + total_new_points
        new_level, _ = achievement_system.calculate_level(new_total_points)

        if new_level > old_level:
            level_up_info = {
                "level_up": True,
                "new_level": new_level,
                "new_title": get_user_title(new_level),
            }

        # Guardar la nueva experiencia total
        get_db_ref(f"user_achievements/{user_id}").update({"total_experience": new_total_points})

    return {
        "new_badges": new_badges,
        "total_new_points": total_new_points,
        **level_up_info,
    }


async def check_achievements_after_match(user_id: str):
    """
    Función de conveniencia para ser llamada después de un partido.
    """
    return await check_user_achievements(user_id)
