import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Componente principal del sistema de logros
const AchievementSystem = ({ token, currentUser }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('my-badges');
  const [userAchievements, setUserAchievements] = useState(null);
  const [allBadges, setAllBadges] = useState([]);
  const [progress, setProgress] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchAchievementData();
    }
  }, [token]);

  const fetchAchievementData = async () => {
    setLoading(true);
    try {
      const [achievementsRes, badgesRes, progressRes, recommendationsRes, leaderboardRes] = await Promise.all([
        axios.get(`${API}/achievements/me`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/achievements/badges`),
        axios.get(`${API}/achievements/progress`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/achievements/recommendations`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/achievements/leaderboard`)
      ]);

      setUserAchievements(achievementsRes.data);
      setAllBadges(badgesRes.data);
      setProgress(progressRes.data);
      setRecommendations(recommendationsRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (error) {
      console.error('Error fetching achievement data:', error);
    }
    setLoading(false);
  };

  const checkForNewAchievements = async () => {
    try {
      const response = await axios.post(`${API}/achievements/check`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.new_badges.length > 0) {
        // Mostrar notificación de nuevos logros
        showAchievementNotification(response.data);
        // Refrescar datos
        fetchAchievementData();
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  const showAchievementNotification = (achievementData) => {
    // Crear notificación visual para nuevos logros
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
      <div class="achievement-popup">
        <h3>🎉 ¡Nuevo Logro Desbloqueado!</h3>
        ${achievementData.new_badges.map(badge => `
          <div class="new-badge">
            <span class="badge-icon">${badge.icon}</span>
            <div>
              <strong>${badge.name}</strong>
              <p>${badge.description}</p>
              <small>+${badge.points} puntos</small>
            </div>
          </div>
        `).join('')}
        ${achievementData.level_up ? `
          <div class="level-up">
            🎊 ¡Subiste al nivel ${achievementData.new_level}!
            <br>Nuevo título: ${achievementData.new_title}
          </div>
        ` : ''}
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remover después de 5 segundos
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="achievement-system">
      {/* Header con estadísticas del usuario */}
      <AchievementHeader userAchievements={userAchievements} />
      
      {/* Navegación por pestañas */}
      <div className="flex flex-wrap gap-2 mb-6 border-b">
        <TabButton 
          active={activeTab === 'my-badges'} 
          onClick={() => setActiveTab('my-badges')}
          icon="🏆"
          label="Mis Logros"
        />
        <TabButton 
          active={activeTab === 'progress'} 
          onClick={() => setActiveTab('progress')}
          icon="📊"
          label="Progreso"
        />
        <TabButton 
          active={activeTab === 'all-badges'} 
          onClick={() => setActiveTab('all-badges')}
          icon="🎯"
          label="Todos los Logros"
        />
        <TabButton 
          active={activeTab === 'leaderboard'} 
          onClick={() => setActiveTab('leaderboard')}
          icon="👑"
          label="Ranking"
        />
      </div>

      {/* Contenido de las pestañas */}
      <div className="tab-content">
        {activeTab === 'my-badges' && (
          <MyBadgesTab 
            userAchievements={userAchievements} 
            recommendations={recommendations}
            onCheckAchievements={checkForNewAchievements}
          />
        )}
        {activeTab === 'progress' && (
          <ProgressTab progress={progress} />
        )}
        {activeTab === 'all-badges' && (
          <AllBadgesTab badges={allBadges} userBadges={userAchievements?.badges || []} />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardTab leaderboard={leaderboard} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
};

// Componente del header con estadísticas
const AchievementHeader = ({ userAchievements }) => {
  if (!userAchievements) return null;

  const levelProgress = userAchievements.next_level_exp > 0 
    ? (userAchievements.experience / userAchievements.next_level_exp) * 100 
    : 100;

  return (
    <div className="achievement-header bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-lg mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold">{userAchievements.level}</div>
          <div className="text-sm opacity-80">Nivel</div>
          <div className="w-full bg-white bg-opacity-20 rounded-full h-2 mt-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{ width: `${levelProgress}%` }}
            ></div>
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold">{userAchievements.badges.length}</div>
          <div className="text-sm opacity-80">Logros Obtenidos</div>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold">{userAchievements.total_points.toLocaleString()}</div>
          <div className="text-sm opacity-80">Puntos Totales</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold">{getUserTitle(userAchievements.level)}</div>
          <div className="text-sm opacity-80">Título Actual</div>
        </div>
      </div>
    </div>
  );
};

// Componente de botón de pestaña
const TabButton = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-t-lg transition-colors ${
      active 
        ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    <span>{icon}</span>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// Pestaña de mis logros
const MyBadgesTab = ({ userAchievements, recommendations, onCheckAchievements }) => {
  const earnedBadges = userAchievements?.badges || [];
  
  return (
    <div className="space-y-6">
      {/* Botón para verificar nuevos logros */}
      <div className="text-center">
        <button
          onClick={onCheckAchievements}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          🔍 Verificar Nuevos Logros
        </button>
      </div>

      {/* Recomendaciones */}
      {recommendations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-800 mb-3">
            🎯 Logros Cercanos a Completar
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.badge.id} recommendation={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Logros obtenidos */}
      <div>
        <h3 className="text-xl font-semibold mb-4">
          🏆 Logros Obtenidos ({earnedBadges.length})
        </h3>
        {earnedBadges.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-6xl mb-4">🎱</div>
            <p>¡Aún no tienes logros!</p>
            <p className="text-sm">Juega algunos partidos para empezar a desbloquear badges.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {earnedBadges.map((userBadge) => (
              <EarnedBadgeCard key={userBadge.badge_id} userBadge={userBadge} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Pestaña de progreso
const ProgressTab = ({ progress }) => {
  const sortedProgress = progress.sort((a, b) => b.progress - a.progress);
  
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">📊 Progreso hacia Logros</h3>
      
      {sortedProgress.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No hay progreso que mostrar en este momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedProgress.map((item) => (
            <ProgressCard key={item.badge.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

// Pestaña de todos los logros
const AllBadgesTab = ({ badges, userBadges }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRarity, setSelectedRarity] = useState('all');
  
  const earnedBadgeIds = userBadges.map(ub => ub.badge_id);
  
  const filteredBadges = badges.filter(badge => {
    const categoryMatch = selectedCategory === 'all' || badge.category === selectedCategory;
    const rarityMatch = selectedRarity === 'all' || badge.rarity === selectedRarity;
    return categoryMatch && rarityMatch;
  });

  const categories = [...new Set(badges.map(b => b.category))];
  const rarities = [...new Set(badges.map(b => b.rarity))];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="all">Todas</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rareza</label>
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="all">Todas</option>
            {rarities.map(rarity => (
              <option key={rarity} value={rarity}>{rarity}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid de badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((badge) => (
          <BadgeCard 
            key={badge.id} 
            badge={badge} 
            earned={earnedBadgeIds.includes(badge.id)}
          />
        ))}
      </div>
    </div>
  );
};

// Pestaña de ranking
const LeaderboardTab = ({ leaderboard, currentUser }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">👑 Ranking de Logros</h3>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Posición
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jugador
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nivel
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Puntos
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Logros
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leaderboard.map((player) => (
                <tr 
                  key={player.username}
                  className={`${player.username === currentUser?.username ? 'bg-blue-50' : ''} hover:bg-gray-50`}
                >
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <RankBadge rank={player.rank} />
                      <span className="ml-2 font-medium">#{player.rank}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900">{player.username}</div>
                      <div className="text-sm text-gray-500">{player.title}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-lg font-bold text-purple-600">{player.level}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-lg font-bold text-green-600">
                      {player.total_points.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-lg font-bold text-blue-600">{player.badge_count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Componentes auxiliares
const RecommendationCard = ({ recommendation }) => (
  <div className="bg-white border border-yellow-300 rounded-lg p-4">
    <div className="flex items-start space-x-3">
      <span className="text-2xl">{recommendation.badge.icon}</span>
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">{recommendation.badge.name}</h4>
        <p className="text-sm text-gray-600 mb-2">{recommendation.badge.description}</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${recommendation.progress}%` }}
          ></div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {Math.round(recommendation.progress)}% completado
        </div>
      </div>
    </div>
  </div>
);

const EarnedBadgeCard = ({ userBadge }) => {
  // Aquí necesitarías obtener los datos del badge desde el catálogo
  // Por simplicidad, asumo que tienes acceso a los datos del badge
  return (
    <div className="bg-white border-2 border-green-200 rounded-lg p-4 shadow-sm">
      <div className="text-center">
        <div className="text-3xl mb-2">🏆</div> {/* Placeholder icon */}
        <h4 className="font-medium text-gray-900">{userBadge.badge_id}</h4>
        <p className="text-xs text-gray-500 mt-2">
          Obtenido: {new Date(userBadge.earned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

const ProgressCard = ({ item }) => (
  <div className="bg-white border rounded-lg p-4">
    <div className="flex items-center space-x-3">
      <span className="text-2xl">{item.badge.icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-medium text-gray-900">{item.badge.name}</h4>
          <span className="text-sm font-medium text-gray-600">
            {Math.round(item.progress)}%
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-2">{item.badge.description}</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="h-2 rounded-full transition-all duration-300"
            style={{ 
              width: `${item.progress}%`,
              backgroundColor: item.color 
            }}
          ></div>
        </div>
      </div>
    </div>
  </div>
);

const BadgeCard = ({ badge, earned }) => (
  <div className={`border rounded-lg p-4 ${earned ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
    <div className="text-center">
      <div className="text-3xl mb-2">{badge.icon}</div>
      <h4 className={`font-medium ${earned ? 'text-green-900' : 'text-gray-500'}`}>
        {badge.name}
      </h4>
      <p className={`text-sm mt-1 ${earned ? 'text-green-700' : 'text-gray-400'}`}>
        {badge.description}
      </p>
      <div className="mt-2 flex justify-center items-center space-x-2">
        <RarityBadge rarity={badge.rarity} />
        <span className="text-xs text-gray-500">+{badge.points} pts</span>
      </div>
      {earned && (
        <div className="mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ Obtenido
          </span>
        </div>
      )}
    </div>
  </div>
);

const RankBadge = ({ rank }) => {
  const getColor = () => {
    if (rank === 1) return 'text-yellow-500';
    if (rank === 2) return 'text-gray-400';
    if (rank === 3) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getIcon = () => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '🏅';
  };

  return <span className={`text-xl ${getColor()}`}>{getIcon()}</span>;
};

const RarityBadge = ({ rarity }) => {
  const colors = {
    common: 'bg-gray-100 text-gray-800',
    uncommon: 'bg-green-100 text-green-800',
    rare: 'bg-blue-100 text-blue-800',
    epic: 'bg-purple-100 text-purple-800',
    legendary: 'bg-yellow-100 text-yellow-800',
    mythic: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[rarity] || colors.common}`}>
      {rarity}
    </span>
  );
};

// Función auxiliar para obtener título del usuario
const getUserTitle = (level) => {
  if (level >= 50) return "Dios del Billar";
  if (level >= 30) return "Leyenda";
  if (level >= 25) return "Maestro";
  if (level >= 20) return "Experto";
  if (level >= 15) return "Competidor";
  if (level >= 10) return "Jugador";
  if (level >= 5) return "Aprendiz";
  return "Novato";
};

export default AchievementSystem;