import React, { useState, useEffect, createContext, useContext, Suspense } from 'react'; // Added Suspense for local fallbacks if needed
import './App.css';
import axios from 'axios';
import LanguageSwitcher from './LanguageSwitcher'; // Import LanguageSwitcher
import { useTranslation } from 'react-i18next'; // Import useTranslation

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem('token');
          setToken(null);
          setUser(null); // Explicitly set user to null on error
          console.error("Token verification failed:", error);
        }
      }
      setLoading(false);
    };
    verifyToken();
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API}/login`, { username, password });
      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Error de login' };
    }
  };

  const register = async (username, password) => { // Removed email from parameters
    try {
      // Assuming backend returns the newly created user on successful registration,
      // but we will prompt them to login manually.
      await axios.post(`${API}/register`, { username, password }); // Removed email from payload
      return { success: true, message: "¡Registro exitoso! Por favor, inicia sesión." };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Error de registro' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    // Pass setToken and setUser if needed by any component directly, though unlikely for this app structure
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
  const { t } = useTranslation(); // Initialize useTranslation
  const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login');
  const [formData, setFormData] = useState({
    username: '',
    // email: '', // Removed email from formData
    password: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const { login, register: authRegister } = useAuth(); // Renamed register to authRegister

  useEffect(() => {
    setIsLoginMode(initialMode === 'login');
    setError(''); // Clear error/message when mode changes via prop
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
        // AuthProvider handles user state, Dashboard useEffect will hide this form.
      }
    } else { // Register mode
      const result = await authRegister(formData.username, formData.password); // Removed formData.email
      if (result.success) {
        setIsLoginMode(true); // Switch to login view
        setFormData({ username: '', password: '' }); // Clear form, removed email
        setMessage(result.message || '¡Registro exitoso! Por favor, inicia sesión.');
        if (onSwitchMode) onSwitchMode('login'); // Inform parent
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
    setFormData({ username: '', password: '' }); // Clear form on mode switch, removed email
    if (onSwitchMode) onSwitchMode(!isLoginMode ? 'register' : 'login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🎱 {t('billiardClub')}</h1>
          <p className="text-gray-600">
            {isLoginMode ? t('loginTitle') : t('registerTitle')} {/* Assuming new keys for these titles */}
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('usernameLabel')}
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
            />
          </div>

          {/* Email input field removed */}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <button
            type="submit"
            disabled={formLoading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50"
          >
            {formLoading ? t('loading') : (isLoginMode ? t('login') : t('register'))}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={handleSwitchMode}
            className="text-green-600 hover:text-green-800 font-medium"
          >
            {isLoginMode ? <>{t('noAccount')} {t('register')}</> : <>{t('alreadyAccount')} {t('login')}</>}
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
  // const [dashboardLoading, setDashboardLoading] = useState(false); // Optional: for content loading indication
  const { user, token, logout } = useAuth();
  const { t } = useTranslation(); // Initialize useTranslation for Dashboard

  const [showLoginView, setShowLoginView] = useState(false);
  const [loginViewMode, setLoginViewMode] = useState('login'); // 'login' or 'register'

  // Fetch rankings - always available
  const fetchRankings = async () => {
    // setDashboardLoading(true);
    try {
      const response = await axios.get(`${API}/rankings`);
      setRankings(response.data);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      setRankings([]); // Clear on error
    }
    // setDashboardLoading(false);
  };

  // Fetch user-specific matches
  const fetchMatches = async () => {
    if (!token) return;
    // setDashboardLoading(true);
    try {
      const response = await axios.get(`${API}/matches/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMatches(response.data);
    } catch (error) {
      console.error('Error fetching matches:', error);
      setMatches([]);
    }
    // setDashboardLoading(false);
  };

  // Fetch user-specific pending matches
  const fetchPendingMatches = async () => {
    if (!token) return;
    // setDashboardLoading(true);
    try {
      const response = await axios.get(`${API}/matches/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingMatches(response.data);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
      setPendingMatches([]);
    }
    // setDashboardLoading(false);
  };

  useEffect(() => {
    fetchRankings(); // Fetch rankings on initial load & user change
    if (user && token) {
      setShowLoginView(false); // Hide login form if user is now present
      fetchMatches();
      fetchPendingMatches();
      // If user just logged in and was on a disabled tab, switch to rankings
      if (!user && (activeTab === 'submit' || activeTab === 'pending' || activeTab === 'history')) {
        setActiveTab('rankings');
      }
    } else {
      // User is null, clear sensitive data
      setMatches([]);
      setPendingMatches([]);
      // If an authenticated tab was active, switch to rankings
      if (activeTab !== 'rankings') {
          setActiveTab('rankings');
      }
    }
  }, [user, token]); // Rerun when user or token changes


  const confirmMatch = async (matchId) => {
    if (!token) return;
    try {
      await axios.post(`${API}/matches/${matchId}/confirm`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPendingMatches(); // Refresh relevant data
      fetchRankings();      // ELO changes
      fetchMatches();       // History updates
    } catch (error) {
      console.error('Error confirming match:', error);
      // TODO: display error to user
    }
  };

  const rejectMatch = async (matchId) => {
    if (!token) return;
    try {
      await axios.post(`${API}/matches/${matchId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPendingMatches(); // Refresh pending matches
    } catch (error) {
      console.error('Error rejecting match:', error);
      // TODO: display error to user
    }
  };

  const TabButton = ({ tab, label, icon, disabled = false }) => (
    <button
      onClick={() => {
        if (disabled) {
          // Optionally show a message or redirect to login
          setShowLoginView(true);
          setLoginViewMode('login');
        } else {
          setActiveTab(tab);
        }
      }}
      disabled={disabled && activeTab === tab} // Prevent clicking if already active & disabled
      className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
        activeTab === tab && !disabled
          ? 'bg-green-600 text-white'
          : disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' // Visual style for disabled
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  if (showLoginView && !user) {
    return (
      <LoginForm
        initialMode={loginViewMode}
        onSwitchMode={(mode) => setLoginViewMode(mode)}
        onLoginSuccess={() => {
          setShowLoginView(false);
          // Data fetching is handled by Dashboard's useEffect on user/token change
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">🎱 {t('billiardClub')}</h1>
              {user && (
                <div className="hidden sm:block text-sm text-gray-500">
                  {t('helloUser', { username: user.username })} - {t('eloRating')}: {user.elo_rating?.toFixed(1)}
                  {user.is_admin && (
                    <span className="ml-2 text-sm font-semibold text-purple-600">({t('admin')})</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4"> {/* Group for right-side items */}
              <LanguageSwitcher />
              {user ? (
                <button
                  onClick={logout}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {t('logout')}
                </button>
              ) : (
                <div className="space-x-2"> {/* This div is for login/register buttons when no user */}
                  <button
                    onClick={() => { setShowLoginView(true); setLoginViewMode('login'); }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => { setShowLoginView(true); setLoginViewMode('register'); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton tab="rankings" label={t('rankings')} icon="🏆" />
          <TabButton tab="submit" label={t('submitResult')} icon="📝" disabled={!user} />
          <TabButton
            tab="pending"
            label={`${t('pendingMatches')} ${user && pendingMatches.length > 0 ? `(${pendingMatches.length})` : ''}`}
            icon="⏳"
            disabled={!user}
          />
          <TabButton tab="history" label={t('matchHistory')} icon="📊" disabled={!user} />
        </div>

        {/* {dashboardLoading && <div className="text-center p-4">{t('loading')}</div>} */}

        <div className="bg-white rounded-lg shadow">
          {activeTab === 'rankings' && (
            <RankingsTab rankings={rankings} />
          )}
          {user && activeTab === 'submit' && (
            <SubmitMatchTab token={token} onMatchSubmitted={() => {
              fetchRankings();
              fetchMatches();
              fetchPendingMatches(); // In case a submission affects this (e.g. future admin actions)
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
            <HistoryTab matches={matches} currentUser={user} />
          )}
          {/* Fallback for when a disabled tab might somehow be active without a user */}
          {!user && (activeTab === 'submit' || activeTab === 'pending' || activeTab === 'history') && (
             <div className="p-6 text-center text-gray-500">
              <p>Por favor, inicia sesión para acceder a esta sección.</p>
              <button
                onClick={() => { setShowLoginView(true); setLoginViewMode('login'); }}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                {t('login')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RankingsTab = ({ rankings }) => (
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-4">🏆 Rankings</h2>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Pos</th>
            <th className="text-left py-2">Jugador</th>
            <th className="text-left py-2">ELO</th>
            <th className="text-left py-2">Partidos</th>
            <th className="text-left py-2">Ganados</th>
            <th className="text-left py-2">% Victoria</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((player) => (
            <tr key={player.username} className="border-b hover:bg-gray-50">
              <td className="py-3 font-bold">#{player.rank}</td>
              <td className="py-3">{player.username}</td>
              <td className="py-3 font-bold text-green-600">{player.elo_rating}</td>
              <td className="py-3">{player.matches_played}</td>
              <td className="py-3">{player.matches_won}</td>
              <td className="py-3">{player.win_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SubmitMatchTab = ({ token, onMatchSubmitted }) => {
  const [formData, setFormData] = useState({
    opponent_username: '',
    match_type: 'rey_mesa',
    result: '',
    won: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // State for opponent autocomplete
  const [opponentSuggestions, setOpponentSuggestions] = useState([]);
  const [isSearchingOpponent, setIsSearchingOpponent] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);

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
      await axios.post(`${API}/matches`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess('Resultado enviado correctamente. Esperando confirmación del oponente.');
      setFormData({
        opponent_username: '',
        match_type: 'rey_mesa',
        result: '',
        won: true
      });
      onMatchSubmitted();
    } catch (error) {
      setError(error.response?.data?.detail || 'Error al enviar resultado');
    }
    setLoading(false);
  };

  // Effect for debouncing opponent search
  useEffect(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    if (formData.opponent_username.length >= 2) {
      setIsSearchingOpponent(true);
      const timeoutId = setTimeout(async () => {
        try {
          const response = await axios.get(`${API}/users/search?query=${formData.opponent_username}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setOpponentSuggestions(response.data);
        } catch (err) {
          console.error('Error fetching opponent suggestions:', err);
          setOpponentSuggestions([]);
        } finally {
          setIsSearchingOpponent(false);
        }
      }, 500); // 500ms debounce
      setDebounceTimeout(timeoutId);
    } else {
      setOpponentSuggestions([]);
      setIsSearchingOpponent(false);
    }

    // Cleanup timeout on unmount or when formData.opponent_username changes
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [formData.opponent_username, token]);


  const handleSuggestionClick = (suggestion) => {
    setFormData({...formData, opponent_username: suggestion.username});
    setOpponentSuggestions([]);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">📝 Subir Resultado</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="relative"> {/* Added relative positioning here */}
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Oponente
          </label>
          <input
            type="text"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={formData.opponent_username}
            onChange={(e) => {
              setFormData({...formData, opponent_username: e.target.value});
              // Suggestions will be fetched by useEffect
            }}
            placeholder="Nombre de usuario del oponente"
            autoComplete="off" // Disable browser's own autocomplete
          />
          {isSearchingOpponent && <p className="text-xs text-gray-500 mt-1">Buscando...</p>}
          {opponentSuggestions.length > 0 && (
            <ul className="border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto bg-white absolute z-10 w-full shadow-lg">
              {opponentSuggestions.map((suggestion) => (
                <li
                  key={suggestion.username} // Assuming username is unique for key
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  {suggestion.username} ({suggestion.elo_rating?.toFixed(0)})
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Removed the extra relative div, as the one above now wraps the input and suggestions */}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de Partida
          </label>
          <select
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={formData.match_type}
            onChange={(e) => setFormData({...formData, match_type: e.target.value})}
          >
            {Object.entries(matchTypes).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resultado
          </label>
          <input
            type="text"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={formData.result}
            onChange={(e) => setFormData({...formData, result: e.target.value})}
            placeholder={formData.match_type.includes('liga') ? 'Ej: 2-1, 5-0' : 'Ganado/Perdido'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ¿Ganaste el partido?
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="won"
                checked={formData.won === true}
                onChange={() => setFormData({...formData, won: true})}
                className="mr-2"
              />
              Sí
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="won"
                checked={formData.won === false}
                onChange={() => setFormData({...formData, won: false})}
                className="mr-2"
              />
              No
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar Resultado'}
        </button>
      </form>
    </div>
  );
};

const PendingMatchesTab = ({ matches, onConfirm, onReject }) => (
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-4">⏳ Partidos Pendientes</h2>
    {matches.length === 0 ? (
      <p className="text-gray-500">No hay partidos pendientes de confirmación.</p>
    ) : (
      <div className="space-y-4">
        {matches.map((match) => (
          <div key={match.id} className="border rounded-lg p-4 bg-yellow-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">
                  {match.player1_username} vs {match.player2_username}
                </p>
                <p className="text-sm text-gray-600">
                  Tipo: {match.match_type.replace('_', ' ')} | Resultado: {match.result}
                </p>
                <p className="text-sm text-gray-600">
                  Ganador reportado: {match.winner_username}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(match.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onConfirm(match.id)}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => onReject(match.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const HistoryTab = ({ matches, currentUser }) => (
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-4">📊 Historial de Partidos</h2>
    {matches.length === 0 ? (
      <p className="text-gray-500">No tienes partidos confirmados aún.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Fecha</th>
              <th className="text-left py-2">Oponente</th>
              <th className="text-left py-2">Tipo</th>
              <th className="text-left py-2">Resultado</th>
              <th className="text-left py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const isWinner = match.winner_username === currentUser?.username;
              const opponent = match.player1_username === currentUser?.username 
                ? match.player2_username 
                : match.player1_username;
              
              return (
                <tr key={match.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 text-sm">
                    {new Date(match.confirmed_at).toLocaleDateString()}
                  </td>
                  <td className="py-3">{opponent}</td>
                  <td className="py-3 text-sm">{match.match_type.replace('_', ' ')}</td>
                  <td className="py-3">{match.result}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      isWinner 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {isWinner ? 'Victoria' : 'Derrota'}
                    </span>
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

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const AppContent = () => {
  const { loading: authLoading } = useAuth(); // Renamed to avoid conflict
  const { t } = useTranslation(); // Initialize useTranslation for AppContent

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p>{t('loading')}</p> {/* Changed text slightly & translated */}
        </div>
      </div>
    );
  }

  // AppContent now always renders Dashboard.
  // Dashboard itself will decide whether to show LoginForm or its main content.
  return <Dashboard />;
};

export default App;