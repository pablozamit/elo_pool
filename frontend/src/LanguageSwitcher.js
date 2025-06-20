import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  // Basic styling for the buttons, can be enhanced with Tailwind classes
  const buttonStyle = {
    padding: '0.25rem 0.5rem',
    border: '1px solid #ccc',
    borderRadius: '0.25rem',
    marginLeft: '0.5rem',
    cursor: 'pointer',
  };

  const disabledButtonStyle = {
    ...buttonStyle,
    cursor: 'not-allowed',
    opacity: 0.5,
  };

  return (
    <div>
      <button
        style={i18n.language === 'es' ? disabledButtonStyle : buttonStyle}
        onClick={() => changeLanguage('es')}
        disabled={i18n.language === 'es'}
      >
        Español
      </button>
      <button
        style={i18n.language === 'en' ? disabledButtonStyle : buttonStyle}
        onClick={() => changeLanguage('en')}
        disabled={i18n.language === 'en'}
      >
        English
      </button>
    </div>
  );
};

export default LanguageSwitcher;
