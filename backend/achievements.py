from enum import Enum
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import math

class BadgeCategory(str, Enum):
    BEGINNER = "beginner"           # Badges para nuevos jugadores
    SKILL = "skill"                 # Basados en habilidad y ELO
    CONSISTENCY = "consistency"     # Juego regular y constante
    SOCIAL = "social"               # Interacción social
    ACHIEVEMENT = "achievement"     # Logros específicos
    STREAK = "streak"               # Rachas y secuencias
    SPECIAL = "special"             # Eventos especiales
    LEGENDARY = "legendary"         # Logros épicos

class BadgeRarity(str, Enum):
    COMMON = "common"               # 70% de jugadores pueden obtenerlo
    UNCOMMON = "uncommon"           # 40% de jugadores
    RARE = "rare"                   # 15% de jugadores
    EPIC = "epic"                   # 5% de jugadores
    LEGENDARY = "legendary"         # 1% de jugadores
    MYTHIC = "mythic"              # 0.1% de jugadores

class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    category: BadgeCategory
    rarity: BadgeRarity
    points: int                     # Puntos de gamificación que otorga
    secret: bool = False           # Badge oculto hasta obtenerlo
    requirements: Dict             # Criterios para obtenerlo
    flavor_text: str = ""         # Texto adicional divertido

class UserBadge(BaseModel):
    badge_id: str
    earned_at: datetime
    progress: float = 100.0        # Progreso hacia el badge (0-100)
    
class UserAchievements(BaseModel):
    user_id: str
    badges: List[UserBadge] = []
    total_points: int = 0
    level: int = 1
    experience: int = 0
    next_level_exp: int = 100

# Definición de los 50 badges
BADGES_CATALOG = [
    # === BEGINNER BADGES (Nuevos Jugadores) ===
    Badge(
        id="first_steps",
        name="Primeros Pasos",
        description="Registra tu primera cuenta en el club",
        icon="🎱",
        category=BadgeCategory.BEGINNER,
        rarity=BadgeRarity.COMMON,
        points=10,
        requirements={"action": "register"},
        flavor_text="Todo gran jugador empezó con un primer paso"
    ),
    
    Badge(
        id="first_match",
        name="Debut",
        description="Juega tu primer partido",
        icon="🎯",
        category=BadgeCategory.BEGINNER,
        rarity=BadgeRarity.COMMON,
        points=25,
        requirements={"matches_played": 1},
        flavor_text="El primer partido nunca se olvida"
    ),
    
    Badge(
        id="first_victory",
        name="Primera Victoria",
        description="Gana tu primer partido",
        icon="🏆",
        category=BadgeCategory.BEGINNER,
        rarity=BadgeRarity.COMMON,
        points=50,
        requirements={"matches_won": 1},
        flavor_text="El sabor de la primera victoria es único"
    ),
    
    Badge(
        id="rookie",
        name="Novato",
        description="Completa 5 partidos",
        icon="🌱",
        category=BadgeCategory.BEGINNER,
        rarity=BadgeRarity.COMMON,
        points=75,
        requirements={"matches_played": 5},
        flavor_text="Ya no eres tan nuevo en esto"
    ),
    
    Badge(
        id="getting_started",
        name="Tomando Ritmo",
        description="Gana 3 partidos",
        icon="⚡",
        category=BadgeCategory.BEGINNER,
        rarity=BadgeRarity.UNCOMMON,
        points=100,
        requirements={"matches_won": 3},
        flavor_text="Empiezas a encontrar tu estilo"
    ),

    # === SKILL BADGES (Habilidad y ELO) ===
    Badge(
        id="rising_star",
        name="Estrella Emergente",
        description="Alcanza 1300 puntos ELO",
        icon="⭐",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.UNCOMMON,
        points=150,
        requirements={"elo_rating": 1300},
        flavor_text="Tu talento empieza a brillar"
    ),
    
    Badge(
        id="skilled_player",
        name="Jugador Hábil",
        description="Alcanza 1500 puntos ELO",
        icon="🎯",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.RARE,
        points=250,
        requirements={"elo_rating": 1500},
        flavor_text="Tu precisión es envidiable"
    ),
    
    Badge(
        id="expert",
        name="Experto",
        description="Alcanza 1700 puntos ELO",
        icon="🎓",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.EPIC,
        points=400,
        requirements={"elo_rating": 1700},
        flavor_text="Pocos llegan a este nivel de maestría"
    ),
    
    Badge(
        id="master",
        name="Maestro",
        description="Alcanza 1900 puntos ELO",
        icon="👑",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.LEGENDARY,
        points=750,
        requirements={"elo_rating": 1900},
        flavor_text="Tu dominio del juego es legendario"
    ),
    
    Badge(
        id="grandmaster",
        name="Gran Maestro",
        description="Alcanza 2100 puntos ELO",
        icon="💎",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.MYTHIC,
        points=1500,
        requirements={"elo_rating": 2100},
        flavor_text="Eres una leyenda viviente del billar"
    ),

    # === CONSISTENCY BADGES (Constancia) ===
    Badge(
        id="regular",
        name="Habitual",
        description="Juega al menos 1 partido por semana durante 4 semanas",
        icon="📅",
        category=BadgeCategory.CONSISTENCY,
        rarity=BadgeRarity.UNCOMMON,
        points=200,
        requirements={"weekly_consistency": 4},
        flavor_text="La constancia es la clave del éxito"
    ),
    
    Badge(
        id="dedicated",
        name="Dedicado",
        description="Juega 50 partidos",
        icon="💪",
        category=BadgeCategory.CONSISTENCY,
        rarity=BadgeRarity.RARE,
        points=300,
        requirements={"matches_played": 50},
        flavor_text="Tu dedicación es admirable"
    ),
    
    Badge(
        id="veteran",
        name="Veterano",
        description="Juega 100 partidos",
        icon="🛡️",
        category=BadgeCategory.CONSISTENCY,
        rarity=BadgeRarity.EPIC,
        points=500,
        requirements={"matches_played": 100},
        flavor_text="Eres un pilar del club"
    ),
    
    Badge(
        id="iron_will",
        name="Voluntad de Hierro",
        description="Juega todos los días durante una semana",
        icon="⚔️",
        category=BadgeCategory.CONSISTENCY,
        rarity=BadgeRarity.RARE,
        points=350,
        requirements={"daily_streak": 7},
        flavor_text="Tu determinación es inquebrantable"
    ),

    # === SOCIAL BADGES (Interacción Social) ===
    Badge(
        id="friendly",
        name="Amigable",
        description="Juega contra 10 oponentes diferentes",
        icon="🤝",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.UNCOMMON,
        points=150,
        requirements={"unique_opponents": 10},
        flavor_text="Haces amigos en cada mesa"
    ),
    
    Badge(
        id="socializer",
        name="Socializador",
        description="Juega contra 25 oponentes diferentes",
        icon="👥",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.RARE,
        points=300,
        requirements={"unique_opponents": 25},
        flavor_text="Conoces a todo el club"
    ),
    
    Badge(
        id="mentor",
        name="Mentor",
        description="Ayuda a 5 jugadores nuevos (gana contra jugadores con <1200 ELO)",
        icon="🎓",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.EPIC,
        points=400,
        requirements={"mentor_wins": 5},
        flavor_text="Compartes tu sabiduría con los novatos"
    ),

    # === ACHIEVEMENT BADGES (Logros Específicos) ===
    Badge(
        id="comeback_king",
        name="Rey del Comeback",
        description="Gana un partido después de perder contra el mismo oponente",
        icon="🔄",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.RARE,
        points=250,
        requirements={"comeback_victory": True},
        flavor_text="Nunca te rindes, siempre vuelves más fuerte"
    ),
    
    Badge(
        id="giant_slayer",
        name="Mata Gigantes",
        description="Vence a un jugador con 200+ puntos ELO más que tú",
        icon="⚔️",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.EPIC,
        points=500,
        requirements={"upset_victory": 200},
        flavor_text="David venció a Goliat, tú venciste a un gigante"
    ),
    
    Badge(
        id="perfectionist",
        name="Perfeccionista",
        description="Mantén un 100% de victorias en tus primeros 5 partidos",
        icon="💯",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.EPIC,
        points=400,
        requirements={"perfect_start": 5},
        flavor_text="La perfección es tu estándar"
    ),
    
    Badge(
        id="tournament_champion",
        name="Campeón de Torneo",
        description="Gana 10 partidos de torneo",
        icon="🏆",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.LEGENDARY,
        points=600,
        requirements={"tournament_wins": 10},
        flavor_text="Los torneos son tu especialidad"
    ),
    
    Badge(
        id="league_dominator",
        name="Dominador de Liga",
        description="Gana 15 partidos de liga",
        icon="👑",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.LEGENDARY,
        points=700,
        requirements={"league_wins": 15},
        flavor_text="La liga es tu reino"
    ),

    # === STREAK BADGES (Rachas) ===
    Badge(
        id="hot_streak",
        name="Racha Caliente",
        description="Gana 3 partidos consecutivos",
        icon="🔥",
        category=BadgeCategory.STREAK,
        rarity=BadgeRarity.UNCOMMON,
        points=200,
        requirements={"win_streak": 3},
        flavor_text="Estás que ardes"
    ),
    
    Badge(
        id="unstoppable",
        name="Imparable",
        description="Gana 5 partidos consecutivos",
        icon="🚀",
        category=BadgeCategory.STREAK,
        rarity=BadgeRarity.RARE,
        points=350,
        requirements={"win_streak": 5},
        flavor_text="Nadie puede detenerte"
    ),
    
    Badge(
        id="legendary_streak",
        name="Racha Legendaria",
        description="Gana 10 partidos consecutivos",
        icon="⚡",
        category=BadgeCategory.STREAK,
        rarity=BadgeRarity.LEGENDARY,
        points=800,
        requirements={"win_streak": 10},
        flavor_text="Tu racha entrará en la historia del club"
    ),
    
    Badge(
        id="consistency_master",
        name="Maestro de la Consistencia",
        description="No pierdas más de 1 partido de cada 5 durante 20 partidos",
        icon="📊",
        category=BadgeCategory.STREAK,
        rarity=BadgeRarity.EPIC,
        points=450,
        requirements={"consistency_ratio": 0.8, "min_matches": 20},
        flavor_text="Tu consistencia es matemáticamente perfecta"
    ),

    # === SPECIAL BADGES (Eventos Especiales) ===
    Badge(
        id="night_owl",
        name="Búho Nocturno",
        description="Juega 10 partidos después de las 22:00",
        icon="🦉",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.UNCOMMON,
        points=150,
        requirements={"night_matches": 10},
        flavor_text="La noche es tu momento"
    ),
    
    Badge(
        id="early_bird",
        name="Madrugador",
        description="Juega 10 partidos antes de las 8:00",
        icon="🐦",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.UNCOMMON,
        points=150,
        requirements={"morning_matches": 10},
        flavor_text="El que madruga, Dios le ayuda"
    ),
    
    Badge(
        id="weekend_warrior",
        name="Guerrero de Fin de Semana",
        description="Juega 20 partidos en fines de semana",
        icon="⚔️",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.RARE,
        points=250,
        requirements={"weekend_matches": 20},
        flavor_text="Los fines de semana son para el billar"
    ),
    
    Badge(
        id="speed_demon",
        name="Demonio de la Velocidad",
        description="Completa 5 partidos en menos de 1 hora cada uno",
        icon="💨",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.RARE,
        points=300,
        requirements={"fast_matches": 5},
        flavor_text="Rápido como el rayo"
    ),

    # === LEGENDARY BADGES (Épicos y Únicos) ===
    Badge(
        id="club_legend",
        name="Leyenda del Club",
        description="Alcanza el puesto #1 en el ranking",
        icon="👑",
        category=BadgeCategory.LEGENDARY,
        rarity=BadgeRarity.LEGENDARY,
        points=1000,
        requirements={"rank": 1},
        flavor_text="Tu nombre será recordado para siempre"
    ),
    
    Badge(
        id="immortal",
        name="Inmortal",
        description="Mantente en el top 3 durante 30 días",
        icon="💎",
        category=BadgeCategory.LEGENDARY,
        rarity=BadgeRarity.MYTHIC,
        points=2000,
        requirements={"top3_days": 30},
        flavor_text="Tu legado es eterno"
    ),
    
    Badge(
        id="centurion",
        name="Centurión",
        description="Gana 100 partidos",
        icon="🏛️",
        category=BadgeCategory.LEGENDARY,
        rarity=BadgeRarity.LEGENDARY,
        points=1200,
        requirements={"matches_won": 100},
        flavor_text="Como los guerreros de la antigua Roma"
    ),
    
    Badge(
        id="untouchable",
        name="Intocable",
        description="Mantén un ratio de victorias del 90% con al menos 50 partidos",
        icon="🛡️",
        category=BadgeCategory.LEGENDARY,
        rarity=BadgeRarity.MYTHIC,
        points=2500,
        requirements={"win_ratio": 0.9, "min_matches": 50},
        flavor_text="Eres prácticamente invencible"
    ),

    # === BADGES SECRETOS ===
    Badge(
        id="phoenix",
        name="Fénix",
        description="Recupera 300+ puntos ELO después de perder 300+",
        icon="🔥",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.LEGENDARY,
        points=800,
        secret=True,
        requirements={"elo_recovery": 300},
        flavor_text="De las cenizas renaces más fuerte"
    ),
    
    Badge(
        id="time_traveler",
        name="Viajero del Tiempo",
        description="Juega a las 12:34 exactamente",
        icon="⏰",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.EPIC,
        points=500,
        secret=True,
        requirements={"exact_time": "12:34"},
        flavor_text="El tiempo se detiene para ti"
    ),
    
    Badge(
        id="lucky_seven",
        name="Siete de la Suerte",
        description="Gana exactamente 7 partidos seguidos, 7 veces",
        icon="🍀",
        category=BadgeCategory.STREAK,
        rarity=BadgeRarity.MYTHIC,
        points=1777,
        secret=True,
        requirements={"lucky_sevens": 7},
        flavor_text="Los números están de tu lado"
    ),

    # === BADGES DE DIVERSIÓN ===
    Badge(
        id="party_animal",
        name="Alma de la Fiesta",
        description="Juega en 5 días diferentes de la semana en una semana",
        icon="🎉",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.UNCOMMON,
        points=175,
        requirements={"weekly_variety": 5},
        flavor_text="Siempre estás listo para jugar"
    ),
    
    Badge(
        id="comeback_artist",
        name="Artista del Comeback",
        description="Gana 5 partidos después de estar perdiendo",
        icon="🎭",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.RARE,
        points=400,
        requirements={"comeback_wins": 5},
        flavor_text="El drama es tu especialidad"
    ),
    
    Badge(
        id="marathon_player",
        name="Jugador Maratón",
        description="Juega durante 6 horas en un solo día",
        icon="🏃",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.EPIC,
        points=600,
        requirements={"daily_hours": 6},
        flavor_text="Tu resistencia es sobrehumana"
    ),
    
    Badge(
        id="variety_master",
        name="Maestro de la Variedad",
        description="Gana al menos 3 partidos de cada tipo de juego",
        icon="🎨",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.RARE,
        points=350,
        requirements={"variety_wins": {"rey_mesa": 3, "liga_grupos": 3, "liga_finales": 3, "torneo": 3}},
        flavor_text="Dominas todos los estilos de juego"
    ),

    # === BADGES DE COMUNIDAD ===
    Badge(
        id="welcoming_committee",
        name="Comité de Bienvenida",
        description="Sé el primer oponente de 5 jugadores nuevos",
        icon="🤗",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.RARE,
        points=300,
        requirements={"first_opponent": 5},
        flavor_text="Haces que todos se sientan bienvenidos"
    ),
    
    Badge(
        id="teacher",
        name="Profesor",
        description="Pierde intencionalmente contra 3 jugadores novatos para enseñarles",
        icon="📚",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.EPIC,
        points=400,
        requirements={"teaching_losses": 3},
        flavor_text="Enseñar es la forma más noble de jugar"
    ),

    # === BADGES DE PRECISIÓN ===
    Badge(
        id="sharpshooter",
        name="Tirador Certero",
        description="Gana 10 partidos con resultados de 3-0 o 5-0",
        icon="🎯",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.RARE,
        points=400,
        requirements={"perfect_wins": 10},
        flavor_text="Tu precisión es quirúrgica"
    ),
    
    Badge(
        id="clutch_player",
        name="Jugador Clutch",
        description="Gana 5 partidos muy reñidos (diferencia de 1 punto)",
        icon="💎",
        category=BadgeCategory.SKILL,
        rarity=BadgeRarity.EPIC,
        points=500,
        requirements={"close_wins": 5},
        flavor_text="Brillas bajo presión"
    ),

    # === BADGES TEMPORALES ===
    Badge(
        id="monthly_champion",
        name="Campeón del Mes",
        description="Gana más partidos que cualquier otro jugador en un mes",
        icon="📅",
        category=BadgeCategory.ACHIEVEMENT,
        rarity=BadgeRarity.LEGENDARY,
        points=750,
        requirements={"monthly_wins_leader": True},
        flavor_text="Este mes fue tuyo"
    ),
    
    Badge(
        id="new_year_resolution",
        name="Propósito de Año Nuevo",
        description="Juega tu primer partido del año en enero",
        icon="🎊",
        category=BadgeCategory.SPECIAL,
        rarity=BadgeRarity.COMMON,
        points=100,
        requirements={"new_year_match": True},
        flavor_text="Empezaste el año con el pie derecho"
    ),

    # === BADGES DE RIVALIDAD ===
    Badge(
        id="rival",
        name="Rival",
        description="Juega 10 partidos contra el mismo oponente",
        icon="⚔️",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.UNCOMMON,
        points=200,
        requirements={"rival_matches": 10},
        flavor_text="Toda gran historia necesita un rival"
    ),
    
    Badge(
        id="nemesis",
        name="Némesis",
        description="Mantén una rivalidad equilibrada (45-55% victorias) en 20+ partidos",
        icon="⚖️",
        category=BadgeCategory.SOCIAL,
        rarity=BadgeRarity.EPIC,
        points=600,
        requirements={"balanced_rivalry": {"matches": 20, "win_rate_range": [0.45, 0.55]}},
        flavor_text="Una rivalidad perfectamente equilibrada"
    ),

    # === BADGE FINAL MÍTICO ===
    Badge(
        id="billiard_god",
        name="Dios del Billar",
        description="Obtén todos los demás badges",
        icon="🌟",
        category=BadgeCategory.LEGENDARY,
        rarity=BadgeRarity.MYTHIC,
        points=10000,
        secret=True,
        requirements={"all_badges": True},
        flavor_text="Has alcanzado la perfección absoluta. Eres una leyenda entre leyendas."
    )
]

class AchievementSystem:
    def __init__(self):
        self.badges = {badge.id: badge for badge in BADGES_CATALOG}
    
    def calculate_level(self, experience: int) -> tuple[int, int]:
        """Calcula el nivel y experiencia necesaria para el siguiente nivel"""
        # Fórmula exponencial: nivel = sqrt(exp/100)
        level = int(math.sqrt(experience / 100)) + 1
        next_level_exp = (level ** 2) * 100
        return level, next_level_exp
    
    def check_badge_requirements(self, badge: Badge, user_stats: Dict) -> bool:
        """Verifica si un usuario cumple los requisitos para un badge"""
        requirements = badge.requirements
        
        for req_key, req_value in requirements.items():
            user_value = user_stats.get(req_key, 0)
            
            if isinstance(req_value, dict):
                # Requisitos complejos
                if not self._check_complex_requirement(req_key, req_value, user_stats):
                    return False
            elif isinstance(req_value, (int, float)):
                # Requisitos numéricos simples
                if user_value < req_value:
                    return False
            elif isinstance(req_value, bool):
                # Requisitos booleanos
                if user_value != req_value:
                    return False
            elif isinstance(req_value, str):
                # Requisitos de string
                if user_value != req_value:
                    return False
        
        return True
    
    def _check_complex_requirement(self, req_key: str, req_value: Dict, user_stats: Dict) -> bool:
        """Maneja requisitos complejos como variety_wins, balanced_rivalry, etc."""
        if req_key == "variety_wins":
            for match_type, required_wins in req_value.items():
                user_wins = user_stats.get(f"{match_type}_wins", 0)
                if user_wins < required_wins:
                    return False
            return True
        
        elif req_key == "balanced_rivalry":
            matches = user_stats.get("rival_matches", 0)
            win_rate = user_stats.get("rival_win_rate", 0)
            min_rate, max_rate = req_value["win_rate_range"]
            
            return (matches >= req_value["matches"] and 
                   min_rate <= win_rate <= max_rate)
        
        return False
    
    def get_badge_progress(self, badge: Badge, user_stats: Dict) -> float:
        """Calcula el progreso hacia un badge (0-100%)"""
        requirements = badge.requirements
        total_progress = 0
        req_count = 0
        
        for req_key, req_value in requirements.items():
            user_value = user_stats.get(req_key, 0)
            
            if isinstance(req_value, (int, float)) and req_value > 0:
                progress = min(100, (user_value / req_value) * 100)
                total_progress += progress
                req_count += 1
            elif isinstance(req_value, bool):
                progress = 100 if user_value == req_value else 0
                total_progress += progress
                req_count += 1
        
        return total_progress / req_count if req_count > 0 else 0
    
    def get_available_badges(self, user_stats: Dict, earned_badges: List[str]) -> List[Badge]:
        """Obtiene badges disponibles para mostrar al usuario"""
        available = []
        
        for badge in BADGES_CATALOG:
            if badge.id not in earned_badges:
                if not badge.secret or self.check_badge_requirements(badge, user_stats):
                    available.append(badge)
        
        return available
    
    def get_recommendations(self, user_stats: Dict, earned_badges: List[str]) -> List[Dict]:
        """Recomienda badges que el usuario puede obtener pronto"""
        recommendations = []
        
        for badge in BADGES_CATALOG:
            if badge.id not in earned_badges and not badge.secret:
                progress = self.get_badge_progress(badge, user_stats)
                if 50 <= progress < 100:  # Entre 50% y 99% de progreso
                    recommendations.append({
                        "badge": badge,
                        "progress": progress,
                        "missing_requirements": self._get_missing_requirements(badge, user_stats)
                    })
        
        # Ordenar por progreso descendente
        recommendations.sort(key=lambda x: x["progress"], reverse=True)
        return recommendations[:5]  # Top 5 recomendaciones
    
    def _get_missing_requirements(self, badge: Badge, user_stats: Dict) -> Dict:
        """Obtiene los requisitos faltantes para un badge"""
        missing = {}
        
        for req_key, req_value in badge.requirements.items():
            user_value = user_stats.get(req_key, 0)
            
            if isinstance(req_value, (int, float)):
                if user_value < req_value:
                    missing[req_key] = req_value - user_value
        
        return missing

# Funciones de utilidad para gamificación
def get_rarity_color(rarity: BadgeRarity) -> str:
    """Obtiene el color asociado a cada rareza"""
    colors = {
        BadgeRarity.COMMON: "#9CA3AF",      # Gris
        BadgeRarity.UNCOMMON: "#10B981",    # Verde
        BadgeRarity.RARE: "#3B82F6",        # Azul
        BadgeRarity.EPIC: "#8B5CF6",        # Púrpura
        BadgeRarity.LEGENDARY: "#F59E0B",   # Dorado
        BadgeRarity.MYTHIC: "#EF4444"       # Rojo
    }
    return colors.get(rarity, "#9CA3AF")

def get_category_icon(category: BadgeCategory) -> str:
    """Obtiene el icono asociado a cada categoría"""
    icons = {
        BadgeCategory.BEGINNER: "🌱",
        BadgeCategory.SKILL: "🎯",
        BadgeCategory.CONSISTENCY: "📅",
        BadgeCategory.SOCIAL: "👥",
        BadgeCategory.ACHIEVEMENT: "🏆",
        BadgeCategory.STREAK: "🔥",
        BadgeCategory.SPECIAL: "⭐",
        BadgeCategory.LEGENDARY: "👑"
    }
    return icons.get(category, "🎱")

# Sistema de puntos y niveles
LEVEL_REWARDS = {
    5: {"title": "Aprendiz", "bonus_points": 100},
    10: {"title": "Jugador", "bonus_points": 250},
    15: {"title": "Competidor", "bonus_points": 500},
    20: {"title": "Experto", "bonus_points": 750},
    25: {"title": "Maestro", "bonus_points": 1000},
    30: {"title": "Leyenda", "bonus_points": 1500},
    50: {"title": "Dios del Billar", "bonus_points": 5000}
}

def get_user_title(level: int) -> str:
    """Obtiene el título del usuario basado en su nivel"""
    for req_level in sorted(LEVEL_REWARDS.keys(), reverse=True):
        if level >= req_level:
            return LEVEL_REWARDS[req_level]["title"]
    return "Novato"