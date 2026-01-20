from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import json
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from enum import Enum
import firebase_admin
from firebase_admin import credentials, db

# --- Configuración Inicial ---
JWT_SECRET = os.environ.get("JWT_SECRET", "tu_clave_secreta_aqui")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# --- Firebase Init (Corregido con tu URL real) ---
firebase_init_error = None
if not firebase_admin._apps:
    try:
        firebase_cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if firebase_cred_json:
            # Limpieza para evitar errores de escape de Vercel
            firebase_cred_json = firebase_cred_json.strip().strip("'").strip('"').strip()
            # Reparación de saltos de línea si se pegó en bloque
            if "\n" in firebase_cred_json:
                firebase_cred_json = firebase_cred_json.replace("\n", "\\n")
            
            cred_dict = json.loads(firebase_cred_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://elopool-f1e62-default-rtdb.europe-west1.firebasedatabase.app/' 
            })
        else:
            firebase_init_error = "Variable FIREBASE_SERVICE_ACCOUNT no encontrada."
    except Exception as e:
        firebase_init_error = f"Error de inicialización: {str(e)}"

def get_db_ref(path: str):
    if firebase_init_error:
        raise HTTPException(status_code=500, detail=firebase_init_error)
    return db.reference(path)

# --- Modelos y Enums (Restaurados) ---
class MatchType(str, Enum):
    REY_MESA = "rey_mesa"
    TORNEO = "torneo"
    LIGA_GRUPOS = "liga_grupos"
    LIGA_FINALES = "liga_finales"

ELO_WEIGHTS = {
    MatchType.REY_MESA: 1.0, MatchType.TORNEO: 1.5,
    MatchType.LIGA_GRUPOS: 2.0, MatchType.LIGA_FINALES: 2.5
}

class UserCreate(BaseModel):
    username: str
    password: str
    @field_validator('username')
    def username_must_not_contain_spaces(cls, v):
        if ' ' in v: raise ValueError('Username cannot contain spaces')
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
    created_at: str

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
    created_at: str
    confirmed_at: Optional[str] = None

class EloPreviewRequest(BaseModel):
    player1_id: str
    player2_id: str
    winner_id: str
    match_type: MatchType

# --- Utilidades ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_password(password: str) -> str: return pwd_context.hash(password)
def verify_password(password: str, hashed: str) -> bool: return pwd_context.verify(password, hashed)

def create_jwt_token(user_id: str, username: str, is_admin: bool) -> str:
    payload = {"user_id": user_id, "username": username, "is_admin": is_admin, "exp": datetime.utcnow() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        user_data = get_db_ref(f'users/{user_id}').get()
        if not user_data: raise HTTPException(status_code=404, detail="User not found")
        return user_data
    except JWTError: raise HTTPException(status_code=401, detail="Invalid token")

def calculate_new_elos(winner_elo, loser_elo, match_type: MatchType):
    K = 32 * ELO_WEIGHTS[match_type]
    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    new_winner_elo = winner_elo + K * (1 - expected_winner)
    new_loser_elo = loser_elo + K * (0 - (1 / (1 + 10 ** ((winner_elo - loser_elo) / 400))))
    return new_winner_elo, new_loser_elo

# --- App FastAPI ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status": "running", "firebase": bool(firebase_admin._apps), "error": firebase_init_error}

@app.post("/api/register", response_model=UserResponse)
def register(user_data: UserCreate):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    for u in all_users.values():
        if u.get('username').lower() == user_data.username.lower():
             raise HTTPException(status_code=400, detail="Username already exists")

    user_id = str(uuid.uuid4())
    new_user = {
        "id": user_id, "username": user_data.username, "password_hash": hash_password(user_data.password),
        "elo_rating": 1200.0, "matches_played": 0, "matches_won": 0, "is_admin": False,
        "is_active": True, "created_at": datetime.utcnow().isoformat()
    }
    users_ref.child(user_id).set(new_user)
    return new_user

@app.post("/api/login")
def login(login_data: UserLogin):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    user_found = next((u for u in all_users.values() if u.get('username').lower() == login_data.username.lower()), None)
    if not user_found or not verify_password(login_data.password, user_found['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt_token(user_found['id'], user_found['username'], user_found.get('is_admin', False))
    return {"access_token": token, "token_type": "bearer", "user": user_found}

@app.get("/api/rankings")
def get_rankings():
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    players = sorted([u for u in all_users.values() if u.get('is_active') and not u.get('is_admin')], 
                    key=lambda x: x.get('elo_rating', 1200), reverse=True)
    return [{"rank": i + 1, "username": u['username'], "elo_rating": round(u.get('elo_rating', 1200), 1),
             "matches_played": u.get('matches_played', 0), "matches_won": u.get('matches_won', 0)} for i, u in enumerate(players)]

@app.post("/api/matches", response_model=MatchResponse)
def create_match(match_data: MatchCreate, current_user: dict = Depends(get_current_user)):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    opponent = next((u for u in all_users.values() if u.get('username').lower() == match_data.opponent_username.lower()), None)
    if not opponent: raise HTTPException(status_code=404, detail="Opponent not found")
    
    match_id = str(uuid.uuid4())
    new_match = {
        "id": match_id, "player1_id": current_user['id'], "player2_id": opponent['id'],
        "player1_username": current_user['username'], "player2_username": opponent['username'],
        "match_type": match_data.match_type, "result": match_data.result, "status": "pending",
        "winner_id": current_user['id'] if match_data.won else opponent['id'],
        "winner_username": current_user['username'] if match_data.won else opponent['username'],
        "created_at": datetime.utcnow().isoformat()
    }
    get_db_ref(f'matches/{match_id}').set(new_match)
    return new_match

@app.post("/api/matches/{match_id}/confirm")
def confirm_match(match_id: str, current_user: dict = Depends(get_current_user)):
    match_ref = get_db_ref(f'matches/{match_id}')
    match_data = match_ref.get()
    if not match_data or match_data['status'] != 'pending': raise HTTPException(status_code=400, detail="Invalid match")
    if not current_user.get('is_admin') and match_data['player2_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized")

    p1_ref, p2_ref = get_db_ref(f"users/{match_data['player1_id']}"), get_db_ref(f"users/{match_data['player2_id']}")
    p1, p2 = p1_ref.get(), p2_ref.get()
    
    w_elo = p1['elo_rating'] if match_data['winner_id'] == p1['id'] else p2['elo_rating']
    l_elo = p2['elo_rating'] if match_data['winner_id'] == p1['id'] else p1['elo_rating']
    new_w, new_l = calculate_new_elos(w_elo, l_elo, MatchType(match_data['match_type']))

    updates = {
        f"users/{p1['id']}/elo_rating": new_w if match_data['winner_id'] == p1['id'] else new_l,
        f"users/{p1['id']}/matches_played": p1.get('matches_played', 0) + 1,
        f"users/{p2['id']}/elo_rating": new_l if match_data['winner_id'] == p1['id'] else new_w,
        f"users/{p2['id']}/matches_played": p2.get('matches_played', 0) + 1,
        f"matches/{match_id}/status": "confirmed",
        f"matches/{match_id}/confirmed_at": datetime.utcnow().isoformat()
    }
    if match_data['winner_id'] == p1['id']: updates[f"users/{p1['id']}/matches_won"] = p1.get('matches_won', 0) + 1
    else: updates[f"users/{p2['id']}/matches_won"] = p2.get('matches_won', 0) + 1
    
    get_db_ref('/').update(updates)
    return {"message": "Confirmed"}

@app.get("/api/matches/history")
def get_match_history(current_user: dict = Depends(get_current_user)):
    all_matches = get_db_ref('matches').get() or {}
    history = [m for m in all_matches.values() if m.get('status') == 'confirmed' and 
               (m['player1_id'] == current_user['id'] or m['player2_id'] == current_user['id'])]
    return sorted(history, key=lambda x: x.get('confirmed_at'), reverse=True)
