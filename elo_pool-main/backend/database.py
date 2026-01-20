import firebase_admin
from firebase_admin import credentials, db
import os
import json

# Cargar las credenciales de Firebase desde una variable de entorno
firebase_service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")

if firebase_service_account_json:
    try:
        cred_json = json.loads(firebase_service_account_json)
        cred = credentials.Certificate(cred_json)
        
        # Verificar si la app ya está inicializada para evitar errores
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': f"https://{cred_json.get('project_id')}.firebaseio.com"
            })
    except json.JSONDecodeError:
        print("Error: La variable de entorno FIREBASE_SERVICE_ACCOUNT no es un JSON válido.")
    except Exception as e:
        print(f"Error al inicializar Firebase: {e}")

def get_db_ref(path: str):
    """
    Devuelve una referencia a una ruta específica en la Realtime Database.
    """
    return db.reference(path)
