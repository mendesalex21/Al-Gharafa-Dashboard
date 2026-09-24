/**
 * Données fictives pour la page Wellness — même forme EXACTE que Compute.gs > buildWellnessView :
 * {date, byId, teamToday, teamScore, teamStatus}. Les ids utilisés sont ceux de ROSTER (photo-data.js),
 * donc les vraies photos s'affichent même en mode démo.
 */
const MOCK_WELLNESS_WEIGHTS = { fatigue: 5, soreness: 4, sleep: 3, energy: 2, recovery: 5 };
const MOCK_WELLNESS_MAX = 95;
function mockScore(items) {
  if (!items) return null;
  let total = 0;
  for (const k in MOCK_WELLNESS_WEIGHTS) { if (items[k] == null) return null; total += items[k] * MOCK_WELLNESS_WEIGHTS[k]; }
  return Math.round((total / MOCK_WELLNESS_MAX) * 100);
}
function mockStatus(pct) { return pct == null ? null : pct < 50 ? 'red' : pct < 70 ? 'orange' : 'green'; }
function mockItemColor(v) { return v == null ? null : v <= 2 ? 'red' : v === 3 ? 'orange' : 'green'; }
const QUESTIONS = ['fatigue', 'soreness', 'sleep', 'energy', 'recovery'];
const MOCK_Q_LABELS = { fatigue: 'Fatigue', soreness: 'Soreness', sleep: 'Sleep', energy: 'Energy', recovery: 'Recovery' };

// player_id (celui de ROSTER) -> réponses brutes du jour, ou null si pas de check-in.
const MOCK_TODAY_ITEMS = {
  ounas: { fatigue: 1, soreness: 1, sleep: 3, energy: 2, recovery: 2 },
  chalpan: { fatigue: 2, soreness: 3, sleep: 4, energy: 2, recovery: 3 },
  amjd: { fatigue: 3, soreness: 3, sleep: 3, energy: 3, recovery: 3 },
  mulla: { fatigue: 3, soreness: 3, sleep: 4, energy: 2, recovery: 3 },
  jang: { fatigue: 3, soreness: 3, sleep: 4, energy: 3, recovery: 3 },
  ahmad: { fatigue: 3, soreness: 2, sleep: 5, energy: 4, recovery: 3 }, // Hamad
  kone: { fatigue: 4, soreness: 3, sleep: 4, energy: 4, recovery: 4 },
  jamil: { fatigue: 4, soreness: 2, sleep: 4, energy: 3, recovery: 3 },
  mahana: { fatigue: 4, soreness: 3, sleep: 4, energy: 3, recovery: 3 },
  rasheed: { fatigue: 3, soreness: 3, sleep: 5, energy: 4, recovery: 3 },
  bennacer: { fatigue: 4, soreness: 4, sleep: 4, energy: 3, recovery: 4 },
  frank: { fatigue: 4, soreness: 4, sleep: 4, energy: 4, recovery: 3 },
  jamal: { fatigue: 4, soreness: 4, sleep: 4, energy: 4, recovery: 4 },
  yacine: { fatigue: 4, soreness: 4, sleep: 4, energy: 4, recovery: 4 },
  fayez: { fatigue: 4, soreness: 4, sleep: 5, energy: 4, recovery: 4 },
  mason: { fatigue: 4, soreness: 4, sleep: 5, energy: 4, recovery: 4 },
  // khalifa, mahmood, aladin, amro, ayoub, coman, dame, fabricio, mustapha, sano, rayyan-ali,
  // rayyan-hani, saif, sassi, yousef-musa, yousef-saeed : pas de check-in aujourd'hui (démo).
};
// écart en points de % vs habitude, juste pour la démo (le vrai calcul est côté serveur).
const MOCK_DIFF = { ounas: -27, chalpan: -9, amjd: 1, mulla: -6, jang: -8, ahmad: -22, kone: 0, jamil: -1, mahana: 4, rasheed: -3, bennacer: 1, frank: 2, jamal: 0, yacine: 0, fayez: 6, mason: 12 };

function mockPlayerInfo(id) {
  const items = MOCK_TODAY_ITEMS[id];
  if (!items) return { name: ROSTER.find((p) => p.id === id).name, today: null, alert: false, historyCount: 0, score: null, diff: null, status: null, worst: null };
  const score = mockScore(items);
  const status = mockStatus(score);
  const today = {};
  let worstKey = null, worstSev = -1, worstVal = 99;
  const sevMap = { red: 3, orange: 2, green: 1 };
  QUESTIONS.forEach((k) => {
    const color = mockItemColor(items[k]);
    today[k] = { value: items[k], color };
    const sev = sevMap[color];
    if (sev > worstSev || (sev === worstSev && items[k] < worstVal)) { worstSev = sev; worstVal = items[k]; worstKey = k; }
  });
  return {
    name: ROSTER.find((p) => p.id === id).name, today, alert: status === 'red', historyCount: 30, score, diff: MOCK_DIFF[id] ?? null,
    status, worst: worstKey ? { key: worstKey, label: MOCK_Q_LABELS[worstKey], value: worstVal } : null,
  };
}

const MOCK_BY_ID = Object.fromEntries(ROSTER.map((p) => [p.id, mockPlayerInfo(p.id)]));
const MOCK_TEAM_TODAY = Object.fromEntries(QUESTIONS.map((k) => {
  const vals = Object.values(MOCK_TODAY_ITEMS).map((it) => it[k]).filter((v) => v != null);
  return [k, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
}));
const MOCK_TEAM_SCORE = QUESTIONS.every((k) => MOCK_TEAM_TODAY[k] != null) ? mockScore(MOCK_TEAM_TODAY) : null;

const MOCK_WELLNESS = {
  date: '2026-09-23',
  byId: MOCK_BY_ID,
  teamToday: MOCK_TEAM_TODAY,
  teamScore: MOCK_TEAM_SCORE,
  teamStatus: mockStatus(MOCK_TEAM_SCORE),
};

/**
 * Synthetic ~120-day history for the Wellness "Trends" section in demo mode — deterministic
 * pseudo-random noise around each player's current score, same shape as Compute.gs > buildWellnessHistory:
 * {players: [{id,name}], days: [{date, byId, teamScore}]}.
 */
const MOCK_WELLNESS_HISTORY = (() => {
  const seeded = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };
  const players = ROSTER.map((p) => ({ id: p.id, name: p.name }));
  const todayMs = Date.UTC(2026, 8, 23); // 2026-09-23
  const days = [];
  const DAY_COUNT = 120;
  for (let i = DAY_COUNT - 1; i >= 0; i--) {
    const dateStr = new Date(todayMs - i * 86400000).toISOString().slice(0, 10);
    const byId = {};
    ROSTER.forEach((p, pi) => {
      const items = MOCK_TODAY_ITEMS[p.id];
      const base = items ? mockScore(items) : 60 + (pi % 25);
      if (seeded(pi * 97 + i) < 0.08) return; // ~8% missed check-ins, like real life
      const noise = Math.round((seeded(pi * 13 + i * 7) - 0.5) * 24);
      byId[p.id] = Math.max(10, Math.min(100, base + noise));
    });
    const vals = Object.values(byId);
    const teamScore = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    days.push({ date: dateStr, byId, teamScore });
  }
  return { players, days };
})();
