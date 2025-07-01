from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete, and_, or_
from .database import get_db, create_tables, UserDB, MatchDB, UserAchievementDB, AsyncSessionLocal
from .achievement_service import check_achievements_after_match
import json

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "your_super_secret_key_here")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Match Types Enum
class MatchType(str, Enum):
    LIGA_GRUPOS = "liga_grupos"
    LIGA_FINALES = "liga_finales"
    TORNEO = "torneo"
    REY_MESA = "rey_mesa"

# ELO Weights for different match types
ELO_WEIGHTS = {
    MatchType.REY_MESA: 1.0,
    MatchType.TORNEO: 1.5,
    MatchType.LIGA_GRUPOS: 2.0,
    MatchType.LIGA_FINALES: 2.5
}

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    elo_rating: float = 1200.0
    matches_played: int = 0
    matches_won: int = 0
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator('username')
    def username_must_not_contain_spaces(cls, v):
        if ' ' in v:
            raise ValueError('Username cannot contain spaces')
        return v

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

class UserAdminCreate(UserCreate):
    is_admin: Optional[bool] = False
    is_active: Optional[bool] = True

class UserUpdateAdmin(BaseModel):
    elo_rating: Optional[float] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

class Match(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player1_id: str
    player2_id: str
    player1_username: str
    player2_username: str
    match_type: MatchType
    result: str
    winner_id: str
    status: str = "pending"
    player1_elo_before: float
    player2_elo_before: float
    player1_elo_after: Optional[float] = None
    player2_elo_after: Optional[float] = None
    submitted_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    confirmed_at: Optional[datetime] = None

class MatchCreate(BaseModel):
    opponent_username: str
    match_type: MatchType
    result: str
    won: bool

class MatchResponse(BaseModel):
    id: str
    player1_username: str
    player2_username: str
    match_type: MatchType
    result: str
    winner_username: str
    status: str
    created_at: datetime
    confirmed_at: Optional[datetime]

class DebugPayload(BaseModel):
    message: str
    source: Optional[str] = None
    lineno: Optional[int] = None
    colno: Optional[int] = None
    stack: Optional[str] = None

# Utility functions
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def create_jwt_token(user_id: str, username: str) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    payload = verify_jwt_token(token)
    
    result = await db.execute(select(UserDB).where(UserDB.id == payload["user_id"]))
    user_db = result.scalar_one_or_none()
    
    if not user_db:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(
        id=user_db.id,
        username=user_db.username,
        password_hash=user_db.password_hash,
        elo_rating=user_db.elo_rating,
        matches_played=user_db.matches_played,
        matches_won=user_db.matches_won,
        is_admin=user_db.is_admin,
        is_active=user_db.is_active,
        created_at=user_db.created_at
    )

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden: User is not an admin")
    return current_user

def calculate_elo_change(winner_elo: float, loser_elo: float, match_type: MatchType) -> tuple:
    """Calculate ELO change for both players"""
    K = 32 * ELO_WEIGHTS[match_type]
    
    expected_winner = 1 / (1 + 10**((loser_elo - winner_elo) / 400))
    expected_loser = 1 / (1 + 10**((winner_elo - loser_elo) / 400))
    
    new_winner_elo = winner_elo + K * (1 - expected_winner)
    new_loser_elo = loser_elo + K * (0 - expected_loser)
    
    return new_winner_elo, new_loser_elo

# Endpoint to receive frontend error logs
@api_router.post("/gemini-debug")
async def gemini_debug(payload: DebugPayload):
    logger.error("Frontend error: %s", json.dumps(payload.dict()))
    return {"status": "ok"}

# Routes
@api_router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=403,
        detail="New registrations are not allowed. Please contact with an Admin."
    )

@api_router.post("/login")
async def login(login_data: UserLogin, db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB).where(UserDB.username == login_data.username))
    user_db = result.scalar_one_or_none()
    
    if not user_db or not verify_password(login_data.password, user_db.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user_db.id, user_db.username)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user_db.id,
            username=user_db.username,
            elo_rating=user_db.elo_rating,
            matches_played=user_db.matches_played,
            matches_won=user_db.matches_won,
            is_admin=user_db.is_admin,
            is_active=user_db.is_active,
            created_at=user_db.created_at
        )
    }

@api_router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        elo_rating=current_user.elo_rating,
        matches_played=current_user.matches_played,
        matches_won=current_user.matches_won,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
        created_at=current_user.created_at
    )

@api_router.post("/matches", response_model=MatchResponse)
async def create_match(match_data: MatchCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Find opponent
    result = await db.execute(select(UserDB).where(UserDB.username == match_data.opponent_username))
    opponent_db = result.scalar_one_or_none()
    
    if not opponent_db:
        raise HTTPException(status_code=404, detail="Opponent not found")
    
    if opponent_db.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot play against yourself")
    
    # Determine winner
    if match_data.won:
        winner_id = current_user.id
        winner_username = current_user.username
    else:
        winner_id = opponent_db.id
        winner_username = opponent_db.username
    
    # Create match
    match_db = MatchDB(
        id=str(uuid.uuid4()),
        player1_id=current_user.id,
        player2_id=opponent_db.id,
        player1_username=current_user.username,
        player2_username=opponent_db.username,
        match_type=match_data.match_type.value,
        result=match_data.result,
        winner_id=winner_id,
        submitted_by=current_user.id,
        player1_elo_before=current_user.elo_rating,
        player2_elo_before=opponent_db.elo_rating
    )
    
    db.add(match_db)
    await db.commit()

    # Check achievements for both players after submitting the result
    await check_achievements_after_match(db, match_db.player1_id)
    await check_achievements_after_match(db, match_db.player2_id)

    await db.commit()
    
    return MatchResponse(
        id=match_db.id,
        player1_username=match_db.player1_username,
        player2_username=match_db.player2_username,
        match_type=MatchType(match_db.match_type),
        result=match_db.result,
        winner_username=winner_username,
        status=match_db.status,
        created_at=match_db.created_at,
        confirmed_at=match_db.confirmed_at
    )

@api_router.get("/matches/pending")
async def get_pending_matches(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(MatchDB).where(MatchDB.status == "pending")
    if not current_user.is_admin:
        query = query.where(MatchDB.player2_id == current_user.id)

    result = await db.execute(query)
    matches = result.scalars().all()
    
    return [MatchResponse(
        id=match.id,
        player1_username=match.player1_username,
        player2_username=match.player2_username,
        match_type=MatchType(match.match_type),
        result=match.result,
        winner_username=match.player1_username if match.winner_id == match.player1_id else match.player2_username,
        status=match.status,
        created_at=match.created_at,
        confirmed_at=match.confirmed_at
    ) for match in matches]

@api_router.post("/matches/{match_id}/confirm")
async def confirm_match(match_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await db.execute(select(MatchDB).where(MatchDB.id == match_id))
    match_db = result.scalar_one_or_none()
    
    if not match_db:
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match_db.player2_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to confirm this match")
    
    if match_db.status != "pending":
        raise HTTPException(status_code=400, detail="Match already processed")
    
    # Calculate ELO changes
    winner_elo = match_db.player1_elo_before if match_db.winner_id == match_db.player1_id else match_db.player2_elo_before
    loser_elo = match_db.player2_elo_before if match_db.winner_id == match_db.player1_id else match_db.player1_elo_before
    
    new_winner_elo, new_loser_elo = calculate_elo_change(winner_elo, loser_elo, MatchType(match_db.match_type))
    
    # Update match
    if match_db.winner_id == match_db.player1_id:
        player1_elo_after = new_winner_elo
        player2_elo_after = new_loser_elo
    else:
        player1_elo_after = new_loser_elo
        player2_elo_after = new_winner_elo
    
    await db.execute(
        update(MatchDB)
        .where(MatchDB.id == match_id)
        .values(
            status="confirmed",
            confirmed_at=datetime.utcnow(),
            player1_elo_after=player1_elo_after,
            player2_elo_after=player2_elo_after
        )
    )
    
    # Update player ELO ratings and stats
    await db.execute(
        update(UserDB)
        .where(UserDB.id == match_db.player1_id)
        .values(
            elo_rating=player1_elo_after,
            matches_played=UserDB.matches_played + 1,
            matches_won=UserDB.matches_won + (1 if match_db.winner_id == match_db.player1_id else 0)
        )
    )
    
    await db.execute(
        update(UserDB)
        .where(UserDB.id == match_db.player2_id)
        .values(
            elo_rating=player2_elo_after,
            matches_played=UserDB.matches_played + 1,
            matches_won=UserDB.matches_won + (1 if match_db.winner_id == match_db.player2_id else 0)
        )
    )
    await check_achievements_after_match(db, match_db.player1_id)
    await check_achievements_after_match(db, match_db.player2_id)
    
    await db.commit()
    
    return {"message": "Match confirmed successfully"}

@api_router.post("/matches/{match_id}/reject")
async def reject_match(match_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await db.execute(select(MatchDB).where(MatchDB.id == match_id))
    match_db = result.scalar_one_or_none()
    
    if not match_db:
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match_db.player2_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reject this match")
    
    if match_db.status != "pending":
        raise HTTPException(status_code=400, detail="Match already processed")
    
    await db.execute(
        update(MatchDB)
        .where(MatchDB.id == match_id)
        .values(status="rejected")
    )
    await db.commit()
    
    return {"message": "Match rejected"}

@api_router.get("/rankings")
async def get_rankings(db: Session = Depends(get_db)):
    result = await db.execute(
        select(UserDB)
        .where(UserDB.is_admin != True)
        .order_by(UserDB.elo_rating.desc())
        .limit(100)
    )
    users = result.scalars().all()
    
    rankings = []
    for i, user in enumerate(users):
        win_rate = (user.matches_won / user.matches_played * 100) if user.matches_played > 0 else 0
        rankings.append({
            "rank": i + 1,
            "username": user.username,
            "elo_rating": round(user.elo_rating, 1),
            "matches_played": user.matches_played,
            "matches_won": user.matches_won,
            "win_rate": round(win_rate, 1)
        })
    
    return rankings

@api_router.get("/matches/history")
async def get_match_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await db.execute(
        select(MatchDB)
        .where(
            and_(
                or_(MatchDB.player1_id == current_user.id, MatchDB.player2_id == current_user.id),
                MatchDB.status == "confirmed"
            )
        )
        .order_by(MatchDB.confirmed_at.desc())
        .limit(50)
    )
    matches = result.scalars().all()
    
    return [MatchResponse(
        id=match.id,
        player1_username=match.player1_username,
        player2_username=match.player2_username,
        match_type=MatchType(match.match_type),
        result=match.result,
        winner_username=match.player1_username if match.winner_id == match.player1_id else match.player2_username,
        status=match.status,
        created_at=match.created_at,
        confirmed_at=match.confirmed_at
    ) for match in matches]

@api_router.get("/users/search")
async def search_users(query: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(query) < 2:
        return []
    
    result = await db.execute(
        select(UserDB)
        .where(
            and_(
                UserDB.username.ilike(f"%{query}%"),
                UserDB.id != current_user.id
            )
        )
        .limit(10)
    )
    users = result.scalars().all()
    
    return [{"id": user.id, "username": user.username, "elo_rating": user.elo_rating} for user in users]

# Admin Endpoints
@api_router.post("/admin/users", response_model=UserResponse, tags=["Admin"])
async def admin_create_user(user_data: UserAdminCreate, admin_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Check if username already exists
    result = await db.execute(select(UserDB).where(UserDB.username == user_data.username))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_db = UserDB(
        id=str(uuid.uuid4()),
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        is_admin=user_data.is_admin,
        is_active=user_data.is_active
    )

    db.add(user_db)
    await db.commit()
    await db.refresh(user_db)
    
    return UserResponse(
        id=user_db.id,
        username=user_db.username,
        elo_rating=user_db.elo_rating,
        matches_played=user_db.matches_played,
        matches_won=user_db.matches_won,
        is_admin=user_db.is_admin,
        is_active=user_db.is_active,
        created_at=user_db.created_at
    )

@api_router.get("/admin/users", response_model=List[UserResponse], tags=["Admin"])
async def admin_get_all_users(admin_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB))
    users = result.scalars().all()
    
    return [UserResponse(
        id=user.id,
        username=user.username,
        elo_rating=user.elo_rating,
        matches_played=user.matches_played,
        matches_won=user.matches_won,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at
    ) for user in users]

@api_router.put("/admin/users/{user_id}", response_model=UserResponse, tags=["Admin"])
async def admin_update_user(user_id: str, user_update_data: UserUpdateAdmin, admin_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    existing_user = result.scalar_one_or_none()
    
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update_data.dict(exclude_unset=True)

    if update_data:
        await db.execute(
            update(UserDB)
            .where(UserDB.id == user_id)
            .values(**update_data)
        )
        await db.commit()

    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    updated_user = result.scalar_one()
    
    return UserResponse(
        id=updated_user.id,
        username=updated_user.username,
        elo_rating=updated_user.elo_rating,
        matches_played=updated_user.matches_played,
        matches_won=updated_user.matches_won,
        is_admin=updated_user.is_admin,
        is_active=updated_user.is_active,
        created_at=updated_user.created_at
    )

@api_router.delete("/admin/users/{user_id}", response_model=Dict[str, str], tags=["Admin"])
async def admin_delete_user(user_id: str, admin_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    result = await db.execute(select(UserDB).where(UserDB.id == user_id))
    existing_user = result.scalar_one_or_none()
    
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(delete(UserDB).where(UserDB.id == user_id))
    await db.commit()
    
    return {"message": "User deleted successfully"}

# Include the router in the main app
app.include_router(api_router)
from .simple_achievement_routes import achievement_router as simple_achievement_router
app.include_router(simple_achievement_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    print("🚀 Starting up application...")
    
    # Create tables
    await create_tables()
    print("✅ Database tables created")
    
    # Create admin user
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserDB).where(UserDB.username == "admin"))
        admin_user = result.scalar_one_or_none()
        
        if not admin_user:
            admin_user = UserDB(
                id=str(uuid.uuid4()),
                username="admin",
                password_hash=hash_password("adminpassword"),
                is_admin=True,
                is_active=True,
                elo_rating=1200.0,
                matches_played=0,
                matches_won=0,
                created_at=datetime.utcnow()
            )
            db.add(admin_user)
            await db.commit()
            print("✅ Default admin user 'admin' created with password 'adminpassword'.")
        else:
            print("✅ Admin user 'admin' already exists.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)