import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Verify token and get user info
      axios.get(`${API}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(response => {
        setUser(response.data);
        setLoading(false);
      }).catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
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

  const register = async (username, email, password) => {
    try {
      const response = await axios.post(`${API}/register`, { username, email, password });
      return { success: true, user: response.data };
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
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
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
const LoginForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isLogin) {
      const result = await login(formData.username, formData.password);
      if (!result.success) {
        setError(result.error);
      }
    } else {
      const result = await register(formData.username, formData.email, formData.password);
      if (result.success) {
        setIsLogin(true);
        setError('');
        setFormData({ username: '', email: '', password: '' });
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🎱 Club de Billar</h1>
          <p className="text-gray-600">
            {isLogin ? 'Inicia sesión en tu cuenta' : 'Crea tu cuenta de jugador'}
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
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
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-green-600 hover:text-green-800 font-medium"
          >
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
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
  const [loading, setLoading] = useState(false);
  const { user, token, logout } = useAuth();

  const fetchRankings = async () => {
    try {
      const response = await axios.get(`${API}/rankings`);
      setRankings(response.data);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    }
  };

  const fetchMatches = async () => {
    try {
      const response = await axios.get(`${API}/matches/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMatches(response.data);
    } catch (error) {
      console.error('Error fetching matches:', error);
    }
  };

  const fetchPendingMatches = async () => {
    try {
      const response = await axios.get(`${API}/matches/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingMatches(response.data);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
    }
  };

  useEffect(() => {
    fetchRankings();
    fetchMatches();
    fetchPendingMatches();
  }, []);

  const confirmMatch = async (matchId) => {
    try {
      await axios.post(`${API}/matches/${matchId}/confirm`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPendingMatches();
      fetchRankings();
      fetchMatches();
    } catch (error) {
      console.error('Error confirming match:', error);
    }
  };

  const rejectMatch = async (matchId) => {
    try {
      await axios.post(`${API}/matches/${matchId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPendingMatches();
    } catch (error) {
      console.error('Error rejecting match:', error);
    }
  };

  const TabButton = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
        activeTab === tab
          ? 'bg-green-600 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">🎱 Club de Billar</h1>
              <div className="hidden sm:block text-sm text-gray-500">
                Hola, {user?.username} - ELO: {user?.elo_rating?.toFixed(1)}
              </div>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton tab="rankings" label="Rankings" icon="🏆" />
          <TabButton tab="submit" label="Subir Resultado" icon="📝" />
          <TabButton tab="pending" label={`Pendientes (${pendingMatches.length})`} icon="⏳" />
          <TabButton tab="history" label="Historial" icon="📊" />
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow">
          {activeTab === 'rankings' && (
            <RankingsTab rankings={rankings} />
          )}
          {activeTab === 'submit' && (
            <SubmitMatchTab token={token} onMatchSubmitted={() => {
              fetchRankings();
              fetchMatches();
            }} />
          )}
          {activeTab === 'pending' && (
            <PendingMatchesTab 
              matches={pendingMatches} 
              onConfirm={confirmMatch}
              onReject={rejectMatch}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab matches={matches} currentUser={user} />
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Oponente
          </label>
          <input
            type="text"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={formData.opponent_username}
            onChange={(e) => setFormData({...formData, opponent_username: e.target.value})}
            placeholder="Nombre de usuario del oponente"
          />
        </div>

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
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginForm />;
};

export default App;