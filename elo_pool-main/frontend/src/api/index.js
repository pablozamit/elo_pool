// frontend/src/api/index.js
import axios from 'axios';

// Usamos la URL del backend desde las variables de entorno, 
// o una local para desarrollo.
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000/api'
});

// Esto es muy útil: añade automáticamente el token de autenticación
// a cada petición si el usuario ha iniciado sesión.
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* --- Funciones de la API --- */

// Autenticación
export const login = (username, password) => apiClient.post('/login', { username, password });
export const register = (username, password) => apiClient.post('/register', { username, password });
export const getMyProfile = () => apiClient.get('/users/me');

// Rankings y Partidos
export const getRankings = () => apiClient.get('/rankings');
export const getPendingMatches = () => apiClient.get('/matches/pending');
export const getMatchHistory = () => apiClient.get('/matches/history');
export const submitMatch = (player1_id, player2_id, winner_id) => apiClient.post('/matches/submit', { player1_id, player2_id, winner_id });
export const confirmMatch = (matchId) => apiClient.post(`/matches/${matchId}/confirm`);
export const declineMatch = (matchId) => apiClient.post(`/matches/${matchId}/decline`);
export const getEloPreview = (player1_id, player2_id, winner_id) => apiClient.post('/elo/preview', { player1_id, player2_id, winner_id });

// Logros
// Logros
export const getMyAchievements = () => apiClient.get('/achievements/me');

// Admin
export const adminGetAllUsers = () => apiClient.get('/admin/users');
export const adminCreateUser = (userData) => apiClient.post('/admin/users', userData);
export const adminUpdateUser = (userId, updateData) => apiClient.put(`/admin/users/${userId}`, updateData);
export const adminDeleteUser = (userId) => apiClient.delete(`/admin/users/${userId}`);
export const getUserProfile = async (userId) => {
  return apiClient.get(`/users/${userId}`);
};

export const getUserAchievements = async (userId) => {
  return apiClient.get(`/achievements/user/${userId}`);
};

export const getUserMatchHistory = async (userId) => {
  return apiClient.get(`/matches/history/user/${userId}`);
};
