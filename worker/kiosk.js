/**
 * The players' wellness and RPE pages, moved from Google to here (his go, 2026-10-22).
 *  - Public routes (the pages have no sign-in, as before): /api/kiosk/roster, /api/kiosk/done, /api/kiosk/checkin,
 *    /api/kiosk/rpe. A player never gets any score back — only "answered / not yet" for the grid, as the old pages.
 *  - The answers go into D1 (binding KIOSK, schema worker/kiosk.sql), one row per date + player.
 *  - The wellness payloads (today's view + the history) are computed here at once, with the Google script's own
 *    formulas (apps-script/Compute.gs: wellnessScore, itemColor_, buildWellnessView, buildWellnessHistory). During the
 *    parallel week they are written to p:wellness_cf / p:wellness_history_cf to compare with the script's; once env
 *    KIOSK_LIVE = "1" they replace p:wellness / p:wellness_history.
 *  - Each answer is copied back to the Google sheets (CheckIns / RPE, same columns) for the physical coach and the
 *    script — at once, and again by the 15-minute cron for any copy that failed (mirrored = 0).
 */
const ITEMS = ['fatigue', 'soreness', 'sleep', 'energy', 'recovery'];
const LABELS = { fatigue: 'Fatigue', soreness: 'Soreness', sleep: 'Sleep', energy: 'Energy', recovery: 'Recovery' };
const WEIGHTS = { fatigue: 5, soreness: 4, sleep: 3, energy: 2, recovery: 5 };
const WEIGHT_MAX = 95; // every item at 5
const SEVERITY = { red: 3, orange: 2, green: 1 };
const INACTIVE = ['left', 'loan'];
// before it, the players answered on the old Google form (numbers 1–5, often without thinking): those answers stay in
// the history (shown in the charts, flagged "pre") but are left out of every average and z-score (his ask, 2026-10-22)
const WELLNESS_SINCE = '2026-09-20';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const qatarDay = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const dayIdx = (s) => { const p = String(s).slice(0, 10).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); };
const idxDate = (i) => new Date(i * 864e5).toISOString().slice(0, 10);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a, m) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)));
const num = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function players(env) { // the Players sheet (from the script's bundle): id, name, position, status, kiosk alias
  return (await env.DATA.get('kiosk:players', 'json')) || [];
}
const active = (ps) => ps.filter((p) => p.player_id && !INACTIVE.includes(String(p.status || '').toLowerCase()));

export async function kioskRoute(req, env, ctx, path) {
  if (!env.KIOSK) return json({ ok: false, error: 'not_ready' }, 501);
  if (path === '/api/kiosk/compute' && req.method === 'POST') { // the PC (upload key): compute now and copy what is waiting (checks)
    if (!env.UPLOAD_KEY || req.headers.get('X-Upload-Key') !== env.UPLOAD_KEY) return json({ ok: false, error: 'forbidden' }, 403);
    await kioskCompute(env); await kioskMirror(env);
    return json({ ok: true });
  }
  if (path === '/api/kiosk/roster' && req.method === 'GET') { // names only (the old pages showed them too)
    return json({ ok: true, today: qatarDay(), players: active(await players(env)).map((p) => ({ id: p.player_id, name: p.display_name, pos: p.position || '' })) });
  }
  if (path === '/api/kiosk/photos' && req.method === 'GET') { // the faces on the grid (as the old pages showed), from the private copy
    const ids = new Set(active(await players(env)).map((p) => p.player_id)), all = ((await env.DATA.get('p:player_photos', 'json')) || {}).photos || {};
    return new Response(JSON.stringify({ ok: true, photos: Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id))) }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } });
  }
  if (path === '/api/kiosk/done' && req.method === 'GET') { // who answered that day — never a value
    const q = new URL(req.url).searchParams, kind = q.get('kind') === 'rpe' ? 'rpe' : 'checkins', date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : qatarDay();
    const r = await env.KIOSK.prepare(`SELECT player_id FROM ${kind} WHERE date = ?`).bind(date).all();
    return json({ ok: true, date, ids: Object.fromEntries((r.results || []).map((x) => [x.player_id, true])) });
  }
  if ((path === '/api/kiosk/checkin' || path === '/api/kiosk/rpe') && req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }
    const ps = active(await players(env)), p = ps.find((x) => x.player_id === b.playerId);
    if (!p) return json({ ok: false, error: 'unknown_player' }, 400);
    if (b.test) return json({ ok: true, test: true }); // ?test on the page: the whole flow, nothing saved
    const today = qatarDay(), date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && b.date <= today && dayIdx(today) - dayIdx(b.date) <= 2 ? b.date : today, ts = new Date().toISOString();
    if (path === '/api/kiosk/checkin') {
      const v = ITEMS.map((k) => num(b[k]));
      if (v.some((x) => x == null || x < 1 || x > 5)) return json({ ok: false, error: 'bad_values' }, 400);
      const avg = round(mean(v), 1);
      await env.KIOSK.prepare('INSERT OR REPLACE INTO checkins (date, player_id, player_name, fatigue, soreness, sleep, energy, recovery, average, ts, mirrored) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
        .bind(date, p.player_id, p.display_name, ...v, avg, ts).run();
      ctx.waitUntil(Promise.allSettled([kioskCompute(env), kioskMirror(env)]));
    } else {
      const r = num(b.rpe);
      if (r == null || r < 0 || r > 10) return json({ ok: false, error: 'bad_values' }, 400);
      await env.KIOSK.prepare('INSERT OR REPLACE INTO rpe (date, player_id, player_name, rpe, ts, by, mirrored) VALUES (?, ?, ?, ?, ?, ?, 0)')
        .bind(date, p.player_id, p.display_name, r, ts, '').run();
      ctx.waitUntil(kioskMirror(env));
    }
    return json({ ok: true, date });
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

/** The answers not yet in the Google sheets, copied there (the script's kiosk_write: same tabs, same columns). */
export async function kioskMirror(env) {
  if (!env.KIOSK || !env.API_URL || !env.UPLOAD_KEY) return;
  const send = async (kind, table, cols) => {
    const r = await env.KIOSK.prepare(`SELECT * FROM ${table} WHERE mirrored = 0 LIMIT 200`).all(), rows = r.results || [];
    if (!rows.length) return;
    const res = await fetch(env.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'kiosk_write', key: env.UPLOAD_KEY, kind, rows: rows.map((x) => cols.map((c) => x[c] ?? '')) }) });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return; // the cron tries again
    await env.KIOSK.batch(rows.map((x) => env.KIOSK.prepare(`UPDATE ${table} SET mirrored = 1 WHERE date = ? AND player_id = ? AND ts = ?`).bind(x.date, x.player_id, x.ts)));
  };
  await send('checkin', 'checkins', ['date', 'player_id', 'player_name', 'fatigue', 'soreness', 'sleep', 'energy', 'recovery', 'average', 'ts']);
  await send('rpe', 'rpe', ['date', 'player_id', 'player_name', 'rpe', 'ts', 'by']);
}

// ------------------------------------------------------------------ the wellness payloads (Compute.gs, same formulas)
function wellnessScore(items) {
  let t = 0;
  for (const k of ITEMS) { if (items[k] == null) return null; t += items[k] * WEIGHTS[k]; }
  return round(t / WEIGHT_MAX * 100, 0);
}
const scoreLevel = (p) => (p == null ? 'none' : p < 50 ? 'red' : p < 70 ? 'orange' : 'green');
function itemColor(val, m, s) {
  if (m != null && s != null && s > 0.05) { const z = (val - m) / s; return z <= -1 ? 'red' : z < -0.3 ? 'orange' : 'green'; }
  return val <= 2 ? 'red' : val === 3 ? 'orange' : 'green';
}
const isKeeper = (p) => String(p.position || '').toUpperCase() === 'GK';

/** {site id: [entries sorted by day]} — each player's check-ins (the last one of a day wins), kiosk ids mapped. */
async function history(env, ps) {
  const alias = {};
  ps.forEach((p) => { alias[String(p.player_id).toLowerCase()] = p.player_id; if (p.alias_kiosk) alias[String(p.alias_kiosk).toLowerCase()] = p.player_id; });
  const r = await env.KIOSK.prepare('SELECT * FROM checkins ORDER BY date, ts').all(), by = {};
  for (const c of r.results || []) {
    const pid = alias[String(c.player_id).trim().toLowerCase()];
    if (!pid) continue;
    const e = { idx: dayIdx(c.date), date: c.date, average: num(c.average) };
    ITEMS.forEach((k) => { e[k] = num(c[k]); });
    if (e.average == null) e.average = mean(ITEMS.map((k) => e[k]).filter((v) => v != null));
    (by[pid] = by[pid] || {})[e.idx] = e;
  }
  const out = {};
  for (const pid in by) out[pid] = Object.keys(by[pid]).map(Number).sort((a, b) => a - b).map((i) => by[pid][i]);
  return out;
}

function playerInfo(p, entries, today, since) { // byId[pid] of the wellness view (Compute.gs playerWellnessInfo_); since = first answer kept for his usual
  const e = entries.find((x) => x.date === today);
  if (!e) return { name: p.display_name, today: null, alert: false, historyCount: 0, score: null, diff: null, status: null, worst: null };
  const items = Object.fromEntries(ITEMS.map((k) => [k, e[k]])), score = wellnessScore(items), status = scoreLevel(score);
  const hist = entries.filter((x) => x.date !== today && (!since || x.date >= since)), stats = {}, hm = {};
  ITEMS.forEach((k) => { const v = hist.map((x) => x[k]).filter((x) => x != null), m = mean(v); stats[k] = { mean: m, std: sd(v, m) }; hm[k] = m; });
  const td = {};
  let worstKey = null, worstSev = -1, worstVal = 99;
  ITEMS.forEach((k) => {
    const v = items[k];
    if (v == null) return;
    const color = itemColor(v, stats[k].mean, stats[k].std), sev = SEVERITY[color];
    td[k] = { value: v, color };
    if (sev > worstSev || (sev === worstSev && v < worstVal)) { worstSev = sev; worstVal = v; worstKey = k; }
  });
  const diff = ITEMS.every((k) => hm[k] != null) ? round(score - wellnessScore(hm), 0) : null;
  return { name: p.display_name, today: td, alert: status === 'red', historyCount: hist.length, score, diff, status, worst: worstKey ? { key: worstKey, label: LABELS[worstKey], value: worstVal } : null };
}

export async function kioskCompute(env) {
  if (!env.KIOSK) return;
  const ps = active(await players(env));
  if (!ps.length) return;
  const H = await history(env, ps), today = qatarDay(), live = env.KIOSK_LIVE === '1';
  const a = build(ps, H, today, WELLNESS_SINCE);
  await env.DATA.put(live ? 'p:wellness' : 'p:wellness_cf', JSON.stringify(a.view));
  await env.DATA.put(live ? 'p:wellness_history' : 'p:wellness_history_cf', JSON.stringify(a.hist));
  if (!live) { // the parallel week: the same calculation without the cut-off, to check it gives the Google script's numbers
    const b = build(ps, H, today, null);
    await env.DATA.put('p:wellness_chk', JSON.stringify(b.view));
    await env.DATA.put('p:wellness_history_chk', JSON.stringify(b.hist));
  }
}

function build(ps, H, today, since) {
  // today's view: each player, and the team average of the outfield players (no goalkeepers, his ask 2026-10-21)
  const byId = {}, teamToday = {};
  ps.forEach((p) => { byId[p.player_id] = playerInfo(p, H[p.player_id] || [], today, since); });
  ITEMS.forEach((k) => {
    const v = ps.filter((p) => !isKeeper(p)).map((p) => (H[p.player_id] || []).find((x) => x.date === today)).filter((e) => e && e[k] != null).map((e) => e[k]);
    teamToday[k] = v.length ? mean(v) : null;
  });
  const teamScore = ITEMS.every((k) => teamToday[k] != null) ? wellnessScore(teamToday) : null;
  const view = { date: today, byId, teamToday, teamScore, teamStatus: teamScore == null ? null : scoreLevel(teamScore), generated_at: new Date().toISOString(), source: 'cloudflare' };
  // the history: one point per day with answers — each player's score and the outfield team's
  const idxs = [...new Set(Object.values(H).flatMap((es) => es.map((e) => e.idx)))].sort((a, b) => a - b);
  const pl = ps.map((p) => ({ id: p.player_id, name: p.display_name, gk: isKeeper(p) }));
  const at = Object.fromEntries(Object.entries(H).map(([pid, es]) => [pid, Object.fromEntries(es.map((e) => [e.idx, e]))]));
  const days = idxs.map((i) => {
    const bid = {}, tv = Object.fromEntries(ITEMS.map((k) => [k, []]));
    pl.forEach((p) => {
      const e = at[p.id] && at[p.id][i];
      if (!e) return;
      const s = wellnessScore(Object.fromEntries(ITEMS.map((k) => [k, e[k]])));
      if (s != null) bid[p.id] = s;
      if (!p.gk) ITEMS.forEach((k) => { if (e[k] != null) tv[k].push(e[k]); });
    });
    const ti = Object.fromEntries(ITEMS.map((k) => [k, tv[k].length ? mean(tv[k]) : null]));
    const d = idxDate(i);
    return { date: d, byId: bid, teamScore: ITEMS.every((k) => ti[k] != null) ? wellnessScore(ti) : null, ...(since && d < since ? { pre: true } : {}) };
  });
  return { view, hist: { players: pl, days, ...(since ? { since } : {}), generated_at: view.generated_at, source: 'cloudflare' } };
}
