import axios from 'axios';

const AIRTABLE_API_KEY = process.env.REACT_APP_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.REACT_APP_AIRTABLE_BASE_ID;
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
console.log("baseId:", AIRTABLE_BASE_ID);

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json'
};

// USERS
const normalizeUser = (u) => ({
  id: u.id,
  username: u.Username || u.username,
  password: u.Password || u.password,
  elo_rating: u['ELO Rating'] ?? u.elo_rating,
  matches_played: u['Matches Played'] ?? u.matches_played,
  matches_won: u['Matches Won'] ?? u.matches_won,
  is_admin: u['Is Admin'] ?? u.is_admin,
  is_active: u['Is Active'] ?? u.is_active,
  created_at: u['Created At'] ?? u.created_at,
  win_rate: u['Win Rate'] ?? u.win_rate,
  recent_activity: u['Recent Activity'] ?? u.recent_activity,
});

const userFieldMap = {
  username: 'Username',
  password: 'Password',
  elo_rating: 'ELO Rating',
  matches_played: 'Matches Played',
  matches_won: 'Matches Won',
  is_admin: 'Is Admin',
  is_active: 'Is Active',
};

const denormalizeUser = (u) => {
  const out = {};
  Object.entries(u).forEach(([k, v]) => {
    if (userFieldMap[k]) {
      out[userFieldMap[k]] = v;
    } else {
      out[k] = v;
    }
  });
  return out;
};

// MATCHES
const normalizeMatch = (m) => {
  const result = {
    id: m.id,
    player1_id: m['Player 1'],
    player2_id: m['Player 2'],
    player1_username: m['Player 1 Username'],
    player2_username: m['Player 2 Username'],
    match_type: m['Match Type'],
    result: m['Match Result'],
    winner_id: m['Winner'],
    status: m['Match Status'],
    player1_elo_before: m['Player 1 ELO Before'],
    player2_elo_before: m['Player 2 ELO Before'],
    player1_elo_after: m['Player 1 ELO After'],
    player2_elo_after: m['Player 2 ELO After'],
    submitted_by: m['Submitted By'],
    created_at: m['Created At'],
    confirmed_at: m['Confirmed At'],
    player1_elo_change: m['Player 1 ELO Change'],
    player2_elo_change: m['Player 2 ELO Change'],
    player1_total_matches: m['Player 1 Total Matches'],
    player2_total_matches: m['Player 2 Total Matches'],
  };
  if (result.winner_id === result.player1_id) {
    result.winner_username = result.player1_username;
  } else if (result.winner_id === result.player2_id) {
    result.winner_username = result.player2_username;
  }
  return result;
};

const matchFieldMap = {
  player1_id: 'Player 1',
  player2_id: 'Player 2',
  player1_username: 'Player 1 Username',
  player2_username: 'Player 2 Username',
  match_type: 'Match Type',
  result: 'Match Result',
  winner_id: 'Winner',
  status: 'Match Status',
  player1_elo_before: 'Player 1 ELO Before',
  player2_elo_before: 'Player 2 ELO Before',
  player1_elo_after: 'Player 1 ELO After',
  player2_elo_after: 'Player 2 ELO After',
  submitted_by: 'Submitted By',
  created_at: 'Created At',
  confirmed_at: 'Confirmed At',
  player1_elo_change: 'Player 1 ELO Change',
  player2_elo_change: 'Player 2 ELO Change',
  player1_total_matches: 'Player 1 Total Matches',
  player2_total_matches: 'Player 2 Total Matches',
};

const denormalizeMatch = (m) => {
  const out = {};
  Object.entries(m).forEach(([k, v]) => {
    if (matchFieldMap[k]) {
      out[matchFieldMap[k]] = v;
    } else {
      out[k] = v;
    }
  });
  return out;
};

// BADGES
const normalizeBadge = (b) => ({
  id: b.id,
  name: b['Badge Name'],
  description: b['Badge Description'],
  category: b['Badge Category'],
  active_status: b['Badge Active Status'],
  created_at: b['Badge Created At'],
  popularity: b['Badge Popularity'],
  suggested_improvements: b['Suggested Badge Improvements'],
});

// USER BADGES
const normalizeUserBadge = (ub) => ({
  id: ub.id,
  name: ub.Name,
  user_id: ub.User,
  badge_id: ub.Badge,
  earned_at: ub['Earned At'],
  total_badges_earned: ub['Total Badges Earned'],
});

const normalizers = {
  Users: normalizeUser,
  Matches: normalizeMatch,
  Badges: normalizeBadge,
  UserBadges: normalizeUserBadge,
};

// CORE OPERATIONS
export const listRecords = async (table, params = '') => {
  const url = `${BASE_URL}/${table}${params}`;
  const response = await axios.get(url, { headers });
  const records = response.data.records.map((r) => {
    const item = { id: r.id, ...r.fields };
    return normalizers[table] ? normalizers[table](item) : item;
  });
  return records;
};

export const createRecord = async (table, fields) => {
  const url = `${BASE_URL}/${table}`;
  const payload = { fields };
  const response = await axios.post(url, payload, { headers });
  const record = { id: response.data.id, ...response.data.fields };
  return normalizers[table] ? normalizers[table](record) : record;
};

export const updateRecord = async (table, id, fields) => {
  const url = `${BASE_URL}/${table}/${id}`;
  const payload = { fields };
  const response = await axios.patch(url, payload, { headers });
  const record = { id: response.data.id, ...response.data.fields };
  return normalizers[table] ? normalizers[table](record) : record;
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
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    throw new Error('Invalid credentials');
  }

  return user;
};

export const registerUser = async (username, password) => {
  const fields = denormalizeUser({
    username,
    password,
    elo_rating: 1200,
    matches_played: 0,
    matches_won: 0,
    is_admin: false,
    is_active: true,
  });
  return createRecord('Users', fields);
};

export const fetchMatchesForUser = async (username) => {
  const all = await listRecords('Matches');
  return all.filter(
    (m) => m.player1_username === username || m.player2_username === username
  );
};

export const fetchPendingMatchesForUser = async (username) => {
  const all = await listRecords('Matches');
  return all.filter(
    (m) =>
      m.status === 'pending' &&
      (m.player1_username === username || m.player2_username === username)
  );
};

export const createMatch = async (fields) => {
  return createRecord('Matches', denormalizeMatch(fields));
};

export const updateMatch = async (id, fields) => {
  return updateRecord('Matches', id, denormalizeMatch(fields));
};

export const fetchRankings = async () => {
  const users = await listRecords('Users');
  return users.sort((a, b) => b.elo_rating - a.elo_rating);
};

export const searchUsers = async (query) => {
  const users = await listRecords('Users');
  return users.filter((u) =>
    u.username.toLowerCase().includes(query.toLowerCase())
  );
};

export const fetchUserBadges = async (userId) => {
  const all = await listRecords('UserBadges');
  return all.filter((b) => b.user_id === userId);
};

export { denormalizeUser };

export const fetchBadges = async () => {
  return listRecords('Badges');
};

export const checkAchievements = async (userId) => {
  const userBadges = await fetchUserBadges(userId);
  return { new_badges: userBadges };
};
