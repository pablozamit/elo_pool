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

# --- Firebase Init ---
firebase_init_error = None
firebase_cred_debug_info = "Not checked"

try:
    if not firebase_admin._apps:
        firebase_cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if firebase_cred_json:
            firebase_cred_debug_info = f"Found env var ({len(firebase_cred_json)} chars)"
            # Basic validation of JSON structure before loading
            if not firebase_cred_json.strip().startswith('{'):
                 firebase_init_error = "Env var does not start with '{'. possible copy-paste error."
            else:
                try:
                    cred_dict = json.loads(firebase_cred_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred, {
                        'databaseURL': 'https://elo-pool-default-rtdb.europe-west1.firebasedatabase.app/' 
                    })
                    print("🔥 Firebase inicializado con credenciales de entorno.")
                except json.JSONDecodeError as je:
                    firebase_init_error = f"JSON Decode Error: {je}"
                except Exception as e:
                    firebase_init_error = f"Init Error: {e}"
        else:
            firebase_cred_debug_info = "Env var FIREBASE_SERVICE_ACCOUNT is missing/empty"
            print("⚠️ ADVERTENCIA: Variable FIREBASE_SERVICE_ACCOUNT no encontrada.")
except Exception as e:
    firebase_init_error = f"Global Init Crash: {e}"

def get_db_ref(path: str):
    if firebase_init_error:
        # If init failed, this calls will fail, but we want the app to start at least
        print(f"Cannot get DB ref, init failed: {firebase_init_error}")
    return db.reference(path)

# --- Modelos y Enums ---

class MatchType(str, Enum):
    REY_MESA = "rey_mesa"
    TORNEO = "torneo"
    LIGA_GRUPOS = "liga_grupos"
    LIGA_FINALES = "liga_finales"

ELO_WEIGHTS = {
    MatchType.REY_MESA: 1.0,
    MatchType.TORNEO: 1.5,
    MatchType.LIGA_GRUPOS: 2.0,
    MatchType.LIGA_FINALES: 2.5
}

class User(BaseModel):
    id: str
    username: str
    elo_rating: float
    matches_played: int
    matches_won: int
    is_admin: bool
    is_active: bool
    created_at: str

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
    created_at: str

class MatchCreate(BaseModel):
    opponent_username: str
    match_type: MatchType
    result: str # "5-3", "2-0", etc.
    won: bool

class MatchResponse(BaseModel):
    id: str
    player1_username: str
    player2_username: str
    match_type: MatchType
    result: str
    winner_username: str
    status: str # "pending", "confirmed", "rejected"
    created_at: str
    confirmed_at: Optional[str] = None

class EloPreviewRequest(BaseModel):
    player1_id: str
    player2_id: str
    winner_id: str
    match_type: MatchType

# --- Utilidades ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def create_jwt_token(user_id: str, username: str, is_admin: bool) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "is_admin": is_admin,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        
        user_ref = get_db_ref(f'users/{user_id}')
        user_data = user_ref.get()
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
            
        return user_data # Retorna diccionario raw de firebase
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_admin_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get('is_admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: User is not an admin")
    return current_user

def calculate_new_elos(winner_elo, loser_elo, match_type: MatchType):
    K = 32 * ELO_WEIGHTS[match_type]
    
    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    expected_loser = 1 / (1 + 10 ** ((winner_elo - loser_elo) / 400))
    
    new_winner_elo = winner_elo + K * (1 - expected_winner)
    new_loser_elo = loser_elo + K * (0 - expected_loser)
    
    return new_winner_elo, new_loser_elo

# --- App FastAPI ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routes ---

@app.get("/")
def root():
    return {"message": "La Catrina Pool Club API (Firebase) is running!"}

@app.get("/api/debug")
def debug_firebase():
    status = {
        "firebase_initialized": bool(firebase_admin._apps),
        "env_var_present": bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT")),
        "env_var_debug": firebase_cred_debug_info,
        "init_error": firebase_init_error,
        "db_url": 'https://elo-pool-default-rtdb.europe-west1.firebasedatabase.app/' 
    }
    
    # Try to write and delete a timestamp to verify DB permissions
    if status["firebase_initialized"] and not firebase_init_error:
        try:
            get_db_ref('debug_ping').set(datetime.utcnow().isoformat())
            status["write_test"] = "Success"
        except Exception as e:
            status["write_test"] = f"Failed: {str(e)}"
    else:
        status["write_test"] = "Skipped due to init failure"
            
    return status

@app.post("/api/register", response_model=UserResponse)
def register(user_data: UserCreate):
    # En modo "solo invitación", este endpoint podría estar deshabilitado
    # O restringido a admins. Por ahora lo dejaré abierto para que puedas
    # crear el primer admin, y luego puedes protegerlo.
    
    users_ref = get_db_ref('users')
    
    # Check if username exists (ineficiente en Firebase sin index, pero ok para pocos users)
    all_users = users_ref.get() or {}
    for uid, u in all_users.items():
        if u.get('username').lower() == user_data.username.lower():
             raise HTTPException(status_code=400, detail="Username already exists")

    user_id = str(uuid.uuid4())
    new_user = {
        "id": user_id,
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
        "elo_rating": 1200.0,
        "matches_played": 0,
        "matches_won": 0,
        "is_admin": False, # Default false
        "is_active": True,
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Guardar en Firebase
    users_ref.child(user_id).set(new_user)
    
    return new_user

@app.post("/api/login")
def login(login_data: UserLogin):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    
    user_found = None
    for uid, u in all_users.items():
        if u.get('username').lower() == login_data.username.lower():
            user_found = u
            break
            
    if not user_found or not verify_password(login_data.password, user_found['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    token = create_jwt_token(user_found['id'], user_found['username'], user_found.get('is_admin', False))
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_found
    }

@app.get("/api/rankings")
def get_rankings():
    users_ref = get_db_ref('users')
    all_users = users_ref.get()
    
    if not all_users:
        return []
        
    # Convertir dict de firebase a lista
    users_list = list(all_users.values())
    
    # Filtrar solo activos y no admins (opcional, si quieres ver admins en ranking quita esto)
    players = [u for u in users_list if u.get('is_active') and not u.get('is_admin')]
    
    # Ordenar por ELO
    players.sort(key=lambda x: x.get('elo_rating', 1200), reverse=True)
    
    rankings = []
    for i, user in enumerate(players):
        matches = user.get('matches_played', 0)
        wins = user.get('matches_won', 0)
        win_rate = (wins / matches * 100) if matches > 0 else 0
        
        rankings.append({
            "rank": i + 1,
            "username": user.get('username'),
            "elo_rating": round(user.get('elo_rating', 1200), 1),
            "matches_played": matches,
            "matches_won": wins,
            "win_rate": round(win_rate, 1)
        })
        
    return rankings

@app.post("/api/matches", response_model=MatchResponse)
def create_match(match_data: MatchCreate, current_user: dict = Depends(get_current_user)):
    # Buscar oponente
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    
    opponent = None
    for uid, u in all_users.items():
        if u.get('username').lower() == match_data.opponent_username.lower():
            opponent = u
            break
            
    if not opponent:
        raise HTTPException(status_code=404, detail="Opponent not found")
        
    if opponent['id'] == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot play against yourself")

    match_id = str(uuid.uuid4())
    
    winner_id = current_user['id'] if match_data.won else opponent['id']
    winner_username = current_user['username'] if match_data.won else opponent['username']

    new_match = {
        "id": match_id,
        "player1_id": current_user['id'],
        "player2_id": opponent['id'],
        "player1_username": current_user['username'],
        "player2_username": opponent['username'],
        "match_type": match_data.match_type,
        "result": match_data.result,
        "winner_id": winner_id,
        "winner_username": winner_username,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        # Guardamos ELO actual para historial
        "player1_elo_before": current_user.get('elo_rating', 1200),
        "player2_elo_before": opponent.get('elo_rating', 1200)
    }
    
    # Guardar match en 'matches'
    get_db_ref(f'matches/{match_id}').set(new_match)
    
    return new_match

@app.get("/api/matches/pending")
def get_pending_matches(current_user: dict = Depends(get_current_user)):
    matches_ref = get_db_ref('matches')
    # Query compleja en firebase real time es dificil, traemos todo y filtramos en python
    # Para producción con miles de matches esto se debe optimizar con índices o firestore
    all_matches = matches_ref.get() or {}
    
    pending = []
    for mid, m in all_matches.items():
        if m.get('status') == 'pending':
            # Si soy admin veo todos, si no, solo los que me toca confirmar (donde soy player2 o el que no creó el match)
            # En este diseño simple, asumimos que player1 siempre CREA el match.
            # Así que player2 debe confirmar.
            if current_user.get('is_admin') or m.get('player2_id') == current_user['id']:
                 pending.append(m)
                 
    # Ordenar por fecha desc
    pending.sort(key=lambda x: x.get('created_at'), reverse=True)
    return pending

@app.post("/api/matches/{match_id}/confirm")
def confirm_match(match_id: str, current_user: dict = Depends(get_current_user)):
    match_ref = get_db_ref(f'matches/{match_id}')
    match_data = match_ref.get()
    
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
        
    # Verificar permisos: Solo el oponente puede confirmar (o un admin)
    # Asumimos que quien creó el match (player1) no puede auto-confirmarse
    if not current_user.get('is_admin') and match_data['player2_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to confirm")
        
    if match_data['status'] != 'pending':
        return {"message": "Match already processed"}

    # --- CALCULAR ELO ---
    p1_ref = get_db_ref(f"users/{match_data['player1_id']}")
    p2_ref = get_db_ref(f"users/{match_data['player2_id']}")
    
    p1 = p1_ref.get()
    p2 = p2_ref.get()
    
    elo1 = p1.get('elo_rating', 1200.0)
    elo2 = p2.get('elo_rating', 1200.0)
    
    winner_elo = elo1 if match_data['winner_id'] == p1['id'] else elo2
    loser_elo = elo2 if match_data['winner_id'] == p1['id'] else elo1
    
    new_w, new_l = calculate_new_elos(winner_elo, loser_elo, MatchType(match_data['match_type']))
    
    if match_data['winner_id'] == p1['id']:
        elo1_new = new_w
        elo2_new = new_l
    else:
        elo1_new = new_l
        elo2_new = new_w
        
    # Update Users
    p1['elo_rating'] = elo1_new
    p1['matches_played'] = p1.get('matches_played', 0) + 1
    if match_data['winner_id'] == p1['id']:
        p1['matches_won'] = p1.get('matches_won', 0) + 1
        
    p2['elo_rating'] = elo2_new
    p2['matches_played'] = p2.get('matches_played', 0) + 1
    if match_data['winner_id'] == p2['id']:
        p2['matches_won'] = p2.get('matches_won', 0) + 1
        
    p1_ref.update(p1)
    p2_ref.update(p2)
    
    # Update Match
    match_ref.update({
        "status": "confirmed",
        "confirmed_at": datetime.utcnow().isoformat(),
        "player1_elo_after": elo1_new,
        "player2_elo_after": elo2_new
    })
    
    return {"message": "Match confirmed and ELO updated"}

@app.post("/api/matches/{match_id}/reject")
def reject_match(match_id: str, current_user: dict = Depends(get_current_user)):
    match_ref = get_db_ref(f'matches/{match_id}')
    match_data = match_ref.get()
    
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
        
    if not current_user.get('is_admin') and match_data['player2_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    match_ref.update({
        "status": "rejected",
        "confirmed_at": datetime.utcnow().isoformat()
    })
    return {"message": "Match rejected"}

@app.get("/api/matches/history")
def get_match_history(current_user: dict = Depends(get_current_user)):
    matches_ref = get_db_ref('matches')
    all_matches = matches_ref.get() or {}
    
    history = []
    for mid, m in all_matches.items():
        if m.get('status') == 'confirmed':
            if m['player1_id'] == current_user['id'] or m['player2_id'] == current_user['id']:
                history.append(m)
                
    history.sort(key=lambda x: x.get('confirmed_at'), reverse=True)
    return history

@app.post("/api/elo/preview")
def preview_elo(request: EloPreviewRequest):
    p1_ref = get_db_ref(f"users/{request.player1_id}")
    p2_ref = get_db_ref(f"users/{request.player2_id}")
    
    p1 = p1_ref.get()
    p2 = p2_ref.get()
    
    if not p1 or not p2:
        raise HTTPException(status_code=404, detail="User not found")
        
    elo1 = p1.get('elo_rating', 1200.0)
    elo2 = p2.get('elo_rating', 1200.0)
    
    winner_elo = elo1 if request.winner_id == request.player1_id else elo2
    loser_elo = elo2 if request.winner_id == request.player1_id else elo1
    
    new_w, new_l = calculate_new_elos(winner_elo, loser_elo, request.match_type)
    
    delta_w = new_w - winner_elo
    delta_l = new_l - loser_elo # será negativo
    
    if request.winner_id == request.player1_id:
        return {
            "user": {"from": round(elo1), "to": round(new_w), "delta": round(delta_w)},
            "opponent": {"from": round(elo2), "to": round(new_l), "delta": round(delta_l)}
        }
    else:
        return {
            "user": {"from": round(elo1), "to": round(new_l), "delta": round(delta_l)},
            "opponent": {"from": round(elo2), "to": round(new_w), "delta": round(delta_w)}
        }

@app.get("/api/users/me")
def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)

def user_to_response(user_data):
    return {
        "id": user_data['id'],
        "username": user_data['username'],
        "elo_rating": user_data.get('elo_rating', 1200.0),
        "matches_played": user_data.get('matches_played', 0),
        "matches_won": user_data.get('matches_won', 0),
        "is_admin": user_data.get('is_admin', False),
        "is_active": user_data.get('is_active', True),
        "created_at": user_data.get('created_at', "")
    }

# Para Vercel
def handler(request):
    return app(request)