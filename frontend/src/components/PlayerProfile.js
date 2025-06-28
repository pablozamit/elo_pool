import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PlayerProfile = ({ playerId, playerUsername, token, currentUser, onClose }) => {
  const { t } = useTranslation();
  const [player, setPlayer] = useState(null);
  const [playerAchievements, setPlayerAchievements] = useState(null);
  const [playerMatches, setPlayerMatches] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (playerId || playerUsername) {
      fetchPlayerData();
    }
  }, [playerId, playerUsername]);

  const fetchPlayerData = async () => {
    setLoading(true);
    try {
      // Si tenemos username pero no ID, buscar el jugador primero
      let targetPlayerId = playerId;
      if (!targetPlayerId && playerUsername) {
        const searchResponse = await axios.get(`${API}/users/search?query=${playerUsername}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const foundPlayer = searchResponse.data.find(p => p.username === playerUsername);
        if (foundPlayer) {
          targetPlayerId = foundPlayer.id;
        }
      }

      if (!targetPlayerId) {
        throw new Error('Jugador no encontrado');
      }

      // Obtener datos del jugador
      const [playerRes, achievementsRes, statsRes] = await Promise.all([
        axios.get(`${API}/users/${targetPlayerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/achievements/user/${targetPlayerId}`),
        axios.get(`${API}/users/${targetPlayerId}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setPlayer(playerRes.data);
      setPlayerAchievements(achievementsRes.data);
      setPlayerStats(statsRes.data);

      // Obtener historial de partidos si es el usuario actual o si es público
      if (targetPlayerId === currentUser?.id) {
        const matchesRes = await axios.get(`${API}/matches/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPlayerMatches(matchesRes.data);
      } else {
        // Para otros jugadores, obtener historial público
        const matchesRes = await axios.get(`${API}/users/${targetPlayerId}/matches/public`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPlayerMatches(matchesRes.data);
      }

    } catch (error) {
      console.error('Error fetching player data:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-center">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <h3 className="text-lg font-semibold mb-4">Jugador no encontrado</h3>
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header del perfil */}
        <ProfileHeader 
          player={player} 
          playerAchievements={playerAchievements}
          playerStats={playerStats}
          isOwnProfile={player.id === currentUser?.id}
          onClose={onClose}
        />

        {/* Navegación por pestañas */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              label="Resumen"
              icon="📊"
            />
            <TabButton
              active={activeTab === 'achievements'}
              onClick={() => setActiveTab('achievements')}
              label="Logros"
              icon="🏆"
            />
            <TabButton
              active={activeTab === 'matches'}
              onClick={() => setActiveTab('matches')}
              label="Historial"
              icon="📋"
            />
            <TabButton
              active={activeTab === 'stats'}
              onClick={() => setActiveTab('stats')}
              label="Estadísticas"
              icon="📈"
            />
          </div>
        </div>

        {/* Contenido de las pestañas */}
        <div className="overflow-y-auto max-h-[60vh]">
          {activeTab === 'overview' && (
            <OverviewTab 
              player={player}
              playerAchievements={playerAchievements}
              playerStats={playerStats}
              recentMatches={playerMatches.slice(0, 5)}
            />
          )}
          {activeTab === 'achievements' && (
            <AchievementsTab playerAchievements={playerAchievements} />
          )}
          {activeTab === 'matches' && (
            <MatchesTab matches={playerMatches} player={player} />
          )}
          {activeTab === 'stats' && (
            <StatsTab playerStats={playerStats} player={player} />
          )}
        </div>
      </div>
    </div>
  );
};

// Componente del header del perfil
const ProfileHeader = ({ player, playerAchievements, playerStats, isOwnProfile, onClose }) => {
  const getPlayerTitle = (level) => {
    if (level >= 50) return "Dios del Billar";
    if (level >= 30) return "Leyenda";
    if (level >= 25) return "Maestro";
    if (level >= 20) return "Experto";
    if (level >= 15) return "Competidor";
    if (level >= 10) return "Jugador";
    if (level >= 5) return "Aprendiz";
    return "Novato";
  };

  const winRate = player.matches_played > 0 
    ? ((player.matches_won / player.matches_played) * 100).toFixed(1)
    : 0;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-4">
          {/* Avatar del jugador */}
          <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-3xl">
            🎱
          </div>
          
          <div>
            <h1 className="text-3xl font-bold">{player.username}</h1>
            <p className="text-lg opacity-90">
              {getPlayerTitle(playerAchievements?.level || 1)}
            </p>
            {player.is_admin && (
              <span className="inline-block bg-purple-500 text-white px-2 py-1 rounded text-sm mt-1">
                👑 Administrador
              </span>
            )}
            {isOwnProfile && (
              <span className="inline-block bg-green-500 text-white px-2 py-1 rounded text-sm mt-1 ml-2">
                Tu perfil
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Estadísticas principales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="ELO Rating"
          value={player.elo_rating?.toFixed(0) || '1200'}
          icon="⭐"
        />
        <StatCard
          label="Nivel"
          value={playerAchievements?.level || 1}
          icon="🎯"
        />
        <StatCard
          label="Partidos"
          value={player.matches_played || 0}
          icon="🎮"
        />
        <StatCard
          label="Victorias"
          value={player.matches_won || 0}
          icon="🏆"
        />
        <StatCard
          label="% Victoria"
          value={`${winRate}%`}
          icon="📊"
        />
      </div>
    </div>
  );
};

// Componente de tarjeta de estadística
const StatCard = ({ label, value, icon }) => (
  <div className="bg-white bg-opacity-10 rounded-lg p-3 text-center">
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-sm opacity-80">{label}</div>
  </div>
);

// Componente de botón de pestaña
const TabButton = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 py-3 px-1 border-b-2 transition-colors ${
      active
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    <span>{icon}</span>
    <span className="font-medium">{label}</span>
  </button>
);

// Pestaña de resumen
const OverviewTab = ({ player, playerAchievements, playerStats, recentMatches }) => {
  const recentBadges = playerAchievements?.badges?.slice(-6) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Logros recientes */}
      <div>
        <h3 className="text-lg font-semibold mb-4">🏆 Logros Recientes</h3>
        {recentBadges.length === 0 ? (
          <p className="text-gray-500">No hay logros aún</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {recentBadges.map((badge, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1">🏆</div>
                <div className="text-xs font-medium">{badge.badge_id}</div>
                <div className="text-xs text-gray-500">
                  {new Date(badge.earned_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Partidos recientes */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📋 Partidos Recientes</h3>
        {recentMatches.length === 0 ? (
          <p className="text-gray-500">No hay partidos recientes</p>
        ) : (
          <div className="space-y-2">
            {recentMatches.map((match) => (
              <RecentMatchCard key={match.id} match={match} player={player} />
            ))}
          </div>
        )}
      </div>

      {/* Estadísticas rápidas */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📊 Estadísticas Rápidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickStat
            label="Racha Actual"
            value={playerStats?.current_streak || 0}
            icon="🔥"
          />
          <QuickStat
            label="Mejor Racha"
            value={playerStats?.best_streak || 0}
            icon="⚡"
          />
          <QuickStat
            label="Oponentes Únicos"
            value={playerStats?.unique_opponents || 0}
            icon="👥"
          />
          <QuickStat
            label="Ranking"
            value={`#${playerStats?.rank || 'N/A'}`}
            icon="🏅"
          />
        </div>
      </div>
    </div>
  );
};

// Pestaña de logros
const AchievementsTab = ({ playerAchievements }) => {
  const badges = playerAchievements?.badges || [];
  const totalPoints = playerAchievements?.total_points || 0;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">
          🏆 Logros Obtenidos ({badges.length})
        </h3>
        <p className="text-gray-600">
          Puntos totales: <span className="font-bold text-green-600">{totalPoints.toLocaleString()}</span>
        </p>
      </div>

      {badges.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <div className="text-6xl mb-4">🎱</div>
          <p>Este jugador aún no tiene logros</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <BadgeCard key={badge.badge_id} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
};

// Pestaña de historial de partidos
const MatchesTab = ({ matches, player }) => {
  const [filter, setFilter] = useState('all');
  
  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    if (filter === 'wins') return match.winner_id === player.id;
    if (filter === 'losses') return match.winner_id !== player.id;
    return match.match_type === filter;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">📋 Historial de Partidos</h3>
        
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="Todos"
          />
          <FilterButton
            active={filter === 'wins'}
            onClick={() => setFilter('wins')}
            label="Victorias"
          />
          <FilterButton
            active={filter === 'losses'}
            onClick={() => setFilter('losses')}
            label="Derrotas"
          />
          <FilterButton
            active={filter === 'rey_mesa'}
            onClick={() => setFilter('rey_mesa')}
            label="Rey Mesa"
          />
          <FilterButton
            active={filter === 'liga_grupos'}
            onClick={() => setFilter('liga_grupos')}
            label="Liga Grupos"
          />
          <FilterButton
            active={filter === 'liga_finales'}
            onClick={() => setFilter('liga_finales')}
            label="Liga Finales"
          />
          <FilterButton
            active={filter === 'torneo'}
            onClick={() => setFilter('torneo')}
            label="Torneo"
          />
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay partidos que mostrar</p>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map((match) => (
            <MatchCard key={match.id} match={match} player={player} />
          ))}
        </div>
      )}
    </div>
  );
};

// Pestaña de estadísticas detalladas
const StatsTab = ({ playerStats, player }) => {
  if (!playerStats) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Estadísticas no disponibles</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Estadísticas por tipo de partida */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📊 Por Tipo de Partida</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MatchTypeStats type="Rey de la Mesa" stats={playerStats.rey_mesa} />
          <MatchTypeStats type="Liga Grupos" stats={playerStats.liga_grupos} />
          <MatchTypeStats type="Liga Finales" stats={playerStats.liga_finales} />
          <MatchTypeStats type="Torneo" stats={playerStats.torneo} />
        </div>
      </div>

      {/* Estadísticas temporales */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📅 Estadísticas Temporales</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatBox
            title="Esta Semana"
            stats={playerStats.this_week}
          />
          <StatBox
            title="Este Mes"
            stats={playerStats.this_month}
          />
          <StatBox
            title="Últimos 30 días"
            stats={playerStats.last_30_days}
          />
        </div>
      </div>

      {/* Progresión de ELO */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📈 Progresión de ELO</h3>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {playerStats.elo_peak || player.elo_rating}
              </div>
              <div className="text-sm text-gray-600">ELO Máximo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {player.elo_rating?.toFixed(0)}
              </div>
              <div className="text-sm text-gray-600">ELO Actual</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {playerStats.elo_low || player.elo_rating}
              </div>
              <div className="text-sm text-gray-600">ELO Mínimo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                +{((player.elo_rating || 1200) - 1200).toFixed(0)}
              </div>
              <div className="text-sm text-gray-600">Ganancia Total</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componentes auxiliares
const RecentMatchCard = ({ match, player }) => {
  const isWinner = match.winner_id === player.id;
  const opponent = match.player1_id === player.id ? match.player2_username : match.player1_username;

  return (
    <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
      <div>
        <span className="font-medium">vs {opponent}</span>
        <span className="text-sm text-gray-600 ml-2">({match.match_type})</span>
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm">{match.result}</span>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          isWinner ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {isWinner ? 'Victoria' : 'Derrota'}
        </span>
      </div>
    </div>
  );
};

const QuickStat = ({ label, value, icon }) => (
  <div className="bg-gray-50 rounded-lg p-3 text-center">
    <div className="text-xl mb-1">{icon}</div>
    <div className="text-xl font-bold">{value}</div>
    <div className="text-sm text-gray-600">{label}</div>
  </div>
);

const BadgeCard = ({ badge }) => (
  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-4">
    <div className="text-center">
      <div className="text-3xl mb-2">🏆</div>
      <h4 className="font-medium text-gray-900">{badge.badge_id}</h4>
      <p className="text-xs text-gray-600 mt-2">
        {new Date(badge.earned_at).toLocaleDateString()}
      </p>
    </div>
  </div>
);

const FilterButton = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    {label}
  </button>
);

const MatchCard = ({ match, player }) => {
  const isWinner = match.winner_id === player.id;
  const opponent = match.player1_id === player.id ? match.player2_username : match.player1_username;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">vs {opponent}</div>
          <div className="text-sm text-gray-600">
            {match.match_type.replace('_', ' ')} • {match.result}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {new Date(match.confirmed_at).toLocaleDateString()}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          isWinner ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {isWinner ? 'Victoria' : 'Derrota'}
        </span>
      </div>
    </div>
  );
};

const MatchTypeStats = ({ type, stats }) => (
  <div className="bg-gray-50 rounded-lg p-4">
    <h4 className="font-medium mb-2">{type}</h4>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span>Jugados:</span>
        <span className="font-medium">{stats?.played || 0}</span>
      </div>
      <div className="flex justify-between">
        <span>Ganados:</span>
        <span className="font-medium text-green-600">{stats?.won || 0}</span>
      </div>
      <div className="flex justify-between">
        <span>% Victoria:</span>
        <span className="font-medium">
          {stats?.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0}%
        </span>
      </div>
    </div>
  </div>
);

const StatBox = ({ title, stats }) => (
  <div className="bg-gray-50 rounded-lg p-4">
    <h4 className="font-medium mb-2">{title}</h4>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span>Partidos:</span>
        <span className="font-medium">{stats?.matches || 0}</span>
      </div>
      <div className="flex justify-between">
        <span>Victorias:</span>
        <span className="font-medium text-green-600">{stats?.wins || 0}</span>
      </div>
      <div className="flex justify-between">
        <span>% Victoria:</span>
        <span className="font-medium">
          {stats?.matches > 0 ? ((stats.wins / stats.matches) * 100).toFixed(1) : 0}%
        </span>
      </div>
    </div>
  </div>
);

export default PlayerProfile;