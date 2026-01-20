from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from .server import get_current_user, User, db
from .achievement_service import get_user_achievements

profile_router = APIRouter(prefix="/api/users", tags=["User Profiles"])

@profile_router.get("/{user_id}")
async def get_user_profile(user_id: str, current_user: User = Depends(get_current_user)):
    """Obtiene el perfil público de un usuario"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Información pública del usuario
    public_profile = {
        "id": user["id"],
        "username": user["username"],
        "elo_rating": user["elo_rating"],
        "matches_played": user["matches_played"],
        "matches_won": user["matches_won"],
        "is_admin": user.get("is_admin", False),
        "created_at": user["created_at"]
    }
    
    return public_profile

@profile_router.get("/{user_id}/stats")
async def get_user_stats(user_id: str, current_user: User = Depends(get_current_user)):
    """Obtiene estadísticas detalladas de un usuario"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Obtener todos los partidos del usuario
    matches = await db.matches.find({
        "$or": [{"player1_id": user_id}, {"player2_id": user_id}],
        "status": "confirmed"
    }).to_list(length=None)
    
    # Calcular estadísticas
    stats = await calculate_detailed_stats(user_id, matches, user)
    
    return stats

@profile_router.get("/{user_id}/matches/public")
async def get_user_public_matches(user_id: str, current_user: User = Depends(get_current_user)):
    """Obtiene el historial público de partidos de un usuario"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Obtener partidos confirmados (información pública)
    matches = await db.matches.find({
        "$or": [{"player1_id": user_id}, {"player2_id": user_id}],
        "status": "confirmed"
    }).sort("confirmed_at", -1).limit(50).to_list(length=50)
    
    # Formatear respuesta
    formatted_matches = []
    for match in matches:
        formatted_matches.append({
            "id": match["id"],
            "player1_id": match["player1_id"],
            "player2_id": match["player2_id"],
            "player1_username": match["player1_username"],
            "player2_username": match["player2_username"],
            "match_type": match["match_type"],
            "result": match["result"],
            "winner_id": match["winner_id"],
            "confirmed_at": match["confirmed_at"]
        })
    
    return formatted_matches

@profile_router.get("/{user_id}/achievements/public")
async def get_user_public_achievements(user_id: str):
    """Obtiene los logros públicos de un usuario"""
    achievements = await get_user_achievements(user_id)
    
    # Solo mostrar información pública de logros
    public_achievements = {
        "user_id": achievements.user_id,
        "total_points": achievements.total_points,
        "level": achievements.level,
        "badge_count": len(achievements.badges),
        "recent_badges": achievements.badges[-5:] if achievements.badges else []  # Últimos 5 badges
    }
    
    return public_achievements

@profile_router.get("/{user_id}/ranking")
async def get_user_ranking_info(user_id: str):
    """Obtiene información del ranking del usuario"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Obtener ranking actual
    all_users = await db.users.find(
        {"is_admin": {"$ne": True}}
    ).sort("elo_rating", -1).to_list(length=None)
    
    current_rank = None
    for i, ranked_user in enumerate(all_users):
        if ranked_user["id"] == user_id:
            current_rank = i + 1
            break
    
    # Calcular estadísticas de ranking
    total_players = len(all_users)
    percentile = ((total_players - current_rank + 1) / total_players * 100) if current_rank else 0
    
    return {
        "current_rank": current_rank,
        "total_players": total_players,
        "percentile": round(percentile, 1),
        "elo_rating": user["elo_rating"]
    }

async def calculate_detailed_stats(user_id: str, matches: List, user: Dict) -> Dict:
    """Calcula estadísticas detalladas del usuario"""
    stats = {
        "total_matches": len(matches),
        "total_wins": len([m for m in matches if m["winner_id"] == user_id]),
        "current_streak": 0,
        "best_streak": 0,
        "unique_opponents": set(),
        "match_types": {},
        "temporal_stats": {},
        "elo_progression": {}
    }
    
    # Calcular rachas
    current_streak = 0
    best_streak = 0
    
    for match in sorted(matches, key=lambda x: x["confirmed_at"]):
        # Oponentes únicos
        opponent_id = match["player2_id"] if match["player1_id"] == user_id else match["player1_id"]
        stats["unique_opponents"].add(opponent_id)
        
        # Rachas
        if match["winner_id"] == user_id:
            current_streak += 1
            best_streak = max(best_streak, current_streak)
        else:
            current_streak = 0
    
    # Racha actual (desde el último partido)
    if matches:
        last_match = max(matches, key=lambda x: x["confirmed_at"])
        if last_match["winner_id"] == user_id:
            # Contar hacia atrás desde el último partido
            for match in reversed(sorted(matches, key=lambda x: x["confirmed_at"])):
                if match["winner_id"] == user_id:
                    stats["current_streak"] += 1
                else:
                    break
    
    stats["best_streak"] = best_streak
    stats["unique_opponents"] = len(stats["unique_opponents"])
    
    # Estadísticas por tipo de partida
    for match in matches:
        match_type = match["match_type"]
        if match_type not in stats["match_types"]:
            stats["match_types"][match_type] = {"played": 0, "won": 0}
        
        stats["match_types"][match_type]["played"] += 1
        if match["winner_id"] == user_id:
            stats["match_types"][match_type]["won"] += 1
    
    # Estadísticas temporales
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    stats["temporal_stats"] = {
        "this_week": calculate_period_stats(matches, user_id, week_ago),
        "this_month": calculate_period_stats(matches, user_id, month_ago),
        "last_30_days": calculate_period_stats(matches, user_id, month_ago)
    }
    
    # Progresión de ELO (simplificada)
    stats["elo_progression"] = {
        "current": user["elo_rating"],
        "peak": user.get("elo_peak", user["elo_rating"]),
        "low": user.get("elo_low", user["elo_rating"]),
        "total_change": user["elo_rating"] - 1200  # Asumiendo 1200 como ELO inicial
    }
    
    # Obtener ranking actual
    all_users = await db.users.find(
        {"is_admin": {"$ne": True}}
    ).sort("elo_rating", -1).to_list(length=None)
    
    for i, ranked_user in enumerate(all_users):
        if ranked_user["id"] == user_id:
            stats["rank"] = i + 1
            break
    
    return stats

def calculate_period_stats(matches: List, user_id: str, since_date: datetime) -> Dict:
    """Calcula estadísticas para un período específico"""
    period_matches = [
        m for m in matches 
        if datetime.fromisoformat(m["confirmed_at"].replace('Z', '+00:00')) >= since_date
    ]
    
    return {
        "matches": len(period_matches),
        "wins": len([m for m in period_matches if m["winner_id"] == user_id]),
        "win_rate": (len([m for m in period_matches if m["winner_id"] == user_id]) / len(period_matches) * 100) if period_matches else 0
    }