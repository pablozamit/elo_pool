from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import json
from pydantic import BaseModel, field_validator
from typing import List, Optional
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
if not firebase_admin._apps:
    try:
        firebase_cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if firebase_cred_json:
            # Limpieza para Vercel
            firebase_cred_json = firebase_cred_json.strip().strip("'").strip('"').strip()
            cred_dict = json.loads(firebase_cred_json)
            cred = credentials.Certificate(cred_dict)
            
            # URL de tu Realtime Database real
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://elopool-f1e62-default-rtdb.europe-west1.firebasedatabase.app/' 
            })
        else:
            firebase_init_error = "Variable FIREBASE_SERVICE_ACCOUNT no encontrada."
    except Exception as e:
        firebase_init_error = f"Error Init: {str(e)}"

def get_db_ref(path: str):
    if firebase_init_error:
        raise HTTPException(status_code=500, detail=firebase_init_error)
    return db.reference(path)

# --- Modelos ---
class UserCreate(BaseModel):
    username: str
    password: str
    @field_validator('username')
    def no_spaces(cls, v):
        if ' ' in v: raise ValueError('No se permiten espacios')
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

# --- Utilidades ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_password(password: str) -> str: return pwd_context.hash(password)
def verify_password(pw, hashed): return pwd_context.verify(pw, hashed)

def create_jwt_token(user_id, username, is_admin):
    payload = {"user_id": user_id, "username": username, "is_admin": is_admin, "exp": datetime.utcnow() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# --- App y Rutas ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status": "ok", "firebase": bool(firebase_admin._apps), "error": firebase_init_error}

@app.post("/api/register", response_model=UserResponse)
def register(user_data: UserCreate):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    for u in all_users.values():
        if u.get('username').lower() == user_data.username.lower():
             raise HTTPException(status_code=400, detail="Usuario ya existe")

    user_id = str(uuid.uuid4())
    new_user = {
        "id": user_id, "username": user_data.username, "password_hash": hash_password(user_data.password),
        "elo_rating": 1200.0, "matches_played": 0, "matches_won": 0, "is_admin": False, "is_active": True,
        "created_at": datetime.utcnow().isoformat()
    }
    users_ref.child(user_id).set(new_user)
    return new_user

@app.post("/api/login")
def login(login_data: UserLogin):
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    user_found = next((u for u in all_users.values() if u.get('username').lower() == login_data.username.lower()), None)
    if not user_found or not verify_password(login_data.password, user_found['password_hash']):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_jwt_token(user_found['id'], user_found['username'], user_found.get('is_admin', False))
    return {"access_token": token, "token_type": "bearer", "user": user_found}

@app.get("/api/rankings")
def get_rankings():
    users_ref = get_db_ref('users')
    all_users = users_ref.get() or {}
    players = sorted([u for u in all_users.values() if u.get('is_active')], key=lambda x: x.get('elo_rating', 1200), reverse=True)
    return [{"rank": i+1, "username": u['username'], "elo_rating": round(u.get('elo_rating', 1200), 1)} for i, u in enumerate(players)]
