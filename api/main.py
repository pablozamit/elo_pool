from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os, json, re, uuid
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from enum import Enum
import firebase_admin
from firebase_admin import credentials, db

# --- Configuración Inicial ---
JWT_SECRET = os.environ.get("JWT_SECRET", "clave_maestra_pool")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# --- CARGADOR BLINDADO DE FIREBASE (Solución al error 500) ---
firebase_init_error = None

def get_firebase_creds():
    raw_s = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw_s: return None
    
    # Limpieza de comillas raras de Vercel
    if raw_s.startswith(("'","\"")): raw_s = raw_s[1:-1]
    
    try:
        # Intento 1: Carga normal (si el JSON es perfecto)
        return json.loads(raw_s, strict=False)
    except Exception:
        # Intento 2: Extracción manual por Regex (ignora errores de escape de JSON)
        # Esto extrae los campos aunque haya barras invertidas \ mal puestas
        def extract(field):
            match = re.search(f'"{field}"\s*:\s*"([^"]+)"', raw_s)
            return match.group(1).replace('\\n', '\n') if match else None
        
        return {
            "type": "service_account",
            "project_id": extract("project_id"),
            "private_key": extract("private_key"),
            "client_email": extract("client_email"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }

if not firebase_admin._apps:
    try:
        creds_dict = get_firebase_creds()
        if creds_dict and creds_dict.get("private_key"):
            cred = credentials.Certificate(creds_dict)
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://elopool-f1e62-default-rtdb.europe-west1.firebasedatabase.app/'
            })
        else:
            firebase_init_error = "No se pudieron extraer las credenciales del env var."
    except Exception as e:
        firebase_init_error = f"Fallo crítico: {str(e)}"

def get_db_ref(path: str):
    if firebase_init_error: raise HTTPException(status_code=500, detail=firebase_init_error)
    return db.reference(path)

# --- Modelos y Lógica ELO (Restaurados de tu archivo original) ---
class MatchType(str, Enum):
    REY_MESA = "rey_mesa"
    TORNEO = "torneo"
    LIGA_GRUPOS = "liga_grupos"
    LIGA_FINALES = "liga_finales"

ELO_WEIGHTS = { MatchType.REY_MESA: 1.0, MatchType.TORNEO: 1.5, MatchType.LIGA_GRUPOS: 2.0, MatchType.LIGA_FINALES: 2.5 }

class UserCreate(BaseModel):
    username: str
    password: str
    @field_validator('username')
    def no_spaces(cls, v):
        if ' ' in v: raise ValueError('Username cannot contain spaces')
        return v

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str; username: str; elo_rating: float; matches_played: int
    matches_won: int; is_admin: bool; is_active: bool; created_at: str

class MatchCreate(BaseModel):
    opponent_username: str; match_type: MatchType; result: str; won: bool

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def verify_password(pw, hashed): return pwd_context.verify(pw, hashed)
def hash_password(pw): return pwd_context.hash(pw)

def create_jwt_token(u_id, u_name, admin):
    payload = {"user_id": u_id, "username": u_name, "is_admin": admin, "exp": datetime.utcnow() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        p = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        u = get_db_ref(f"users/{p['user_id']}").get()
        if not u: raise Exception()
        return u
    except: raise HTTPException(status_code=401, detail="Token inválido")

def calculate_new_elos(w_elo, l_elo, m_type):
    K = 32 * ELO_WEIGHTS[m_type]
    ew = 1 / (1 + 10 ** ((l_elo - w_elo) / 400))
    el = 1 / (1 + 10 ** ((w_elo - l_elo) / 400))
    return w_elo + K * (1 - ew), l_elo + K * (0 - el)

# --- API Endpoints ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def health(): return {"status": "ok", "firebase": bool(firebase_admin._apps), "error": firebase_init_error}

@app.post("/api/register", response_model=UserResponse)
def register(data: UserCreate):
    ref = get_db_ref('users')
    if any(u.get('username','').lower() == data.username.lower() for u in (ref.get() or {}).values()):
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    uid = str(uuid.uuid4())
    user = {"id": uid, "username": data.username, "password_hash": hash_password(data.password),
            "elo_rating": 1200.0, "matches_played": 0, "matches_won": 0, "is_admin": False,
            "is_active": True, "created_at": datetime.utcnow().isoformat()}
    ref.child(uid).set(user)
    return user

@app.post("/api/login")
def login(data: UserLogin):
    users = get_db_ref('users').get() or {}
    user = next((u for u in users.values() if u['username'].lower() == data.username.lower()), None)
    if not user or not verify_password(data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {"access_token": create_jwt_token(user['id'], user['username'], user.get('is_admin', False)), "user": user}

@app.get("/api/rankings")
def rankings():
    users = get_db_ref('users').get() or {}
    players = sorted([u for u in users.values() if u.get('is_active')], key=lambda x: x.get('elo_rating', 1200), reverse=True)
    return [{"rank": i+1, "username": u['username'], "elo_rating": round(u.get('elo_rating', 1200), 1),
             "matches": u.get('matches_played', 0)} for i, u in enumerate(players)]

@app.post("/api/matches")
def create_match(data: MatchCreate, user = Depends(get_current_user)):
    opp = next((u for u in (get_db_ref('users').get() or {}).values() if u['username'].lower() == data.opponent_username.lower()), None)
    if not opp: raise HTTPException(status_code=404, detail="Oponente no encontrado")
    mid = str(uuid.uuid4())
    match = {"id": mid, "player1_id": user['id'], "player2_id": opp['id'], "player1_username": user['username'],
             "player2_username": opp['username'], "match_type": data.match_type, "result": data.result,
             "winner_id": user['id'] if data.won else opp['id'], "status": "pending", "created_at": datetime.utcnow().isoformat()}
    get_db_ref(f'matches/{mid}').set(match)
    return match

@app.post("/api/matches/{mid}/confirm")
def confirm(mid: str, user = Depends(get_current_user)):
    m = get_db_ref(f'matches/{mid}').get()
    if not m or m['status'] != 'pending': raise HTTPException(status_code=400)
    p1, p2 = get_db_ref(f"users/{m['player1_id']}").get(), get_db_ref(f"users/{m['player2_id']}").get()
    w_elo = p1['elo_rating'] if m['winner_id'] == p1['id'] else p2['elo_rating']
    l_elo = p2['elo_rating'] if m['winner_id'] == p1['id'] else p1['elo_rating']
    nw, nl = calculate_new_elos(w_elo, l_elo, MatchType(m['match_type']))
    
    updates = {
        f"users/{p1['id']}/elo_rating": nw if m['winner_id'] == p1['id'] else nl,
        f"users/{p1['id']}/matches_played": p1.get('matches_played', 0) + 1,
        f"users/{p2['id']}/elo_rating": nl if m['winner_id'] == p1['id'] else nw,
        f"users/{p2['id']}/matches_played": p2.get('matches_played', 0) + 1,
        f"matches/{mid}/status": "confirmed", f"matches/{mid}/confirmed_at": datetime.utcnow().isoformat()
    }
    db.reference('/').update(updates)
    return {"status": "confirmed"}
