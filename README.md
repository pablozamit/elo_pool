# 🎱 Club de Billar - Sistema de Gestión

Una aplicación web completa para la gestión de un club de billar con sistema de rankings ELO, gestión de partidos y administración de usuarios.

## 📋 Características Principales

### 🔐 Sistema de Autenticación
- **Registro e inicio de sesión** de usuarios
- **Autenticación JWT** con tokens seguros
- **Gestión de sesiones** persistentes
- **Roles de usuario** (jugador regular y administrador)

### 🏆 Sistema de Rankings ELO
- **Algoritmo ELO personalizado** con diferentes pesos según tipo de partida:
  - **Rey de la Mesa**: Peso 1.0 (menor impacto)
  - **Torneo**: Peso 1.5 (impacto bajo-medio)
  - **Liga - Ronda de Grupos**: Peso 2.0 (impacto medio-alto)
  - **Liga - Rondas Finales**: Peso 2.5 (mayor impacto)
- **Rankings automáticos** ordenados por ELO
- **Estadísticas detalladas**: partidos jugados, ganados, porcentaje de victoria

### 🎯 Gestión de Partidos
- **Envío de resultados** por cualquier jugador
- **Sistema de confirmación** del oponente
- **Historial completo** de partidos confirmados
- **Gestión de partidos pendientes** con opciones de confirmar/rechazar
- **4 tipos de partidos** con diferentes pesos ELO

### ⚙️ Panel de Administración
- **Interfaz completa de administración** (solo para admins)
- **Gestión de usuarios**: crear, editar, eliminar
- **Control de permisos**: asignar/quitar roles de admin
- **Gestión de estado**: activar/desactivar usuarios
- **Edición de ELO**: ajuste manual de ratings
- **Exclusión automática** de admins en rankings

### 🌐 Interfaz Multiidioma
- **Soporte para Español e Inglés**
- **Cambio dinámico** de idioma
- **Detección automática** del idioma del navegador

### 📱 Diseño Responsive
- **Optimizado para móviles** y tablets
- **Interfaz moderna** con Tailwind CSS
- **Navegación intuitiva** por pestañas
- **Experiencia de usuario fluida**

## 🚀 Tecnologías Utilizadas

### Backend
- **FastAPI** - Framework web moderno y rápido
- **MongoDB** - Base de datos NoSQL
- **JWT** - Autenticación segura
- **Python** - Lenguaje de programación

### Frontend
- **React** - Biblioteca de interfaz de usuario
- **Tailwind CSS** - Framework de estilos
- **Axios** - Cliente HTTP
- **i18next** - Internacionalización

## 📁 Estructura del Proyecto

```
├── backend/
│   ├── server.py          # Servidor principal con todas las rutas
│   ├── requirements.txt   # Dependencias de Python
│   └── .env              # Variables de entorno
├── frontend/
│   ├── src/
│   │   ├── App.js        # Componente principal
│   │   ├── i18n.js       # Configuración de idiomas
│   │   └── LanguageSwitcher.js
│   ├── public/
│   │   └── locales/      # Archivos de traducción
│   └── package.json      # Dependencias de Node.js
└── README.md
```

## 🛠️ Instalación y Configuración

### Prerrequisitos
- Python 3.8+
- Node.js 14+
- MongoDB

### Backend
```bash
cd backend
pip install -r requirements.txt
python server.py
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Variables de Entorno
Configurar en `backend/.env`:
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="billiard_club"
JWT_SECRET="your_super_secret_key"
```

Configurar en `frontend/.env` (puedes partir de `frontend/.env.example`):
```
REACT_APP_AIRTABLE_API_KEY=patd5NZCLRKn8aLeh.f946e3c8a6d87690dd4c0d39e3b51d9822bee9b27f455c7b1947cea7dc619b45
REACT_APP_AIRTABLE_BASE_ID=appFHZ4wPWkDlp00P
```
Si defines las variables de Airtable, el frontend funcionará de forma autónoma sin levantar el backend.

## 👤 Usuarios por Defecto

### Usuario Administrador
- **Usuario**: `admin`
- **Contraseña**: `adminpassword`
- **Permisos**: Acceso completo al panel de administración

## 🎮 Guía de Uso

### Para Jugadores Regulares

1. **Registro/Login**
   - Crear cuenta nueva o iniciar sesión
   - El sistema guarda la sesión automáticamente

2. **Ver Rankings**
   - Consultar posición actual en el ranking
   - Ver estadísticas de otros jugadores

3. **Subir Resultados**
   - Seleccionar oponente (con autocompletado)
   - Elegir tipo de partida
   - Ingresar resultado y ganador
   - Esperar confirmación del oponente

4. **Gestionar Partidos Pendientes**
   - Revisar partidos enviados por otros jugadores
   - Confirmar o rechazar resultados

5. **Ver Historial**
   - Consultar todos los partidos confirmados
   - Ver progresión de ELO a lo largo del tiempo

### Para Administradores

1. **Acceso al Panel Admin**
   - Iniciar sesión como admin
   - El tab "Admin" aparece automáticamente

2. **Gestión de Usuarios**
   - **Crear usuarios**: Formulario con permisos personalizables
   - **Editar usuarios**: Modificar ELO, permisos, estado
   - **Eliminar usuarios**: Con confirmación de seguridad

3. **Control de Permisos**
   - Asignar/quitar roles de administrador
   - Activar/desactivar cuentas de usuario

## 🔧 Funcionalidades Técnicas

### Sistema ELO
- **Fórmula estándar ELO** con K-factor variable
- **Pesos diferenciados** por tipo de partida
- **Actualización automática** tras confirmación
- **Cálculo preciso** de cambios de rating

### Seguridad
- **Autenticación JWT** con expiración
- **Validación de permisos** en cada endpoint
- **Protección CORS** configurada
- **Hashing seguro** de contraseñas

### Base de Datos
- **Colecciones MongoDB**:
  - `users`: Información de usuarios
  - `matches`: Partidos y resultados
- **Índices optimizados** para consultas rápidas
- **Validación de datos** con Pydantic

## 🎯 Tipos de Partidas

| Tipo | Descripción | Peso ELO | Uso Recomendado |
|------|-------------|----------|-----------------|
| **Rey de la Mesa** | Partidas casuales | 1.0 | Juegos informales |
| **Torneo** | Competencias organizadas | 1.5 | Torneos del club |
| **Liga - Grupos** | Fase de grupos | 2.0 | Liga regular |
| **Liga - Finales** | Fases finales | 2.5 | Partidos decisivos |

## 🌟 Características Destacadas

### Experiencia de Usuario
- ✅ **Interfaz intuitiva** y fácil de usar
- ✅ **Feedback visual** inmediato
- ✅ **Navegación fluida** entre secciones
- ✅ **Autocompletado** en búsqueda de oponentes

### Administración
- ✅ **Panel completo** de gestión
- ✅ **Edición inline** de usuarios
- ✅ **Confirmaciones de seguridad**
- ✅ **Exclusión automática** de rankings

### Multiidioma
- ✅ **Español e Inglés** soportados
- ✅ **Cambio dinámico** sin recargar
- ✅ **Detección automática** de idioma
- ✅ **Persistencia** de preferencias

## 🔄 Flujo de Trabajo

1. **Jugador A** envía resultado de partida
2. **Sistema** crea partida en estado "pendiente"
3. **Jugador B** recibe notificación en "Pendientes"
4. **Jugador B** confirma o rechaza el resultado
5. **Sistema** actualiza ELO de ambos jugadores
6. **Partida** se mueve al historial como "confirmada"
7. **Rankings** se actualizan automáticamente

## 📊 Métricas y Estadísticas

- **ELO Rating**: Sistema de puntuación dinámico
- **Partidos Jugados**: Contador total de partidas
- **Partidos Ganados**: Victorias confirmadas
- **Porcentaje de Victoria**: Cálculo automático
- **Ranking**: Posición relativa en el club

## 🛡️ Seguridad y Permisos

### Niveles de Acceso
- **Invitado**: Solo ver rankings públicos
- **Jugador**: Gestión completa de sus partidos
- **Administrador**: Control total del sistema

### Protecciones
- **Tokens JWT** con expiración
- **Validación** en frontend y backend
- **Sanitización** de datos de entrada
- **Prevención** de ataques comunes

---

## 📞 Soporte

Para reportar problemas o sugerir mejoras, contacta al administrador del sistema.

**¡Disfruta jugando y compitiendo en el club de billar! 🎱**