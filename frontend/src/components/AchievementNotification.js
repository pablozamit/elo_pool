import React, { useState, useEffect } from 'react';
import './AchievementNotification.css';

const AchievementNotification = ({ achievements, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (achievements && achievements.length > 0) {
      setVisible(true);
      setCurrentIndex(0);
    }
  }, [achievements]);

  useEffect(() => {
    if (visible && achievements && achievements.length > 0) {
      const timer = setTimeout(() => {
        if (currentIndex < achievements.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          setVisible(false);
          setTimeout(onClose, 300); // Esperar a que termine la animación
        }
      }, 3000); // Mostrar cada logro por 3 segundos

      return () => clearTimeout(timer);
    }
  }, [visible, currentIndex, achievements, onClose]);

  if (!achievements || achievements.length === 0 || !visible) {
    return null;
  }

  const currentAchievement = achievements[currentIndex];

  return (
    <div className={`achievement-notification ${visible ? 'show' : ''}`}>
      <div className="achievement-content">
        <div className="achievement-header">
          <span className="achievement-title">🎉 ¡Nuevo Logro!</span>
          <button 
            className="close-button"
            onClick={() => {
              setVisible(false);
              setTimeout(onClose, 300);
            }}
          >
            ×
          </button>
        </div>
        
        <div className="achievement-body">
          <div className="achievement-icon">
            {currentAchievement.icon}
          </div>
          
          <div className="achievement-details">
            <h3 className="achievement-name">{currentAchievement.name}</h3>
            <p className="achievement-description">{currentAchievement.description}</p>
            
            <div className="achievement-rewards">
              <span className="points-reward">+{currentAchievement.points} puntos</span>
              <span className={`rarity-badge rarity-${currentAchievement.rarity}`}>
                {currentAchievement.rarity}
              </span>
            </div>
            
            {currentAchievement.flavor_text && (
              <p className="flavor-text">"{currentAchievement.flavor_text}"</p>
            )}
          </div>
        </div>
        
        {achievements.length > 1 && (
          <div className="achievement-progress">
            <div className="progress-dots">
              {achievements.map((_, index) => (
                <div 
                  key={index}
                  className={`dot ${index === currentIndex ? 'active' : ''} ${index < currentIndex ? 'completed' : ''}`}
                />
              ))}
            </div>
            <span className="progress-text">
              {currentIndex + 1} de {achievements.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AchievementNotification;