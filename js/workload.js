/**
 * Workload › Squad (risk board, acute vs chronic, squad load) and Workload › Player (deep-dive).
 * Data: sync/build.py → "workload" payload (ACWR rolling 7:28 + EWMA, weekly load z-scores, monotony,
 * high-speed exposure, availability). Wellness and tests payloads are joined in for the 360° view.
 */
const WL = { data: null, wellness: null, tests: null, history: null, model: 'z', metric: 'td', rank: 'hit', player: null, int: null, week: null, weekMode: 'train', bw: 0 };
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
    ${pageHead('Workload', 'Squad', 'sq-sub', segHtml('sq-model', [['acwr', 'Rolling 7:28'], ['ewma', 'EWMA'], ['z', 'z-score']], WL.model))}
    <div class="tiles" id="sq-tiles"></div>
    <section class="panel sv-bleed">
      <div class="panel-head"><h2 class="panel-title">Risk board</h2>
        <span class="stepper sq-bstep"><button type="button" id="sq-bprev" aria-label="Previous week">‹</button><span class="month-label" id="sq-bweek"></span><button type="button" id="sq-bnext" aria-label="Next week">›</button></span>
        <span class="panel-note" id="sq-board-note"></span></div>
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
  withData('wellness_history', (d) => { WL.history = d; drawBoard(); }, () => {}); // each week's wellness
  document.getElementById('sq-bprev').onclick = () => { WL.bw++; drawBoard(); };
  document.getElementById('sq-bnext').onclick = () => { WL.bw = Math.max(0, WL.bw - 1); drawBoard(); };
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

  drawBoard();
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

/* ------------------------------------------------------------------ the risk board (his mockup A, 2026-10-26): any week
 * (Sunday → Saturday; this week = the last 7 days, as the A:C), columns by category — volume, intensity, internal, A:C —
 * each load as his z for the week (vs his previous 6 weeks, the value in the tooltip), or its A:C / EWMA ratio; Vmax of the
 * week (% of his reference) and the days since ≥ 90 % at the end of the week; the alert in words at the end (this week:
 * the alerts of the dashboard and the e-mail; an earlier week: the same rules from that week's numbers). */
const BD_GROUPS = [
  ['Volume', '#5856d6', [['minutes', 'Min'], ['td', 'TD']]],
  ['Intensity', '#ff9500', [['d15', '>15'], ['hit', 'HIT >20'], ['spr', 'Sprint m'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc+Dec'], ['vmax', 'Vmax'], ['hsv', 'Days ≥90%']]],
  ['Internal', '#ff2d55', [['srpe', 'sRPE'], ['rpe', 'RPE'], ['well', 'Wellness']]],
  ['A:C 7:28', '#8e8e93', [['ac_td', 'TD'], ['ac_hit', 'HIT'], ['ac_spr_n', 'Sprints'], ['ac_acc_dec', 'Acc+Dec'], ['mono', 'Monot.']]],
];
const BD_Z = ['minutes', 'td', 'd15', 'hit', 'spr', 'spr_n', 'acc_dec', 'srpe'];
const BD_LABEL = { minutes: 'Minutes', td: 'TD', d15: '>15', hit: 'HIT', spr: 'Sprint', spr_n: 'Sprints', acc_dec: 'Acc+Dec', srpe: 'sRPE' };

/** One player's week: values (7-day sums), z, ratios, Vmax, days since ≥ 90 %, RPE, wellness, monotony; null without data. */
function bdWeek(p, s, end, th) {
  const i = daysBetween(s.start, end);
  if (i < 6 || i >= s.cat.length) return null;
  const ser = (k) => (s.load[k] || (s.xload || {})[k]), sum = (a) => { if (!a) return null; let t = 0; for (let j = i - 6; j <= i; j++) t += a[j] || 0; return t; };
  const v = Object.fromEntries(BD_Z.map((k) => [k, sum(ser(k))]));
  const z = Object.fromEntries(BD_Z.map((k) => [k, ((s.z7[k] || (s.xz7 || {})[k]) || [])[i] ?? null]));
  const ratio = Object.fromEntries(BD_Z.map((k) => [k, WL.model === 'ewma' ? (s.ewma[k] || [])[i] ?? null : ((s.a7 || {})[k] || s.acwr[k] || [])[i] ?? null]));
  const sp = s.vmax ? s.vmax.slice(i - 6, i + 1).filter((x) => x != null) : [], vmax = sp.length ? Math.max(...sp) : null;
  const hs = (s.hsv || []).filter((x) => x <= end).pop(), hsv = hs ? daysBetween(hs, end) : null;
  const sr = (s.load.srpe || []).slice(i - 6, i + 1), mu = sr.reduce((a, b) => a + b, 0) / 7, sd = Math.sqrt(sr.reduce((a, b) => a + (b - mu) ** 2, 0) / 6);
  const hist = WL.history && WL.history.days ? WL.history.days.filter((x) => x.date > addDays(end, -7) && x.date <= end && !x.pre && x.byId[p.id] != null).map((x) => x.byId[p.id]) : [];
  const cats = s.cat.slice(i - 6, i + 1), out = cats.split('').filter((c) => 'xrsna'.includes(c)).length;
  const w = { v, z, ratio, vmax, pct: vmax && p.vmax_ref ? Math.round(100 * vmax / p.vmax_ref) : null, hsv, rpe: v.minutes ? v.srpe / v.minutes : null,
    well: hist.length ? Math.round(hist.reduce((a, b) => a + b, 0) / hist.length) : null, mono: sd > 0 ? mu / sd : null,
    ac: Object.fromEntries(['td', 'hit', 'spr_n', 'acc_dec'].map((k) => [k, ((s.a7 || {})[k] || [])[i] ?? null])), last: cats.slice(-1), out };
  // that week's alert, the dashboard's rules (Load spike, ACWR above the zone, monotony, no ≥ 90 % Vmax)
  const f = [];
  if (out < 7) {
    ['td', 'hit', 'spr', 'acc_dec', 'srpe'].forEach((k) => { const a = (s.acwr[k] || [])[i]; if (a > th.acwr_hi_red) f.push({ level: 'red', text: `ACWR ${BD_LABEL[k]} ${a.toFixed(2)}` }); else if (a > th.acwr_hi_orange) f.push({ level: 'orange', text: `ACWR ${BD_LABEL[k]} ${a.toFixed(2)}` }); });
    ['td', 'hit', 'spr', 'acc_dec', 'srpe'].forEach((k) => { const x = z[k]; if (x >= th.z_red) f.push({ level: 'red', text: `Load spike ${BD_LABEL[k]} z ${fmtSigned(x)}` }); else if (x >= th.z_orange) f.push({ level: 'orange', text: `Load spike ${BD_LABEL[k]} z ${fmtSigned(x)}` }); });
    if (w.mono >= th.monotony) f.push({ level: 'orange', text: `Monotony ${w.mono.toFixed(1)}` });
    if (hsv != null && hsv >= th.hsv_days) f.push({ level: 'orange', text: `No ≥90% Vmax for ${hsv} days` });
  }
  f.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  w.flags = f;
  return w;
}

function drawBoard() {
  const d = WL.data, board = document.getElementById('sq-board');
  if (!d || !board || document.getElementById('view-squad').hidden) return;
  const th = d.thresholds || { acwr_hi_red: 1.5, acwr_hi_orange: 1.37, z_red: 2, z_orange: 1.5, monotony: 2, hsv_days: 10 };
  const start0 = addDays(d.as_of, -dateOf(d.as_of).getUTCDay()), firstSer = Object.values(d.series).map((s) => s.start).sort()[0] || d.as_of;
  const maxBack = Math.max(0, Math.floor(daysBetween(addDays(firstSer, 6), start0) / 7));
  WL.bw = Math.min(WL.bw, maxBack);
  const now = WL.bw === 0, wStart = addDays(start0, -7 * WL.bw), end = now ? d.as_of : addDays(wStart, 6);
  document.getElementById('sq-bweek').textContent = now ? `This week · last 7 days to ${fmtDay(d.as_of, { weekday: 'short', day: 'numeric' })}` : `${fmtDay(wStart, { day: 'numeric', month: 'short' })} – ${fmtDay(end, { day: 'numeric', month: 'short' })}`;
  document.getElementById('sq-bprev').disabled = WL.bw >= maxBack;
  document.getElementById('sq-bnext').disabled = now;
  const zm = WL.model === 'z';
  document.getElementById('sq-board-note').textContent = `${zm ? 'z = the week vs his previous 6 weeks (value on hover)' : WL.model === 'ewma' ? 'EWMA ratio per metric' : 'A:C 7:28 per metric'} · training + matches · click a player`;
  const dash = '<span class="muted">—</span>';
  const zchip = (x, val) => (x == null ? dash : `<span class="mz ${tmZ(x)}" title="${val == null ? '' : fmtN(Math.round(val))}">${tmS(x)}</span>`);
  const rows = [];
  d.players.forEach((p) => {
    const s = d.series[p.id], w = s && bdWeek(p, s, end, th);
    if (!w || (!now && !w.v.minutes && w.out === 0)) return;
    const flags = now ? p.flags : w.flags, risk = now ? p.risk : w.out === 7 ? 'na' : flags.some((f) => f.level === 'red') ? 'red' : flags.length ? 'orange' : 'green';
    const status = now ? p.status : ({ x: 'injured', r: 'rehab', s: 'sick', n: 'national team', a: 'absent' }[w.last] || 'available');
    const hurt = status === 'injured' || status === 'rehab';
    const cell = (k) => {
      if (BD_Z.includes(k)) return hurt && !w.v[k] ? dash : zm ? zchip(w.z[k], w.v[k]) : w.ratio[k] != null && k !== 'minutes' && k !== 'd15' ? acwrChip(w.ratio[k]) : `<span class="num">${fmtN(Math.round(w.v[k] || 0))}</span>`;
      if (k === 'vmax') return w.vmax == null ? dash : `<span class="num">${w.vmax.toFixed(1)}</span>${w.pct ? ` <small class="muted">${w.pct}%</small>` : ''}`;
      if (k === 'hsv') return w.hsv == null ? dash : `<span class="${w.hsv >= th.hsv_days && !hurt ? 'chip-v orange' : 'num'}">${w.hsv} d</span>`;
      if (k === 'rpe') return w.rpe == null ? dash : `<span class="num">${w.rpe.toFixed(1)}</span>`;
      if (k === 'well') return w.well == null ? dash : `<span class="chip-v ${w.well >= 70 ? 'green' : w.well >= 50 ? 'orange' : 'red'}">${w.well}%</span>`;
      if (k === 'mono') return w.mono == null ? dash : `<span class="${w.mono >= th.monotony ? 'chip-v orange' : 'num'}">${w.mono.toFixed(1)}</span>`;
      const a = w.ac[k.slice(3)];
      return a == null ? dash : hurt ? `<span class="chip-v na">${a.toFixed(2)}</span>` : acwrChip(a);
    };
    const key = (k) => (BD_Z.includes(k) ? (zm ? w.z[k] : w.ratio[k] ?? w.v[k]) : k === 'vmax' ? w.vmax : k === 'hsv' ? w.hsv : k === 'rpe' ? w.rpe : k === 'well' ? w.well : k === 'mono' ? w.mono : w.ac[k.slice(3)]);
    const ks = BD_GROUPS.flatMap(([, , c]) => c.map(([k]) => k));
    rows.push({ id: p.id,
      cells: [`<i class="riskdot" style="background:${STATUS_COL[risk]}" title="${risk}"></i>`, playerCell(p.id, p.name, status === 'available' ? p.pos : `${p.pos || ''} · ${STATUS_LABEL[status] || status}`), ...ks.map(cell), flagsCompact(flags)],
      keys: [RISK_ORDER[risk] * 100 - flags.length, p.name, ...ks.map(key), flags.length] });
  });
  sortableTable(board, [{ label: 'Risk', cls: 'c' }, { label: 'Player' },
    ...BD_GROUPS.flatMap(([, , c]) => c.map(([k, l], j) => ({ label: l, cls: `c${j === 0 ? ' gsep' : ''}`, desc: k !== 'well' }))), { label: 'Alert', cls: 'gsep', desc: true }],
  rows, { col: 0, dir: 1 }, (r) => `data-id="${r.id}" class="clickable"`, '',
  [['', 2], ...BD_GROUPS.map(([l, c, cs]) => [l, cs.length, c]), ['', 1]]);
  board.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) switchView('player', { player: tr.dataset.id }); };
  if (!rows.length) board.innerHTML = '<div class="empty">No data this week.</div>';
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
const PL = { view: 'week', color: 'z', team: false, hit: 'hit', spr: 'spr', from: null, to: null }; // from / to: the Day view's dates (null = the last 5 weeks)
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

/** His matches (A and B team games he played), each with its minutes, his z vs his usual match (per 90) and the opponent. */
function plGames(B) {
  const { s, days } = B, sess = Object.fromEntries(((TR.sessions && TR.sessions.sessions) || []).map((x) => [x.date, x]));
  return days.map((x, i) => ({ x, i, c: s.cat[i], min: s.min[i] || 0 })).filter((g) => (g.c === 'm' || g.c === 'b') && g.min > 0).map((g) => {
    const se = sess[g.x], q = se ? se.players.find((r) => r.id === B.p.id) : null, ref = q && q.mdref ? q.mdref : null;
    return { ...g, se, q, ref, opp: g.c === 'b' ? 'B team' : (se && se.cycle && se.cycle.opponent) || 'Friendly', comp: g.c === 'b' ? 'B team' : (se && se.cycle && se.cycle.competition) || '' };
  });
}
function plCharts(B) {
  const { s, days, d, t, L, A } = B, z = PL.color === 'z';
  const sw = (k) => (k === 'hit' || k === 'd15' ? segHtml('pl-hit', [['hit', '> 20'], ['d15', '> 15']], PL.hit) : k === 'spr' || k === 'spr_n' ? segHtml('pl-spr', [['spr', 'Distance'], ['spr_n', 'Number']], PL.spr) : '');
  const head = (k, l, note) => `<div class="pl-ch"><h2>${l}<small>${note}</small></h2>${sw(k)}</div>`;
  const tk = (tv) => (PL.team && tv > 0 ? { lo: tv * 0.97, hi: tv * 1.03 } : {}), teamNote = PL.team ? ' · grey tick = the team' : '';
  const tval = (k, i) => (t.daily[k] && i >= 0 ? t.daily[k][i] : null), twk = (w, k) => (B.tw[w.start] && B.tw[w.start][k] != null ? B.tw[w.start][k] : null);
  const card = (inner) => `<div class="tm-card">${inner}</div>`;
  let out = '';
  if (PL.view === 'games') { // his matches only (his ask, 2026-10-23): raw or per 90 min, against his usual match
    const gs = plGames(B).slice(-Math.max(8, TM.fit || 14)), p90 = PL.g90 === 'p90', few = gs.length <= (TM.fit || 99);
    const short = (g) => (g.c === 'b' ? 'B' : g.opp.replace(/^Al[\s-]+/i, '').slice(0, 3).toUpperCase()), roomy = gs.length <= (TM.fit || 99) / 2;
    const tick = (g) => (roomy ? `${short(g)} ${fmtDay(g.x, { day: 'numeric', month: 'numeric' })}` : short(g));
    out = plKeys().map((k) => { const [l, u] = PL_LAB[k];
      return card(head(k, l, `per match${p90 ? ' · per 90 min' : ` · his minutes`}${u ? ' · ' + u : ''} · grey box = his usual match${p90 ? '' : ' for those minutes'} · colour = z per 90`) + tmChart({ title: l, dots: few, strip: 'none',
        items: gs.map((g) => { const raw = L[k] ? L[k][g.i] || 0 : 0, f = p90 ? 90 / g.min : 1, v = raw * f, r = g.ref, m = r && r.mean ? r.mean[k] : null, sd = r && r.sd ? r.sd[k] : null, sc = p90 ? 1 : g.min / 90;
          const zz = r && r.z ? r.z[k] : null, ac = A[k] ? A[k][g.i] : null;
          return { v, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], ac, lo: m != null && sd != null ? Math.max(0, (m - 0.67 * sd) * sc) : null, hi: m != null && sd != null ? (m + 0.67 * sd) * sc : null, tick: tick(g), logo: g.c === 'b' ? null : tmLogo(g.opp), label: few && v > 0 ? tmK(v) : '',
            tip: `${fmtDay(g.x)} · ${g.opp}${g.comp && g.comp !== g.opp ? ' · ' + g.comp : ''} · ${g.min}': ${fmtN(raw)}${g.min ? ` (${fmtN(raw * 90 / g.min)} per 90)` : ''}${m != null ? ` · his usual ${fmtN(m)} per 90` : ''}${zz == null ? '' : ' · z ' + tmS(zz)}` }; }) })); }).join('');
    out += card(head('', 'Minutes', 'per match') + tmChart({ title: 'Minutes', dots: few, strip: 'none', max: 110,
      items: gs.map((g) => ({ v: g.min, col: g.min >= 80 ? '#16269e' : g.min >= 45 ? '#5a7bd8' : '#aab8e8', tick: tick(g), logo: g.c === 'b' ? null : tmLogo(g.opp), label: few ? g.min : '', tip: `${fmtDay(g.x)} · ${g.opp}: ${g.min}'` })) }));
    return out;
  }
  if (PL.view === 'day') {
    const [f0, t0] = plDayRange(s, d), ds = days.filter((x) => x >= f0 && x <= t0), few = ds.length <= (TM.fit || 99);
    const dtick = (x) => (few ? fmtDay(x, { weekday: 'short', day: 'numeric' }) : dateOf(x).getUTCDay() === 0 ? fmtDay(x, { day: 'numeric', month: 'short' }) : '');
    out = plKeys().map((k) => { const [l, u] = PL_LAB[k];
      return card(head(k, l, `per day${u ? ' · ' + u : ''} · colour = ${z ? 'z vs his usual for that MD' : 'A:C 7:28'}${teamNote}`) + tmChart({ title: l, dots: ds.length <= (TM.fit || 99),
        items: ds.map((x) => { const i = daysBetween(s.start, x), v = L[k][i], zz = v > 0 ? B.dayZ(x, k) : null, ac = A[k] ? A[k][i] : null, c = s.cat[i], tv = tval(k, B.tIdx(x));
          return { v, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], ac, game: c === 'm' || c === 'b', sep: dateOf(x).getUTCDay() === 0, label: few && v > 0 ? tmK(v) : '', ...tk(tv), tick: dtick(x),
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
      return card(head(k, l, `his average week of the month${u ? ' · ' + u : ''}${teamNote}`) + tmChart({ title: l, dots: true, band: st.p25 == null ? null : [st.p25, st.p75],
        items: months.map((m) => { const x = info(m, k), zz = tmZof(x.pw, st); return { v: x.pw, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(x.ac)[0], ac: x.ac, label: tmK(x.pw), tick: lab(m), now: m === cur, soft: m === cur, ...tk(x.tpw),
          tip: `${lab(m)}: ${fmtN(x.tot)} in ${x.n} days${zz == null ? '' : ' · z ' + tmS(zz) + ' vs his weeks'}${x.ac == null ? '' : ' · average A:C ' + x.ac.toFixed(2)}${PL.team && x.tpw ? ' · team ' + fmtN(x.tpw) + ' a week' : ''}` }; }) })); }).join('');
    out += card(head('', 'Wellness', 'his average score of the month · %') + tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'none', dots: true,
      items: months.map((m) => { const v = B.wellOf(m + '-01', m + '-31'); return { v: v || 0, col: v == null ? '#aeaeb2' : tmWell(v), label: v == null ? '' : Math.round(v), tick: lab(m), now: m === cur, soft: m === cur, tip: v == null ? '' : `${lab(m)}: ${Math.round(v)} %` }; }) }));
    return out;
  }
  const ws = B.weeks.slice(-Math.max(8, TM.fit || 14));
  out = plKeys().map((k) => { const [l, u] = PL_LAB[k], st = tmStats(B.real(k).map((w) => w[k]));
    return card(head(k, l, `per week${u ? ' · ' + u : ''}${st.p25 == null ? '' : ` · his usual ${tmK(st.p25)}–${tmK(st.p75)}`}${teamNote}`) + tmChart({ title: l, dots: true, band: st.p25 == null ? null : [st.p25, st.p75],
      items: ws.map((w) => { const zz = B.zw(w, k), ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : d.as_of) : null, tv = twk(w, k);
        return { v: w[k], col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], ac, label: w[k] > 0 ? tmK(w[k]) : 'no GPS', tick: w.label, now: !w.done, soft: !w.done, go: w.start, ...tk(tv),
          tip: `${w.label} · ${fmtDay(w.start, { day: 'numeric', month: 'short' })}: ${fmtN(w[k])}${zz == null ? '' : ' · z ' + tmS(zz)}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}${PL.team && tv ? ' · team ' + fmtN(tv) : ''}` }; }) })); }).join('');
  out += card(head('', 'Wellness', 'his average score of the week · % · green band = 70 % or more') + tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'none', dots: true,
    items: ws.map((w) => { const v = B.wellOf(w.start, w.end); return { v: v || 0, col: v == null ? '#aeaeb2' : tmWell(v), label: v == null ? '' : Math.round(v), tick: w.label, now: !w.done, soft: !w.done, go: w.start, tip: v == null ? '' : `${w.label}: ${Math.round(v)} %` }; }) }));
  return out;
}

function plGamesTable(B) {
  const gs = plGames(B), K = [['td', 'Distance'], ['d15', '&gt; 15'], ['hit', '&gt; 20'], ['spr', 'Sprint dist.'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc + Dec'], ['srpe', 'sRPE']], p90 = PL.g90 === 'p90';
  const cell = (g, k) => { const raw = B.L[k] ? B.L[k][g.i] || 0 : 0, v = p90 && g.min ? raw * 90 / g.min : raw, zz = g.ref && g.ref.z ? g.ref.z[k] : null;
    return `<td class="b">${raw > 0 ? tmK(v) : '—'}</td><td>${zz == null ? '' : `<span class="mz ${tmZ(zz)}">${tmS(zz)}</span>`}</td>`; };
  const rows = gs.slice().reverse().map((g) => `<tr><td><b>${fmtDay(g.x, { weekday: 'short', day: 'numeric', month: 'short' })}</b></td><td class="l">${g.c === 'b' ? '' : crestHtml(g.opp, 18) + ' '}${escapeHtml(g.opp)}</td><td class="l">${escapeHtml(g.comp && g.comp !== g.opp ? g.comp : '')}</td><td class="b">${g.min}'</td>${K.map(([k]) => cell(g, k)).join('')}<td>${g.q && g.q.vmax ? fmtN(g.q.vmax, 1) : '—'}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Match by match</h2><span class="panel-note">${p90 ? 'per 90 minutes' : 'his raw numbers'} · z vs his usual match, per 90 (his last games) · max speed in km/h</span></div>
    <div class="table-wrap"><table class="tm-tbl tm-wide"><thead><tr><th>Date</th><th class="l">Opponent</th><th class="l">Comp.</th><th class="b">Minutes</th>${K.map(([, l]) => `<th class="b">${l}</th><th>z</th>`).join('')}<th>Max speed</th></tr></thead><tbody>${rows || '<tr><td colspan="19" class="muted">No match yet</td></tr>'}</tbody></table></div></section>`;
}

function plTable(B) {
  const { d } = B, pc = (v) => (v == null ? '—' : `<span class="tm-acchip" style="background:${v >= 100 ? '#1f7a3d' : v >= 90 ? '#34a853' : v >= 80 ? '#8ccf9f' : v >= 60 ? '#e8a33d' : '#d9534f'}">${Math.round(v)} %</span>`);
  const main = (w, k) => { const zz = B.zw(w, k), ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : d.as_of) : null;
    return `<td class="b">${w[k] > 0 ? tmK(w[k]) : '—'}</td><td>${zz == null ? '' : `<span class="mz ${tmZ(zz)}">${tmS(zz)}</span>`}</td><td class="g">${ac == null ? '' : `<span class="tm-acchip" style="background:${tmZone(ac)[0]}">${ac.toFixed(2)}</span>`}</td>`; };
  const rows = B.weeks.slice().reverse().map((w) => { const x = B.IW[w.start], o = B.wellOf(w.start, w.end);
    return `<tr class="tm-go${w.done ? '' : ' now'}" data-wk="${w.start}" tabindex="0" title="Open the detail of ${w.label}"><td><b>${w.label}</b> <span class="muted">${fmtDay(w.start, { day: 'numeric', month: 'short' })}${w.done ? '' : ' · in progress'}</span></td><td class="b">${w.train || '—'}</td><td>${w.games || '—'}</td><td>${w.min ? fmtN(w.min) : '—'}</td>
      ${main(w, 'td')}${main(w, 'hit')}${main(w, 'spr')}${main(w, 'acc_dec')}<td class="b">${x ? pc(x.td) : '—'}</td><td>${x ? pc(x.hi) : ''}</td><td class="b">${x && x.rh != null ? `<b>${x.rh}</b>${x.rx == null ? '' : ` <small class="muted">× ${x.rx.toFixed(1)}</small>`}` : '—'}</td>${main(w, 'srpe')}<td class="b">${o == null ? '—' : `<b style="color:${tmWell(o)}">${Math.round(o)} %</b>`}</td></tr>`; }).join('');
  const m3 = (l) => `<th class="b">${l}</th><th>z</th><th class="g">A:C</th>`;
  return `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Week by week</h2><span class="panel-note">z vs his other full weeks of the season · A:C 7:28 at the end of the week · WCS: his best minute of the week in training, % of his match worst case · RHIE: his bouts in the week (training + matches), × = how many of his matches it makes</span></div>
    <div class="table-wrap"><table class="tm-tbl tm-wide"><thead><tr class="grp"><th></th><th colspan="6">Volume</th><th colspan="6">Speed</th><th colspan="3">Accelerations</th><th colspan="2">WCS · best minute</th><th>RHIE</th><th colspan="4">Internal load &amp; wellness</th></tr>
      <tr><th>Week</th><th class="b">Sessions</th><th>Matches</th><th>Match min</th>${m3('Distance')}${m3('&gt; 20 km/h')}${m3('Sprint dist.')}${m3('Acc + Dec')}<th class="b">m/min</th><th>A/D + spr</th><th class="b">Bouts</th>${m3('sRPE')}<th class="b">Wellness</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/**
 * A week of the player opened (his ask, 2026-10-21): the Team page's week drawer for one player — why the week is above
 * or below his usual week, each metric as one bar cut by day (the piece = the MD of that day, in the colour of his day
 * vs his usual for that MD; a match = "G"), the make-up of his week and his days one by one. His usual week = the
 * middle half of his other full weeks of the season (as the z of the page).
 */
function plWeekOpen(start) {
  if (!WL.data || !WL.player || !WL.data.series[WL.player]) return;
  const B = plBuild(WL.player), { s, d, p } = B, asOf = d.as_of, wi = B.weeks.findIndex((x) => x.start === start);
  if (wi < 0) return;
  svEnsureDrawer();
  const W = B.weeks[wi], others = B.weeks.filter((x) => x.done && x.td > 0 && x.start !== start), ds = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const sess = Object.fromEntries(((TR.sessions && TR.sessions.sessions) || []).map((x) => [x.date, x]));
  const mine = (x) => { const se = sess[x]; return se ? se.players.find((r) => r.id === p.id) : null; };
  const ix = (x) => daysBetween(s.start, x), cat = (x) => { const i = ix(x); return i >= 0 && i < B.n ? s.cat[i] : '-'; };
  const val = (x, k) => { const i = ix(x); return i >= 0 && i < B.n && B.L[k] ? B.L[k][i] || 0 : 0; }, mins = (x) => { const i = ix(x); return i >= 0 && i < B.n ? s.min[i] || 0 : 0; };
  const kindOf = (x) => (x > asOf ? 'later' : ({ m: 'match', b: 'match', t: 'train', p: 'train', c: 'train', i: 'train', r: 'out', x: 'out', s: 'out', n: 'out', a: 'out' }[cat(x)] || 'off'));
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : w === 'match' ? 'es' : 's'}`, u1 = (v) => (v == null ? '—' : v.toFixed(1));
  // his day vs his usual for that MD (the sessions payload: z and the usual mean; a match per 90 min)
  const zDay = (x, k) => { const q = mine(x); return q && q.mdref && q.mdref.z && q.mdref.z[k] != null && val(x, k) > 0 ? { z: q.mdref.z[k], mean: (q.mdref.mean || {})[k], per90: q.mdref.per90 } : null; };
  const KS = ['td', 'd15', 'hit', 'spr', 'spr_n', 'acc_dec', 'srpe']; // speed thresholds in order
  const M = KS.map((k) => { const [l, u] = PL_LAB[k], st = tmStats(others.map((x) => x[k]).filter((v) => v > 0)); return { k, l, u, st, v: W[k] || 0, z: W.done && W[k] > 0 ? tmZof(W[k], st) : null, ac: W[k] > 0 ? B.acAt(k, W.done ? W.end : asOf) : null }; });
  const avg = (f) => (others.length ? others.reduce((a, x) => a + f(x), 0) / others.length : null);
  const nM = W.games, nT = W.train, uM = avg((x) => x.games), uT = avg((x) => x.train), nOut = ds.filter((x) => kindOf(x) === 'out').length;
  const wv = ds.map((x) => B.wh[x]).filter((v) => v != null), wAvg = wv.length ? wv.reduce((a, v) => a + v, 0) / wv.length : null;
  const wSt = tmStats(others.map((x) => B.wellOf(x.start, x.end)).filter((v) => v != null)), wZ = W.done && wAvg != null ? tmZof(wAvg, wSt) : null;

  // why: the metrics out of his usual, the make-up of his week, his days far from his usual MD, his wellness
  const out = M.filter((m) => m.z != null && Math.abs(m.z) >= 1), up = out.filter((m) => m.z > 0), dn = out.filter((m) => m.z < 0), names = (xs) => xs.map((m) => `${m.k === 'srpe' ? m.l : m.l.toLowerCase()} (${tmS(m.z)})`).join(', ');
  const head = !W.done ? `Week in progress, up to ${fmtDay(asOf, { weekday: 'long', day: 'numeric', month: 'short' })} — it is compared with his usual week once it is complete.`
    : !W.td ? 'No GPS this week.'
      : !out.length ? 'A usual week for him on every metric.'
        : [up.length ? `<b>Above</b> his usual week on ${names(up)}` : '', dn.length ? `<b>${up.length ? 'below' : 'Below'}</b> ${up.length ? '' : 'his usual week '}on ${names(dn)}` : ''].filter(Boolean).join(' · ') + '.';
  const why = [];
  const games = ds.filter((x) => kindOf(x) === 'match');
  if (games.length) why.push(`<b>${pl(games.length, 'match')}</b>: ${games.map((x) => `${fmtDay(x, { weekday: 'short', day: 'numeric' })} ${mins(x) ? mins(x) + '\'' : 'no minutes'}${cat(x) === 'b' ? ' (B team)' : ''}`).join(' · ')}${W.done && uM != null && Math.abs(nM - uM) >= 0.75 ? ` — his usual week has ${u1(uM)}` : ''}.`);
  if (W.done && uT != null && Math.abs(nT - uT) >= 1) why.push(`<b>${pl(nT, 'training day')}</b> — his usual week has ${u1(uT)}.`);
  if (nOut) why.push(`<b>${pl(nOut, 'day')}</b> not available: ${ds.filter((x) => kindOf(x) === 'out').map((x) => `${fmtDay(x, { weekday: 'short', day: 'numeric' })} ${CAT_INFO[cat(x)][0].toLowerCase()}`).join(' · ')}.`);
  const far = ds.flatMap((x) => ['td', 'hit'].map((k) => ({ x, k, r: zDay(x, k) }))).filter((y) => y.r && Math.abs(y.r.z) >= 1.5).sort((a, b) => Math.abs(b.r.z) - Math.abs(a.r.z));
  [...new Set(far.map((y) => y.x))].slice(0, 3).forEach((x) => { const ys = far.filter((y) => y.x === x), md = (sess[x] && sess[x].md) || '';
    why.push(`<b>${fmtDay(x, { weekday: 'long', day: 'numeric', month: 'short' })}${md ? ` (${escapeHtml(md)})` : ''}</b> ${ys[0].r.z > 0 ? 'above' : 'below'} his usual ${kindOf(x) === 'match' ? 'match' : escapeHtml(md || 'day')}: ${ys.map((y) => `${y.k === 'td' ? 'distance' : '> 20 km/h'} ${fmtN(val(x, y.k))}${y.r.mean != null ? ` vs ${fmtN(y.r.mean)}${y.r.per90 ? ' per 90' : ''}` : ''} (z ${tmS(y.r.z)})`).join(', ')}.`); });
  if (wZ != null && Math.abs(wZ) >= 1) why.push(`<b>Wellness ${Math.round(wAvg)} %</b> ${wZ > 0 ? 'above' : 'below'} his usual week (${Math.round(wSt.p25)}–${Math.round(wSt.p75)} %, z ${tmS(wZ)}).`);

  const mdOf = (x) => { const md = (sess[x] && sess[x].md) || ''; return kindOf(x) === 'match' ? 'G' : /^MD[+-]\d$/.test(md) ? md : ''; };
  const tag = (x, wd) => { const md = mdOf(x); return md === 'G' ? 'G' : !md ? '' : wd > 6.5 ? md : wd > 3 ? md.slice(2) : ''; };
  const bar = (m) => { const scale = Math.max(m.v, m.st.p75 || 0) * 1.12 || 1, live = ds.filter((x) => val(x, m.k) > 0); let at = 0;
    return `<div class="tw-bar">${m.st.p25 == null ? '' : `<u style="left:${(m.st.p25 / scale * 100).toFixed(2)}%;width:${((m.st.p75 - m.st.p25) / scale * 100).toFixed(2)}%" title="his usual week ${fmtN(m.st.p25)}–${fmtN(m.st.p75)}"></u>`}${live.map((x) => { const v = val(x, m.k), left = at, r = zDay(x, m.k), wd = v / scale * 100, md = mdOf(x); at += v;
      return `<i class="${x === live[live.length - 1] ? 'last' : ''}" style="left:${(left / scale * 100).toFixed(2)}%;width:${wd.toFixed(2)}%;background:${TM_ZCOL[tmZ(r ? r.z : null)]}" title="${escapeHtml(`${fmtDay(x, { weekday: 'short', day: 'numeric', month: 'short' })}${md ? ' · ' + (md === 'G' ? 'match' : md) : ''}: ${fmtN(v)}${r ? `${r.mean != null ? ` · his usual ${fmtN(r.mean)}${r.per90 ? ' per 90' : ''}` : ''} · z ${tmS(r.z)}` : ''}`)}"><span>${tag(x, wd)}</span></i>`; }).join('')}</div>`; };
  const chip = (z) => `<span class="mz ${tmZ(z)}">${z == null ? '—' : tmS(z)}</span>`;
  const rows = M.map((m) => `<div class="tw-m"><span class="n">${m.l}</span><span class="v">${tmK(m.v)}${m.u ? ` <small class="muted">${m.u}</small>` : ''}</span>${bar(m)}<span class="c">${chip(m.z)}</span><span class="u">${m.st.p25 == null ? '' : `usual ${tmK(m.st.p25)}–${tmK(m.st.p75)}`}</span><span class="c">${m.ac == null ? '—' : `<span class="tm-acchip" style="background:${tmZone(m.ac)[0]}">${m.ac.toFixed(2)}</span>`}</span></div>`).join('');
  const wRow = !wv.length && wSt.p25 == null ? '' : `<div class="tw-m"><span class="n">Wellness</span><span class="v">${wAvg == null ? '—' : Math.round(wAvg)} <small class="muted">%</small></span><div class="tw-days">${ds.map((x) => { const v = B.wh[x], md = mdOf(x);
    return `<i class="${v == null ? 'no' : ''}"${v != null ? ` style="background:${tmWell(v)}"` : ''} title="${escapeHtml(`${fmtDay(x, { weekday: 'short', day: 'numeric', month: 'short' })}${md ? ' · ' + md : ''}: ${v != null ? Math.round(v) + ' %' : 'no check-in'}`)}">${md ? `<small>${md}</small>` : ''}${v != null ? Math.round(v) : x > asOf ? '' : '–'}</i>`; }).join('')}</div><span class="c">${chip(wZ)}</span><span class="u">${wSt.p25 == null ? '' : `usual ${Math.round(wSt.p25)}–${Math.round(wSt.p75)} %`}</span><span class="c"></span></div>`;
  const cell = (x, k) => { const v = val(x, k), r = zDay(x, k); return `<td>${v > 0 ? fmtN(v) : '—'}${r ? chip(r.z) : v > 0 ? '<span class="mz na">—</span>' : ''}</td>`; };
  const short = { td: 'Distance', d15: '> 15', hit: '> 20', spr: 'Sprint dist.', spr_n: 'Sprints', acc_dec: 'Acc + Dec', srpe: 'sRPE' };
  const dayRows = ds.map((x) => { const k = kindOf(x), q = mine(x), v = B.wh[x], md = mdOf(x), c = cat(x);
    return `<tr class="${k === 'off' || k === 'later' || k === 'out' ? 'off' : ''}"><td><b>${fmtDay(x, { weekday: 'short', day: 'numeric', month: 'short' })}</b></td><td class="l">${md ? `<span class="tw-md${md === 'G' ? ' g' : ''}">${md === 'G' ? 'G · MD' : md}</span>` : ''}</td><td class="l">${k === 'later' ? 'Not yet' : c === '-' ? 'No team session' : escapeHtml(CAT_INFO[c][0])}${q && q.type && !['m', 't'].includes(c) && q.type.toLowerCase() !== CAT_INFO[c][0].toLowerCase() ? ` <small class="muted">${escapeHtml(q.type)}</small>` : ''}</td><td>${mins(x) ? mins(x) + '\'' : ''}</td><td>${q && q.rpe ? q.rpe : ''}</td>${KS.map((kk) => cell(x, kk)).join('')}<td>${v != null ? `<b style="color:${tmWell(v)}">${Math.round(v)} %</b>` : '—'}</td></tr>`; }).join('');
  const tot = `<tr class="tot"><td colspan="5">This week${W.done ? '' : ' so far'}</td>${M.map((m) => `<td>${fmtN(m.v)}${chip(m.z)}</td>`).join('')}<td>${wAvg == null ? '—' : Math.round(wAvg) + ' %'}</td></tr>
    <tr class="usu"><td colspan="5">His usual week (middle half of his ${others.length} other full weeks)</td>${M.map((m) => `<td>${m.st.p25 == null ? '—' : `${tmK(m.st.p25)}–${tmK(m.st.p75)}`}</td>`).join('')}<td></td></tr>`;
  const cls = (a, b) => (b == null || !W.done ? '' : a - b >= 0.75 ? 'hi' : b - a >= 0.75 ? 'lo' : '');
  const minG = games.reduce((a, x) => a + mins(x), 0), prev = B.weeks[wi - 1], next = B.weeks[wi + 1];
  const sheet = document.getElementById('sv-sheet');
  sheet.innerHTML = `
    <div class="tw-head"><div><div class="eb">Workload · Player · week detail</div><h3>${avatarHtml(p.id, p.name, 30)} ${escapeHtml(p.name)} · ${W.label} · ${fmtDay(W.start, { day: 'numeric', month: 'short' })} → ${fmtDay(W.end, { day: 'numeric', month: 'short', year: 'numeric' })}${W.done ? '' : ' <small>in progress</small>'}</h3>
      <p>${pl(nT, 'training day')} · ${pl(nM, 'match')}${minG ? ` (${minG}')` : ''}${nOut ? ` · ${nOut} not available` : ''}</p></div>
      <div class="sv-nav"><button type="button" data-wk="${prev ? prev.start : ''}" ${prev ? '' : 'disabled'}>‹ ${prev ? prev.label : ''}</button><button type="button" data-wk="${next ? next.start : ''}" ${next ? '' : 'disabled'}>${next ? next.label : ''} ›</button><button type="button" class="sv-x" aria-label="Close">×</button></div></div>
    <div class="tw-why"><b class="t">Why this week is where it is</b>${head}${why.length ? `<ul>${why.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
    <div class="tw-card"><h4>The week on each metric<small>the bar = his week, one piece per day: its MD, in the colour of his day vs his usual for that MD · between the two black lines = his usual week · G = match</small></h4>
      <div class="tw-scroll"><div class="tw-m h"><span>Metric</span><span class="r">Week</span><span>MD by MD</span><span class="c">z</span><span>His usual week</span><span class="c">A:C ${W.done ? 'end' : 'now'}</span></div>${rows}${wRow}</div>
      ${wRow ? '<p class="tw-note">Wellness: one cell per morning, Sunday to Saturday — his score, green 70 % or more · orange 50–70 · red under 50; the week = the average of his mornings.</p>' : ''}</div>
    <div class="tw-card"><h4>Make-up of the week<small>compared with his other full weeks of the season</small></h4><div class="tw-mk">
      <div class="${cls(nM, uM)}"><span>Matches</span><b>${nM}</b><em>usual ${u1(uM)}${minG ? ` · ${minG}'` : ''}</em></div><div class="${cls(nT, uT)}"><span>Training days</span><b>${nT}</b><em>usual ${u1(uT)}</em></div>
      <div><span>Not available</span><b>${nOut}</b><em>injury, rehab, sick, national team, absent</em></div><div><span>Wellness</span><b>${wAvg == null ? '—' : Math.round(wAvg) + ' %'}</b><em>${pl(wv.length, 'morning')}</em></div></div></div>
    <div class="tw-card"><h4>Day by day<small>his load · chip = z vs his usual for that MD (a match: vs his usual match, per 90)</small></h4>
      <div class="table-wrap"><table class="tw-dt"><thead><tr><th>Day</th><th class="l">MD</th><th class="l">Session</th><th>Time</th><th>RPE</th>${KS.map((k) => `<th>${short[k]}</th>`).join('')}<th>Wellness</th></tr></thead><tbody>${dayRows}${tot}</tbody></table></div></div>`;
  const dr = document.getElementById('sv-drawer'), wasHidden = dr.hidden;
  dr.hidden = false;
  document.getElementById('sv-dim').hidden = false;
  document.body.classList.add('sv-noscroll');
  if (wasHidden) dr.scrollTop = 0;
  sheet.querySelector('.sv-x').onclick = svClose;
  sheet.querySelectorAll('[data-wk]').forEach((b) => { b.onclick = () => { if (b.dataset.wk) plWeekOpen(b.dataset.wk); }; });
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
    <div class="grid2">${box('Weekly load z-score', 'Sunday–Saturday weeks vs his previous 6 weeks', '<div class="table-wrap" id="pl-z"></div>')}${box(`Availability · last ${s.cat.length} days`, '', '<div id="pl-timeline"></div>')}</div>
    <div class="tm-bar"><div class="tm-dates${PL.view === 'day' ? '' : ' muted'}">${PL.view === 'day' ? `<label>From <input type="date" id="pl-from" min="${s.start}" max="${d.as_of}" value="${plDayRange(s, d)[0]}"></label><label>to <input type="date" id="pl-to" min="${s.start}" max="${d.as_of}" value="${plDayRange(s, d)[1]}"></label>${PL.from ? '<button type="button" class="linkbtn" id="pl-reset">Reset</button>' : ''}` : PL.view === 'week' ? 'The last weeks' : PL.view === 'games' ? 'His last matches' : 'The season'}</div>
      <div class="tm-ctl">${PL.view === 'games' ? segHtml('pl-g90', [['raw', 'Raw'], ['p90', 'Per 90']], PL.g90 || 'raw') : `<span class="tm-lab">Team</span>${segHtml('pl-team', [['off', 'Off'], ['on', 'Show']], PL.team ? 'on' : 'off')}`}<span class="tm-lab">Colour</span>${segHtml('pl-color', [['z', 'z-score'], ['ac', 'A:C']], PL.color)}${segHtml('pl-view', [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['games', 'Games']], PL.view)}</div></div>
    <div class="tm-legend">${legend}<span>G = match</span>${PL.view === 'week' ? '<span>click a week: its detail day by day</span>' : ''}${PL.team ? '<span><i style="background:#6b6b70"></i>the team</span>' : ''}</div>
    <div class="tm-grid${PL.team && PL.view !== 'games' ? ' pl-team' : ''}">${plCharts(B)}</div>
    ${PL.view === 'games' ? plGamesTable(B) : plTable(B)}
    <div class="grid2">${box('Match references', p.top3_src === 'own' ? `top 3 of his last ${p.top3_n} games ≥ 70 min (A + B, at most since last season), extra time left out` : `no game of 70 min yet — ${p.top3_src} reference`, plRefs(B))}${box('Physical tests', '', '<div id="pl-tests"></div>', '<a class="link" id="pl-tests-link">Open tests</a>')}</div>`;
  if (document.getElementById('pl-team')) bindSeg('pl-team', (v) => { PL.team = v === 'on'; drawPlayerLoad(); });
  if (document.getElementById('pl-g90')) bindSeg('pl-g90', (v) => { PL.g90 = v; drawPlayerLoad(); }); // Games: raw or per 90
  bindSeg('pl-color', (v) => { PL.color = v; drawPlayerLoad(); });
  bindSeg('pl-view', (v) => { PL.view = v; drawPlayerLoad(); });
  ['from', 'to'].forEach((f) => { const el = document.getElementById('pl-' + f); if (el) el.onchange = () => { if (!el.value) return; const [a, b] = plDayRange(s, d); PL.from = a; PL.to = b; PL[f] = el.value; if (PL.from > PL.to) PL[f === 'from' ? 'to' : 'from'] = el.value; drawPlayerLoad(); }; });
  if (document.getElementById('pl-reset')) document.getElementById('pl-reset').onclick = () => { PL.from = PL.to = null; drawPlayerLoad(); };
  bindSeg('pl-hit', (v) => { PL.hit = v; drawPlayerLoad(); });
  bindSeg('pl-spr', (v) => { PL.spr = v; drawPlayerLoad(); });
  document.getElementById('pl-tests-link').onclick = () => switchView('testing', { athlete: p.id, tab: 'profile' });
  body.querySelectorAll('[data-wk]').forEach((el) => { el.onclick = () => plWeekOpen(el.dataset.wk); el.onkeydown = (e) => { if (e.key === 'Enter') plWeekOpen(el.dataset.wk); }; }); // a week: its detail day by day
  drawZTable(s);
  drawTimeline(s);
  drawPlayerTests(p);
}

/** The Day view's dates: his choice (From / to), else the last 5 weeks — within his series. */
function plDayRange(s, d) {
  const lo = s.start, hi = d.as_of, clamp = (x) => (x < lo ? lo : x > hi ? hi : x);
  return PL.from ? [clamp(PL.from), clamp(PL.to || hi)] : [clamp(addDays(hi, -34)), hi];
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
/** His availability (his ask, 2026-10-19): the team's days (training, games — off days and days without record left out)
 * that he was not injured, in rehab or sick. Absent / not selected and national team count as available. */
function av(cats) {
  const n = {}; cats.forEach((c) => { n[c] = (n[c] || 0) + 1; });
  const days = cats.filter((c) => c !== 'o' && c !== '-').length, out = (n.x || 0) + (n.r || 0) + (n.s || 0);
  return { days, out, n, pct: days ? Math.round(100 * (days - out) / days) : null };
}
const avCol = (p) => (p >= 90 ? '#1f7a3d' : p >= 75 ? '#ff9f0a' : '#e5484d');
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
    const a = av(s.cat.split('').filter((_, i) => addDays(s.start, i).startsWith(m)));
    return `<div class="tc-m"><div class="tc-t">${fmtDay(m + '-15', { month: 'long' })}${a.pct == null ? '' : ` <span style="color:${avCol(a.pct)}">${a.pct} %</span>`}</div><div class="tc-g">${cells}</div></div>`;
  };
  const used = new Set(s.cat.split('')), all = av(s.cat.split(''));
  const sum = all.pct == null ? '' : `<div class="tc-av"><b style="color:${avCol(all.pct)}">${all.pct} %</b><span>available · ${all.days - all.out} of ${all.days} team days${all.out ? ` · out ${[['x', 'injury'], ['r', 'rehab'], ['s', 'sick']].filter(([k]) => all.n[k]).map(([k, l]) => `${all.n[k]} ${l}`).join(' · ')}` : ''}</span></div>`;
  document.getElementById('pl-timeline').innerHTML = `${sum}<div class="tc">${months.map(cal).join('')}</div>
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
