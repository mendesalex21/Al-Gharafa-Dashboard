/**
 * Workload › Squad (risk board, acute vs chronic, squad load) and Workload › Player (deep-dive).
 * Data: sync/build.py → "workload" payload (ACWR rolling 7:28 + EWMA, weekly load z-scores, monotony,
 * high-speed exposure, availability). Wellness and tests payloads are joined in for the 360° view.
 */
const WL = { data: null, wellness: null, tests: null, history: null, model: 'acwr', metric: 'td', rank: 'hit', player: null, int: null, week: null, weekMode: 'train' };
const WEEK_TARGET_METRICS = [['td', 'Total distance'], ['hit', 'Distance > 20 km/h'], ['spr_n', 'Sprints (count)'], ['acc_dec', 'HIT Acc + Dec']];
const RISK_ORDER = { red: 0, orange: 1, green: 2, na: 3 };
const STATUS_LABEL = { available: 'Available', injured: 'Injured', rehab: 'Rehab', sick: 'Sick', 'national team': 'National team', absent: 'Absent' };

function statusBadge(status) {
  const lv = status === 'available' ? 'green' : status === 'injured' || status === 'rehab' ? 'red' : status === 'sick' ? 'orange' : 'na';
  return `<span class="badge"><i style="background:${STATUS_COL[lv]}"></i>${STATUS_LABEL[status] || status}</span>`;
}
function maxSpike(p) {
  let best = null;
  METRIC_KEYS.forEach((k) => { const z = p.z7[k]; if (z != null && (best == null || z > best.z)) best = { k, z }; });
  return best;
}
function spikeHtml(s) {
  if (!s) return '<span class="muted">—</span>';
  const cls = s.z >= 2 ? 'red' : s.z >= 1.5 ? 'orange' : '';
  return `<span class="${cls ? 'chip-v ' + cls : 'num'}">${fmtSigned(s.z)}</span> <small class="muted">${METRIC_SHORT[s.k]}</small>`;
}
function flagsHtml(flags) {
  if (!flags.length) return '<span class="muted">—</span>';
  return `<span class="flags">${flags.map((f) => `<span><i style="background:${STATUS_COL[f.level]}"></i>${escapeHtml(f.text)}</span>`).join('')}</span>`;
}
function flagsCompact(flags) {
  if (!flags.length) return '<span class="muted">—</span>';
  const top = flags.find((f) => f.level === 'red') || flags[0];
  const more = flags.length - 1;
  return `<span class="flags one" title="${escapeHtml(flags.map((f) => f.text).join('\n'))}"><span><i style="background:${STATUS_COL[top.level]}"></i>${escapeHtml(top.text)}</span>${more ? `<small class="muted">+${more} more</small>` : ''}</span>`;
}
function wellnessCell(id) {
  const w = WL.wellness && WL.wellness.byId && WL.wellness.byId[id];
  if (!w || w.score == null) return '<span class="muted">—</span>';
  return `<span class="chip-v ${w.status}">${w.score}%</span>`;
}

// ------------------------------------------------------------------ Squad
function renderSquad() {
  const root = document.getElementById('view-squad');
  root.innerHTML = `
    ${pageHead('Workload', 'Squad', 'sq-sub', segHtml('sq-model', [['acwr', 'Rolling 7:28'], ['ewma', 'EWMA']], WL.model))}
    <div class="tiles" id="sq-tiles"></div>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title">Risk board</h2>
        <span class="panel-note">ACWR per metric · spike = this week's load vs the player's previous 6 weeks (z) · click a player</span></div>
      <div class="table-wrap" id="sq-board"><div class="empty">Loading…</div></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">ACWR ranking</h2>
        <span class="legend-inline"><span><i style="background:#8e8e93"></i>bar = 7:28</span><span><i style="background:var(--ink)"></i>dash = 14:35 (previous week)</span></span>
        ${segHtml('sq-rank', RANK_METRICS.map(([k, l]) => [k, l]), WL.rank)}</div>
      <div class="chart" id="sq-rank-chart"></div>
      <p class="panel-foot">Available players with ≥ 28 days of data. Same ratios as the club Power BI: 7:28 = last 7 days ÷ the 28 days before them; 14:35 = the same ratio one week earlier — both above 1.37 = two weeks in a row of overload. Zones: 0.5 · 0.78 · 1.37 · 1.5.</p>
    </section>
    <div class="panel-head bare"><h2 class="panel-title">Weekly load vs top-3 match</h2><span class="panel-note" id="sq-wk-note"></span>
      <span class="sq-wk-ctl"><select class="select" id="sq-wk-pick" aria-label="Week"></select>${segHtml('sq-wk-mode', [['train', 'Training only'], ['all', 'All sessions']], WL.weekMode)}</span></div>
    <div class="grid2">${WEEK_TARGET_METRICS.map(([k, l]) => `<section class="panel"><div class="panel-head"><h2 class="panel-title small">% of top-3 match · ${l}</h2><span class="panel-note" id="sq-wk-target-${k}"></span></div><div class="chart" id="sq-wk-pct-${k}"></div></section>`).join('')}</div>
    <div class="panel-head bare"><h2 class="panel-title">Load by metric</h2>${segHtml('sq-metric', METRIC_KEYS.map((k) => [k, METRIC_SHORT[k]]), WL.metric)}</div>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Acute vs chronic</h2><span class="panel-note">rolling averages per day · the team's own load is on the Team page</span></div>
      <div class="chart" id="sq-scatter"></div>
      <p class="panel-foot">Dashed lines: ACWR 0.78 · 1.37 · 1.5. Shaded wedge: 0.78–1.37.</p>
    </section>
    <div class="legend-row">
      <span><i style="background:${ACWR_COL.green}"></i>ACWR 0.78–1.37</span>
      <span><i style="background:${ACWR_COL.amber}"></i>1.37–1.5</span>
      <span><i style="background:${ACWR_COL.red}"></i>&gt;1.5 · spike z ≥ 2</span>
      <span><i style="background:${ACWR_COL.low}"></i>0.5–0.78 (underload)</span>
      <span><i style="background:${ACWR_COL.vlow}"></i>&lt;0.5</span>
    </div>`;
  bindSeg('sq-model', (v) => { WL.model = v; drawSquad(); });
  bindSeg('sq-metric', (v) => { WL.metric = v; drawSquad(); });
  bindSeg('sq-rank', (v) => { WL.rank = v; drawRanking(); });
  bindSeg('sq-wk-mode', (v) => { WL.weekMode = v; drawSquadWeek(); });
  withData('sessions', (d) => { TR.sessions = d; drawSquadWeek(); }, () => {}); // the players' weeks (% of his top-3 match)
  withData('workload', (d) => { WL.data = d; drawSquad(); }, (err) => { root.innerHTML = loadError(err); });
  withData('wellness', (d) => { WL.wellness = d; drawSquad(); }, () => {});
}

/** Each player's week (Sunday → Saturday) as a % of his top-3 match — from the old Training › Week load page. The green
 * band = the usual range of the club's past competitive weeks (training only), or the staff's targets when set. */
function drawSquadWeek() {
  const d = TR.sessions, pick = document.getElementById('sq-wk-pick');
  if (!d || !d.weeks || !pick || document.getElementById('view-squad').hidden) return;
  const list = d.weeks.list;
  if (!WL.week || !list.find((w) => w.start === WL.week)) WL.week = list[0].start;
  if (pick.options.length !== list.length) pick.innerHTML = list.map((w) => `<option value="${w.start}">Week of ${fmtDay(w.start, { day: 'numeric', month: 'short' })}</option>`).join('');
  pick.value = WL.week;
  pick.onchange = () => { WL.week = pick.value; drawSquadWeek(); };
  const w = list.find((x) => x.start === WL.week), mode = WL.weekMode, bands = d.weeks.bands, partial = w.data_to && w.data_to < w.end;
  document.getElementById('sq-wk-note').textContent = `${fmtDay(w.start, { day: 'numeric', month: 'short' })} – ${fmtDay(w.end, { day: 'numeric', month: 'short' })}${partial ? ` · in progress, to ${fmtDay(w.data_to, { weekday: 'short', day: 'numeric' })}` : ''} · ${mode === 'train' ? 'training sessions only' : 'training and matches'} · 100 % = one match of his (average of his 3 best games) · shaded = ${d.weeks.bands_source === 'config' ? 'staff targets' : `usual range of ${d.weeks.bands_n} past competitive player-weeks (training only)`}`;
  const ids = Object.keys(w.players);
  WEEK_TARGET_METRICS.forEach(([k]) => {
    const vals = ids.map((id) => ({ id, v: w.players[id][mode + '_p3'][k] })).filter((x) => x.v != null && x.v > 0).sort((a, b) => b.v - a.v);
    const b = bands[k];
    document.getElementById('sq-wk-target-' + k).textContent = b ? `target ${b[0]}–${b[1]}%` : '';
    chXY(document.getElementById('sq-wk-pct-' + k), {
      x: vals.map((x) => playerName(x.id)), height: 270, slantTicks: true, yMin: 0,
      bands: b ? [{ from: b[0], to: b[1], color: STATUS_COL.green, alpha: 0.12 }] : [],
      bars: { values: vals.map((x) => x.v), color: (v) => (!b ? '#2a78d6' : v > b[1] * 1.25 ? STATUS_COL.red : v > b[1] ? STATUS_COL.orange : v >= b[0] ? '#34c759' : '#9fc2ee') },
      refs: [{ y: 100, dash: true, label: '1 match' }],
      tip: (i) => `<b>${escapeHtml(playerName(vals[i].id))} · ${vals[i].v}%</b><span>${fmtN(w.players[vals[i].id][mode][k])} this week${b ? ` · target ${b[0]}–${b[1]}%` : ''}</span>`,
    });
  });
}

function drawSquad() {
  const d = WL.data;
  if (!d || document.getElementById('view-squad').hidden) return;
  drawSquadWeek();
  document.getElementById('sq-sub').textContent = `Data up to ${fmtDay(d.as_of, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtUpdated(d.generated_at)}`;
  const ratio = (p) => (WL.model === 'ewma' ? p.ewma : p.acwr);
  const ps = d.players;
  const red = ps.filter((p) => p.risk === 'red').length, orange = ps.filter((p) => p.risk === 'orange').length;
  const unavailable = ps.filter((p) => p.status !== 'available');
  const counts = {};
  unavailable.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const weeks = d.team.weeks, wNow = weeks[weeks.length - 1], wPrev = weeks[weeks.length - 2];
  document.getElementById('sq-tiles').innerHTML = `
    <div class="tile"><div class="tile-label">Flagged players</div>
      <div class="tile-value"><span class="dotnum"><i style="background:${STATUS_COL.red}"></i>${red}</span><span class="dotnum"><i style="background:${STATUS_COL.orange}"></i>${orange}</span></div>
      <div class="tile-sub">red = high risk · orange = monitor</div></div>
    <div class="tile"><div class="tile-label">Available</div><div class="tile-value">${ps.length - unavailable.length}<small> / ${ps.length}</small></div>
      <div class="tile-sub">${Object.entries(counts).map(([k, n]) => `${n} ${STATUS_LABEL[k].toLowerCase()}`).join(' · ') || 'full squad'}</div></div>
    <div class="tile"><div class="tile-label">Team ACWR</div>
      <div class="tile-value chips">${['td', 'hit', 'spr'].map((k) => `<span><small>${METRIC_SHORT[k]}</small>${acwrChip(d.team.acwr_now[k])}</span>`).join('')}</div>
      <div class="tile-sub">rolling 7:28 · the team (your Team rule)</div></div>
    <div class="tile"><div class="tile-label">This week · TD</div><div class="tile-value">${fmtN(wNow.td)}<small> m</small></div>
      <div class="tile-sub">${wNow.days < 7 ? `${wNow.days} of 7 days · ` : ''}last week ${fmtN(wPrev ? wPrev.td : null)} m</div></div>`;

  const rows = ps.map((p) => {
    const r = ratio(p), sp = maxSpike(p);
    const hist = p.history_days < 28 ? `<small class="muted">${p.history_days} d of data</small>` : '';
    const hurt = p.status === 'injured' || p.status === 'rehab';
    const chip = (v) => (hurt ? '<span class="muted">—</span>' : p.status !== 'available' ? `<span class="chip-v na">${v == null ? '—' : v.toFixed(2)}</span>` : acwrChip(v));
    return {
      id: p.id,
      cells: [`<i class="riskdot" style="background:${STATUS_COL[p.risk]}" title="${p.risk}"></i>`, playerCell(p.id, p.name, p.pos), statusBadge(p.status),
        ...METRIC_KEYS.map((k) => (r[k] == null && hist ? hist : chip(r[k]))),
        spikeHtml(sp), p.monotony == null ? '<span class="muted">—</span>' : `<span class="${p.monotony >= 2 ? 'chip-v orange' : 'num'}">${p.monotony.toFixed(1)}</span>`,
        p.days_hsv == null ? '—' : `<span class="${p.days_hsv >= 10 && p.status === 'available' ? 'chip-v orange' : 'num'}">${p.days_hsv} d</span>`,
        wellnessCell(p.id), flagsCompact(p.flags)],
      keys: [RISK_ORDER[p.risk] * 100 - p.flags.length, p.name, p.status, ...METRIC_KEYS.map((k) => r[k]), sp ? sp.z : null, p.monotony, p.days_hsv,
        WL.wellness && WL.wellness.byId[p.id] ? WL.wellness.byId[p.id].score : null, p.flags.length],
    };
  });
  const board = document.getElementById('sq-board');
  sortableTable(board, [
    { label: 'Risk', cls: 'c' }, { label: 'Player' }, { label: 'Status' }, ...METRIC_KEYS.map((k) => ({ label: METRIC_SHORT[k], cls: 'c', desc: true })),
    { label: 'Spike z', cls: 'c', desc: true }, { label: 'Monotony', cls: 'c', desc: true }, { label: '≥90% Vmax', cls: 'c', desc: true },
    { label: 'Wellness', cls: 'c' }, { label: 'Flags', desc: true },
  ], rows, { col: 0, dir: 1 }, (r) => `data-id="${r.id}" class="clickable"`);
  board.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) switchView('player', { player: tr.dataset.id }); };

  drawRanking();
  const k = WL.metric;
  const pts = ps.filter((p) => p.status === 'available' && p.chronic[k] > 0).map((p) => {
    const lv = acwrLevel(p.acwr[k]);
    return { id: p.id, x: p.chronic[k], y: p.acute[k], label: p.name, color: acwrColor(p.acwr[k]), showLabel: p.acwr[k] > ACWR_TH.high || p.acwr[k] < ACWR_TH.vlow, r: p.acwr[k] };
  });
  chScatter(document.getElementById('sq-scatter'), {
    points: pts, height: 300, rays: [{ r: 0.78, color: ACWR_COL.low, label: '0.78' }, { r: 1.37, color: ACWR_COL.amber, label: '1.37' }, { r: 1.5, color: ACWR_COL.red, label: '1.5' }],
    zone: { from: 0.78, to: 1.37, color: ACWR_COL.green },
    xLabel: `Chronic · avg of the 28 days before the week ${METRIC_UNIT[k]}`, yLabel: `Acute · 7-day avg ${METRIC_UNIT[k]}`,
    tip: (p) => `<b>${escapeHtml(p.label)}</b><span>ACWR ${p.r.toFixed(2)} · acute ${fmtN(p.y)} · chronic ${fmtN(p.x)}</span>`,
    onClick: (p) => switchView('player', { player: p.id }),
  });
}

const RANK_METRICS = [['td', 'TD'], ['hit', 'HIT >20'], ['spr', 'Sprint dist.'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc+Dec'], ['srpe', 'sRPE']];

function drawRanking() {
  const d = WL.data;
  const k = WL.rank;
  const ps = d.players.filter((p) => p.status === 'available' && p.acwr_all && p.acwr_all[k] != null).sort((a, b) => b.acwr_all[k] - a.acwr_all[k]);
  const col = (v) => acwrColor(v);
  const vals = ps.map((p) => Math.min(p.acwr_all[k], 3));
  chXY(document.getElementById('sq-rank-chart'), {
    x: ps.map((p) => p.name), height: 280, slantTicks: true, yMin: 0, yMax: Math.max(2, ...vals) * 1.05,
    bars: { values: vals, color: (v) => col(v) },
    markers: [{ values: ps.map((p) => (p.acwr14[k] == null ? null : Math.min(p.acwr14[k], 3))), color: 'var(--ink)' }],
    refs: [{ y: 0.78, dash: true, color: ACWR_COL.low, label: '0.78' }, { y: 1.37, dash: true, color: ACWR_COL.amber, label: '1.37' }, { y: 1.5, color: ACWR_COL.red, label: '1.5' }],
    tip: (i) => `<b>${escapeHtml(ps[i].name)}</b><span>7:28 ${ps[i].acwr_all[k].toFixed(2)} · 14:35 ${ps[i].acwr14[k] == null ? '—' : ps[i].acwr14[k].toFixed(2)}</span>`,
    onClick: (i) => switchView('player', { player: ps[i].id }),
  });
}

// ------------------------------------------------------------------ Player
/* ------------------------------------------------------------------ Workload › Player (his mockup A, 2026-10-19): the Team
 * page's layout for one player — tiles (big: the last full week's z, small: the A:C; + his WCS and RHIE), his weekly z-score
 * and a month calendar of his days (letters) on top, Day / Week / Month charts (> 20 or > 15 km/h, sprint distance or
 * number; his wellness; option: the team's value as a grey tick), week by week, match references (+ max speed, WCS, RHIE)
 * and tests. d15 and the number of sprints are not in the workload series: they come from the sessions payload, their
 * A:C is computed here the same way (uncoupled 7:28). */
const PL = { view: 'week', color: 'z', team: false, hit: 'hit', spr: 'spr' };
const PL_LAB = { td: ['Total distance', 'm'], hit: ['Distance > 20 km/h', 'm'], d15: ['Distance > 15 km/h', 'm'], spr: ['Sprint distance', 'm'], spr_n: ['Number of sprints', ''], acc_dec: ['High Acc + Dec', ''], srpe: ['sRPE', 'AU'] };
const PL_ALL = ['td', 'hit', 'd15', 'spr', 'spr_n', 'acc_dec', 'srpe'];
const plKeys = () => ['td', PL.hit, PL.spr, 'acc_dec', 'srpe'];

function renderPlayerLoad(opts) {
  if (opts && opts.player) WL.player = opts.player;
  const root = document.getElementById('view-player');
  root.innerHTML = `<div class="sv-bleed">${pageHead('Workload', 'Player', 'pl-sub', `<div class="picker"><span id="pl-avatar"></span><select class="select" id="pl-select" aria-label="Player"></select></div>`)}
    <div id="pl-body"><div class="panel"><div class="empty">Loading…</div></div></div></div>`;
  if (!PL.bound) { PL.bound = true; let timer; window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => drawPlayerLoad(), 150); }); }
  withData('workload', (d) => { WL.data = d; drawPlayerLoad(); }, (err) => { root.innerHTML = loadError(err); });
  withData('sessions', (d) => { TR.sessions = d; drawPlayerLoad(); }, () => {}); // each day's z vs his usual for that MD, d15 and the sprints
  withData('tests', (d) => { WL.tests = d; drawPlayerLoad(); }, () => {});
  withData('wellness_history', (d) => { WL.history = d; drawPlayerLoad(); }, () => {});
  withData('intensity', (d) => { WL.int = d; drawPlayerLoad(); }, () => {}); // his WCS and RHIE
}

function plBuild(pid) {
  const d = WL.data, s = d.series[pid], p = d.players.find((x) => x.id === pid), n = s.cat.length;
  const days = Array.from({ length: n }, (_, i) => addDays(s.start, i));
  const week1 = d.team.week1 || (d.team.weeks.length ? d.team.weeks[0].start : d.team.start);
  const sess = Object.fromEntries(((TR.sessions && TR.sessions.sessions) || []).map((x) => [x.date, x]));
  const mine = (x) => { const se = sess[x]; return se ? se.players.find((r) => r.id === pid) : null; };
  const dayZ = (x, k) => { const q = mine(x); return q && q.mdref && q.mdref.z ? q.mdref.z[k] : null; };
  // the load of each metric by day, and its A:C (the workload series, or computed here for d15 and the sprints)
  const L = { ...s.load }, A = { ...s.acwr };
  ['d15', 'spr_n'].forEach((k) => {
    L[k] = days.map((x) => { const q = mine(x); return q && q[k] != null ? q[k] : 0; });
    A[k] = L[k].map((_, i) => { if (i < 34) return null; let a = 0, c = 0; for (let j = i - 6; j <= i; j++) a += L[k][j]; for (let j = i - 34; j <= i - 7; j++) c += L[k][j];
      return c > 0 ? Math.round((a / 7) / (c / 28) * 100) / 100 : null; });
  });
  const W = {};
  days.forEach((x, i) => { const ws = addDays(x, -dateOf(x).getUTCDay());
    const w = W[ws] || (W[ws] = { start: ws, end: addDays(ws, 6), train: 0, games: 0, min: 0, ...Object.fromEntries(PL_ALL.map((k) => [k, 0])) });
    const c = s.cat[i];
    if ('tpci'.includes(c)) w.train++;
    if (c === 'm' || c === 'b') { w.games++; w.min += s.min[i] || 0; }
    PL_ALL.forEach((k) => { w[k] += (L[k] && L[k][i]) || 0; }); });
  const weeks = Object.values(W).sort((a, b) => (a.start < b.start ? -1 : 1)).map((w) => ({ ...w, done: w.end <= d.as_of, label: 'W' + String(Math.round(daysBetween(week1, w.start) / 7) + 1).padStart(2, '0') }));
  const real = (k) => weeks.filter((w) => w.done && w[k] > 0);
  const acAt = (k, x) => (A[k] ? A[k][Math.min(n - 1, Math.max(0, daysBetween(s.start, x)))] : null);
  const zw = (w, k) => (w[k] > 0 ? tmZof(w[k], tmStats(real(k).filter((x) => x.start !== w.start).map((x) => x[k]))) : null);
  const t = d.team, tIdx = (x) => daysBetween(t.start, x), tw = Object.fromEntries(t.weeks.map((w) => [w.start, w]));
  const wh = Object.fromEntries(((WL.history && WL.history.days) || []).filter((x) => x.byId && x.byId[pid] != null).map((x) => [x.date, x.byId[pid]]));
  const wellOf = (a, b) => { const xs = Object.entries(wh).filter(([x]) => x >= a && x <= b).map(([, v]) => v); return xs.length ? xs.reduce((u, v) => u + v, 0) / xs.length : null; };
  const I = WL.int, g = I && I.gps ? Object.keys(I.gps).find((k) => I.gps[k].pid === pid) : null, IW = {};
  if (I && g) {
    const mb = ((I.rhie.mref || {})[g] || {}).bouts;
    I.weeks.forEach((x) => { const b = x.best[g];
      const rh = [...Object.values(x.train).map((tt) => ((tt.rhie.players || {})[g] || {}).n), ...(x.matches || []).map((m) => ((I.rhie.matches[m] || {})[g] || {}).n)].filter((v) => v != null);
      const tot = rh.length ? rh.reduce((u, v) => u + v, 0) : null;
      IW[x.ws] = { td: b ? b.td[0] : null, hi: b ? b.hi[0] : null, rh: tot, rx: tot != null && mb ? tot / mb : null }; });
  }
  return { d, s, p, n, days, dayZ, L, A, weeks, real, acAt, zw, t, tIdx, tw, wh, wellOf, I, g, IW };
}

function plTiles(B) {
  const { p, d } = B, last = B.real('td').slice(-1)[0];
  const tiles = plKeys().map((k) => {
    const [l, u] = PL_LAB[k], now = B.acAt(k, d.as_of), prev = B.acAt(k, addDays(d.as_of, -7)), [col, txt] = tmZone(now), z = last ? B.zw(last, k) : null, st = tmStats(B.real(k).map((w) => w[k])), ta = (d.team.acwr_now || {})[k];
    return `<div class="tm-tile"><span class="k">${l}</span><div class="ac"><b style="color:${TM_ZCOL[tmZ(z)]}">${z == null ? '—' : tmS(z)}</b><span>z · ${last ? last.label : ''}</span></div>
      <span class="tm-zone"><i style="background:${col}"></i><span title="${txt}">A:C <b>${now == null ? '—' : now.toFixed(2)}</b></span></span><div class="ln"><span>A:C a week ago</span><b>${prev == null ? '—' : prev.toFixed(2)}</b></div>
      ${PL.team && ta != null ? `<div class="ln"><span>Team A:C</span><b>${ta.toFixed(2)}</b></div>` : ''}
      ${last ? `<div class="ln"><span>${last.label}</span><b>${tmK(last[k])}${u ? ' ' + u : ''}</b></div><div class="ln"><span>His usual week</span><b>${tmK(st.p25)}–${tmK(st.p75)}</b></div>` : ''}</div>`;
  }).join('');
  // his WCS and RHIE: the last week with data, against his usual week
  const lw = B.weeks.filter((w) => w.done && B.IW[w.start] && B.IW[w.start].td != null).slice(-1)[0], x = lw ? B.IW[lw.start] : null;
  const hist = (f) => tmStats(Object.entries(B.IW).filter(([ws, v]) => v[f] != null && (!lw || ws !== lw.start)).map(([, v]) => v[f]));
  const pcol = (v) => (v == null ? 'var(--ink-muted)' : v >= 100 ? '#1f7a3d' : v >= 90 ? '#34a853' : v >= 80 ? '#5fbf7a' : v >= 60 ? '#e8a33d' : '#d9534f');
  const sw = hist('td'), sr = hist('rh');
  const wcs = `<div class="tm-tile"><span class="k">WCS · best minute</span><div class="ac"><b style="color:${pcol(x && x.td)}">${x && x.td != null ? x.td : '—'}<small> %</small></b><span>m/min · ${lw ? lw.label : ''}</span></div>
    <span class="tm-zone"><i style="background:${pcol(x && x.hi)}"></i>A/D + spr <b>${x && x.hi != null ? x.hi + ' %' : '—'}</b></span><div class="ln"><span>His usual week</span><b>${sw.p25 == null ? '—' : `${Math.round(sw.p25)}–${Math.round(sw.p75)} %`}</b></div>
    <div class="ln"><span>Of his WCS</span><b>${B.I && B.I.wref && B.I.wref[B.g] ? `${B.I.wref[B.g].td[0]} m/min` : '—'}</b></div></div>`;
  const rh = `<div class="tm-tile"><span class="k">RHIE · bouts</span><div class="ac"><b>${x && x.rh != null ? x.rh : '—'}</b><span>${lw ? lw.label : ''}</span></div>
    <span class="tm-zone"><i style="background:#16269e"></i>${x && x.rx != null ? `× ${x.rx.toFixed(1)} of his matches` : 'training + matches'}</span><div class="ln"><span>His usual week</span><b>${sr.p25 == null ? '—' : `${Math.round(sr.p25)}–${Math.round(sr.p75)}`}</b></div>
    <div class="ln"><span>In a match</span><b>${B.I && B.g && (B.I.rhie.mref || {})[B.g] ? B.I.rhie.mref[B.g].bouts : '—'}</b></div></div>`;
  const dl = Object.keys(B.wh).sort().pop(), w7 = B.wellOf(addDays(d.as_of, -6), d.as_of), w28 = B.wellOf(addDays(d.as_of, -34), addDays(d.as_of, -7));
  const well = `<div class="tm-tile"><span class="k">Wellness</span>${dl ? `<div class="ac"><b style="color:${tmWell(B.wh[dl])}">${Math.round(B.wh[dl])}<small> %</small></b><span>${fmtDay(dl, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    <span class="tm-zone"><i style="background:${tmWell(B.wh[dl])}"></i>his last check-in</span>` : '<div class="ac"><b>—</b></div><span class="tm-zone">no check-in</span>'}<div class="ln"><span>Last 7 days</span><b>${w7 == null ? '—' : Math.round(w7) + ' %'}</b></div><div class="ln"><span>The 4 weeks before</span><b>${w28 == null ? '—' : Math.round(w28) + ' %'}</b></div></div>`;
  return tiles + wcs + rh + well;
}

function plCharts(B) {
  const { s, days, d, t, L, A } = B, z = PL.color === 'z';
  const sw = (k) => (k === 'hit' || k === 'd15' ? segHtml('pl-hit', [['hit', '> 20'], ['d15', '> 15']], PL.hit) : k === 'spr' || k === 'spr_n' ? segHtml('pl-spr', [['spr', 'Distance'], ['spr_n', 'Number']], PL.spr) : '');
  const head = (k, l, note) => `<div class="pl-ch"><h2>${l}<small>${note}</small></h2>${sw(k)}</div>`;
  const tk = (tv) => (PL.team && tv > 0 ? { lo: tv * 0.97, hi: tv * 1.03 } : {}), teamNote = PL.team ? ' · grey tick = the team' : '';
  const tval = (k, i) => (t.daily[k] && i >= 0 ? t.daily[k][i] : null), twk = (w, k) => (B.tw[w.start] && B.tw[w.start][k] != null ? B.tw[w.start][k] : null);
  const card = (inner) => `<div class="tm-card">${inner}</div>`;
  let out = '';
  if (PL.view === 'day') {
    const ds = days.filter((x) => x >= addDays(d.as_of, -34)), few = ds.length <= (TM.fit || 99);
    const dtick = (x) => (few ? fmtDay(x, { weekday: 'short', day: 'numeric' }) : dateOf(x).getUTCDay() === 0 ? fmtDay(x, { day: 'numeric', month: 'short' }) : '');
    out = plKeys().map((k) => { const [l, u] = PL_LAB[k];
      return card(head(k, l, `per day${u ? ' · ' + u : ''} · colour = ${z ? 'z vs his usual for that MD' : 'A:C 7:28'}${teamNote}`) + tmChart({ title: l, dots: ds.length <= (TM.fit || 99), strip: 'none',
        items: ds.map((x) => { const i = daysBetween(s.start, x), v = L[k][i], zz = v > 0 ? B.dayZ(x, k) : null, ac = A[k] ? A[k][i] : null, c = s.cat[i], tv = tval(k, B.tIdx(x));
          return { v, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], game: c === 'm' || c === 'b', sep: dateOf(x).getUTCDay() === 0, label: few && v > 0 ? tmK(v) : '', ...tk(tv), tick: dtick(x),
            tip: `${fmtDay(x)} · ${(CAT_INFO[c] || CAT_INFO['-'])[0]}: ${fmtN(v)}${zz == null ? '' : ' · z ' + tmS(zz)}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}${PL.team && tv ? ' · team ' + fmtN(tv) : ''}` }; }) })); }).join('');
    out += card(head('', 'Wellness', 'his score each morning · % · green band = 70 % or more') + tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'none', dots: true,
      items: ds.map((x) => { const v = B.wh[x]; return { v: v || 0, col: v == null ? '#aeaeb2' : tmWell(v), label: few && v != null ? Math.round(v) : '', sep: dateOf(x).getUTCDay() === 0, tick: dtick(x), tip: v == null ? `${fmtDay(x)}: no check-in` : `${fmtDay(x)}: ${Math.round(v)} %` }; }) }));
    return out;
  }
  if (PL.view === 'month') {
    const months = [...new Set(days.map((x) => x.slice(0, 7)))], cur = d.as_of.slice(0, 7);
    const lab = (m) => fmtDay(m + '-15', { month: 'short' }) + (m === cur ? ' · so far' : '');
    const info = (m, k) => { const ix = days.map((x, i) => [x, i]).filter(([x]) => x.startsWith(m) && x <= d.as_of).map(([, i]) => i), tot = ix.reduce((a, i) => a + (L[k][i] || 0), 0), acs = ix.map((i) => (A[k] ? A[k][i] : null)).filter((v) => v != null);
      const tix = ix.map((i) => B.tIdx(days[i])).filter((j) => j >= 0 && t.daily[k]), ttot = tix.reduce((a, j) => a + (t.daily[k][j] || 0), 0);
      return { n: ix.length, tot, pw: ix.length ? tot / ix.length * 7 : 0, ac: acs.length ? acs.reduce((a, b) => a + b, 0) / acs.length : null, tpw: tix.length ? ttot / tix.length * 7 : null }; };
    out = plKeys().map((k) => { const [l, u] = PL_LAB[k], st = tmStats(B.real(k).map((w) => w[k]));
      return card(head(k, l, `his average week of the month${u ? ' · ' + u : ''}${teamNote}`) + tmChart({ title: l, dots: true, strip: 'none', band: st.p25 == null ? null : [st.p25, st.p75],
        items: months.map((m) => { const x = info(m, k), zz = tmZof(x.pw, st); return { v: x.pw, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(x.ac)[0], label: tmK(x.pw), tick: lab(m), now: m === cur, soft: m === cur, ...tk(x.tpw),
          tip: `${lab(m)}: ${fmtN(x.tot)} in ${x.n} days${zz == null ? '' : ' · z ' + tmS(zz) + ' vs his weeks'}${x.ac == null ? '' : ' · average A:C ' + x.ac.toFixed(2)}${PL.team && x.tpw ? ' · team ' + fmtN(x.tpw) + ' a week' : ''}` }; }) })); }).join('');
    out += card(head('', 'Wellness', 'his average score of the month · %') + tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'none', dots: true,
      items: months.map((m) => { const v = B.wellOf(m + '-01', m + '-31'); return { v: v || 0, col: v == null ? '#aeaeb2' : tmWell(v), label: v == null ? '' : Math.round(v), tick: lab(m), now: m === cur, soft: m === cur, tip: v == null ? '' : `${lab(m)}: ${Math.round(v)} %` }; }) }));
    return out;
  }
  const ws = B.weeks.slice(-Math.max(8, TM.fit || 14));
  out = plKeys().map((k) => { const [l, u] = PL_LAB[k], st = tmStats(B.real(k).map((w) => w[k]));
    return card(head(k, l, `per week${u ? ' · ' + u : ''}${st.p25 == null ? '' : ` · his usual ${tmK(st.p25)}–${tmK(st.p75)}`}${teamNote}`) + tmChart({ title: l, dots: true, strip: 'none', band: st.p25 == null ? null : [st.p25, st.p75],
      items: ws.map((w) => { const zz = B.zw(w, k), ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : d.as_of) : null, tv = twk(w, k);
        return { v: w[k], col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], label: w[k] > 0 ? tmK(w[k]) : 'no GPS', tick: w.label, now: !w.done, soft: !w.done, ...tk(tv),
          tip: `${w.label} · ${fmtDay(w.start, { day: 'numeric', month: 'short' })}: ${fmtN(w[k])}${zz == null ? '' : ' · z ' + tmS(zz)}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}${PL.team && tv ? ' · team ' + fmtN(tv) : ''}` }; }) })); }).join('');
  out += card(head('', 'Wellness', 'his average score of the week · % · green band = 70 % or more') + tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'none', dots: true,
    items: ws.map((w) => { const v = B.wellOf(w.start, w.end); return { v: v || 0, col: v == null ? '#aeaeb2' : tmWell(v), label: v == null ? '' : Math.round(v), tick: w.label, now: !w.done, soft: !w.done, tip: v == null ? '' : `${w.label}: ${Math.round(v)} %` }; }) }));
  return out;
}

function plTable(B) {
  const { d } = B, pc = (v) => (v == null ? '—' : `<span class="tm-acchip" style="background:${v >= 100 ? '#1f7a3d' : v >= 90 ? '#34a853' : v >= 80 ? '#8ccf9f' : v >= 60 ? '#e8a33d' : '#d9534f'}">${Math.round(v)} %</span>`);
  const main = (w, k) => { const zz = B.zw(w, k), ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : d.as_of) : null;
    return `<td class="b">${w[k] > 0 ? tmK(w[k]) : '—'}</td><td>${zz == null ? '' : `<span class="mz ${tmZ(zz)}">${tmS(zz)}</span>`}</td><td class="g">${ac == null ? '' : `<span class="tm-acchip" style="background:${tmZone(ac)[0]}">${ac.toFixed(2)}</span>`}</td>`; };
  const rows = B.weeks.slice().reverse().map((w) => { const x = B.IW[w.start], o = B.wellOf(w.start, w.end);
    return `<tr class="${w.done ? '' : 'now'}"><td><b>${w.label}</b> <span class="muted">${fmtDay(w.start, { day: 'numeric', month: 'short' })}${w.done ? '' : ' · in progress'}</span></td><td class="b">${w.train || '—'}</td><td>${w.games || '—'}</td><td>${w.min ? fmtN(w.min) : '—'}</td>
      ${main(w, 'td')}${main(w, 'hit')}${main(w, 'spr')}${main(w, 'acc_dec')}<td class="b">${x ? pc(x.td) : '—'}</td><td>${x ? pc(x.hi) : ''}</td><td class="b">${x && x.rh != null ? `<b>${x.rh}</b>${x.rx == null ? '' : ` <small class="muted">× ${x.rx.toFixed(1)}</small>`}` : '—'}</td>${main(w, 'srpe')}<td class="b">${o == null ? '—' : `<b style="color:${tmWell(o)}">${Math.round(o)} %</b>`}</td></tr>`; }).join('');
  const m3 = (l) => `<th class="b">${l}</th><th>z</th><th class="g">A:C</th>`;
  return `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Week by week</h2><span class="panel-note">z vs his other full weeks of the season · A:C 7:28 at the end of the week · WCS: his best minute of the week in training, % of his match worst case · RHIE: his bouts in the week (training + matches), × = how many of his matches it makes</span></div>
    <div class="table-wrap"><table class="tm-tbl tm-wide"><thead><tr class="grp"><th></th><th colspan="6">Volume</th><th colspan="6">Speed</th><th colspan="3">Accelerations</th><th colspan="2">WCS · best minute</th><th>RHIE</th><th colspan="4">Internal load &amp; wellness</th></tr>
      <tr><th>Week</th><th class="b">Sessions</th><th>Matches</th><th>Match min</th>${m3('Distance')}${m3('&gt; 20 km/h')}${m3('Sprint dist.')}${m3('Acc + Dec')}<th class="b">m/min</th><th>A/D + spr</th><th class="b">Bouts</th>${m3('sRPE')}<th class="b">Wellness</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function plRefs(B) {
  const { p, I, g } = B, wr = I && I.wref && g ? I.wref[g] : null, rm = I && g ? (I.rhie.mref || {})[g] : null;
  const row = (l, a, b, u) => `<tr><td>${l}</td><td class="c">${a == null ? '—' : a}</td><td class="c">${b == null ? '—' : `<b>${b}</b>`} <small class="muted">${u || ''}</small></td></tr>`;
  const PN = { S: 'Sprint', A: 'Acceleration', D: 'Deceleration', M: 'Mixed' };
  const prof = rm && rm.b >= 6 ? (() => { const tk = Object.values(I.rhie.mref).reduce((a, m) => a.map((v, i) => v + m.k[i]), [0, 0, 0]), sh = (k) => { const s = k[0] + k[1] + k[2]; return k.map((v) => v / Math.max(1, s)); };
    const a = sh(rm.k), b = sh(tk), ix = a.map((v, i) => v / (b[i] || 1)), i = ix.indexOf(Math.max(...ix)); return PN[ix[i] >= 1.1 ? 'SAD'[i] : 'M']; })() : null;
  return `<table class="dtable compact"><thead><tr><th></th><th class="c">Median / 90 min</th><th class="c">Top-3 match avg</th></tr></thead><tbody>
    ${[['td', 'Total distance', 'm'], ['d15', 'Distance > 15 km/h', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'], ['spr_n', 'Sprints', ''], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE', 'AU']]
      .map(([k, l, u]) => row(l, p.match_ref[k] == null ? null : fmtN(p.match_ref[k]), fmtN(p.top3[k]), u)).join('')}
    ${row('Max speed', null, p.vmax_ref == null ? null : fmtN(p.vmax_ref, 1), 'km/h · his best of the last 12 months')}
    <tr class="sub"><td colspan="3"><b>WCS</b> <small class="muted">his worst case of the matches (the mean of his 3 best${wr && wr.pos ? ' · his position\'s, fewer than 3 matches' : ''})</small></td></tr>
    ${row('WCS m/min · 1 · 3 · 5 min', null, wr ? wr.td.map((v) => fmtN(v)).join(' · ') : null, 'm/min')}
    ${row('WCS A/D + spr · 1 · 3 · 5 min', null, wr ? wr.hi.map((v) => v.toFixed(1)).join(' · ') : null, 'per min')}
    <tr class="sub"><td colspan="3"><b>RHIE</b> <small class="muted">his matches of 60 min or more${rm ? ` · ${rm.n}` : ''}</small></td></tr>
    ${row('Bouts in a match · per 90 min', null, rm ? `${rm.bouts} · ${rm.p90}` : null, '')}
    ${row('Actions per bout · profile', null, rm ? `${rm.pb == null ? '—' : rm.pb}${prof ? ' · ' + prof : ''}` : null, '')}
    </tbody></table>`;
}

function drawPlayerLoad(opts) {
  if (opts && opts.player) WL.player = opts.player;
  const d = WL.data, root = document.getElementById('view-player');
  if (!d || !root || root.hidden || !document.getElementById('pl-body')) return;
  const players = d.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!WL.player || !d.series[WL.player]) WL.player = (players.find((p) => p.risk === 'red') || players[0]).id;
  const sel = document.getElementById('pl-select');
  if (sel.options.length !== players.length) {
    sel.innerHTML = players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    sel.onchange = () => { WL.player = sel.value; drawPlayerLoad(); };
  }
  sel.value = WL.player;
  const B = plBuild(WL.player), { p, s } = B;
  document.getElementById('pl-avatar').innerHTML = avatarHtml(p.id, p.name, 34);
  document.getElementById('pl-sub').innerHTML = `${escapeHtml(p.pos || '')} · ${STATUS_LABEL[p.status]}${p.today ? ` · today: ${escapeHtml(p.today)}` : ''} · data up to ${fmtDay(d.as_of, { day: 'numeric', month: 'short' })}`;
  const body = document.getElementById('pl-body'), two = window.matchMedia('(min-width: 761px)').matches, gw = body.clientWidth;
  TM.cw = gw ? Math.max(480, Math.round((gw - (two ? 16 : 0)) / (two ? 2 : 1) - 36)) : 548;
  TM.fit = Math.max(8, Math.floor((TM.cw - 56) / 30));
  const box = (t, note, inner, extra = '') => `<section class="panel"><div class="panel-head"><h2 class="panel-title small">${t}</h2>${note ? `<span class="panel-note">${note}</span>` : ''}${extra}</div>${inner}</section>`;
  const legend = PL.color === 'z' ? [['vlow', 'well below'], ['low', 'below'], ['ok', 'usual'], ['up', 'above'], ['vup', 'well above']].map(([c, l]) => `<span><i style="background:${TM_ZCOL[c]}"></i>${l}</span>`).join('')
    : [0.4, 0.6, 1, 1.4, 1.6].map((r) => `<span><i style="background:${tmZone(r)[0]}"></i>${tmZone(r)[1]}</span>`).join('');
  body.innerHTML = `<div class="tm-tiles pl-tiles">${plTiles(B)}</div>
    ${p.flags.length ? `<div class="panel flags-panel">${flagsHtml(p.flags)}</div>` : ''}
    <div class="grid2">${box('Weekly load z-score', 'Sunday–Saturday weeks vs his previous 6 weeks', '<div class="table-wrap" id="pl-z"></div>')}${box(`Availability · last ${s.cat.length} days`, '', '<div id="pl-timeline"></div>')}</div>
    <div class="tm-bar"><div class="tm-dates muted">${PL.view === 'day' ? 'The last 5 weeks' : PL.view === 'week' ? 'The last weeks' : 'The season'}</div>
      <div class="tm-ctl"><span class="tm-lab">Team</span>${segHtml('pl-team', [['off', 'Off'], ['on', 'Show']], PL.team ? 'on' : 'off')}<span class="tm-lab">Colour</span>${segHtml('pl-color', [['z', 'z-score'], ['ac', 'A:C']], PL.color)}${segHtml('pl-view', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], PL.view)}</div></div>
    <div class="tm-legend">${legend}<span>G = match</span>${PL.team ? '<span><i style="background:#6b6b70"></i>the team</span>' : ''}</div>
    <div class="tm-grid${PL.team ? ' pl-team' : ''}">${plCharts(B)}</div>
    ${plTable(B)}
    <div class="grid2">${box('Match references', p.top3_src === 'own' ? `top 3 of his last ${p.top3_n} games ≥ 70 min (A + B, at most since last season), extra time left out` : `no game of 70 min yet — ${p.top3_src} reference`, plRefs(B))}${box('Physical tests', '', '<div id="pl-tests"></div>', '<a class="link" id="pl-tests-link">Open tests</a>')}</div>`;
  bindSeg('pl-team', (v) => { PL.team = v === 'on'; drawPlayerLoad(); });
  bindSeg('pl-color', (v) => { PL.color = v; drawPlayerLoad(); });
  bindSeg('pl-view', (v) => { PL.view = v; drawPlayerLoad(); });
  bindSeg('pl-hit', (v) => { PL.hit = v; drawPlayerLoad(); });
  bindSeg('pl-spr', (v) => { PL.spr = v; drawPlayerLoad(); });
  document.getElementById('pl-tests-link').onclick = () => switchView('testing', { athlete: p.id, tab: 'profile' });
  drawZTable(s);
  drawTimeline(s);
  drawPlayerTests(p);
}

function drawZTable(s) {
  // one column per calendar week (Sunday–Saturday): the value on its Saturday, or on the last data day for the current week
  const n = s.cat.length, idx = [n - 1];
  for (let i = n - 1; i >= 0 && idx.length < 6; i--) if (dateOf(addDays(s.start, i)).getUTCDay() === 6 && i !== n - 1) idx.unshift(i);
  const head = idx.map((i) => {
    const dt = addDays(s.start, i), sat = dateOf(dt).getUTCDay() === 6;
    return `<th class="c">${sat ? 'w/e ' : ''}${fmtDay(dt, { day: 'numeric', month: 'short' })}${sat ? '' : '<small> (so far)</small>'}</th>`;
  }).join('');
  const body = METRIC_KEYS.map((k) => `<tr><td>${METRIC_SHORT[k]}</td>${idx.map((i) => {
    const z = s.z7[k][i];
    const cls = z == null ? '' : z >= 2 ? 'hz-red' : z >= 1.5 ? 'hz-orange' : z <= -2 ? 'hz-low' : '';
    return `<td class="c ${cls}">${z == null ? '·' : fmtSigned(z)}</td>`;
  }).join('')}</tr>`).join('');
  document.getElementById('pl-z').innerHTML = `<table class="dtable compact"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** His days as letters (his ask, 2026-10-19): T training, G game, R rehab (orange), I injury (red)… one column a week, Sun → Sat. */
const TL_LET = { t: ['T', '#fff', '#2a78d6'], m: ['G', '#fff', '#34c759'], b: ['B', '#fff', '#248a3d'], p: ['P', '#fff', '#7fb0ea'], c: ['C', '#0b4f6c', '#64d2ff'],
  i: ['Gy', '#1d5fae', '#b4d4f7'], r: ['R', '#fff', '#ff9f0a'], x: ['I', '#fff', '#e5484d'], s: ['S', '#fff', '#bf5af2'], n: ['N', '#fff', '#8e8e93'],
  a: ['A', '#6e6e73', '#d1d1d6'], o: ['O', '#aeaeb2', '#ececf0'] }; // the old colours (blue = training), match in green (his ask, 2026-10-19)
function drawTimeline(s) {
  // a calendar per month (Sun → Sat, his choice 2026-10-19), each day its letter in its colour
  const first = s.start, last = addDays(s.start, s.cat.length - 1), months = [];
  for (let m = first.slice(0, 7); m <= last.slice(0, 7);) { months.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; }
  const cal = (m) => {
    const [y, mo] = m.split('-').map(Number), nd = new Date(Date.UTC(y, mo, 0)).getUTCDate(), lead = dateOf(m + '-01').getUTCDay();
    let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l) => `<b class="tc-h">${l}</b>`).join('') + '<i class="tc-pad"></i>'.repeat(lead);
    for (let dd = 1; dd <= nd; dd++) {
      const x = `${m}-${String(dd).padStart(2, '0')}`, i = daysBetween(s.start, x), c = i >= 0 && i < s.cat.length ? s.cat[i] : null, L = c ? TL_LET[c] : null, info = c ? CAT_INFO[c] || CAT_INFO['-'] : null;
      cells += L ? `<i style="color:${L[1]};background:${L[2]}" title="${fmtDay(x)} · ${info[0]}${s.min[i] ? ` · ${s.min[i]} min` : ''}">${L[0]}</i>` : `<i class="tc-none" title="${fmtDay(x)}${c ? ' · no record' : ''}"></i>`;
    }
    return `<div class="tc-m"><div class="tc-t">${fmtDay(m + '-15', { month: 'long' })}</div><div class="tc-g">${cells}</div></div>`;
  };
  const used = new Set(s.cat.split(''));
  document.getElementById('pl-timeline').innerHTML = `<div class="tc">${months.map(cal).join('')}</div>
    <div class="legend-row tight">${Object.entries(TL_LET).filter(([k]) => used.has(k)).map(([k, L]) => `<span><b class="tl-k" style="color:${L[1]};background:${L[2]}">${L[0]}</b>${CAT_INFO[k][0]}</span>`).join('')}</div>`;
}

function drawPlayerTests(p) {
  const el = document.getElementById('pl-tests');
  const t = WL.tests;
  if (!t || !t.dates || !t.dates.length) { el.innerHTML = emptyState(t ? 'No test data yet.' : 'Loading…'); return; }
  const date = t.dates[0], sess = t.sessions[date];
  const a = sess.athletes.find((x) => x.id === p.id);
  el.innerHTML = a ? `<p class="panel-note">${fmtDay(date, { day: 'numeric', month: 'long', year: 'numeric' })} · z-score vs squad</p>${testZBarsHtml(a, t, sess, true)}` : emptyState('Not tested in the latest session.');
}
