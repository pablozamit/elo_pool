import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
// Importamos solo las funciones necesarias de nuestra API
import { getMyAchievements } from '../api';

// Componente principal del sistema de logros
const AchievementSystem = ({ currentUser }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(currentUser ? 'my-badges' : 'all-badges');
  const [userAchievements, setUserAchievements] = useState(null);
  const [allBadges, setAllBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTab(currentUser ? 'my-badges' : 'all-badges');
    if (currentUser) {
      fetchAchievementData();
    } else {
        setLoading(false);
    }
  }, [currentUser]);

  const fetchAchievementData = async () => {
    setLoading(true);
    try {
      // La API ahora nos da toda la información de logros del usuario en una sola llamada
      const achievementsRes = await getMyAchievements(); 
      setUserAchievements(achievementsRes.data);
    } catch (error) {
      console.error('Error fetching achievement data:', error);
    }
    setLoading(false);
  };

  const checkForNewAchievements = async () => {
    if (!currentUser) return;
    try {
      const data = await checkAchievementsAPI(currentUser.id);
      if (data.new_badges.length > 0) {
        showAchievementNotification(data);
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
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="achievement-system">
      {/* Header con estadísticas del usuario */}
      <AchievementHeader userAchievements={userAchievements} />
      
      {/* Navegación por pestañas */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-600">
        {currentUser && (
          <>
            <TabButton
              active={activeTab === 'my-badges'}
              onClick={() => setActiveTab('my-badges')}
              icon="🏆"
              label={t('myAchievements')}
            />
            <TabButton
              active={activeTab === 'progress'}
              onClick={() => setActiveTab('progress')}
              icon="📊"
              label={t('progress')}
            />
          </>
        )}
        <TabButton
          active={activeTab === 'all-badges'}
          onClick={() => setActiveTab('all-badges')}
          icon="🎯"
          label={t('allBadges')}
        />
        <TabButton
          active={activeTab === 'leaderboard'}
          onClick={() => setActiveTab('leaderboard')}
          icon="👑"
          label={t('leaderboard')}
        />
      </div>

      {/* Contenido de las pestañas */}
      <div className="tab-content">
        {currentUser && activeTab === 'my-badges' && (
          <MyBadgesTab
            userAchievements={userAchievements}
            recommendations={recommendations}
            onCheckAchievements={checkForNewAchievements}
          />
        )}
        {currentUser && activeTab === 'progress' && (
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
  const { t } = useTranslation();
  
  if (!userAchievements) return null;

  const levelProgress = userAchievements.next_level_exp > 0 
    ? (userAchievements.experience / userAchievements.next_level_exp) * 100 
    : 100;

  return (
    <div className="premium-card p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-primary-gold">{userAchievements.level}</div>
          <div className="text-sm text-text-secondary">{t('level')}</div>
          <div className="w-full bg-gray-600 rounded-full h-2 mt-2">
            <div 
              className="bg-primary-gold h-2 rounded-full transition-all duration-300"
              style={{ width: `${levelProgress}%` }}
            ></div>
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold text-primary-gold">{userAchievements.badges.length}</div>
          <div className="text-sm text-text-secondary">{t('earnedBadges')}</div>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold text-primary-gold">{userAchievements.total_points.toLocaleString()}</div>
          <div className="text-sm text-text-secondary">{t('totalPoints')}</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-primary-gold">{getUserTitle(userAchievements.level)}</div>
          <div className="text-sm text-text-secondary">{t('currentTitle')}</div>
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
        ? 'bg-primary-gold text-dark-bg border-b-2 border-primary-gold' 
        : 'bg-card-bg text-text-secondary hover:bg-gray-700 border-b-2 border-transparent'
    }`}
  >
    <span>{icon}</span>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// Pestaña de mis logros
const MyBadgesTab = ({ userAchievements, recommendations }) => {
  const { t } = useTranslation();
  const earnedBadges = userAchievements?.badges || [];
  
  return (
    <div className="space-y-6">
      {/* El botón para verificar nuevos logros ha sido ELIMINADO */}

      {/* Recomendaciones */}
      {recommendations.length > 0 && (
        <div className="premium-card p-4">
          <h3 className="text-lg font-semibold text-primary-gold mb-3">
            🎯 {t('nearCompletion')}
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
        <h3 className="text-xl font-semibold text-primary-gold mb-4">
          🏆 {t('earnedBadges')} ({earnedBadges.length})
        </h3>
        {earnedBadges.length === 0 ? (
          <div className="text-center text-text-secondary py-8">
            <div className="text-6xl mb-4">🎱</div>
            <p>{t('noAchievementsYet')}</p>
            <p className="text-sm">{t('playToUnlock')}</p>
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
  const { t } = useTranslation();
  const sortedProgress = progress.sort((a, b) => b.progress - a.progress);
  
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-primary-gold">📊 {t('progress')}</h3>
      
      {sortedProgress.length === 0 ? (
        <div className="text-center text-text-secondary py-8">
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
  const { t } = useTranslation();
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
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('category')}</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="form-input"
          >
            <option value="all">{t('allCategories')}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('rarity')}</label>
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value)}
            className="form-input"
          >
            <option value="all">{t('allRarities')}</option>
            {rarities.map(rarity => (
              <option key={rarity} value={rarity}>{t(rarity)}</option>
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
  const { t } = useTranslation();
  
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-primary-gold">👑 {t('achievementRanking')}</h3>
      
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('position')}</th>
                <th>{t('player')}</th>
                <th>{t('level')}</th>
                <th>{t('points')}</th>
                <th>{t('badges')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((player) => (
                <tr 
                  key={player.username}
                  className={player.username === currentUser?.username ? 'bg-primary-gold bg-opacity-10' : ''}
                >
                  <td>
                    <div className="flex items-center">
                      <RankBadge rank={player.rank} />
                      <span className="ml-2 font-medium">#{player.rank}</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div className="font-medium text-text-primary">{player.username}</div>
                      <div className="text-sm text-text-secondary">{player.title}</div>
                    </div>
                  </td>
                  <td>
                    <span className="text-lg font-bold text-primary-gold">{player.level}</span>
                  </td>
                  <td>
                    <span className="text-lg font-bold text-success">
                      {player.total_points.toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span className="text-lg font-bold text-primary-gold">{player.badge_count}</span>
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
const RecommendationCard = ({ recommendation }) => {
  const { t } = useTranslation();
  
  return (
    <div className="premium-card p-4">
      <div className="flex items-start space-x-3">
        <span className="text-2xl">{recommendation.badge.icon}</span>
        <div className="flex-1">
          <h4 className="font-medium text-text-primary">{recommendation.badge.name}</h4>
          <p className="text-sm text-text-secondary mb-2">{recommendation.badge.description}</p>
          <div className="w-full bg-gray-600 rounded-full h-2">
            <div 
              className="bg-primary-gold h-2 rounded-full transition-all duration-300"
              style={{ width: `${recommendation.progress}%` }}
            ></div>
          </div>
          <div className="text-xs text-text-muted mt-1">
            {Math.round(recommendation.progress)}% {t('completedProgress')}
          </div>
        </div>
      </div>
    </div>
  );
};

const EarnedBadgeCard = ({ userBadge }) => {
  const { t } = useTranslation();
  
  return (
    <div className="premium-card p-4 border-2 border-success">
      <div className="text-center">
        <div className="text-3xl mb-2">🏆</div>
        <h4 className="font-medium text-text-primary">{userBadge.badge_id}</h4>
        <p className="text-xs text-text-secondary mt-2">
          {t('obtainedOn')} {new Date(userBadge.earned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

const ProgressCard = ({ item }) => {
  const { t } = useTranslation();
  
  return (
    <div className="premium-card p-4">
      <div className="flex items-center space-x-3">
        <span className="text-2xl">{item.badge.icon}</span>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-text-primary">{item.badge.name}</h4>
            <span className="text-sm font-medium text-text-secondary">
              {Math.round(item.progress)}%
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">{item.badge.description}</p>
          <div className="w-full bg-gray-600 rounded-full h-2">
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
};

const BadgeCard = ({ badge, earned }) => {
  const { t } = useTranslation();
  
  return (
    <div className={`premium-card p-4 ${earned ? 'border-2 border-success' : 'opacity-60'}`}>
      <div className="text-center">
        <div className="text-3xl mb-2">🏆</div>
        <h4 className={`font-medium ${earned ? 'text-text-primary' : 'text-text-muted'}`}>
          {badge.name}
        </h4>
        <p className={`text-sm mt-1 ${earned ? 'text-text-secondary' : 'text-text-muted'}`}>
          {badge.description}
        </p>
        <div className="mt-2 flex justify-center items-center space-x-2">
          <RarityBadge rarity={badge.rarity} />
          <span className="text-xs text-text-muted">+{badge.points} pts</span>
        </div>
        {earned && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success text-dark-bg">
              ✓ {t('obtained')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

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
  const { t } = useTranslation();
  
  const colors = {
    common: 'bg-gray-600 text-gray-200',
    uncommon: 'bg-green-600 text-green-200',
    rare: 'bg-blue-600 text-blue-200',
    epic: 'bg-purple-600 text-purple-200',
    legendary: 'bg-yellow-600 text-yellow-200',
    mythic: 'bg-red-600 text-red-200'
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[rarity] || colors.common}`}>
      {t(rarity)}
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
