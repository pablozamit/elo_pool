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
import sqlite3
import json
from contextlib import asynccontextmanager

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "your_super_secret_key_here_change_in_production")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Database path
DB_PATH = "/tmp/billiard_club.db"

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

# Database functions
def init_db():
    """Initialize SQLite database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            elo_rating REAL DEFAULT 1200.0,
            matches_played INTEGER DEFAULT 0,
            matches_won INTEGER DEFAULT 0,
            is_admin BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create matches table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS matches (
            id TEXT PRIMARY KEY,
            player1_id TEXT NOT NULL,
            player2_id TEXT NOT NULL,
            player1_username TEXT NOT NULL,
            player2_username TEXT NOT NULL,
            match_type TEXT NOT NULL,
            result TEXT NOT NULL,
            winner_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            player1_elo_before REAL NOT NULL,
            player2_elo_before REAL NOT NULL,
            player1_elo_after REAL,
            player2_elo_after REAL,
            submitted_by TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            confirmed_at TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db():
    """Get database connection"""
    return sqlite3.connect(DB_PATH)

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

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_jwt_token(token)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (payload["user_id"],))
    user_data = cursor.fetchone()
    conn.close()
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(
        id=user_data[0],
        username=user_data[1],
        password_hash=user_data[2],
        elo_rating=user_data[3],
        matches_played=user_data[4],
        matches_won=user_data[5],
        is_admin=bool(user_data[6]),
        is_active=bool(user_data[7]),
        created_at=datetime.fromisoformat(user_data[8])
    )

def get_current_admin_user(current_user: User = Depends(get_current_user)):
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

# Create FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_db()
    
    # Create admin user if it doesn't exist
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin",))
    admin_user = cursor.fetchone()
    
    if not admin_user:
        admin_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO users (id, username, password_hash, is_admin, is_active)
            VALUES (?, ?, ?, ?, ?)
        ''', (admin_id, "admin", hash_password("adminpassword"), True, True))
        conn.commit()
        print("✅ Default admin user 'admin' created with password 'adminpassword'.")
    else:
        print("✅ Admin user 'admin' already exists.")
    
    conn.close()

# Routes
@app.post("/api/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if username already exists
    cursor.execute("SELECT * FROM users WHERE username = ?", (user_data.username,))
    existing_user = cursor.fetchone()
    
    if existing_user:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create new user
    user_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
    ''', (user_id, user_data.username, hash_password(user_data.password)))
    
    conn.commit()
    
    # Get the created user
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_data_db = cursor.fetchone()
    conn.close()
    
    return UserResponse(
        id=user_data_db[0],
        username=user_data_db[1],
        elo_rating=user_data_db[3],
        matches_played=user_data_db[4],
        matches_won=user_data_db[5],
        is_admin=bool(user_data_db[6]),
        is_active=bool(user_data_db[7]),
        created_at=datetime.fromisoformat(user_data_db[8])
    )

@app.post("/api/login")
async def login(login_data: UserLogin):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (login_data.username,))
    user_data = cursor.fetchone()
    conn.close()
    
    if not user_data or not verify_password(login_data.password, user_data[2]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user_data[0], user_data[1])
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user_data[0],
            username=user_data[1],
            elo_rating=user_data[3],
            matches_played=user_data[4],
            matches_won=user_data[5],
            is_admin=bool(user_data[6]),
            is_active=bool(user_data[7]),
            created_at=datetime.fromisoformat(user_data[8])
        )
    }

@app.get("/api/me", response_model=UserResponse)
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

@app.post("/api/matches", response_model=MatchResponse)
async def create_match(match_data: MatchCreate, current_user: User = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Find opponent
    cursor.execute("SELECT * FROM users WHERE username = ?", (match_data.opponent_username,))
    opponent_data = cursor.fetchone()
    
    if not opponent_data:
        conn.close()
        raise HTTPException(status_code=404, detail="Opponent not found")
    
    if opponent_data[0] == current_user.id:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot play against yourself")
    
    # Determine winner
    if match_data.won:
        winner_id = current_user.id
        winner_username = current_user.username
    else:
        winner_id = opponent_data[0]
        winner_username = opponent_data[1]
    
    # Create match
    match_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO matches (
            id, player1_id, player2_id, player1_username, player2_username,
            match_type, result, winner_id, submitted_by, player1_elo_before, player2_elo_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        match_id, current_user.id, opponent_data[0], current_user.username, opponent_data[1],
        match_data.match_type.value, match_data.result, winner_id, current_user.id,
        current_user.elo_rating, opponent_data[3]
    ))
    
    conn.commit()
    conn.close()
    
    return MatchResponse(
        id=match_id,
        player1_username=current_user.username,
        player2_username=opponent_data[1],
        match_type=match_data.match_type,
        result=match_data.result,
        winner_username=winner_username,
        status="pending",
        created_at=datetime.utcnow(),
        confirmed_at=None
    )

@app.get("/api/matches/pending")
async def get_pending_matches(current_user: User = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    if current_user.is_admin:
        cursor.execute('''
            SELECT * FROM matches
            WHERE status = 'pending'
            ORDER BY created_at DESC
        ''')
    else:
        cursor.execute('''
            SELECT * FROM matches
            WHERE player2_id = ? AND status = 'pending'
            ORDER BY created_at DESC
        ''', (current_user.id,))
    matches = cursor.fetchall()
    conn.close()
    
    result = []
    for match in matches:
        result.append(MatchResponse(
            id=match[0],
            player1_username=match[3],
            player2_username=match[4],
            match_type=MatchType(match[5]),
            result=match[6],
            winner_username=match[3] if match[7] == match[1] else match[4],
            status=match[8],
            created_at=datetime.fromisoformat(match[14]),
            confirmed_at=datetime.fromisoformat(match[15]) if match[15] else None
        ))
    
    return result

@app.post("/api/matches/{match_id}/confirm")
async def confirm_match(match_id: str, current_user: User = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Get match
    cursor.execute("SELECT * FROM matches WHERE id = ?", (match_id,))
    match_data = cursor.fetchone()
    
    if not match_data:
        conn.close()
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match_data[2] != current_user.id:  # player2_id
        conn.close()
        raise HTTPException(status_code=403, detail="Not authorized to confirm this match")
    
    if match_data[8] != "pending":  # status
        conn.close()
        raise HTTPException(status_code=400, detail="Match already processed")
    
    # Calculate ELO changes
    winner_elo = match_data[9] if match_data[7] == match_data[1] else match_data[10]  # player1_elo_before or player2_elo_before
    loser_elo = match_data[10] if match_data[7] == match_data[1] else match_data[9]
    
    new_winner_elo, new_loser_elo = calculate_elo_change(winner_elo, loser_elo, MatchType(match_data[5]))
    
    # Update match
    if match_data[7] == match_data[1]:  # winner_id == player1_id
        player1_elo_after = new_winner_elo
        player2_elo_after = new_loser_elo
    else:
        player1_elo_after = new_loser_elo
        player2_elo_after = new_winner_elo
    
    cursor.execute('''
        UPDATE matches 
        SET status = 'confirmed', confirmed_at = ?, player1_elo_after = ?, player2_elo_after = ?
        WHERE id = ?
    ''', (datetime.utcnow().isoformat(), player1_elo_after, player2_elo_after, match_id))
    
    # Update player ELO ratings and stats
    cursor.execute('''
        UPDATE users 
        SET elo_rating = ?, matches_played = matches_played + 1, 
            matches_won = matches_won + ?
        WHERE id = ?
    ''', (player1_elo_after, 1 if match_data[7] == match_data[1] else 0, match_data[1]))
    
    cursor.execute('''
        UPDATE users 
        SET elo_rating = ?, matches_played = matches_played + 1, 
            matches_won = matches_won + ?
        WHERE id = ?
    ''', (player2_elo_after, 1 if match_data[7] == match_data[2] else 0, match_data[2]))
    
    conn.commit()
    conn.close()
    
    return {"message": "Match confirmed successfully"}

@app.post("/api/matches/{match_id}/reject")
async def reject_match(match_id: str, current_user: User = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM matches WHERE id = ?", (match_id,))
    match_data = cursor.fetchone()
    
    if not match_data:
        conn.close()
        raise HTTPException(status_code=404, detail="Match not found")
    
    if match_data[2] != current_user.id:
        conn.close()
        raise HTTPException(status_code=403, detail="Not authorized to reject this match")
    
    if match_data[8] != "pending":
        conn.close()
        raise HTTPException(status_code=400, detail="Match already processed")
    
    cursor.execute("UPDATE matches SET status = 'rejected' WHERE id = ?", (match_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Match rejected"}

@app.get("/api/rankings")
async def get_rankings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM users 
        WHERE is_admin = 0 
        ORDER BY elo_rating DESC 
        LIMIT 100
    ''')
    users = cursor.fetchall()
    conn.close()
    
    rankings = []
    for i, user in enumerate(users):
        win_rate = (user[5] / user[4] * 100) if user[4] > 0 else 0
        rankings.append({
            "rank": i + 1,
            "username": user[1],
            "elo_rating": round(user[3], 1),
            "matches_played": user[4],
            "matches_won": user[5],
            "win_rate": round(win_rate, 1)
        })
    
    return rankings

@app.get("/api/matches/history")
async def get_match_history(current_user: User = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM matches 
        WHERE (player1_id = ? OR player2_id = ?) AND status = 'confirmed'
        ORDER BY confirmed_at DESC 
        LIMIT 50
    ''', (current_user.id, current_user.id))
    matches = cursor.fetchall()
    conn.close()
    
    result = []
    for match in matches:
        result.append(MatchResponse(
            id=match[0],
            player1_username=match[3],
            player2_username=match[4],
            match_type=MatchType(match[5]),
            result=match[6],
            winner_username=match[3] if match[7] == match[1] else match[4],
            status=match[8],
            created_at=datetime.fromisoformat(match[14]),
            confirmed_at=datetime.fromisoformat(match[15]) if match[15] else None
        ))
    
    return result

@app.get("/api/users/search")
async def search_users(query: str, current_user: User = Depends(get_current_user)):
    if len(query) < 2:
        return []
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, elo_rating FROM users 
        WHERE username LIKE ? AND id != ?
        LIMIT 10
    ''', (f"%{query}%", current_user.id))
    users = cursor.fetchall()
    conn.close()
    
    return [{"id": user[0], "username": user[1], "elo_rating": user[2]} for user in users]

# Admin endpoints
@app.post("/api/admin/users", response_model=UserResponse, tags=["Admin"])
async def admin_create_user(user_data: UserAdminCreate, admin_user: User = Depends(get_current_admin_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if username already exists
    cursor.execute("SELECT * FROM users WHERE username = ?", (user_data.username,))
    existing_user = cursor.fetchone()
    
    if existing_user:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")

    user_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO users (id, username, password_hash, is_admin, is_active)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, user_data.username, hash_password(user_data.password), 
          user_data.is_admin, user_data.is_active))
    
    conn.commit()
    
    # Get the created user
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_data_db = cursor.fetchone()
    conn.close()
    
    return UserResponse(
        id=user_data_db[0],
        username=user_data_db[1],
        elo_rating=user_data_db[3],
        matches_played=user_data_db[4],
        matches_won=user_data_db[5],
        is_admin=bool(user_data_db[6]),
        is_active=bool(user_data_db[7]),
        created_at=datetime.fromisoformat(user_data_db[8])
    )

@app.get("/api/admin/users", response_model=List[UserResponse], tags=["Admin"])
async def admin_get_all_users(admin_user: User = Depends(get_current_admin_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    conn.close()
    
    return [UserResponse(
        id=user[0],
        username=user[1],
        elo_rating=user[3],
        matches_played=user[4],
        matches_won=user[5],
        is_admin=bool(user[6]),
        is_active=bool(user[7]),
        created_at=datetime.fromisoformat(user[8])
    ) for user in users]

@app.put("/api/admin/users/{user_id}", response_model=UserResponse, tags=["Admin"])
async def admin_update_user(user_id: str, user_update_data: UserUpdateAdmin, admin_user: User = Depends(get_current_admin_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    existing_user = cursor.fetchone()
    
    if not existing_user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update_data.dict(exclude_unset=True)
    
    if update_data:
        set_clause = ", ".join([f"{key} = ?" for key in update_data.keys()])
        values = list(update_data.values()) + [user_id]
        cursor.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    updated_user = cursor.fetchone()
    conn.close()
    
    return UserResponse(
        id=updated_user[0],
        username=updated_user[1],
        elo_rating=updated_user[3],
        matches_played=updated_user[4],
        matches_won=updated_user[5],
        is_admin=bool(updated_user[6]),
        is_active=bool(updated_user[7]),
        created_at=datetime.fromisoformat(updated_user[8])
    )

@app.delete("/api/admin/users/{user_id}", response_model=Dict[str, str], tags=["Admin"])
async def admin_delete_user(user_id: str, admin_user: User = Depends(get_current_admin_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    existing_user = cursor.fetchone()
    
    if not existing_user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    return {"message": "User deleted successfully"}

# Health check
@app.get("/")
async def root():
    return {"message": "La Catrina Pool Club API is running!"}

# For Vercel
def handler(request):
    return app(request)