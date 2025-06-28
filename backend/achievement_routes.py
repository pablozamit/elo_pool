from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import asyncio
from .server import get_current_user, User, db
from .achievements import (
    AchievementSystem, Badge, UserBadge, UserAchievements, 
    BADGES_CATALOG, get_rarity_color, get_category_icon, get_user_title
)

achievement_router = APIRouter(prefix="/api/achievements", tags=["Achievements"])
achievement_system = AchievementSystem()

@achievement_router.get("/badges", response_model=List[Badge])
async def get_all_badges():
    """Obtiene todos los badges disponibles (excluyendo secretos no obtenidos)"""
    return [badge for badge in BADGES_CATALOG if not badge.secret]

@achievement_router.get("/badges/secret", response_model=List[Badge])
async def get_secret_badges(current_user: User = Depends(get_current_user)):
    """Obtiene badges secretos que el usuario ha desbloqueado"""
    user_achievements = await get_user_achievements(current_user.id)
    earned_badge_ids = [ub.badge_id for ub in user_achievements.badges]
    
    return [badge for badge in BADGES_CATALOG 
            if badge.secret and badge.id in earned_badge_ids]

@achievement_router.get("/user/{user_id}", response_model=UserAchievements)
async def get_user_achievements_endpoint(user_id: str):
    """Obtiene los logros de un usuario específico"""
    return await get_user_achievements(user_id)

@achievement_router.get("/me", response_model=UserAchievements)
async def get_my_achievements(current_user: User = Depends(get_current_user)):
    """Obtiene los logros del usuario actual"""
    return await get_user_achievements(current_user.id)

@achievement_router.get("/progress")
async def get_badge_progress(current_user: User = Depends(get_current_user)):
    """Obtiene el progreso hacia badges no obtenidos"""
    user_stats = await calculate_user_stats(current_user.id)
    user_achievements = await get_user_achievements(current_user.id)
    earned_badge_ids = [ub.badge_id for ub in user_achievements.badges]
    
    progress = []
    for badge in BADGES_CATALOG:
        if badge.id not in earned_badge_ids and not badge.secret:
            badge_progress = achievement_system.get_badge_progress(badge, user_stats)
            if badge_progress > 0:
                progress.append({
                    "badge": badge,
                    "progress": badge_progress,
                    "color": get_rarity_color(badge.rarity)
                })
    
    # Ordenar por progreso descendente
    progress.sort(key=lambda x: x["progress"], reverse=True)
    return progress

@achievement_router.get("/recommendations")
async def get_badge_recommendations(current_user: User = Depends(get_current_user)):
    """Obtiene recomendaciones de badges cercanos a completar"""
    user_stats = await calculate_user_stats(current_user.id)
    user_achievements = await get_user_achievements(current_user.id)
    earned_badge_ids = [ub.badge_id for ub in user_achievements.badges]
    
    return achievement_system.get_recommendations(user_stats, earned_badge_ids)

@achievement_router.get("/leaderboard")
async def get_achievement_leaderboard():
    """Obtiene el ranking de jugadores por puntos de logros"""
    achievements_cursor = db.user_achievements.find({}).sort("total_points", -1).limit(50)
    achievements_list = await achievements_cursor.to_list(length=50)
    
    leaderboard = []
    for i, achievement in enumerate(achievements_list):
        user = await db.users.find_one({"id": achievement["user_id"]})
        if user:
            leaderboard.append({
                "rank": i + 1,
                "username": user["username"],
                "total_points": achievement["total_points"],
                "level": achievement["level"],
                "title": get_user_title(achievement["level"]),
                "badge_count": len(achievement.get("badges", [])),
                "experience": achievement.get("experience", 0)
            })
    
    return leaderboard

@achievement_router.get("/stats/global")
async def get_global_achievement_stats():
    """Obtiene estadísticas globales de logros"""
    total_users = await db.users.count_documents({})
    
    badge_stats = {}
    for badge in BADGES_CATALOG:
        count = await db.user_achievements.count_documents({
            "badges.badge_id": badge.id
        })
        badge_stats[badge.id] = {
            "name": badge.name,
            "earned_by": count,
            "percentage": (count / total_users * 100) if total_users > 0 else 0,
            "rarity": badge.rarity.value,
            "category": badge.category.value
        }
    
    # Estadísticas por categoría
    category_stats = {}
    for badge in BADGES_CATALOG:
        category = badge.category.value
        if category not in category_stats:
            category_stats[category] = {"total": 0, "earned": 0}
        category_stats[category]["total"] += 1
        category_stats[category]["earned"] += badge_stats[badge.id]["earned_by"]
    
    return {
        "total_badges": len(BADGES_CATALOG),
        "total_users": total_users,
        "badge_stats": badge_stats,
        "category_stats": category_stats,
        "rarest_badges": sorted(
            [{"id": bid, **stats} for bid, stats in badge_stats.items()],
            key=lambda x: x["percentage"]
        )[:10]
    }

@achievement_router.post("/check")
async def check_and_award_achievements(current_user: User = Depends(get_current_user)):
    """Verifica y otorga nuevos logros al usuario"""
    return await check_user_achievements(current_user.id)

# Funciones auxiliares
async def get_user_achievements(user_id: str) -> UserAchievements:
    """Obtiene o crea los logros de un usuario"""
    achievements_doc = await db.user_achievements.find_one({"user_id": user_id})
    
    if not achievements_doc:
        # Crear nuevo documento de logros
        new_achievements = UserAchievements(user_id=user_id)
        await db.user_achievements.insert_one(new_achievements.dict())
        return new_achievements
    
    return UserAchievements(**achievements_doc)

async def calculate_user_stats(user_id: str) -> Dict:
    """Calcula estadísticas completas del usuario para verificar logros"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        return {}
    
    # Estadísticas básicas del usuario
    stats = {
        "matches_played": user.get("matches_played", 0),
        "matches_won": user.get("matches_won", 0),
        "elo_rating": user.get("elo_rating", 1200),
        "created_at": user.get("created_at")
    }
    
    # Estadísticas de partidos
    matches = await db.matches.find({
        "$or": [{"player1_id": user_id}, {"player2_id": user_id}],
        "status": "confirmed"
    }).to_list(length=None)
    
    # Calcular estadísticas avanzadas
    stats.update(await calculate_advanced_stats(user_id, matches, user))
    
    return stats

async def calculate_advanced_stats(user_id: str, matches: List, user: Dict) -> Dict:
    """Calcula estadísticas avanzadas para logros complejos"""
    stats = {}
    
    # Oponentes únicos
    opponents = set()
    for match in matches:
        opponent_id = match["player2_id"] if match["player1_id"] == user_id else match["player1_id"]
        opponents.add(opponent_id)
    stats["unique_opponents"] = len(opponents)
    
    # Estadísticas por tipo de partida
    match_type_stats = {}
    for match in matches:
        match_type = match["match_type"]
        if match_type not in match_type_stats:
            match_type_stats[match_type] = {"played": 0, "won": 0}
        
        match_type_stats[match_type]["played"] += 1
        if match["winner_id"] == user_id:
            match_type_stats[match_type]["won"] += 1
    
    for match_type, type_stats in match_type_stats.items():
        stats[f"{match_type}_wins"] = type_stats["won"]
        stats[f"{match_type}_played"] = type_stats["played"]
    
    # Rachas de victorias
    current_streak = 0
    max_streak = 0
    for match in sorted(matches, key=lambda x: x["confirmed_at"]):
        if match["winner_id"] == user_id:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    
    stats["win_streak"] = current_streak
    stats["max_win_streak"] = max_streak
    
    # Ratio de victorias
    if stats.get("matches_played", 0) > 0:
        stats["win_ratio"] = stats.get("matches_won", 0) / stats["matches_played"]
    else:
        stats["win_ratio"] = 0
    
    # Estadísticas temporales (últimos 30 días)
    recent_matches = [m for m in matches 
                     if datetime.fromisoformat(m["confirmed_at"].replace('Z', '+00:00')) > 
                     datetime.utcnow() - timedelta(days=30)]
    
    stats["recent_matches"] = len(recent_matches)
    stats["recent_wins"] = len([m for m in recent_matches if m["winner_id"] == user_id])
    
    # Ranking actual
    all_users = await db.users.find({"is_admin": {"$ne": True}}).sort("elo_rating", -1).to_list(length=None)
    for i, ranked_user in enumerate(all_users):
        if ranked_user["id"] == user_id:
            stats["rank"] = i + 1
            break
    
    return stats

async def check_user_achievements(user_id: str) -> Dict:
    """Verifica y otorga nuevos logros a un usuario"""
    user_stats = await calculate_user_stats(user_id)
    user_achievements = await get_user_achievements(user_id)
    earned_badge_ids = [ub.badge_id for ub in user_achievements.badges]
    
    new_badges = []
    total_new_points = 0
    
    # Verificar cada badge
    for badge in BADGES_CATALOG:
        if badge.id not in earned_badge_ids:
            if achievement_system.check_badge_requirements(badge, user_stats):
                # Otorgar badge
                new_badge = UserBadge(
                    badge_id=badge.id,
                    earned_at=datetime.utcnow(),
                    progress=100.0
                )
                user_achievements.badges.append(new_badge)
                new_badges.append(badge)
                total_new_points += badge.points
    
    # Actualizar puntos totales y nivel
    user_achievements.total_points += total_new_points
    user_achievements.experience += total_new_points
    
    # Calcular nuevo nivel
    new_level, next_level_exp = achievement_system.calculate_level(user_achievements.experience)
    old_level = user_achievements.level
    user_achievements.level = new_level
    user_achievements.next_level_exp = next_level_exp
    
    # Guardar cambios
    if new_badges:
        await db.user_achievements.update_one(
            {"user_id": user_id},
            {"$set": user_achievements.dict()},
            upsert=True
        )
    
    return {
        "new_badges": new_badges,
        "total_new_points": total_new_points,
        "level_up": new_level > old_level,
        "new_level": new_level,
        "new_title": get_user_title(new_level) if new_level > old_level else None
    }

# Hook para verificar logros después de cada partida
async def check_achievements_after_match(user_id: str):
    """Función para llamar después de confirmar un partido"""
    return await check_user_achievements(user_id)