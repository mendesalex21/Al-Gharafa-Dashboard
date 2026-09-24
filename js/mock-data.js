/** Données fictives — même forme que le JSON produit par Compute.gs (buildHome). Utilisées en mode démo. */
const MOCK_HOME = {
  as_of: '2026-09-22', today: '2026-09-23',
  alerts: {
    count: 3,
    players: [
      { id: 'ounas', name: 'Ounas', position: 'CM', level: 'red', avg: 2.4, trend: -1.3, base_low: false, reasons: 'low (≤2): fatigue, recovery; below usual: sleep', items: { fatigue: 2, soreness: 2, sleep: 2, energy: 3, recovery: 2 } },
      { id: 'jamal', name: 'Jamal', position: 'FW', level: 'orange', avg: 3.6, trend: -0.8, base_low: false, reasons: 'below usual: energy', items: { fatigue: 4, soreness: 4, sleep: 3, energy: 3, recovery: 4 } },
      { id: 'mulla', name: 'Mulla', position: 'CD', level: 'orange', avg: 2.8, trend: -0.2, base_low: true, reasons: 'low (≤2): sleep', items: { fatigue: 3, soreness: 3, sleep: 2, energy: 3, recovery: 3 } },
    ],
    ok: ['Rasheed', 'Yacine', 'Fabricio', 'Amjd', 'Bennacer', 'Chalpan', 'Dame', 'Frank', 'Rayyan Ali', 'Rayyan Hani', 'Aladin', 'Amro'].map((n, i) => ({ id: 'ok' + i, name: n, position: '—', level: 'green', avg: 4.2, trend: 0.1 })),
    missing: [{ id: 'saif', name: 'Saif' }, { id: 'sassi', name: 'Sassi' }],
  },
  session: {
    date: '2026-09-22', is_yesterday: true, md_tag: 'MD-2', type: 'Training', is_match: false,
    participants: 21, squad: 24,
    not_participating: [{ id: 'seydou', name: 'Seydou', reason: 'Recovery' }, { id: 'mustapha', name: 'Mustapha', reason: 'Injury' }, { id: 'jang', name: 'Jang', reason: 'Authorized' }],
    totals: { dt: 68400, hit_dt: 7200, acc_dec: 640, sprint_dt: 1580, rpe_load: 13230 },
    per_player: { dt: 3257, hit_dt: 343, acc_dec: 30.5, sprint_dt: 75, rpe_load: 630 },
    avg_rpe: 6.1,
  },
  week: {
    start: '2026-09-20',
    days: [
      { date: '2026-09-20', players: 22, dt: 61200, hit_dt: 6100, acc_dec: 540, sprint_dt: 1300, rpe_load: 11800 },
      { date: '2026-09-21', players: 24, dt: 12400, hit_dt: 900, acc_dec: 80, sprint_dt: 120, rpe_load: 2600 },
      { date: '2026-09-22', players: 21, dt: 68400, hit_dt: 7200, acc_dec: 640, sprint_dt: 1580, rpe_load: 13230 },
      { date: '2026-09-23', players: 0, dt: 0, hit_dt: 0, acc_dec: 0, sprint_dt: 0, rpe_load: 0 },
      { date: '2026-09-24', players: 0, dt: 0, hit_dt: 0, acc_dec: 0, sprint_dt: 0, rpe_load: 0 },
      { date: '2026-09-25', players: 0, dt: 0, hit_dt: 0, acc_dec: 0, sprint_dt: 0, rpe_load: 0 },
      { date: '2026-09-26', players: 0, dt: 0, hit_dt: 0, acc_dec: 0, sprint_dt: 0, rpe_load: 0 },
    ],
    totals: { dt: 142000, hit_dt: 14200, acc_dec: 1260, sprint_dt: 3000, rpe_load: 27630 },
    prev_totals: { dt: 168000, hit_dt: 15500, acc_dec: 1500, sprint_dt: 3600, rpe_load: 31200 },
    delta_pct: { dt: -15, hit_dt: -8, acc_dec: -16, sprint_dt: -17, rpe_load: -11 },
  },
  players: [
    { id: 'ounas', name: 'Ounas', position: 'CM', available: true, gps: { status: 'orange', risk: 0.32, worst: 'acc_dec', acwr: { dt: 1.1, hit_dt: 1.4, acc_dec: 1.35, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.05, acwr: 1.05, missing: false }, wellness: { status: 'red', avg: 2.4, trend: -1.3 }, global: { status: 'red', risk: 0.55 } },
    { id: 'jamal', name: 'Jamal', position: 'FW', available: true, gps: { status: 'green', risk: 0.02, worst: 'dt', acwr: { dt: 1.05, hit_dt: 1.1, acc_dec: 0.95, sprint_dt: 1.15 } }, rpe: { status: 'green', risk: 0.0, acwr: 1.0, missing: false }, wellness: { status: 'orange', avg: 3.6, trend: -0.8 }, global: { status: 'orange', risk: 0.28 } },
    { id: 'mulla', name: 'Mulla', position: 'CD', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 1.0, hit_dt: 0.95, acc_dec: 1.0, sprint_dt: 0.9 } }, rpe: { status: 'green', risk: 0.0, acwr: 0.95, missing: false }, wellness: { status: 'orange', avg: 2.8, trend: -0.2 }, global: { status: 'orange', risk: 0.26 } },
    { id: 'rasheed', name: 'Rasheed', position: 'CM', available: true, gps: { status: 'red', risk: 0.6, worst: 'sprint_dt', acwr: { dt: 1.3, hit_dt: 1.4, acc_dec: 1.2, sprint_dt: 1.6 } }, rpe: { status: 'orange', risk: 0.3, acwr: 1.35, missing: false }, wellness: { status: 'green', avg: 4.4, trend: 0.1 }, global: { status: 'red', risk: 0.52 } },
    { id: 'yacine', name: 'Yacine', position: 'CD', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 1.0, hit_dt: 1.0, acc_dec: 1.0, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.0, acwr: 1.0, missing: false }, wellness: { status: 'green', avg: 4.0, trend: 0.0 }, global: { status: 'green', risk: 0.0 } },
    { id: 'fabricio', name: 'Fabricio', position: 'CD', available: true, gps: { status: 'green', risk: 0.03, worst: 'hit_dt', acwr: { dt: 1.02, hit_dt: 1.08, acc_dec: 0.98, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.0, acwr: 0.98, missing: false }, wellness: { status: 'green', avg: 3.8, trend: -0.1 }, global: { status: 'green', risk: 0.02 } },
    { id: 'amjd', name: 'Amjd', position: 'WM', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 0.95, hit_dt: 0.9, acc_dec: 1.0, sprint_dt: 0.85 } }, rpe: { status: 'green', risk: 0.0, acwr: 0.9, missing: true }, wellness: { status: 'none', avg: null, trend: null }, global: { status: 'green', risk: 0.0 } },
    { id: 'bennacer', name: 'Bennacer', position: 'CM', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 1.0, hit_dt: 1.0, acc_dec: 1.0, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.0, acwr: 1.0, missing: false }, wellness: { status: 'green', avg: 4.1, trend: 0.05 }, global: { status: 'green', risk: 0.0 } },
    { id: 'chalpan', name: 'Chalpan', position: 'WD', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 1.0, hit_dt: 1.0, acc_dec: 1.0, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.0, acwr: 1.0, missing: false }, wellness: { status: 'green', avg: 4.3, trend: 0.0 }, global: { status: 'green', risk: 0.0 } },
    { id: 'dame', name: 'Dame', position: 'FW', available: true, gps: { status: 'green', risk: 0.0, worst: 'dt', acwr: { dt: 1.0, hit_dt: 1.0, acc_dec: 1.0, sprint_dt: 1.0 } }, rpe: { status: 'green', risk: 0.0, acwr: 1.0, missing: false }, wellness: { status: 'green', avg: 4.0, trend: 0.0 }, global: { status: 'green', risk: 0.0 } },
    { id: 'mustapha', name: 'Mustapha', position: 'CD', available: false, gps: { status: 'na', risk: null, worst: '', acwr: {} }, rpe: { status: 'na', risk: null, acwr: null, missing: false }, wellness: { status: 'none', avg: null, trend: null }, global: { status: 'na', risk: null } },
  ],
};

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
