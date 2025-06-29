import axios from 'axios';

const AIRTABLE_API_KEY = process.env.REACT_APP_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.REACT_APP_AIRTABLE_BASE_ID;
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
console.log("baseId:", AIRTABLE_BASE_ID);

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json'
};

export const listRecords = async (table, params = '') => {
  const url = `${BASE_URL}/${table}${params}`;
  const res = await axios.get(url, { headers });
  return res.data.records.map(r => ({ id: r.id, ...r.fields }));
};

export const createRecord = async (table, fields) => {
  const url = `${BASE_URL}/${table}`;
  const res = await axios.post(url, { fields }, { headers });
  return { id: res.data.id, ...res.data.fields };
};

export const updateRecord = async (table, id, fields) => {
  const url = `${BASE_URL}/${table}/${id}`;
  const res = await axios.patch(url, { fields }, { headers });
  return { id: res.data.id, ...res.data.fields };
};

export const deleteRecord = async (table, id) => {
  const url = `${BASE_URL}/${table}/${id}`;
  await axios.delete(url, { headers });
};

export const findRecordsByField = async (table, field, value) => {
  const filter = `?filterByFormula=${encodeURIComponent(`{${field}}='${value}'`)}`;
  return listRecords(table, filter);
};

export const loginUser = async (username, password) => {
  const users = await listRecords('Users');

  console.log('Intentando login con:', username, password);
  console.log('Usuarios disponibles:', users);

  const user = users.find(
    (u) => u.Username === username && u.Password === password
  );

  if (!user) {
    console.log('No se encontró coincidencia exacta.');
    throw new Error('Invalid credentials');
  }

  console.log('Usuario autenticado:', user);
  return user;
};

export const registerUser = async (username, password) => {
  return createRecord('Users', {
    username,
    password,
    elo_rating: 1200,
    matches_played: 0,
    matches_won: 0,
    is_admin: false,
    is_active: true
  });
};

export const fetchMatchesForUser = async (username) => {
  const all = await listRecords('Matches');
  return all.filter(m => m.player1_username === username || m.player2_username === username);
};

export const fetchPendingMatchesForUser = async (username) => {
  const all = await listRecords('Matches');
  return all.filter(m => m.status === 'pending' && (m.player1_username === username || m.player2_username === username));
};

export const fetchPendingMatchesForUser = async (username) => {
  const all = await listRecords('Matches');
  return all.filter(m => m.status === 'pending' && (m.player1_username === username || m.player2_username === username));
};

export const createMatch = async (fields) => {
  return createRecord('Matches', fields);
};

export const updateMatch = async (id, fields) => {
  return updateRecord('Matches', id, fields);
};

export const fetchRankings = async () => {
  const users = await listRecords('Users');
  return users.sort((a, b) => b.elo_rating - a.elo_rating);
};

export const searchUsers = async (query) => {
  const users = await listRecords('Users');
  return users.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
};

export const fetchUserBadges = async (userId) => {
  const all = await listRecords('UserBadges');
  return all.filter(b => b.user_id === userId);
};

export const fetchBadges = async () => {
  return listRecords('Badges');
};

export const checkAchievements = async (userId) => {
  const userBadges = await fetchUserBadges(userId);
  return { new_badges: userBadges };
};
