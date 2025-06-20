import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi) // Handles loading translation files from a backend/public folder
  .use(LanguageDetector) // Detects user language
  .use(initReactI18next) // Passes i18n instance to react-i18next
  .init({
    supportedLngs: ['en', 'es'], // Supported languages
    fallbackLng: 'es', // Fallback language if detected language is not supported
    defaultNS: 'translation', // Default namespace for translations
    detection: {
      // Order and from where user language should be detected
      order: ['localStorage', 'navigator'],
      // Caches results in localStorage
      caches: ['localStorage'],
    },
    backend: {
      // Path where translation files will be loaded from
      // {{lng}} will be replaced by the detected language (e.g., en)
      // {{ns}} will be replaced by the namespace (e.g., translation)
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    react: {
      // Use Suspense for loading translations (recommended)
      useSuspense: true,
    },
    // Optional: enable debug mode for development
    // debug: process.env.NODE_ENV === 'development',
  });

export default i18n;
