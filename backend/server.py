from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import jwt
import hashlib
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT Configuration
JWT_SECRET = "billiard_club_secret_key_2025"
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Match Types Enum
class MatchType(str, Enum):
    LIGA_GRUPOS = "liga_grupos"  # Liga ronda de grupos
    LIGA_FINALES = "liga_finales"  # Liga rondas finales  
    TORNEO = "torneo"  # Torneo
    REY_MESA = "rey_mesa"  # Rey de la mesa

# ELO Weights for different match types
ELO_WEIGHTS = {
    MatchType.REY_MESA: 1.0,      # Lowest weight
    MatchType.TORNEO: 1.5,        # Low-medium weight
    MatchType.LIGA_GRUPOS: 2.0,   # Medium-high weight
    MatchType.LIGA_FINALES: 2.5   # Highest weight
}

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    # email: str # Removed
    password_hash: str
    elo_rating: float = 1200.0
    matches_played: int = 0
    matches_won: int = 0
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    username: str
    # email: str # Removed
    password: str

    @validator('username')
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
    # email: str # Removed
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
    # email: Optional[str] = None # Removed
    elo_rating: Optional[float] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    # password: Optional[str] = None # Add if password change is desired

class Match(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player1_id: str
    player2_id: str
    player1_username: str
    player2_username: str
    match_type: MatchType
    result: str  # For numeric results like "2-1" or "won/lost"
    winner_id: str
    status: str = "pending"  # pending, confirmed, rejected
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
    won: bool  # True if current user won

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

# Utility functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

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
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_jwt_token(token)
    user = await db.users.find_one({"id": payload["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return User(**user)

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden: User is not an admin")
    return current_user

async def get_optional_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security, use_cache=False)):
    if credentials is None:
        return None
    try:
        token = credentials.credentials
        # We need a version of verify_jwt_token that doesn't raise HTTPException
        # For now, we'll wrap the existing one and catch its specific HTTPExceptions
        try:
            payload = verify_jwt_token(token)
        except HTTPException as http_exc: # Catch exceptions from verify_jwt_token
            # Log the error for debugging, but don't re-raise
            # logger.info(f"JWT verification failed for optional user: {http_exc.detail}")
            return None

        user_doc = await db.users.find_one({"id": payload["user_id"]})
        if not user_doc:
            return None

        # Ensure user is active
        if not user_doc.get("is_active", True): # Default to True if field is missing for older docs
            # logger.info(f"Optional user found but is inactive: {payload['user_id']}")
            return None

        return User(**user_doc)
    except jwt.ExpiredSignatureError: # This is already handled by verify_jwt_token's HTTPException
        return None
    except jwt.JWTError: # This is also handled by verify_jwt_token's HTTPException
        return None
    except Exception:
        # logger.error("Unexpected error in get_optional_current_user", exc_info=True)
        return None

def calculate_elo_change(winner_elo: float, loser_elo: float, match_type: MatchType) -> tuple:
    """Calculate ELO change for both players"""
    K = 32 * ELO_WEIGHTS[match_type]  # K-factor adjusted by match type weight
    
    # Expected scores
    expected_winner = 1 / (1 + 10**((loser_elo - winner_elo) / 400))
    expected_loser = 1 / (1 + 10**((winner_elo - loser_elo) / 400))
    
    # New ratings
    new_winner_elo = winner_elo + K * (1 - expected_winner)
    new_loser_elo = loser_elo + K * (0 - expected_loser)
    
    return new_winner_elo, new_loser_elo

# Import achievement system
from .achievement_routes import achievement_router, check_achievements_after_match
from .profile_routes import profile_router

# Routes
@api_router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Check if username already exists
    existing_user_by_username = await db.users.find_one({"username": user_data.username})
    if existing_user_by_username:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Email check removed
    
    # Create new user
    user = User(
        username=user_data.username,
        # email=user_data.email, # Removed
        password_hash=hash_password(user_data.password)
    )
    
    await db.users.insert_one(user.dict())
    
    # Check for first registration achievement
    await check_achievements_after_match(user.id)
    
    return UserResponse(**user.dict())

@api_router.post("/login")
async def login(login_data: UserLogin):
    user = await db.users.find_one({"username": login_data.username})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user["id"], user["username"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(**user)
    }

@api_router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(**current_user.dict())

@api_router.post("/matches", response_model=MatchResponse)
async def create_match(match_data: MatchCreate, current_user: User = Depends(get_current_user)):
    # Find opponent
    opponent = await db.users.find_one({"username": match_data.opponent_username})
    if not opponent:
        raise HTTPException(status_code=404, detail="Opponent not found")
    
    if opponent["id"] == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot play against yourself")
    
    # Determine winner and loser
    if match_data.won:
        winner_id = current_user.id
        winner_username = current_user.username
    else:
        winner_id = opponent["id"]
        winner_username = opponent["username"]
    
    # Create match
    match = Match(
        player1_id=current_user.id,
        player2_id=opponent["id"],
        player1_username=current_user.username,
        player2_username=opponent["username"],
        match_type=match_data.match_type,
        result=match_data.result,
        winner_id=winner_id,
        submitted_by=current_user.id,
        player1_elo_before=current_user.elo_rating,
        player2_elo_before=opponent["elo_rating"]
    )
    
    await db.matches.insert_one(match.dict())
    
    return MatchResponse(
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

@api_router.get("/matches/pending")
async def get_pending_matches(current_user: User = Depends(get_current_user)):
    # Get matches where current user is player2 and status is pending
    matches = await db.matches.find({
        "player2_id": current_user.id,
        "status": "pending"
    }).to_list(100)
    
    return [MatchResponse(
        id=match["id"],
        player1_username=match["player1_username"],
        player2_username=match["player2_username"],
        match_type=match["match_type"],
        result=match["result"],
        winner_username=match["player1_username"] if match["winner_id"] == match["player1_id"] else match["player2_username"],
        status=match["status"],
        created_at=match["created_at"],
        confirmed_at=match.get("confirmed_at")
    ) for match in matches]

@api_router.post("/matches/{match_id}/confirm")
async def confirm_match(match_id: str, current_user: User = Depends(get_current_user)):
    match = await db.matches.find_one({"id": match_id})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match["player2_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to confirm this match")
    
    if match["status"] != "pending":
        raise HTTPException(status_code=400, detail="Match already processed")
    
    # Calculate ELO changes
    winner_elo = match["player1_elo_before"] if match["winner_id"] == match["player1_id"] else match["player2_elo_before"]
    loser_elo = match["player2_elo_before"] if match["winner_id"] == match["player1_id"] else match["player1_elo_before"]
    
    new_winner_elo, new_loser_elo = calculate_elo_change(winner_elo, loser_elo, MatchType(match["match_type"]))
    
    # Update match
    if match["winner_id"] == match["player1_id"]:
        player1_elo_after = new_winner_elo
        player2_elo_after = new_loser_elo
    else:
        player1_elo_after = new_loser_elo
        player2_elo_after = new_winner_elo
    
    await db.matches.update_one(
        {"id": match_id},
        {
            "$set": {
                "status": "confirmed",
                "confirmed_at": datetime.utcnow(),
                "player1_elo_after": player1_elo_after,
                "player2_elo_after": player2_elo_after
            }
        }
    )
    
    # Update player ELO ratings and stats
    await db.users.update_one(
        {"id": match["player1_id"]},
        {
            "$set": {"elo_rating": player1_elo_after},
            "$inc": {
                "matches_played": 1,
                "matches_won": 1 if match["winner_id"] == match["player1_id"] else 0
            }
        }
    )
    
    await db.users.update_one(
        {"id": match["player2_id"]},
        {
            "$set": {"elo_rating": player2_elo_after},
            "$inc": {
                "matches_played": 1,
                "matches_won": 1 if match["winner_id"] == match["player2_id"] else 0
            }
        }
    )
    
    # Check achievements for both players
    await check_achievements_after_match(match["player1_id"])
    await check_achievements_after_match(match["player2_id"])
    
    return {"message": "Match confirmed successfully"}

@api_router.post("/matches/{match_id}/reject")
async def reject_match(match_id: str, current_user: User = Depends(get_current_user)):
    match = await db.matches.find_one({"id": match_id})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match["player2_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reject this match")
    
    if match["status"] != "pending":
        raise HTTPException(status_code=400, detail="Match already processed")
    
    await db.matches.update_one(
        {"id": match_id},
        {"$set": {"status": "rejected"}}
    )
    
    return {"message": "Match rejected"}

@api_router.get("/rankings")
async def get_rankings():
    users = await db.users.find(
        {"is_admin": {"$ne": True}}
    ).sort("elo_rating", -1).to_list(100)
    
    rankings = []
    for i, user in enumerate(users):
        win_rate = (user["matches_won"] / user["matches_played"] * 100) if user["matches_played"] > 0 else 0
        rankings.append({
            "rank": i + 1,
            "username": user["username"],
            "elo_rating": round(user["elo_rating"], 1),
            "matches_played": user["matches_played"],
            "matches_won": user["matches_won"],
            "win_rate": round(win_rate, 1)
        })
    
    return rankings

@api_router.get("/matches/history")
async def get_match_history(current_user: User = Depends(get_current_user)):
    matches = await db.matches.find({
        "$or": [
            {"player1_id": current_user.id},
            {"player2_id": current_user.id}
        ],
        "status": "confirmed"
    }).sort("confirmed_at", -1).to_list(50)
    
    return [MatchResponse(
        id=match["id"],
        player1_username=match["player1_username"],
        player2_username=match["player2_username"],
        match_type=match["match_type"],
        result=match["result"],
        winner_username=match["player1_username"] if match["winner_id"] == match["player1_id"] else match["player2_username"],
        status=match["status"],
        created_at=match["created_at"],
        confirmed_at=match.get("confirmed_at")
    ) for match in matches]

@api_router.get("/users/search")
async def search_users(query: str, current_user: User = Depends(get_current_user)):
    if len(query) < 2:
        return []
    
    users = await db.users.find({
        "username": {"$regex": query, "$options": "i"},
        "id": {"$ne": current_user.id}
    }).limit(10).to_list(10)
    
    return [{"username": user["username"], "elo_rating": user["elo_rating"]} for user in users]

# Admin Endpoints
@api_router.post("/admin/users", response_model=UserResponse, tags=["Admin"])
async def admin_create_user(user_data: UserAdminCreate, admin_user: User = Depends(get_current_admin_user)):
    # Check if username already exists
    existing_user_by_username = await db.users.find_one({"username": user_data.username})
    if existing_user_by_username:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Email check removed

    user_dict = user_data.dict()
    user_dict["password_hash"] = hash_password(user_data.password)
    del user_dict["password"]  # Remove plain password

    # Ensure is_admin and is_active are set from UserAdminCreate
    new_user = User(
        **user_dict
    )

    await db.users.insert_one(new_user.dict())
    return UserResponse(**new_user.dict())

@api_router.get("/admin/users", response_model=List[UserResponse], tags=["Admin"])
async def admin_get_all_users(admin_user: User = Depends(get_current_admin_user)):
    users_cursor = db.users.find({})
    users_list = await users_cursor.to_list(length=None) # Get all users
    return [UserResponse(**user) for user in users_list]

@api_router.put("/admin/users/{user_id}", response_model=UserResponse, tags=["Admin"])
async def admin_update_user(user_id: str, user_update_data: UserUpdateAdmin, admin_user: User = Depends(get_current_admin_user)):
    existing_user = await db.users.find_one({"id": user_id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update_data.dict(exclude_unset=True)

    # # If password is part of UserUpdateAdmin and provided, hash it
    # if "password" in update_data and update_data["password"]:
    #     update_data["password_hash"] = hash_password(update_data["password"])
    #     del update_data["password"]
    # elif "password" in update_data: # if password field exists but is None/empty
    #     del update_data["password"]

    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})

    updated_user_doc = await db.users.find_one({"id": user_id})
    return UserResponse(**updated_user_doc)

@api_router.delete("/admin/users/{user_id}", response_model=Dict[str, str], tags=["Admin"])
async def admin_delete_user(user_id: str, admin_user: User = Depends(get_current_admin_user)):
    existing_user = await db.users.find_one({"id": user_id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deleting themselves? (Optional check)
    # if existing_user["id"] == admin_user.id:
    #     raise HTTPException(status_code=400, detail="Admin users cannot delete themselves.")

    delete_result = await db.users.delete_one({"id": user_id})
    if delete_result.deleted_count == 1:
        return {"message": "User deleted successfully"}

    raise HTTPException(status_code=500, detail="Failed to delete user")


# Include the routers in the main app
app.include_router(api_router)
app.include_router(achievement_router)
app.include_router(profile_router)

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
async def create_admin_on_startup():
    admin_user_exists = await db.users.find_one({"username": "admin"})
    if not admin_user_exists:
        admin_user = User(
            id=str(uuid.uuid4()),
            username="admin",
            # email="admin@example.com", # Removed
            password_hash=hash_password("adminpassword"),
            is_admin=True,
            is_active=True,
            elo_rating=1200.0,
            matches_played=0,
            matches_won=0,
            created_at=datetime.utcnow()
        )
        await db.users.insert_one(admin_user.dict())
        print("Default admin user 'admin' created with password 'adminpassword'.")
    else:
        print("Admin user 'admin' already exists. No action taken.")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()