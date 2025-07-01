import axios from 'axios';

const AIRTABLE_API_KEY = process.env.REACT_APP_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.REACT_APP_AIRTABLE_BASE_ID;
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
console.log("baseId:", AIRTABLE_BASE_ID);

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json'
};

// Minimal achievement catalog used by the client when the backend is not
// available. Each achievement defines an id, the points it grants and a
// condition function that receives user stats.
const ACHIEVEMENTS = [
  {
    id: 'first_match',
    points: 25,
    condition: (s) => s.matches_played >= 1,
  },
  {
    id: 'first_victory',
    points: 50,
    condition: (s) => s.matches_won >= 1,
  },
  {
    id: 'rookie',
    points: 75,
    condition: (s) => s.matches_played >= 5,
  },
  {
    id: 'getting_started',
    points: 100,
    condition: (s) => s.matches_won >= 3,
  },
  {
    id: 'rising_star',
    points: 150,
    condition: (s) => s.elo_rating >= 1300,
  },
];

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
  } else if (result.winner_id === result.player1_username) {
    // Backwards compatibility with old records storing username
    result.winner_username = result.player1_username;
  } else if (result.winner_id === result.player2_username) {
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

export const listRecords = async (table, params = '') => {
  console.group('Airtable listRecords');
  console.log('Llamando a Airtable:', table, params);
  const url = `${BASE_URL}/${table}${params}`;
  const response = await axios.get(url, { headers });
  const records = response.data.records.map((r) => {
    const item = { id: r.id, ...r.fields };
    return normalizers[table] ? normalizers[table](item) : item;
  });
  console.log('Respuesta Airtable:', records);
  console.groupEnd();
  return records;
};

export const createRecord = async (table, fields) => {
  console.group('Airtable createRecord');
  console.log('Llamando a Airtable:', table, fields);
  const url = `${BASE_URL}/${table}`;
  const payload = { fields };
  const response = await axios.post(url, payload, { headers });
  const record = { id: response.data.id, ...response.data.fields };
  const out = normalizers[table] ? normalizers[table](record) : record;
  console.log('Respuesta Airtable:', out);
  console.groupEnd();
  return out;
};

export const updateRecord = async (table, id, fields) => {
  console.group('Airtable updateRecord');
  console.log('Llamando a Airtable:', table, id, fields);
  const url = `${BASE_URL}/${table}/${id}`;
  const payload = { fields };
  const response = await axios.patch(url, payload, { headers });
  const record = { id: response.data.id, ...response.data.fields };
  const out = normalizers[table] ? normalizers[table](record) : record;
  console.log('Respuesta Airtable:', out);
  console.groupEnd();
  return out;
};

export const deleteRecord = async (table, id) => {
  console.group('Airtable deleteRecord');
  console.log('Llamando a Airtable:', table, id);
  const url = `${BASE_URL}/${table}/${id}`;
  const resp = await axios.delete(url, { headers });
  console.log('Respuesta Airtable:', resp.status);
  console.groupEnd();
};

export const findRecordsByField = async (table, field, value) => {
  const filter = `?filterByFormula=${encodeURIComponent(`{${field}}='${value}'`)}`;
  return listRecords(table, filter);
};

export const loginUser = async (username, password) => {
  console.group('Airtable loginUser');
  console.log('Credenciales', { username, password });
  const users = await listRecords('Users');
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) {
    console.groupEnd();
    throw new Error('Invalid credentials');
  }
  console.log('Usuario encontrado', user.id);
  console.groupEnd();
  return user;
};

export const registerUser = async (username, password) => {
  console.group('Airtable registerUser');
  console.log('Datos', { username, password });
  const fields = denormalizeUser({
    username,
    password,
    elo_rating: 1200,
    matches_played: 0,
    matches_won: 0,
    is_admin: false,
    is_active: true,
  });
  const record = await createRecord('Users', fields);
  console.groupEnd();
  return record;
};

export const fetchMatchesForUser = async (username) => {
  console.group('Airtable fetchMatchesForUser');
  console.log('Usuario', username);
  const all = await listRecords('Matches');
  const filtered = all.filter(
    (m) => m.player1_username === username || m.player2_username === username
  );
  console.log('Matches encontrados', filtered.length);
  console.groupEnd();
  return filtered;
};

export const fetchPendingMatchesForUser = async (username) => {
  console.group('Airtable fetchPendingMatchesForUser');
  console.log('Usuario', username);
  const all = await listRecords('Matches');
  const filtered = all.filter(
    (m) =>
      m.status === 'pending' &&
      (m.player1_username === username || m.player2_username === username)
  );
  console.log('Pendientes encontrados', filtered.length);
  console.groupEnd();
  return filtered;
};

export const fetchAllPendingMatches = async () => {
  console.group('Airtable fetchAllPendingMatches');
  const all = await listRecords('Matches');
  const pending = all.filter((m) => m.status === 'pending');
  console.log('Pendientes totales', pending.length);
  console.groupEnd();
  return pending;
};

export const createMatch = async (fields) => {
  console.group('Airtable createMatch');
  console.log('Campos', fields);
  const record = await createRecord('Matches', denormalizeMatch(fields));
  console.groupEnd();
  return record;
};

export const updateMatch = async (id, fields) => {
  console.group('Airtable updateMatch');
  console.log('ID', id, 'Campos', fields);
  const record = await updateRecord('Matches', id, denormalizeMatch(fields));
  console.groupEnd();
  return record;
};

export const fetchRecentMatches = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const filter = `?filterByFormula=AND({Match Status}='confirmed', IS_AFTER({Confirmed At}, '${since}'))`;
  return listRecords('Matches', filter);
};

export const fetchRankings = async () => {
  console.group('Airtable fetchRankings');
  const users = await listRecords('Users');
  const sorted = users.sort((a, b) => b.elo_rating - a.elo_rating);
  console.log('Rankings obtenidos:', sorted.length);
  console.groupEnd();
  return sorted;
};

export const searchUsers = async (query) => {
  console.group('Airtable searchUsers');
  console.log('Query', query);
  const users = await listRecords('Users');
  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(query.toLowerCase())
  );
  console.log('Resultados', filtered.length);
  console.groupEnd();
  return filtered;
};

export const fetchUserBadges = async (userId) => {
  console.group('Airtable fetchUserBadges');
  console.log('Usuario', userId);
  const all = await listRecords('UserBadges');
  const badges = all.filter((b) => b.user_id === userId);

  let total_points = 0;
  badges.forEach((b) => {
    const badge = ACHIEVEMENTS.find((a) => a.id === b.badge_id);
    if (badge) total_points += badge.points;
  });
  const level = Math.floor(total_points / 100) + 1;

  const result = {
    user_id: userId,
    badges,
    total_points,
    level,
    experience: total_points,
    next_level_exp: level * 100,
  };
  console.log('Respuesta Airtable:', result);
  console.groupEnd();
  return result;
};

export const fetchBadges = async () => {
  console.group('Airtable fetchBadges');
  const data = await listRecords('Badges');
  console.log('Badges obtenidos:', data.length);
  console.groupEnd();
  return data;
};

export const checkAchievements = async (userId) => {
  console.group('Airtable checkAchievements');
  console.log('Usuario', userId);
  const users = await listRecords('Users');
  const user = users.find((u) => u.id === userId);
  if (!user) {
    console.groupEnd();
    return { new_badges: [] };
  }

  const matches = await listRecords('Matches');
  const confirmed = matches.filter(
    (m) => m.status === 'confirmed' && (m.player1_id === userId || m.player2_id === userId)
  );
  const wins = confirmed.filter((m) => m.winner_id === userId).length;

  const stats = {
    matches_played: confirmed.length,
    matches_won: wins,
    elo_rating: user.elo_rating,
  };

  const existing = (await fetchUserBadges(userId)).badges.map((b) => b.badge_id);
  const new_badges = [];

  for (const ach of ACHIEVEMENTS) {
    if (existing.includes(ach.id)) continue;
    if (ach.condition(stats)) {
      const badgeRecords = await listRecords(
        'Badges',
        `?filterByFormula={Badge ID}='${ach.id}'`
      );
      const badgeId = badgeRecords?.[0]?.id;

      if (!badgeId) {
        console.warn('Badge not found:', ach.id);
        continue;
      }

      await createRecord('UserBadges', {
        User: userId,
        Badge: [badgeId],
        'Earned At': new Date().toISOString(),
      });
      new_badges.push(ach);
    }
  }

  console.log('Badges obtenidos', new_badges.length);
  console.groupEnd();
  return { new_badges };
};

export { denormalizeUser };
