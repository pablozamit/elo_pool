from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from enum import Enum
# Importaciones de la base de datos y servicios
from firebase_admin import db
from .database import get_db_ref
from .achievement_service import check_achievements_after_match, get_user_achievements as get_user_achievements_service
from .achievements import UserAchievements

# --- Configuración Inicial ---
JWT_SECRET = os.environ.get("JWT_SECRET", "clave_super_secreta_de_al_menos_32_caracteres_aqui")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

app = FastAPI(
    title="ELO Pool API",
    description="Backend para la aplicación de ranking de billar.",
    version="1.0.0"
)

# --- Middlewares ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, deberías restringir esto a tu dominio de frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modelos Pydantic (DTOs) ---

class MatchType(str, Enum):
    REY_MESA = "rey_mesa"
    TORNEO = "torneo"
    LIGA_GRUPOS = "liga_grupos"
    LIGA_FINALES = "liga_finales"

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    is_active: bool = True

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    elo_rating: float
    matches_played: int
    matches_won: int
    is_admin: bool
    is_active: bool
    created_at: datetime

class UserUpdateAdmin(BaseModel):
    elo_rating: Optional[float] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

class MatchSubmit(BaseModel):
    player1_id: str
    player2_id: str
    winner_id: str
    match_type: MatchType
    result: str

class MatchResponse(BaseModel):
    id: str
    player1_username: str
    player2_username: str
    match_type: MatchType
    result: str
    winner_username: str
    status: str
    created_at: datetime
    confirmed_at: Optional[datetime] = None

class EloPreviewRequest(BaseModel):
    player1_id: str
    player2_id: str
    winner_id: str
    match_type: MatchType

class EloPreviewResponse(BaseModel):
    user: Dict
    opponent: Dict

# --- Lógica de Negocio y Utilidades ---

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_k_factor(elo: float, matches_played: int) -> int:
    if matches_played < 30:
        return 40
    if elo > 2400:
        return 10
    return 20

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_jwt_token(data: dict, expires_delta: timedelta = timedelta(days=7)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def calculate_elo_change(winner_elo: float, loser_elo: float, winner_matches_played: int, loser_matches_played: int) -> tuple[float, float]:
    k_factor_winner = get_k_factor(winner_elo, winner_matches_played)
    k_factor_loser = get_k_factor(loser_elo, loser_matches_played)

    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    expected_loser = 1 / (1 + 10 ** ((winner_elo - loser_elo) / 400))
    
    new_winner_elo = winner_elo + k_factor_winner * (1 - expected_winner)
    new_loser_elo = loser_elo + k_factor_loser * (0 - expected_loser)
    
    return round(new_winner_elo, 2), round(new_loser_elo, 2)

# --- Dependencias de Seguridad ---

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    user_ref = get_db_ref(f'users/{user_id}')
    user = user_ref.get()
    
    if user is None or not user.get('is_active'):
        raise HTTPException(status_code=401, detail="User not found or inactive")
        
    return user

async def get_current_admin_user(current_user = Depends(get_current_user)):
    if not current_user.get('is_admin'):
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
    return current_user

# --- Rutas de la API ---

api_router = APIRouter(prefix="/api")

# -- Autenticación --
@api_router.post("/login", tags=["Authentication"])
async def login(form_data: UserLogin):
    users_ref = get_db_ref('users')
    user_data = users_ref.order_by_child('username').equal_to(form_data.username).get()
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    user_id = list(user_data.keys())[0]
    user = user_data[user_id]
    
    if not verify_password(form_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    access_token = create_jwt_token(data={"sub": user_id})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_details": UserResponse(**user)
    }

# -- Rankings y Partidos --
@api_router.get("/rankings", response_model=List[dict], tags=["Rankings"])
async def get_rankings_endpoint():
    users_ref = get_db_ref('users')
    all_users = users_ref.get()
    
    if not all_users:
        return []

    # Filter out admins and inactive users
    players = [user for user in all_users.values() if not user.get('is_admin') and user.get('is_active')]
    
    # Sort by ELO rating
    players.sort(key=lambda x: x.get('elo_rating', 0), reverse=True)
    
    rankings = []
    for i, user in enumerate(players):
        matches_played = user.get('matches_played', 0)
        matches_won = user.get('matches_won', 0)
        win_rate = (matches_won / matches_played * 100) if matches_played > 0 else 0
        rankings.append({
            "rank": i + 1,
            "id": user.get('id'),
            "username": user.get('username'),
            "elo_rating": round(user.get('elo_rating', 0)),
            "matches_played": matches_played,
            "matches_won": matches_won,
            "win_rate": round(win_rate, 1),
            "elo_change": 0, # Placeholder
            "rank_change": 0 # Placeholder
        })
    return rankings

@api_router.post("/matches/submit", response_model=MatchResponse, tags=["Matches"])
async def submit_match_endpoint(data: MatchSubmit, current_user = Depends(get_current_user)):
    if data.player1_id != current_user['id']:
        raise HTTPException(status_code=403, detail="Player 1 must be the current user")

    player1_ref = get_db_ref(f'users/{data.player1_id}')
    player1 = player1_ref.get()
    
    player2_ref = get_db_ref(f'users/{data.player2_id}')
    player2 = player2_ref.get()

    if not player2:
        raise HTTPException(status_code=404, detail="Opponent (Player 2) not found")

    if data.winner_id not in [player1['id'], player2['id']]:
        raise HTTPException(status_code=400, detail="Winner must be one of the players")
        
    winner_username = player1['username'] if data.winner_id == player1['id'] else player2['username']
    
    matches_ref = get_db_ref('matches')
    new_match_ref = matches_ref.push()
    match_id = new_match_ref.key

    new_match_data = {
        "id": match_id,
        "player1_id": player1['id'],
        "player2_id": player2['id'],
        "player1_username": player1['username'],
        "player2_username": player2['username'],
        "winner_id": data.winner_id,
        "match_type": data.match_type.value,
        "result": data.result,
        "status": "pending",
        "submitted_by": current_user['id'],
        "player1_elo_before": player1['elo_rating'],
        "player2_elo_before": player2['elo_rating'],
        "created_at": datetime.utcnow().isoformat(),
        "confirmed_at": None
    }

    new_match_ref.set(new_match_data)
    
    return MatchResponse(
        **new_match_data,
        winner_username=winner_username
    )

@api_router.get("/matches/pending", response_model=List[MatchResponse], tags=["Matches"])
async def get_pending_matches_endpoint(current_user = Depends(get_current_user)):
    matches_ref = get_db_ref('matches')
    query = matches_ref.order_by_child('status').equal_to('pending')
    matches = query.get()
    
    if not matches:
        return []
        
    response = []
    for match_id, match in matches.items():
        if not current_user['is_admin']:
            if match['player2_id'] != current_user['id'] or match['submitted_by'] == current_user['id']:
                continue
        
        winner_ref = get_db_ref(f"users/{match['winner_id']}")
        winner = winner_ref.get()
        winner_username = winner['username'] if winner else "Unknown"

        response.append(MatchResponse(
            **match,
            winner_username=winner_username,
        ))
    return response

@api_router.post("/matches/{match_id}/confirm", tags=["Matches"])
async def confirm_match_endpoint(match_id: str, current_user = Depends(get_current_user)):
    match_ref = get_db_ref(f'matches/{match_id}')
    match = match_ref.get()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match['status'] != "pending":
        raise HTTPException(status_code=400, detail="Match is not pending confirmation")
    if match['player2_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Only player 2 can confirm the match")

    player1_ref = get_db_ref(f"users/{match['player1_id']}")
    player1 = player1_ref.get()
    player2_ref = get_db_ref(f"users/{match['player2_id']}")
    player2 = player2_ref.get()
    
    winner_id = match['winner_id']
    loser_id = player2['id'] if winner_id == player1['id'] else player1['id']
    
    winner = player1 if winner_id == player1['id'] else player2
    loser = player2 if winner_id == player1['id'] else player1

    new_winner_elo, new_loser_elo = calculate_elo_change(
        winner['elo_rating'],
        loser['elo_rating'],
        winner.get('matches_played', 0),
        loser.get('matches_played', 0)
    )
    
    # Update winner stats
    winner_ref = get_db_ref(f"users/{winner_id}")
    winner_ref.update({
        'elo_rating': new_winner_elo,
        'matches_played': winner.get('matches_played', 0) + 1,
        'matches_won': winner.get('matches_won', 0) + 1
    })

    # Update loser stats
    loser_ref = get_db_ref(f"users/{loser_id}")
    loser_ref.update({
        'elo_rating': new_loser_elo,
        'matches_played': loser.get('matches_played', 0) + 1
    })
    
    # Update match
    elo_snapshot = {
        'before': {
            'winner_elo': winner['elo_rating'],
            'loser_elo': loser['elo_rating'],
        },
        'after': {
            'winner_elo': new_winner_elo,
            'loser_elo': new_loser_elo,
        }
    }

    match_updates = {
        'status': 'confirmed',
        'confirmed_at': datetime.utcnow().isoformat(),
        'elo_snapshot': elo_snapshot,
    }

    if match['player1_id'] == winner_id:
        match_updates['player1_elo_after'] = new_winner_elo
        match_updates['player2_elo_after'] = new_loser_elo
    else:
        match_updates['player1_elo_after'] = new_loser_elo
        match_updates['player2_elo_after'] = new_winner_elo

    match_ref.update(match_updates)

    # Check achievements
    try:
        await check_achievements_after_match(winner_id)
        await check_achievements_after_match(loser_id)
    except Exception as e:
        logging.error(f"Error checking achievements: {e}")

    return {"message": "Match confirmed and ELO updated."}

@api_router.post("/matches/{match_id}/decline", tags=["Matches"])
async def decline_match_endpoint(match_id: str, current_user = Depends(get_current_user)):
    match_ref = get_db_ref(f'matches/{match_id}')
    match = match_ref.get()
    
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match['player2_id'] != current_user['id'] and not current_user.get('is_admin'):
        raise HTTPException(status_code=403, detail="Not authorized to decline this match")

    match_ref.update({'status': 'declined'})
    
    return {"message": "Match declined"}

@api_router.get("/matches/history", response_model=List[MatchResponse], tags=["Matches"])
async def get_match_history_endpoint(current_user = Depends(get_current_user)):
    matches_ref = get_db_ref('matches')
    
    # This is not efficient, but Firebase doesn't support 'OR' queries.
    # A better solution would be to denormalize the data.
    all_matches = matches_ref.order_by_child('status').equal_to('confirmed').get()
    
    if not all_matches:
        return []
        
    user_matches = []
    for match_id, match in all_matches.items():
        if match['player1_id'] == current_user['id'] or match['player2_id'] == current_user['id']:
            user_matches.append(match)
            
    # Sort by confirmed_at descending
    user_matches.sort(key=lambda x: x.get('confirmed_at') or '', reverse=True)
    
    response = []
    for match in user_matches[:50]:
        winner_ref = get_db_ref(f"users/{match['winner_id']}")
        winner = winner_ref.get()
        winner_username = winner['username'] if winner else "Unknown"
        
        response.append(MatchResponse(
            **match,
            winner_username=winner_username
        ))
    return response

@api_router.post("/elo/preview", response_model=EloPreviewResponse, tags=["ELO"])
async def get_elo_preview_endpoint(data: EloPreviewRequest):
    player1_ref = get_db_ref(f"users/{data.player1_id}")
    player1 = player1_ref.get()
    player2_ref = get_db_ref(f"users/{data.player2_id}")
    player2 = player2_ref.get()

    if not player1 or not player2:
        raise HTTPException(status_code=404, detail="One or more players not found")

    winner = player1 if data.winner_id == player1['id'] else player2
    loser = player2 if data.winner_id == player1['id'] else player1

    new_winner_elo, new_loser_elo = calculate_elo_change(
        winner['elo_rating'],
        loser['elo_rating'],
        winner.get('matches_played', 0),
        loser.get('matches_played', 0)
    )

    user_preview = {
        "from": round(player1['elo_rating']),
        "to": round(new_winner_elo) if player1['id'] == winner['id'] else round(new_loser_elo),
        "delta": round(new_winner_elo - player1['elo_rating']) if player1['id'] == winner['id'] else round(new_loser_elo - player1['elo_rating'])
    }
    opponent_preview = {
        "username": player2['username'],
        "from": round(player2['elo_rating']),
        "to": round(new_winner_elo) if player2['id'] == winner['id'] else round(new_loser_elo),
        "delta": round(new_winner_elo - player2['elo_rating']) if player2['id'] == winner['id'] else round(new_loser_elo - player2['elo_rating'])
    }

    return EloPreviewResponse(user=user_preview, opponent=opponent_preview)

# -- Logros --
@api_router.get("/achievements/me", response_model=UserAchievements, tags=["Achievements"])
async def get_my_achievements_endpoint(current_user = Depends(get_current_user)):
    achievements = await get_user_achievements_service(current_user['id'])
    return achievements

# --- Rutas Públicas de Perfil ---

@api_router.get("/users/{user_id}", response_model=UserResponse, tags=["Users"])
async def get_user_details_endpoint(user_id: str):
    """Obtiene los detalles públicos de un usuario."""
    user_ref = get_db_ref(f'users/{user_id}')
    user = user_ref.get()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)

@api_router.get("/achievements/user/{user_id}", response_model=UserAchievements, tags=["Achievements"])
async def get_user_achievements_endpoint(user_id: str):
    """Obtiene los logros y el progreso de un usuario específico."""
    achievements = await get_user_achievements_service(user_id)
    return achievements

@api_router.get("/matches/history/user/{user_id}", response_model=List[MatchResponse], tags=["Matches"])
async def get_user_match_history_endpoint(user_id: str):
    """Obtiene el historial de partidos confirmados para un usuario específico."""
    matches_ref = get_db_ref('matches')
    
    # This is not efficient, but Firebase doesn't support 'OR' queries.
    # A better solution would be to denormalize the data.
    all_matches = matches_ref.order_by_child('status').equal_to('confirmed').get()
    
    if not all_matches:
        return []
        
    user_matches = []
    for match_id, match in all_matches.items():
        if match['player1_id'] == user_id or match['player2_id'] == user_id:
            user_matches.append(match)
            
    # Sort by confirmed_at descending
    user_matches.sort(key=lambda x: x.get('confirmed_at') or '', reverse=True)
    
    response = []
    for match in user_matches[:50]:
        winner_ref = get_db_ref(f"users/{match['winner_id']}")
        winner = winner_ref.get()
        winner_username = winner['username'] if winner else "Unknown"
        
        response.append(MatchResponse(
            **match,
            winner_username=winner_username
        ))
    return response

# -- Admin --
@api_router.post("/admin/users", response_model=UserResponse, tags=["Admin"])
async def admin_create_user_endpoint(user_data: UserCreate, admin_user = Depends(get_current_admin_user)):
    users_ref = get_db_ref('users')
    if users_ref.order_by_child('username').equal_to(user_data.username).get():
        raise HTTPException(status_code=400, detail="Username already exists")
        
    user_id = str(uuid.uuid4())
    new_user_data = {
        "id": user_id,
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
        "elo_rating": 1200.0,
        "matches_played": 0,
        "matches_won": 0,
        "is_admin": user_data.is_admin,
        "is_active": user_data.is_active,
        "created_at": datetime.utcnow().isoformat()
    }
    
    users_ref.child(user_id).set(new_user_data)
    
    return UserResponse(**new_user_data)

@api_router.get("/admin/users", response_model=List[UserResponse], tags=["Admin"])
async def admin_get_all_users_endpoint(admin_user = Depends(get_current_admin_user)):
    users_ref = get_db_ref('users')
    users = users_ref.get()
    if not users:
        return []
    return [UserResponse(**user) for user in users.values()]

@api_router.put("/admin/users/{user_id}", response_model=UserResponse, tags=["Admin"])
async def admin_update_user_endpoint(user_id: str, data: UserUpdateAdmin, admin_user = Depends(get_current_admin_user)):
    user_ref = get_db_ref(f'users/{user_id}')
    user_data = user_ref.get()
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = data.dict(exclude_unset=True)
    user_ref.update(update_data)
    
    updated_user_data = user_ref.get()
    return UserResponse(**updated_user_data)

@api_router.delete("/admin/users/{user_id}", tags=["Admin"])
async def admin_delete_user_endpoint(user_id: str, admin_user = Depends(get_current_admin_user)):
    user_ref = get_db_ref(f'users/{user_id}')
    if not user_ref.get():
        raise HTTPException(status_code=404, detail="User not found")
        
    user_ref.delete()
    return {"message": "User deleted successfully"}

@api_router.post("/admin/matches/{match_id}/rollback", tags=["Admin"])
async def admin_rollback_match_endpoint(match_id: str, admin_user=Depends(get_current_admin_user)):
    """
    Revierte un partido confirmado, restaurando el ELO y las estadísticas de los jugadores
    de forma atómica usando una actualización multi-ruta.
    """
    match_ref = get_db_ref(f'matches/{match_id}')
    match = match_ref.get()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.get('status') != 'confirmed':
        raise HTTPException(status_code=400, detail="Only confirmed matches can be rolled back")
    if 'elo_snapshot' not in match:
        raise HTTPException(status_code=400, detail="Match has no ELO snapshot to restore")

    winner_id = match['winner_id']
    loser_id = match['player2_id'] if winner_id == match['player1_id'] else match['player1_id']

    winner_ref = get_db_ref(f"users/{winner_id}")
    loser_ref = get_db_ref(f"users/{loser_id}")

    winner_data = winner_ref.get()
    loser_data = loser_ref.get()

    # Construir la actualización multi-ruta
    updates = {
        f"users/{winner_id}/elo_rating": match['elo_snapshot']['before']['winner_elo'],
        f"users/{winner_id}/matches_played": winner_data.get('matches_played', 0) - 1,
        f"users/{winner_id}/matches_won": winner_data.get('matches_won', 0) - 1,
        f"users/{loser_id}/elo_rating": match['elo_snapshot']['before']['loser_elo'],
        f"users/{loser_id}/matches_played": loser_data.get('matches_played', 0) - 1,
        f"matches/{match_id}/status": "cancelled",
    }

    try:
        db.reference('/').update(updates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rollback match: {e}")

    return {"message": f"Match {match_id} has been rolled back successfully."}

# -- Punto de Entrada y Eventos --
app.include_router(api_router)

@app.on_event("startup")
async def on_startup():
    logging.info("Starting up application...")
    # Verificar si el usuario admin existe y crearlo si no
    users_ref = get_db_ref('users')
    admin_query = users_ref.order_by_child('username').equal_to('admin').get()
    if not admin_query:
        admin_id = str(uuid.uuid4())
        admin_data = {
            "id": admin_id,
            "username": "admin",
            "password_hash": hash_password("adminpassword"),
            "elo_rating": 1200.0,
            "matches_played": 0,
            "matches_won": 0,
            "is_admin": True,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
        users_ref.child(admin_id).set(admin_data)
        logging.info("Default admin user created.")

@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to the ELO Pool Club API!"}

# --- HANDLER PARA VERCEL (OBLIGATORIO) ---
def handler(request):
    return app(request)
