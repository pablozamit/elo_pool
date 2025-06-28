# 🚀 Instrucciones de Setup - Deployment Gratuito

## 📋 Checklist de Deployment

### ✅ **PASO 1: MongoDB Atlas (Base de Datos) - 5 minutos**

1. **Crear cuenta en MongoDB Atlas:**
   - Ve a: https://cloud.mongodb.com
   - Registrate con email (gratis)
   - Verifica tu email

2. **Crear cluster gratuito:**
   - Selecciona "Build a Database"
   - Elige "M0 Sandbox" (GRATIS - 512MB)
   - Región: Elige la más cercana a ti
   - Nombre del cluster: `billiard-club`

3. **Configurar acceso:**
   - **Usuario de base de datos:**
     - Username: `billiard_admin`
     - Password: Genera una contraseña segura (guárdala)
   - **Network Access:**
     - Add IP Address → "Allow access from anywhere" (0.0.0.0/0)

4. **Obtener connection string:**
   - Ve a "Connect" → "Connect your application"
   - Copia el string que se ve así:
   ```
   mongodb+srv://billiard_admin:<password>@billiard-club.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   - Reemplaza `<password>` con tu contraseña real
   - Añade `/billiard_club` antes del `?` para especificar la base de datos

**✅ RESULTADO:** Tendrás un string como:
```
mongodb+srv://billiard_admin:tu_password@billiard-club.xxxxx.mongodb.net/billiard_club?retryWrites=true&w=majority
```

---

### ✅ **PASO 2: Railway (Backend) - 10 minutos**

1. **Crear cuenta en Railway:**
   - Ve a: https://railway.app
   - Registrate con GitHub (recomendado)

2. **Crear nuevo proyecto:**
   - Click "New Project"
   - Selecciona "Deploy from GitHub repo"
   - Conecta tu repositorio del club de billar

3. **Configurar variables de entorno:**
   - Ve a tu proyecto → "Variables"
   - Añade estas variables:
   ```
   MONGO_URL=mongodb+srv://billiard_admin:tu_password@billiard-club.xxxxx.mongodb.net/billiard_club?retryWrites=true&w=majority
   DB_NAME=billiard_club
   JWT_SECRET=clave_super_segura_de_al_menos_32_caracteres_aqui
   PORT=8000
   ```

4. **Configurar build:**
   - Railway debería detectar automáticamente que es Python
   - Si no, ve a "Settings" → "Build Command":
   ```bash
   cd backend && pip install -r requirements.txt
   ```
   - "Start Command":
   ```bash
   cd backend && python -m uvicorn server:app --host 0.0.0.0 --port $PORT
   ```

5. **Deploy:**
   - Railway hará deploy automáticamente
   - Espera 2-3 minutos
   - Obtendrás una URL como: `https://tu-proyecto.railway.app`

**✅ RESULTADO:** Tu backend estará funcionando en una URL de Railway

---

### ✅ **PASO 3: Vercel (Frontend) - 5 minutos**

1. **Crear cuenta en Vercel:**
   - Ve a: https://vercel.com
   - Registrate con GitHub

2. **Importar proyecto:**
   - Click "New Project"
   - Selecciona tu repositorio del club de billar
   - Root Directory: Déjalo en "." (raíz)

3. **Configurar build:**
   - Framework Preset: "Create React App"
   - Build Command: `cd frontend && npm run build`
   - Output Directory: `frontend/build`
   - Install Command: `cd frontend && npm install`

4. **Configurar variables de entorno:**
   - Ve a "Environment Variables"
   - Añade:
   ```
   REACT_APP_BACKEND_URL=https://tu-proyecto.railway.app
   ```
   (Usa la URL que obtuviste de Railway)

5. **Deploy:**
   - Click "Deploy"
   - Espera 2-3 minutos
   - Obtendrás una URL como: `https://tu-proyecto.vercel.app`

**✅ RESULTADO:** Tu frontend estará funcionando en una URL de Vercel

---

### ✅ **PASO 4: Verificar que Todo Funciona**

1. **Probar la aplicación:**
   - Ve a tu URL de Vercel
   - Deberías ver la página de login del club de billar
   - Intenta registrar un usuario nuevo
   - Verifica que puedas hacer login

2. **Probar el backend directamente:**
   - Ve a: `https://tu-proyecto.railway.app/api/rankings`
   - Deberías ver un JSON con rankings vacíos: `[]`

3. **Verificar la base de datos:**
   - En MongoDB Atlas, ve a "Browse Collections"
   - Deberías ver la base de datos `billiard_club`
   - Con colecciones `users` y `matches` (después de registrar usuarios)

---

### ✅ **PASO 5: Configurar Dominio Personalizado (Opcional)**

Si quieres un dominio como `miclubdebillar.com`:

1. **Comprar dominio:**
   - Namecheap, GoDaddy, etc. (~$10-15/año)

2. **Configurar en Vercel:**
   - Ve a tu proyecto → "Settings" → "Domains"
   - Añade tu dominio
   - Configura los DNS según las instrucciones

3. **SSL automático:**
   - Vercel configura HTTPS automáticamente
   - Tu sitio será seguro por defecto

---

## 🔧 **Troubleshooting Común**

### ❌ **Error: "Cannot connect to database"**
- Verifica que el MONGO_URL esté correcto en Railway
- Asegúrate de que la IP 0.0.0.0/0 esté permitida en MongoDB Atlas
- Verifica que la contraseña no tenga caracteres especiales sin escapar

### ❌ **Error: "CORS policy"**
- Verifica que REACT_APP_BACKEND_URL apunte a la URL correcta de Railway
- Asegúrate de que no haya `/` al final de la URL

### ❌ **Error: "Build failed"**
- Verifica que los comandos de build estén correctos
- Revisa los logs en Railway/Vercel para más detalles

### ❌ **Error: "Cannot find module"**
- Asegúrate de que requirements.txt y package.json estén en las carpetas correctas
- Verifica que los comandos de build incluyan `cd frontend` o `cd backend`

---

## 🎯 **URLs Finales**

Después del setup tendrás:

- **Frontend (usuarios):** `https://tu-proyecto.vercel.app`
- **Backend (API):** `https://tu-proyecto.railway.app`
- **Base de datos:** MongoDB Atlas (gestionada automáticamente)

## 💰 **Costos**

- **MongoDB Atlas:** $0/mes (hasta 512MB)
- **Railway:** $0/mes (hasta $5 de uso)
- **Vercel:** $0/mes (hasta 100GB bandwidth)
- **Dominio personalizado:** $10-15/año (opcional)

**Total: $0/mes + dominio opcional**

---

## 🚀 **¡Listo para Producción!**

Tu club de billar estará:
- ✅ Accesible desde cualquier dispositivo
- ✅ Con base de datos persistente
- ✅ Con HTTPS automático
- ✅ Con backups automáticos
- ✅ Escalable automáticamente

¡Comparte la URL con los miembros de tu club y empezad a competir! 🎱