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
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete, and_, or_, func

# Importaciones de la base de datos y servicios
from .database import get_db, create_tables, UserDB, MatchDB, AsyncSessionLocal
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

    class Config:
        orm_mode = True

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
ELO_WEIGHTS = {
    MatchType.REY_MESA: 1.0,
    MatchType.TORNEO: 1.5,
    MatchType.LIGA_GRUPOS: 2.0,
    MatchType.LIGA_FINALES: 2.5
}

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_jwt_token(data: dict, expires_delta: timedelta = timedelta(days=7)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def calculate_elo_change(winner_elo: float, loser_elo: float, match_type: MatchType) -> tuple[float, float]:
    k_factor = 32 * ELO_WEIGHTS[match_type]
    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    expected_loser = 1 / (1 + 10 ** ((winner_elo - loser_elo) / 400))
    
    new_winner_elo = winner_elo + k_factor * (1 - expected_winner)
    new_loser_elo = loser_elo + k_factor * (0 - expected_loser)
    
    return round(new_winner_elo, 2), round(new_loser_elo, 2)

# --- Dependencias de Seguridad ---

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
        
    return user

async def get_current_admin_user(current_user: UserDB = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
    return current_user

# --- Rutas de la API ---

api_router = APIRouter(prefix="/api")

# -- Autenticación --
@api_router.post("/login", tags=["Authentication"])
async def login(form_data: UserLogin, db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB).where(UserDB.username == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    access_token = create_jwt_token(data={"sub": user.id})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_details": UserResponse.from_orm(user)
    }

# -- Rankings y Partidos --
@api_router.get("/rankings", response_model=List[dict], tags=["Rankings"])
async def get_rankings_endpoint(db: Session = Depends(get_db)):
    result = await db.execute(
        select(UserDB)
        .where(UserDB.is_admin == False, UserDB.is_active == True)
        .order_by(UserDB.elo_rating.desc())
    )
    users = result.scalars().all()
    
    rankings = []
    for i, user in enumerate(users):
        win_rate = (user.matches_won / user.matches_played * 100) if user.matches_played > 0 else 0
        rankings.append({
            "rank": i + 1,
            "id": user.id,
            "username": user.username,
            "elo_rating": round(user.elo_rating),
            "matches_played": user.matches_played,
            "matches_won": user.matches_won,
            "win_rate": round(win_rate, 1),
            "elo_change": 0, # Placeholder, se podría calcular con datos históricos
            "rank_change": 0 # Placeholder
        })
    return rankings

@api_router.post("/matches/submit", response_model=MatchResponse, tags=["Matches"])
async def submit_match_endpoint(data: MatchSubmit, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.player1_id != current_user.id:
        raise HTTPException(status_code=403, detail="Player 1 must be the current user")

    p1_res = await db.execute(select(UserDB).where(UserDB.id == data.player1_id))
    player1 = p1_res.scalar_one()
    
    p2_res = await db.execute(select(UserDB).where(UserDB.id == data.player2_id))
    player2 = p2_res.scalar_one_or_none()

    if not player2:
        raise HTTPException(status_code=404, detail="Opponent (Player 2) not found")

    if data.winner_id not in [player1.id, player2.id]:
        raise HTTPException(status_code=400, detail="Winner must be one of the players")
        
    winner_username = player1.username if data.winner_id == player1.id else player2.username

    new_match = MatchDB(
        id=str(uuid.uuid4()),
        player1_id=player1.id,
        player2_id=player2.id,
        player1_username=player1.username,
        player2_username=player2.username,
        winner_id=data.winner_id,
        match_type=data.match_type.value,
        result=data.result,
        status="pending",
        submitted_by=current_user.id,
        player1_elo_before=player1.elo_rating,
        player2_elo_before=player2.elo_rating,
    )

    db.add(new_match)
    await db.commit()
    await db.refresh(new_match)
    
    return MatchResponse(
        id=new_match.id,
        player1_username=new_match.player1_username,
        player2_username=new_match.player2_username,
        match_type=new_match.match_type,
        result=new_match.result,
        winner_username=winner_username,
        status=new_match.status,
        created_at=new_match.created_at,
        confirmed_at=new_match.confirmed_at
    )

@api_router.get("/matches/pending", response_model=List[MatchResponse], tags=["Matches"])
async def get_pending_matches_endpoint(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    # Un admin ve todos los pendientes, un jugador solo los que debe confirmar
    query = select(MatchDB).where(MatchDB.status == "pending")
    if not current_user.is_admin:
        query = query.where(MatchDB.player2_id == current_user.id, MatchDB.submitted_by != current_user.id)
    
    result = await db.execute(query.order_by(MatchDB.created_at.desc()))
    matches = result.scalars().all()

    response = []
    for match in matches:
        winner_res = await db.execute(select(UserDB.username).where(UserDB.id == match.winner_id))
        winner_username = winner_res.scalar_one()
        response.append(MatchResponse(
            id=match.id,
            player1_username=match.player1_username,
            player2_username=match.player2_username,
            match_type=match.match_type,
            result=match.result,
            winner_username=winner_username,
            status=match.status,
            created_at=match.created_at,
            confirmed_at=match.confirmed_at,
        ))
    return response

@api_router.post("/matches/{match_id}/confirm", tags=["Matches"])
async def confirm_match_endpoint(match_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    res = await db.execute(select(MatchDB).where(MatchDB.id == match_id))
    match = res.scalar_one_or_none()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.status != "pending":
        raise HTTPException(status_code=400, detail="Match is not pending confirmation")
    if match.player2_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only player 2 can confirm the match")

    p1_res = await db.execute(select(UserDB).where(UserDB.id == match.player1_id))
    player1 = p1_res.scalar_one()
    p2_res = await db.execute(select(UserDB).where(UserDB.id == match.player2_id))
    player2 = p2_res.scalar_one()
    
    winner_id = match.winner_id
    loser_id = player2.id if winner_id == player1.id else player1.id
    
    winner = player1 if winner_id == player1.id else player2
    loser = player2 if winner_id == player1.id else player1

    new_winner_elo, new_loser_elo = calculate_elo_change(winner.elo_rating, loser.elo_rating, MatchType(match.match_type))
    
    # Actualizar ELO y estadísticas
    winner.elo_rating = new_winner_elo
    winner.matches_played += 1
    winner.matches_won += 1
    
    loser.elo_rating = new_loser_elo
    loser.matches_played += 1
    
    # Actualizar partida
    match.status = 'confirmed'
    match.confirmed_at = datetime.utcnow()
    
    if match.player1_id == winner_id:
        match.player1_elo_after = new_winner_elo
        match.player2_elo_after = new_loser_elo
    else:
        match.player1_elo_after = new_loser_elo
        match.player2_elo_after = new_winner_elo

    # Guardar cambios
    await db.commit()

    # Comprobar logros
    await check_achievements_after_match(db, winner_id)
    await check_achievements_after_match(db, loser_id)
    await db.commit()

    return {"message": "Match confirmed and ELO updated."}

@api_router.post("/matches/{match_id}/decline", tags=["Matches"])
async def decline_match_endpoint(match_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    res = await db.execute(select(MatchDB).where(MatchDB.id == match_id))
    match = res.scalar_one_or_none()
    
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.player2_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to decline this match")

    match.status = 'declined'
    await db.commit()
    
    return {"message": "Match declined"}

@api_router.get("/matches/history", response_model=List[MatchResponse], tags=["Matches"])
async def get_match_history_endpoint(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await db.execute(
        select(MatchDB)
        .where(or_(MatchDB.player1_id == current_user.id, MatchDB.player2_id == current_user.id))
        .where(MatchDB.status == 'confirmed')
        .order_by(MatchDB.confirmed_at.desc())
        .limit(50)
    )
    matches = result.scalars().all()
    
    response = []
    for match in matches:
        winner_res = await db.execute(select(UserDB.username).where(UserDB.id == match.winner_id))
        winner_username = winner_res.scalar_one()
        response.append(MatchResponse(
            id=match.id,
            player1_username=match.player1_username,
            player2_username=match.player2_username,
            match_type=match.match_type,
            result=match.result,
            winner_username=winner_username,
            status=match.status,
            created_at=match.created_at,
            confirmed_at=match.confirmed_at
        ))
    return response

@api_router.post("/elo/preview", response_model=EloPreviewResponse, tags=["ELO"])
async def get_elo_preview_endpoint(data: EloPreviewRequest, db: Session = Depends(get_db)):
    p1_res = await db.execute(select(UserDB).where(UserDB.id == data.player1_id))
    player1 = p1_res.scalar_one()
    p2_res = await db.execute(select(UserDB).where(UserDB.id == data.player2_id))
    player2 = p2_res.scalar_one()

    winner = player1 if data.winner_id == player1.id else player2
    loser = player2 if data.winner_id == player1.id else player1

    new_winner_elo, new_loser_elo = calculate_elo_change(winner.elo_rating, loser.elo_rating, data.match_type)

    user_preview = {
        "from": round(player1.elo_rating),
        "to": round(new_winner_elo) if player1.id == winner.id else round(new_loser_elo),
        "delta": round(new_winner_elo - player1.elo_rating) if player1.id == winner.id else round(new_loser_elo - player1.elo_rating)
    }
    opponent_preview = {
        "username": player2.username,
        "from": round(player2.elo_rating),
        "to": round(new_winner_elo) if player2.id == winner.id else round(new_loser_elo),
        "delta": round(new_winner_elo - player2.elo_rating) if player2.id == winner.id else round(new_loser_elo - player2.elo_rating)
    }

    return EloPreviewResponse(user=user_preview, opponent=opponent_preview)

# -- Logros --
@api_router.get("/achievements/me", response_model=UserAchievements, tags=["Achievements"])
async def get_my_achievements_endpoint(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    achievements = await get_user_achievements_service(db, current_user.id)
    return achievements

# --- Rutas Públicas de Perfil ---

@api_router.get("/users/{user_id}", response_model=UserResponse, tags=["Users"])
async def get_user_details_endpoint(user_id: str, db: Session = Depends(get_db)):
    """Obtiene los detalles públicos de un usuario."""
    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@api_router.get("/achievements/user/{user_id}", response_model=UserAchievements, tags=["Achievements"])
async def get_user_achievements_endpoint(user_id: str, db: Session = Depends(get_db)):
    """Obtiene los logros y el progreso de un usuario específico."""
    achievements = await get_user_achievements_service(db, user_id)
    return achievements

@api_router.get("/matches/history/user/{user_id}", response_model=List[MatchResponse], tags=["Matches"])
async def get_user_match_history_endpoint(user_id: str, db: Session = Depends(get_db)):
    """Obtiene el historial de partidos confirmados para un usuario específico."""
    result = await db.execute(
        select(MatchDB)
        .where(or_(MatchDB.player1_id == user_id, MatchDB.player2_id == user_id))
        .where(MatchDB.status == 'confirmed')
        .order_by(MatchDB.confirmed_at.desc())
        .limit(50)
    )
    matches = result.scalars().all()
    
    response = []
    for match in matches:
        winner_res = await db.execute(select(UserDB.username).where(UserDB.id == match.winner_id))
        winner_username = winner_res.scalar_one()
        match_response = MatchResponse(
            id=match.id,
            player1_username=match.player1_username,
            player2_username=match.player2_username,
            match_type=match.match_type,
            result=match.result,
            winner_username=winner_username,
            status=match.status,
            created_at=match.created_at,
            confirmed_at=match.confirmed_at
        )
        response.append(match_response)
    return response

# -- Admin --
@api_router.post("/admin/users", response_model=UserResponse, tags=["Admin"])
async def admin_create_user_endpoint(user_data: UserCreate, admin_user: UserDB = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    res = await db.execute(select(UserDB).where(UserDB.username == user_data.username))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
        
    new_user = UserDB(
        id=str(uuid.uuid4()),
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        is_admin=user_data.is_admin,
        is_active=user_data.is_active
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@api_router.get("/admin/users", response_model=List[UserResponse], tags=["Admin"])
async def admin_get_all_users_endpoint(admin_user: UserDB = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB).order_by(UserDB.username))
    return result.scalars().all()

@api_router.put("/admin/users/{user_id}", response_model=UserResponse, tags=["Admin"])
async def admin_update_user_endpoint(user_id: str, data: UserUpdateAdmin, admin_user: UserDB = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    res = await db.execute(select(UserDB).where(UserDB.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
        
    await db.commit()
    await db.refresh(user)
    return user

@api_router.delete("/admin/users/{user_id}", tags=["Admin"])
async def admin_delete_user_endpoint(user_id: str, admin_user: UserDB = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    res = await db.execute(select(UserDB).where(UserDB.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    await db.execute(delete(UserDB).where(UserDB.id == user_id))
    await db.commit()
    return {"message": "User deleted successfully"}

# -- Punto de Entrada y Eventos --
app.include_router(api_router)

@app.on_event("startup")
async def on_startup():
    logging.info("Starting up application...")
    await create_tables()
    logging.info("Database tables checked/created.")
    
    # Crear usuario admin si no existe
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(UserDB).where(UserDB.username == "admin"))
        if not res.scalar_one_or_none():
            admin = UserDB(
                id=str(uuid.uuid4()),
                username="admin",
                password_hash=hash_password("adminpassword"),
                is_admin=True,
                is_active=True
            )
            db.add(admin)
            await db.commit()
            logging.info("Default admin user created.")

@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to the ELO Pool Club API!"}
