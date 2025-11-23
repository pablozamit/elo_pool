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
    players = [user for user in
