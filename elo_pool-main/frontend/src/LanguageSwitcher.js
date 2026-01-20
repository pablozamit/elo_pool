import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => changeLanguage('es')}
        disabled={i18n.language === 'es'}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
          i18n.language === 'es'
            ? 'bg-yellow-600 text-black cursor-not-allowed'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
        }`}
      >
        ES
      </button>
      <button
        onClick={() => changeLanguage('en')}
        disabled={i18n.language === 'en'}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
          i18n.language === 'en'
            ? 'bg-yellow-600 text-black cursor-not-allowed'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageSwitcher;