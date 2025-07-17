import React, { useState, useEffect, createContext, useContext, Suspense } from 'react';
import './App.css';
import {
  login as apiLogin,
  register as apiRegister,
  getRankings,
  getMatchHistory,
  getPendingMatches,
  submitMatch,
  confirmMatch as apiConfirmMatch,
  declineMatch as apiDeclineMatch,
  getMyAchievements,
  getEloPreview,
  adminGetAllUsers,
  adminUpdateUser,
  adminCreateUser,
  adminDeleteUser,
} from './api/index';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import AchievementSystem from './components/AchievementSystem';
import AchievementNotification from './components/AchievementNotification';
import PlayerProfile from './components/PlayerProfile';
import AdminDebugPanel from './components/AdminDebugPanel';
import { analyzeErrorWithGemini } from './utils/gemini.js';

const ELO_WEIGHTS = {
  rey_mesa: 1.0,
  torneo: 1.5,
  liga_grupos: 2.0,
  liga_finales: 2.5,
};

const findUserByUsername = (list, username) => {
  if (!Array.isArray(list) || !username) return undefined;
  return list.find(
    (u) => u.username && u.username.toLowerCase() === username.toLowerCase()
  );
};

const calculateEloChange = (winnerElo, loserElo, matchType) => {
  console.group('Calculo ELO');
  console.log('Entradas:', { winnerElo, loserElo, matchType });
  const K = 32 * ELO_WEIGHTS[matchType];
  const expectedWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));
  const newWinnerElo = winnerElo + K * (1 - expectedWinner);
  const newLoserElo = loserElo + K * (0 - expectedLoser);
  console.log('Salidas:', { newWinnerElo, newLoserElo });
  console.groupEnd();
  return { newWinnerElo, newLoserElo };
};

const simulateEloChange = (playerA, playerB, didAWin, matchType) => {
  const weight = ELO_WEIGHTS[matchType] || 1.0;
  const expectedA = 1 / (1 + Math.pow(10, (playerB.elo_rating - playerA.elo_rating) / 400));
  const scoreA = didAWin ? 1 : 0;
  const K = 32 * weight;
  const change = Math.round(K * (scoreA - expectedA));
  return {
    eloA: Math.round(playerA.elo_rating + change),
    eloB: Math.round(playerB.elo_rating - change),
    change,
  };
};

const useEloPreview = ({ currentUser, opponent, score1, score2, matchType }) => {
  const [eloPreview, setEloPreview] = useState(null);

  useEffect(() => {
    if (!currentUser || !opponent || score1 === '' || score2 === '' || !matchType) {
      setEloPreview(null);
      return;
    }

    const fetchPreview = async () => {
      try {
        const winnerId = parseInt(score1, 10) > parseInt(score2, 10) ? currentUser.id : opponent.id;
        
        const previewData = {
          player1_id: currentUser.id,
          player2_id: opponent.id,
          winner_id: winnerId,
          match_type: matchType,
        };
        
        const response = await getEloPreview(previewData);
        setEloPreview(response.data);
      } catch (error) {
        console.error("Error al obtener la previsualización del ELO:", error);
        setEloPreview(null);
      }
    };

    fetchPreview();
  }, [currentUser, opponent, score1, score2, matchType]);

  return eloPreview;
};

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    console.group('Login');
    console.log('Credenciales ingresadas:', { username, password });
    try {
      const response = await apiLogin(username, password);
      const { access_token, user_details } = response.data;

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user_details));
      
      setToken(access_token);
      setUser(user_details);
      
      console.log('Login exitoso para', username);
      console.groupEnd();
      return { success: true };
    } catch (error) {
      console.error('Error de login:', error.message);
      console.groupEnd();
      return { success: false, error: 'Usuario o contraseña incorrectos' };
    }
  };

  const register = async (username, password) => {
    console.group('Registro');
    console.log('Datos de registro:', { username, password });
    try {
      await apiRegister(username, password);
      
      console.log('Registro exitoso para', username);
      console.groupEnd();
      return { success: true, message: '¡Registro exitoso! Por favor, inicia sesión.' };
    } catch (error) {
      console.error('Error de registro:', error.message);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      console.groupEnd();
      return { success: false, error: error.response?.data?.detail || 'Error de registro' };
    }
  };

  const logout = () => {
    console.log('Cerrando sesión');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, setToken, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Components
const LoginForm = ({ initialMode = 'login', onSwitchMode, onLoginSuccess }) => {
  const { t } = useTranslation();
  const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login');
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const { login, register: authRegister } = useAuth();

  useEffect(() => {
    setIsLoginMode(initialMode === 'login');
    setError('');
    setMessage('');
  }, [initialMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.group('Formulario de autenticación');
    console.log('Modo:', isLoginMode ? 'login' : 'register');
    console.log('Datos ingresados:', formData);
    setFormLoading(true);
    setError('');
    setMessage('');

    if (isLoginMode) {
      const result = await login(formData.username, formData.password);
      if (!result.success) {
        console.log('Login fallido');
        setError(result.error);
      } else {
        console.log('Login completado');
        if (onLoginSuccess) onLoginSuccess();
      }
    } else {
      const result = await authRegister(formData.username, formData.password);
      if (result.success) {
        console.log('Registro completado');
        setIsLoginMode(true);
        setFormData({ username: '', password: '' });
        setMessage(result.message || '¡Registro exitoso! Por favor, inicia sesión.');
        if (onSwitchMode) onSwitchMode('login');
      } else {
        console.log('Registro fallido');
        setError(result.error);
      }
    }
    setFormLoading(false);
    console.groupEnd();
  };

  const handleSwitchMode = () => {
    console.log('Cambiando modo de formulario');
    setIsLoginMode(!isLoginMode);
    setError('');
    setMessage('');
    setFormData({ username: '', password: '' });
    if (onSwitchMode) onSwitchMode(!isLoginMode ? 'register' : 'login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="app-background"></div>
      
      <div className="premium-form w-full max-w-md fade-in-up">
        <div className="text-center mb-8">
          <div className="logo-container justify-center mb-6">
            <div className="logo-icon">🎱</div>
            <div>
              <h1 className="club-name">La Catrina</h1>
              <p className="club-subtitle">{t('billiardClub')}</p>
            </div>
          </div>
          <h2 className="premium-subtitle text-xl mb-2">
            {isLoginMode ? t('loginTitle') : t('registerTitle')}
          </h2>
          <p className="text-sm text-gray-400">
            {isLoginMode ? 'Ingresa a tu cuenta premium' : 'Crea tu cuenta de miembro'}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg mb-4 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="form-group">
            <label className="form-label">
              {t('usernameLabel')}
            </label>
            <input
              type="text"
              required
              className="form-input"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              placeholder="Ingresa tu usuario"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              required
              className="form-input"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              placeholder="Ingresa tu contraseña"
            />
          </div>

          <button
            type="submit"
            disabled={formLoading}
            className="btn-premium w-full"
          >
            {formLoading ? (
              <div className="flex items-center justify-center">
                <div className="loading-spinner mr-2"></div>
                {t('loading')}
              </div>
            ) : (
              isLoginMode ? t('login') : t('register')
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={handleSwitchMode}
            className="text-yellow-400 hover:text-yellow-300 font-medium transition-colors"
          >
            {isLoginMode ? t('noAccount') : t('alreadyAccount')}
          </button>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('rankings');
  const [rankings, setRankings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [achievementNotifications, setAchievementNotifications] = useState([]);
  const [newAchievementCount, setNewAchievementCount] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [actionError, setActionError] = useState('');
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const [showLoginView, setShowLoginView] = useState(false);
  const [loginViewMode, setLoginViewMode] = useState('login');

  const fetchRankings = async () => {
    console.group('Fetch Rankings');
    try {
      const response = await getRankings();
      setRankings(response.data);
      console.log('Rankings actualizados, total:', response.data.length);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setRankings([]);
    }
    console.groupEnd();
  };

  const fetchMatches = async () => {
    if (!user) {
      console.warn('Usuario undefined en fetchMatches');
      return;
    }
    console.group('Fetch Matches');
    try {
      const response = await getMatchHistory();
      setMatches(response.data);
      console.log('Actualizados matches del usuario:', response.data.length);
    } catch (error) {
      console.error('Error fetching matches:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setMatches([]);
    }
    console.groupEnd();
  };

  const fetchPendingMatches = async () => {
    if (!user) {
      console.warn('Usuario undefined en fetchPendingMatches');
      return;
    }
    console.group('Fetch Pending Matches');
    try {
      const response = await getPendingMatches();
      setPendingMatches(response.data);
      console.log('Pendientes obtenidos:', response.data.length);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setPendingMatches([]);
    }
    console.groupEnd();
  };

  const checkAchievements = async () => {
    if (!user) {
      console.warn('Usuario undefined en checkAchievements');
      return;
    }
    console.group('Check Achievements');
    try {
      const response = await getMyAchievements();
      const data = response.data;

      console.log('Badges nuevos:', data.new_badges?.length || 0);
      if (data.new_badges && data.new_badges.length > 0) {
        setAchievementNotifications(data.new_badges);
        setNewAchievementCount((c) => c + data.new_badges.length);
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
    }
    console.groupEnd();
  };

  useEffect(() => {
    fetchRankings();
  }, []);

  useEffect(() => {
    if (user) {
      console.log('Usuario disponible:', user.username);
      fetchRankings();
      setShowLoginView(false);
      fetchMatches();
      fetchPendingMatches();
      checkAchievements();
    } else {
      console.log('Usuario null, acceso restringido');
      setMatches([]);
      setPendingMatches([]);
      if (['submit', 'pending', 'history', 'admin'].includes(activeTab)) {
        setActiveTab('rankings');
      }
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'achievements') {
      setNewAchievementCount(0);
    }
  }, [activeTab]);

  const confirmMatch = async (matchId) => {
    if (!user) {
      console.warn('Usuario undefined en confirmMatch');
      return;
    }
    console.group('Confirmar partido');
    try {
      await apiConfirmMatch(matchId);
      fetchPendingMatches();
      fetchRankings();
      fetchMatches();
      checkAchievements();
      console.log('Partido confirmado correctamente');
    } catch (error) {
      console.error('Error confirming match:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setActionError('Error al confirmar el partido');
      alert('Error al confirmar el partido');
    }
    console.groupEnd();
  };

  const rejectMatch = async (matchId) => {
    if (!user) {
      console.warn('Usuario undefined en rejectMatch');
      return;
    }
    console.group('Rechazar partido');
    try {
      await apiDeclineMatch(matchId);
      fetchPendingMatches();
      console.log('Partido rechazado', matchId);
    } catch (error) {
      console.error('Error rejecting match:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setActionError('Error al rechazar el partido');
      alert('Error al rechazar el partido');
    }
    console.groupEnd();
  };

  const TabButton = ({ tab, label, icon, disabled = false, count = null }) => (
    <button
      onClick={() => {
        if (disabled) {
          setShowLoginView(true);
          setLoginViewMode('login');
        } else {
          setActiveTab(tab);
        }
      }}
      disabled={disabled && activeTab === tab}
      className={`nav-button ${activeTab === tab && !disabled ? 'active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="text-lg">{icon}</span>
      <span className="hidden sm:inline">
        {label}
        {count !== null && count > 0 && (
          <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            {count}
          </span>
        )}
      </span>
    </button>
  );

  if (showLoginView && !user) {
    return (
      <LoginForm
        initialMode={loginViewMode}
        onSwitchMode={(mode) => setLoginViewMode(mode)}
        onLoginSuccess={() => {
          setShowLoginView(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="app-background"></div>
      
      {achievementNotifications.length > 0 && (
        <AchievementNotification
          achievements={achievementNotifications}
          onClose={() => setAchievementNotifications([])}
        />
      )}

      {selectedPlayer && (
        <PlayerProfile
          playerId={selectedPlayer.id}
          playerUsername={selectedPlayer.username}
          currentUser={user}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <div className="premium-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="logo-container">
              <div className="logo-icon">🎱</div>
              <div>
                <h1 className="club-name">La Catrina</h1>
                <p className="club-subtitle">{t('billiardClub')}</p>
              </div>
            </div>
            
            {user && (
              <div className="hidden lg:block text-right">
                <div className="text-sm text-gray-300">
                  {t('helloUser', { username: user.username })}
                </div>
                <div className="flex items-center justify-end gap-4 mt-1">
                  <div className="elo-badge">
                    ELO: {user.elo_rating?.toFixed(0)}
                  </div>
                  {user.is_admin && (
                    <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      ADMIN
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedPlayer({ id: user.id, username: user.username })}
                    className="text-yellow-400 hover:text-yellow-300 text-sm underline transition-colors"
                  >
                    Mi Perfil
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-4">
              <LanguageSwitcher />
              {user ? (
                <button
                  onClick={logout}
                  className="btn-secondary"
                >
                  {t('logout')}
                </button>
              ) : (
                <div className="space-x-2">
                  <button
                    onClick={() => { setShowLoginView(true); setLoginViewMode('login'); }}
                    className="btn-premium"
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => { setShowLoginView(true); setLoginViewMode('register'); }}
                    className="btn-secondary"
                  >
                    {t('register')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="premium-nav mb-8 justify-center">
          <TabButton tab="rankings" label={t('rankings')} icon="🏆" />
          {user && (
            <>
              <TabButton tab="submit" label={t('submitResult')} icon="📝" />
              <TabButton
                tab="pending"
                label={t('pendingMatches')}
                icon="⏳"
                count={pendingMatches.length}
              />
              <TabButton tab="history" label={t('matchHistory')} icon="📊" />
            </>
          )}
          <TabButton
            tab="achievements"
            label={t('achievements')}
            icon="🎖️"
            count={newAchievementCount}
          />
          {user && user.is_admin && (
            <TabButton tab="admin" label={t('admin')} icon="⚙️" />
          )}
        </div>

        <div className="premium-card p-8 fade-in-up">
          {activeTab === 'rankings' && (
            <RankingsTab rankings={rankings} onPlayerClick={setSelectedPlayer} />
          )}
          {user && activeTab === 'submit' && (
            <SubmitMatchTab rankings={rankings} onMatchSubmitted={() => {
              fetchRankings();
              fetchMatches();
              fetchPendingMatches();
              checkAchievements();
            }} />
          )}
          {user && activeTab === 'pending' && (
            <PendingMatchesTab 
              matches={pendingMatches} 
              onConfirm={confirmMatch}
              onReject={rejectMatch}
            />
          )}
          {user && activeTab === 'history' && (
            <HistoryTab matches={matches} currentUser={user} onPlayerClick={setSelectedPlayer} />
          )}
          {activeTab === 'achievements' && (
            <AchievementSystem currentUser={user} />
          )}
          {user && user.is_admin && activeTab === 'admin' && (
            <AdminTab />
          )}
          {!user && (activeTab === 'submit' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'admin') && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔒</div>
              <h3 className="premium-title text-2xl mb-4">Acceso Restringido</h3>
              <p className="text-gray-400 mb-8">Esta sección es exclusiva para miembros del club</p>
              <button
                onClick={() => { setShowLoginView(true); setLoginViewMode('login'); }}
                className="btn-premium"
              >
                Iniciar Sesión
              </button>
            </div>
          )}
        </div>
      </div>
      {user?.is_admin && <AdminDebugPanel />}
    </div>
  );
};

const AdminTab = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    username: '',
    password: '',
    is_admin: false,
    is_active: true
  });

  const fetchUsers = async () => {
    console.group('Fetch Users');
    setLoading(true);
    try {
      const response = await adminGetAllUsers();
      setUsers(response.data);
      console.log('Usuarios cargados:', response.data.length);
    } catch (error) {
      setError('Error al cargar usuarios');
      console.error('Error fetching users:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
    }
    setLoading(false);
    console.groupEnd();
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    console.group('Crear usuario');
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await adminCreateUser(createFormData);
      console.log('Usuario creado');
      setSuccess('Usuario creado exitosamente');
      setCreateFormData({
        username: '',
        password: '',
        is_admin: false,
        is_active: true
      });
      setShowCreateForm(false);
      fetchUsers();
    } catch (error) {
      console.error('Error creando usuario:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setError(error.response?.data?.detail || 'Error al crear usuario');
    }
    setLoading(false);
    console.groupEnd();
  };

  const handleUpdateUser = async (userId, updateData) => {
    console.group('Actualizar usuario');
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await adminUpdateUser(userId, updateData);
      console.log('Usuario actualizado', userId);
      setSuccess('Usuario actualizado exitosamente');
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setError(error.response?.data?.detail || 'Error al actualizar usuario');
    }
    setLoading(false);
    console.groupEnd();
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar al usuario "${username}"?`)) {
      return;
    }

    console.group('Eliminar usuario');
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await adminDeleteUser(userId);
      console.log('Usuario eliminado', userId);
      setSuccess('Usuario eliminado exitosamente');
      fetchUsers();
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setError(error.response?.data?.detail || 'Error al eliminar usuario');
    }
    setLoading(false);
    console.groupEnd();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="premium-title text-3xl">Panel de Administración</h2>
          <p className="text-gray-400 mt-2">Gestión completa de usuarios del club</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={showCreateForm ? "btn-secondary" : "btn-premium"}
        >
          {showCreateForm ? 'Cancelar' : 'Crear Usuario'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {showCreateForm && (
        <div className="premium-card p-6">
          <h3 className="premium-subtitle text-xl mb-6">Crear Nuevo Usuario</h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-group">
              <label className="form-label">Nombre de Usuario</label>
              <input
                type="text"
                required
                className="form-input"
                value={createFormData.username}
                onChange={(e) => setCreateFormData({...createFormData, username: e.target.value})}
                placeholder="Usuario único"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                required
                className="form-input"
                value={createFormData.password}
                onChange={(e) => setCreateFormData({...createFormData, password: e.target.value})}
                placeholder="Contraseña segura"
              />
            </div>
            <div className="flex items-center space-x-6">
              <label className="flex items-center text-gray-300">
                <input
                  type="checkbox"
                  checked={createFormData.is_admin}
                  onChange={(e) => setCreateFormData({...createFormData, is_admin: e.target.checked})}
                  className="mr-2 accent-yellow-500"
                />
                Administrador
              </label>
              <label className="flex items-center text-gray-300">
                <input
                  type="checkbox"
                  checked={createFormData.is_active}
                  onChange={(e) => setCreateFormData({...createFormData, is_active: e.target.checked})}
                  className="mr-2 accent-yellow-500"
                />
                Usuario Activo
              </label>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-premium"
              >
                {loading ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>ELO</th>
                <th>Partidos</th>
                <th>Ganados</th>
                <th>Admin</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isEditing={editingUser === user.id}
                  onEdit={() => setEditingUser(user.id)}
                  onCancelEdit={() => setEditingUser(null)}
                  onUpdate={(updateData) => handleUpdateUser(user.id, updateData)}
                  onDelete={() => handleDeleteUser(user.id, user.username)}
                  loading={loading}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading && (
        <div className="text-center">
          <div className="loading-spinner mx-auto"></div>
          <p className="text-gray-400 mt-4">{t('loading')}</p>
        </div>
      )}
    </div>
  );
};

const UserRow = ({ user, isEditing, onEdit, onCancelEdit, onUpdate, onDelete, loading }) => {
  const [editData, setEditData] = useState({
    elo_rating: user.elo_rating,
    is_admin: user.is_admin,
    is_active: user.is_active
  });

  const handleSave = () => {
    onUpdate(editData);
  };

  if (isEditing) {
    return (
      <tr className="bg-yellow-900/10">
        <td className="font-medium text-yellow-400">{user.username}</td>
        <td>
          <input
            type="number"
            step="0.1"
            className="w-24 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white"
            value={editData.elo_rating}
            onChange={(e) => setEditData({...editData, elo_rating: parseFloat(e.target.value)})}
          />
        </td>
        <td>{user.matches_played}</td>
        <td>{user.matches_won}</td>
        <td>
          <input
            type="checkbox"
            checked={editData.is_admin}
            onChange={(e) => setEditData({...editData, is_admin: e.target.checked})}
            className="accent-yellow-500"
          />
        </td>
        <td>
          <input
            type="checkbox"
            checked={editData.is_active}
            onChange={(e) => setEditData({...editData, is_active: e.target.checked})}
            className="accent-yellow-500"
          />
        </td>
        <td>
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              Guardar
            </button>
            <button
              onClick={onCancelEdit}
              className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-yellow-500/5 transition-colors">
      <td className="font-medium">
        {user.username}
        {user.is_admin && (
          <span className="ml-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">ADMIN</span>
        )}
      </td>
      <td>
        <span className="elo-badge text-sm">
          {user.elo_rating?.toFixed(0)}
        </span>
      </td>
      <td>{user.matches_played}</td>
      <td>{user.matches_won}</td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          user.is_admin ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'
        }`}>
          {user.is_admin ? 'Sí' : 'No'}
        </span>
      </td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          user.is_active ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {user.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <div className="flex space-x-2">
          <button
            onClick={onEdit}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );
};

const RankingsTab = ({ rankings, onPlayerClick }) => (
  <div className="space-y-6">
    <div className="text-center">
      <h2 className="premium-title text-3xl mb-2">Rankings Elite</h2>
      <p className="text-gray-400">Los mejores jugadores del club</p>
    </div>
    
    <div className="overflow-x-auto">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Posición</th>
            <th>Jugador</th>
            <th>ELO Rating</th>
            <th>Partidos</th>
            <th>Victorias</th>
            <th>% Victoria</th>
            <th>Perfil</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((player) => (
            <tr key={player.username} className="interactive-element">
              <td>
                <div className="flex items-center">
                  <div className={`rank-badge rank-${player.rank <= 3 ? player.rank : 'other'}`}>
                    #{player.rank}
                  </div>
                  <span className="ml-2 text-sm">
                    {player.rank_change > 0
                      ? `▲${player.rank_change}`
                      : player.rank_change < 0
                      ? `▼${Math.abs(player.rank_change)}`
                      : '='}
                  </span>
                </div>
              </td>
              <td className="font-semibold text-yellow-400">{player.username}</td>
              <td>
                <div className="flex items-center">
                  <span className="elo-badge">{player.elo_rating}</span>
                  <span className="ml-2 text-sm">
                    {player.elo_change > 0
                      ? `▲${player.elo_change}`
                      : player.elo_change < 0
                      ? `▼${Math.abs(player.elo_change)}`
                      : '='}
                  </span>
                </div>
              </td>
              <td>{player.matches_played}</td>
              <td className="text-green-400 font-semibold">{player.matches_won}</td>
              <td>
                <span className={`font-semibold ${
                  player.win_rate >= 70 ? 'text-green-400' : 
                  player.win_rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {player.win_rate}%
                </span>
              </td>
              <td>
                <button
                  onClick={() => onPlayerClick({ username: player.username })}
                  className="text-yellow-400 hover:text-yellow-300 text-sm underline transition-colors"
                >
                  Ver Perfil
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SubmitMatchTab = ({ onMatchSubmitted, rankings }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) {
    console.warn('Usuario undefined en SubmitMatchTab');
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-gray-400 mb-8">Debes iniciar sesión para registrar un resultado</p>
      </div>
    );
  }
  const [formData, setFormData] = useState({
    opponent_username: '',
    match_type: 'rey_mesa',
    my_score: '',
    opponent_score: '',
    break_and_run: false,
    cleanup: false,
    castigo_divino: false,
    feliz_navidad: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [opponentSuggestions, setOpponentSuggestions] = useState([]);
  const [isSearchingOpponent, setIsSearchingOpponent] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const response = await getRankings();
        setAllPlayers(response.data);
      } catch (err) {
        console.error('Error loading players:', err);
        try {
          const suggestion = await analyzeErrorWithGemini(err);
          console.groupCollapsed('[🧠 Gemini Suggestion]');
          console.log(suggestion);
          console.groupEnd();
        } catch {
          console.warn('[Gemini] No se pudo generar sugerencia automática.');
        }
      }
    };
    loadPlayers();
  }, []);

  const typedOpponent =
    findUserByUsername(allPlayers, formData.opponent_username) ||
    findUserByUsername(rankings, formData.opponent_username);
  console.log('Rival ingresado:', formData.opponent_username, typedOpponent);
  const opponent = selectedOpponent || typedOpponent;

  const canCalculatePreview =
    user &&
    opponent &&
    !isNaN(user.elo_rating) &&
    !isNaN(opponent.elo_rating) &&
    formData.my_score !== '' &&
    formData.opponent_score !== '' &&
    formData.match_type;
  console.log('Puede calcular preview:', canCalculatePreview);

  const eloPreview = useEloPreview({
    currentUser: user,
    opponent: opponent,
    score1: formData.my_score,
    score2: formData.opponent_score,
    matchType: formData.match_type,
  });

  const matchTypes = {
    rey_mesa: 'Rey de la Mesa',
    liga_grupos: 'Liga - Ronda de Grupos',
    liga_finales: 'Liga - Rondas Finales',
    torneo: 'Torneo'
  };

  const matchTypeLabels = {
    rey_mesa: 'Rey de la Mesa',
    liga_grupos: 'Liga - Grupos',
    liga_finales: 'Liga - Finales',
    torneo: 'Torneo',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.group('Enviando partido');
    console.log('Datos del formulario:', formData);
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const myScore = parseInt(formData.my_score, 10);
      const oppScore = parseInt(formData.opponent_score, 10);

      if (isNaN(myScore) || isNaN(oppScore)) {
        throw new Error('El resultado debe ser un número.');
      }
      
      if (!opponent) {
        throw new Error('Oponente no encontrado o no seleccionado.');
      }
      
      const winnerId = myScore > oppScore ? user.id : opponent.id;

      const matchPayload = {
        player1_id: user.id,
        player2_id: opponent.id,
        winner_id: winnerId,
        match_type: formData.match_type,
        result: `${myScore}-${oppScore}`,
      };

      console.log('Payload:', matchPayload);
      await submitMatch(matchPayload);
      
      console.log('Resultado enviado con éxito');
      setSuccess('Resultado enviado correctamente. Esperando confirmación del oponente.');
      setFormData({
        opponent_username: '',
        match_type: 'rey_mesa',
        my_score: '',
        opponent_score: '',
        break_and_run: false,
        cleanup: false,
        castigo_divino: false,
        feliz_navidad: false,
      });
      onMatchSubmitted();
    } catch (error) {
      console.error('Error enviando partido:', error);
      try {
        const suggestion = await analyzeErrorWithGemini(error);
        console.groupCollapsed('[🧠 Gemini Suggestion]');
        console.log(suggestion);
        console.groupEnd();
      } catch {
        console.warn('[Gemini] No se pudo generar sugerencia automática.');
      }
      setError(error.response?.data?.detail || 'Error al enviar resultado');
    }
    setLoading(false);
    console.groupEnd();
  };

  useEffect(() => {
    if (formData.opponent_username.length >= 2) {
      const suggestions = allPlayers.filter(player => 
        player.username.toLowerCase().includes(formData.opponent_username.toLowerCase()) &&
        player.username.toLowerCase() !== user.username.toLowerCase()
      );
      setOpponentSuggestions(suggestions);
    } else {
      setOpponentSuggestions([]);
    }
  }, [formData.opponent_username, allPlayers, user.username]);

  const handleSuggestionClick = (suggestion) => {
    setFormData({ ...formData, opponent_username: suggestion.username });
    setSelectedOpponent(suggestion);
    setOpponentSuggestions([]);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="premium-title text-3xl mb-2">Registrar Resultado</h2>
        <p className="text-gray-400">Sube el resultado de tu último partido</p>
      </div>
      
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
        <div className="form-group relative">
          <label className="form-label">{t('opponent')}</label>
          <input
            type="text"
            required
            className="form-input"
            value={formData.opponent_username}
            onChange={(e) => {
              setFormData({ ...formData, opponent_username: e.target.value });
              setSelectedOpponent(null);
            }}
            placeholder="Buscar jugador..."
            autoComplete="off"
          />
          {isSearchingOpponent && (
            <p className="text-xs text-gray-400 mt-1">{t('loading')}</p>
          )}
          {opponentSuggestions.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {opponentSuggestions.map((suggestion) => (
                <li
                  key={suggestion.username}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-4 py-3 hover:bg-gray-700 cursor-pointer flex justify-between items-center"
                >
                  <span className="text-white">{suggestion.username}</span>
                  <span className="text-yellow-400 text-sm">
                    ELO: {suggestion.elo_rating?.toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t('matchType')}</label>
          <select
            required
            className="form-input"
            value={formData.match_type}
            onChange={(e) => setFormData({...formData, match_type: e.target.value})}
          >
            {Object.entries(matchTypes).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t('result')}</label>
          <div className="flex items-center space-x-2">
            <select
              className="form-input w-20"
              value={formData.my_score}
              onChange={(e) => setFormData({ ...formData, my_score: e.target.value })}
            >
              {Array.from({ length: formData.match_type.includes('liga') ? 10 : 2 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <span className="text-xl">-</span>
            <select
              className="form-input w-20"
              value={formData.opponent_score}
              onChange={(e) => setFormData({ ...formData, opponent_score: e.target.value })}
            >
              {Array.from({ length: formData.match_type.includes('liga') ? 10 : 2 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label block mb-1">Opcionales</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-gray-300">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.break_and_run}
                onChange={(e) => setFormData({ ...formData, break_and_run: e.target.checked })}
                className="mr-2 accent-yellow-500"
              />
              Break & Run
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.cleanup}
                onChange={(e) => setFormData({ ...formData, cleanup: e.target.checked })}
                className="mr-2 accent-yellow-500"
              />
              Clean-Up
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.castigo_divino}
                onChange={(e) => setFormData({ ...formData, castigo_divino: e.target.checked })}
                className="mr-2 accent-yellow-500"
              />
              Castigo Divino
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.feliz_navidad}
                onChange={(e) => setFormData({ ...formData, feliz_navidad: e.target.checked })}
                className="mr-2 accent-yellow-500"
              />
              Feliz Navidad
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-premium w-full"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="loading-spinner mr-2"></div>
              {t('loading')}
            </div>
          ) : (
            t('submit')
          )}
        </button>
      </form>

      {eloPreview && (
        <div className="mt-8 bg-gray-800/70 p-4 rounded-lg border border-yellow-600 text-sm text-yellow-200">
          <p className="mb-2 font-semibold">🔍 Previsualización del cambio de ELO:</p>
          <ul className="space-y-1">
            <li>
              <span className="font-bold">{user.username}</span>: {eloPreview.user.from} →{' '}
              <span className="text-green-400">{eloPreview.user.to}</span>{' '}
              ({eloPreview.user.delta >= 0 ? '+' : ''}{eloPreview.user.delta})
            </li>
            <li>
              <span className="font-bold">{eloPreview.opponent.username}</span>: {eloPreview.opponent.from} →{' '}
              <span className="text-red-400">{eloPreview.opponent.to}</span>{' '}
              ({eloPreview.opponent.delta >= 0 ? '+' : ''}{eloPreview.opponent.delta})
            </li>
          </ul>
        </div>
      )}
      {!eloPreview && canCalculatePreview && (
        <div className="mt-8 text-yellow-400 text-sm">
          ⚠️ No se pudo calcular el cambio de ELO.
        </div>
      )}
    </div>
  );
};

const PendingMatchesTab = ({ matches, onConfirm, onReject }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="premium-title text-3xl mb-2">{t('pendingMatches')}</h2>
        <p className="text-gray-400">Confirma o rechaza los resultados enviados</p>
      </div>
      
      {matches.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✅</div>
          <h3 className="premium-subtitle text-xl mb-2">Todo al día</h3>
          <p className="text-gray-400">No tienes partidos pendientes de confirmación</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <div key={match.id} className="premium-card p-6 hover:border-yellow-500/50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-xl font-semibold text-yellow-400">
                      {match.player1_username} vs {match.player2_username}
                    </h3>
                    <span className="status-pending">
                      Pendiente
                    </span>
                  </div>
                  <div className="text-gray-300">
                    <span className="font-medium">Tipo:</span> {match.match_type.replace('_', ' ')} • 
                    <span className="font-medium ml-2">Resultado:</span> {match.result}
                  </div>
                  <div className="text-gray-400">
                    <span className="font-medium">Ganador reportado:</span> 
                    <span className="text-green-400 ml-1">{match.winner_username}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(match.created_at).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => onConfirm(match.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    ✓ {t('confirm')}
                  </button>
                  <button
                    onClick={() => onReject(match.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    ✗ {t('reject')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HistoryTab = ({ matches, currentUser, onPlayerClick }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="premium-title text-3xl mb-2">{t('matchHistory')}</h2>
        <p className="text-gray-400">Tu trayectoria en el club</p>
      </div>
      
      {matches.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎱</div>
          <h3 className="premium-subtitle text-xl mb-2">Sin historial</h3>
          <p className="text-gray-400">Aún no tienes partidos confirmados</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>{t('opponent')}</th>
                <th>{t('matchType')}</th>
                <th>{t('result')}</th>
                <th>Estado</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const isWinner = match.winner_username === currentUser?.username;
                const opponent = match.player1_username === currentUser?.username 
                  ? match.player2_username 
                  : match.player1_username;
                
                return (
                  <tr key={match.id} className="interactive-element">
                    <td className="text-sm">
                      {new Date(match.confirmed_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="font-semibold text-yellow-400">{opponent}</td>
                    <td className="text-sm capitalize">{match.match_type.replace('_', ' ')}</td>
                    <td className="font-medium">{match.result}</td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        isWinner 
                          ? 'bg-green-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {isWinner ? '🏆 Victoria' : '💔 Derrota'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => onPlayerClick({ username: opponent })}
                        className="text-yellow-400 hover:text-yellow-300 text-sm underline transition-colors"
                      >
                        Ver Perfil
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const AppContent = () => {
  const { loading: authLoading } = useAuth();
  const { t } = useTranslation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="app-background"></div>
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-6"></div>
          <h2 className="premium-title text-2xl mb-2">La Catrina Pool Club</h2>
          <p className="text-gray-400">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return <Dashboard />;
};

export default App;
