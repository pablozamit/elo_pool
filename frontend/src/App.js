import React, { useState, useEffect, createContext, useContext, Suspense } from 'react';
import './App.css';
import {
  loginUser,
  registerUser,
  fetchRankings as airtableFetchRankings,
  fetchMatchesForUser,
  fetchPendingMatchesForUser,
  fetchAllPendingMatches,
  createMatch as airtableCreateMatch,
  updateMatch,
  fetchRecentMatches,
  searchUsers,
  checkAchievements as checkAchievementsAPI,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  denormalizeUser,
} from './api/airtable';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import AchievementSystem from './components/AchievementSystem';
import AchievementNotification from './components/AchievementNotification';
import PlayerProfile from './components/PlayerProfile';

const ELO_WEIGHTS = {
  rey_mesa: 1.0,
  torneo: 1.5,
  liga_grupos: 2.0,
  liga_finales: 2.5,
};

const calculateEloChange = (winnerElo, loserElo, matchType) => {
  const K = 32 * ELO_WEIGHTS[matchType];
  const expectedWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));
  const newWinnerElo = winnerElo + K * (1 - expectedWinner);
  const newLoserElo = loserElo + K * (0 - expectedLoser);
  return { newWinnerElo, newLoserElo };
};

// Base Airtable interaction is handled via api/airtable.js

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
    try {
      const userData = await loginUser(username, password);
      localStorage.setItem('token', 'airtable');
      localStorage.setItem('user', JSON.stringify(userData));
      setToken('airtable');
      setUser(userData);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Error de login' };
    }
  };

  const register = async (username, password) => {
    try {
      await registerUser(username, password);
      return { success: true, message: '¡Registro exitoso! Por favor, inicia sesión.' };
    } catch (error) {
      return { success: false, error: 'Error de registro' };
    }
  };

  const logout = () => {
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
    setFormLoading(true);
    setError('');
    setMessage('');

    if (isLoginMode) {
      const result = await login(formData.username, formData.password);
      if (!result.success) {
        setError(result.error);
      } else {
        if (onLoginSuccess) onLoginSuccess();
      }
    } else {
      const result = await authRegister(formData.username, formData.password);
      if (result.success) {
        setIsLoginMode(true);
        setFormData({ username: '', password: '' });
        setMessage(result.message || '¡Registro exitoso! Por favor, inicia sesión.');
        if (onSwitchMode) onSwitchMode('login');
      } else {
        setError(result.error);
      }
    }
    setFormLoading(false);
  };

  const handleSwitchMode = () => {
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

  // Fetch rankings with 7-day evolution
  const fetchRankings = async () => {
    try {
      const players = await airtableFetchRankings();
      const recent = await fetchRecentMatches(7);

      const changeMap = {};
      players.forEach((p) => {
        changeMap[p.id] = 0;
      });
      recent.forEach((m) => {
        if (m.player1_id && changeMap[m.player1_id] !== undefined) {
          changeMap[m.player1_id] += m.player1_elo_change || 0;
        }
        if (m.player2_id && changeMap[m.player2_id] !== undefined) {
          changeMap[m.player2_id] += m.player2_elo_change || 0;
        }
      });

      const withChange = players.map((p, idx) => ({
        ...p,
        rank: idx + 1,
        elo_change: Math.round(changeMap[p.id] || 0),
        elo_past: p.elo_rating - (changeMap[p.id] || 0),
      }));

      const pastSorted = [...withChange].sort((a, b) => b.elo_past - a.elo_past);
      const pastRank = {};
      pastSorted.forEach((p, i) => {
        pastRank[p.id] = i + 1;
      });

      const finalRankings = withChange.map((p) => ({
        ...p,
        rank_change: (pastRank[p.id] || p.rank) - p.rank,
      }));

      setRankings(finalRankings);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      setRankings([]);
    }
  };

  // Fetch user-specific matches
  const fetchMatches = async () => {
    if (!user) return;
    try {
      const data = await fetchMatchesForUser(user.username);
      setMatches(data);
    } catch (error) {
      console.error('Error fetching matches:', error);
      setMatches([]);
    }
  };

  // Fetch user-specific pending matches
  const fetchPendingMatches = async () => {
    if (!user) return;
    try {
      const data = user.is_admin
        ? await fetchAllPendingMatches()
        : await fetchPendingMatchesForUser(user.username);
      setPendingMatches(data);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
      setPendingMatches([]);
    }
  };

  // Check for new achievements
  const checkAchievements = async () => {
    if (!user) return;
    try {
      const data = await checkAchievementsAPI(user.id);
      if (data.new_badges && data.new_badges.length > 0) {
        setAchievementNotifications(data.new_badges);
        setNewAchievementCount((c) => c + data.new_badges.length);
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  useEffect(() => {
    fetchRankings();
    if (user) {
      setShowLoginView(false);
      fetchMatches();
      fetchPendingMatches();
      checkAchievements();
      if (!user && (activeTab === 'submit' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'admin' || activeTab === 'achievements')) {
        setActiveTab('rankings');
      }
    } else {
      setMatches([]);
      setPendingMatches([]);
      if (activeTab !== 'rankings') {
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
    if (!user) return;
    try {
      const match = pendingMatches.find((m) => m.id === matchId);
      if (!match) throw new Error('Match not found');

      const player1 = rankings.find((p) => p.id === match.player1_id);
      const player2 = rankings.find((p) => p.id === match.player2_id);
      if (!player1 || !player2) throw new Error('Players not found');

      const winnerIsP1 = match.winner_id === match.player1_id || match.winner_id === match.player1_username;
      const winnerElo = winnerIsP1 ? match.player1_elo_before : match.player2_elo_before;
      const loserElo = winnerIsP1 ? match.player2_elo_before : match.player1_elo_before;

      const { newWinnerElo, newLoserElo } = calculateEloChange(
        winnerElo,
        loserElo,
        match.match_type
      );

      const player1EloAfter = winnerIsP1 ? newWinnerElo : newLoserElo;
      const player2EloAfter = winnerIsP1 ? newLoserElo : newWinnerElo;

      await updateMatch(matchId, {
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        player1_elo_after: player1EloAfter,
        player2_elo_after: player2EloAfter,
      });

      await updateRecord('Users', player1.id, denormalizeUser({
        elo_rating: player1EloAfter,
        matches_played: player1.matches_played + 1,
        matches_won: player1.matches_won + (winnerIsP1 ? 1 : 0),
      }));

      await updateRecord('Users', player2.id, denormalizeUser({
        elo_rating: player2EloAfter,
        matches_played: player2.matches_played + 1,
        matches_won: player2.matches_won + (winnerIsP1 ? 0 : 1),
      }));

      fetchPendingMatches();
      fetchRankings();
      fetchMatches();
      checkAchievements();
    } catch (error) {
      console.error('Error confirming match:', error);
      setActionError('Error confirming match');
      alert('Error confirming match');
    }
  };

  const rejectMatch = async (matchId) => {
    if (!user) return;
    try {
      await updateMatch(matchId, { status: 'rejected' });
      fetchPendingMatches();
    } catch (error) {
      console.error('Error rejecting match:', error);
      setActionError('Error rejecting match');
      alert('Error rejecting match');
    }
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
      
      {/* Achievement Notifications */}
      {achievementNotifications.length > 0 && (
        <AchievementNotification
          achievements={achievementNotifications}
          onClose={() => setAchievementNotifications([])}
        />
      )}

      {/* Player Profile Modal */}
      {selectedPlayer && (
        <PlayerProfile
          playerId={selectedPlayer.id}
          playerUsername={selectedPlayer.username}
          currentUser={user}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Header */}
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

      {/* Navigation & Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="premium-nav mb-8 justify-center">
          <TabButton tab="rankings" label={t('rankings')} icon="🏆" />
          <TabButton tab="submit" label={t('submitResult')} icon="📝" disabled={!user} />
          <TabButton
            tab="pending"
            label={t('pendingMatches')}
            icon="⏳"
            disabled={!user}
            count={pendingMatches.length}
          />
          <TabButton tab="history" label={t('matchHistory')} icon="📊" disabled={!user} />
          <TabButton
            tab="achievements"
            label={t('achievements')}
            icon="🎖️"
            disabled={!user}
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
          {user && activeTab === 'achievements' && (
            <AchievementSystem currentUser={user} />
          )}
          {user && user.is_admin && activeTab === 'admin' && (
            <AdminTab />
          )}
          {!user && (activeTab === 'submit' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'admin' || activeTab === 'achievements') && (
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
    setLoading(true);
    try {
      const data = await listRecords('Users');
      setUsers(data);
    } catch (error) {
      setError('Error al cargar usuarios');
      console.error('Error fetching users:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await createRecord(
        'Users',
        denormalizeUser({
          username: createFormData.username,
          password: createFormData.password,
          is_admin: createFormData.is_admin,
          is_active: createFormData.is_active,
          elo_rating: 1200,
          matches_played: 0,
          matches_won: 0,
        })
      );
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
      setError(error.response?.data?.detail || 'Error al crear usuario');
    }
    setLoading(false);
  };

  const handleUpdateUser = async (userId, updateData) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await updateRecord('Users', userId, denormalizeUser(updateData));
      setSuccess('Usuario actualizado exitosamente');
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      setError(error.response?.data?.detail || 'Error al actualizar usuario');
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar al usuario "${username}"?`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await deleteRecord('Users', userId);
      setSuccess('Usuario eliminado exitosamente');
      fetchUsers();
    } catch (error) {
      setError(error.response?.data?.detail || 'Error al eliminar usuario');
    }
    setLoading(false);
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
  const [formData, setFormData] = useState({
    opponent_username: '',
    match_type: 'rey_mesa',
    my_score: '0',
    opponent_score: '0'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [opponentSuggestions, setOpponentSuggestions] = useState([]);
  const [isSearchingOpponent, setIsSearchingOpponent] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [preview, setPreview] = useState(null);
  const typedOpponent = rankings.find(
    (p) => p.username.toLowerCase() === formData.opponent_username.toLowerCase()
  );
  const opponentToDisplay = selectedOpponent || typedOpponent;

  const matchTypes = {
    rey_mesa: 'Rey de la Mesa',
    liga_grupos: 'Liga - Ronda de Grupos',
    liga_finales: 'Liga - Rondas Finales',
    torneo: 'Torneo'
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const myScore = parseInt(formData.my_score, 10);
      const oppScore = parseInt(formData.opponent_score, 10);
      const iWon = myScore > oppScore;
      const opponent = selectedOpponent || typedOpponent;
      if (!opponent) {
        throw new Error('Opponent not found');
      }
      const matchPayload = {
        player1_username: user.username,
        player2_username: opponent.username,
        player1_id: user.id,
        player2_id: opponent.id,
        match_type: formData.match_type,
        result: `${myScore}-${oppScore}`,
        winner_id: iWon ? user.id : opponent.id,
        status: 'pending',
        submitted_by: user.username,
        created_at: new Date().toISOString(),
        player1_elo_before: user.elo_rating,
        player2_elo_before: opponent.elo_rating,
        player1_total_matches: user.matches_played,
        player2_total_matches: opponent.matches_played,
      };
      await airtableCreateMatch(matchPayload);
      setSuccess('Resultado enviado correctamente. Esperando confirmación del oponente.');
      setFormData({
        opponent_username: '',
        match_type: 'rey_mesa',
        my_score: '0',
        opponent_score: '0'
      });
      onMatchSubmitted();
    } catch (error) {
      setError(error.response?.data?.detail || 'Error al enviar resultado');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    if (formData.opponent_username.length >= 2) {
      setIsSearchingOpponent(true);
      const timeoutId = setTimeout(async () => {
        try {
          const suggestions = await searchUsers(formData.opponent_username);
          setOpponentSuggestions(suggestions);
        } catch (err) {
          console.error('Error fetching opponent suggestions:', err);
          setOpponentSuggestions([]);
        } finally {
          setIsSearchingOpponent(false);
        }
      }, 500);
      setDebounceTimeout(timeoutId);
    } else {
      setOpponentSuggestions([]);
      setIsSearchingOpponent(false);
    }

    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [formData.opponent_username]);


  const handleSuggestionClick = (suggestion) => {
    setFormData({ ...formData, opponent_username: suggestion.username });
    setSelectedOpponent(suggestion);
    setOpponentSuggestions([]);
  };

  useEffect(() => {
    const opponent =
      selectedOpponent ||
      rankings.find(
        (p) => p.username.toLowerCase() === formData.opponent_username.toLowerCase()
      );

    if (!opponent || rankings.length === 0) {
      setPreview(null);
      return;
    }
    const opponentRankObj = rankings.find((p) => p.username === opponent.username);
    const userRankObj = rankings.find((p) => p.username === user.username);
    if (!opponentRankObj || !userRankObj) {
      setPreview(null);
      return;
    }
    const myScore = parseInt(formData.my_score, 10);
    const oppScore = parseInt(formData.opponent_score, 10);
    if (isNaN(myScore) || isNaN(oppScore)) {
      setPreview(null);
      return;
    }
    const iWon = myScore > oppScore;
    const winnerElo = iWon ? user.elo_rating : opponent.elo_rating;
    const loserElo = iWon ? opponent.elo_rating : user.elo_rating;
    const { newWinnerElo, newLoserElo } = calculateEloChange(winnerElo, loserElo, formData.match_type);
    const userNewElo = iWon ? newWinnerElo : newLoserElo;
    const opponentNewElo = iWon ? newLoserElo : newWinnerElo;

    const updated = rankings
      .map((p) => {
        if (p.username === user.username) return { ...p, elo_rating: userNewElo };
        if (p.username === opponent.username) return { ...p, elo_rating: opponentNewElo };
        return p;
      })
      .sort((a, b) => b.elo_rating - a.elo_rating);

    const newUserRank = updated.findIndex((p) => p.username === user.username) + 1;
    const newOppRank = updated.findIndex((p) => p.username === opponent.username) + 1;
    const currentUserRank = rankings.findIndex((p) => p.username === user.username) + 1;
    const currentOppRank = rankings.findIndex((p) => p.username === opponent.username) + 1;

    setPreview({
      userNewElo,
      opponentNewElo,
      userRank: newUserRank,
      opponentRank: newOppRank,
      userChange: userNewElo - user.elo_rating,
      opponentChange: opponentNewElo - opponent.elo_rating,
      userRankDiff: currentUserRank - newUserRank,
      opponentRankDiff: currentOppRank - newOppRank,
      currentUserRank,
      currentOppRank,
    });
  }, [selectedOpponent, formData.opponent_username, formData.my_score, formData.opponent_score, formData.match_type, rankings, user]);

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

        {preview && (
          <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 space-y-2 text-sm">
            <h4 className="text-center text-yellow-400 font-semibold">{t('eloPreviewTitle')}</h4>
            <div className="flex justify-between">
              <div className="w-1/2 pr-2">
                <div className="font-bold text-white">{user.username}</div>
                <div>{t('newElo')}: {user.elo_rating.toFixed(0)} → {preview.userNewElo.toFixed(0)} ({preview.userChange >= 0 ? '+' : ''}{preview.userChange.toFixed(1)})</div>
                <div>{t('newPosition')}: {preview.currentUserRank} → {preview.userRank} (
                  {preview.userRankDiff > 0
                    ? t('positionUp', { count: preview.userRankDiff })
                    : preview.userRankDiff < 0
                    ? t('positionDown', { count: -preview.userRankDiff })
                    : t('positionNoChange')}
                )</div>
              </div>
              <div className="w-1/2 pl-2">
                <div className="font-bold text-white">{opponentToDisplay?.username}</div>
                <div>{t('newElo')}: {opponentToDisplay?.elo_rating.toFixed(0)} → {preview.opponentNewElo.toFixed(0)} ({preview.opponentChange >= 0 ? '+' : ''}{preview.opponentChange.toFixed(1)})</div>
                <div>{t('newPosition')}: {preview.currentOppRank} → {preview.opponentRank} (
                  {preview.opponentRankDiff > 0
                    ? t('positionUp', { count: preview.opponentRankDiff })
                    : preview.opponentRankDiff < 0
                    ? t('positionDown', { count: -preview.opponentRankDiff })
                    : t('positionNoChange')}
                )</div>
              </div>
            </div>
          </div>
        )}

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