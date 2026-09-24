/**
 * Workload › Squad (risk board, acute vs chronic, squad load) and Workload › Player (deep-dive).
 * Data: sync/build.py → "workload" payload (ACWR rolling 7:28 + EWMA, weekly load z-scores, monotony,
 * high-speed exposure, availability). Wellness and tests payloads are joined in for the 360° view.
 */
const WL = { data: null, wellness: null, tests: null, model: 'acwr', metric: 'td', player: null, plMetric: 'td', plModel: 'acwr' };
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
    <div class="panel-head bare"><h2 class="panel-title">Load by metric</h2>${segHtml('sq-metric', METRIC_KEYS.map((k) => [k, METRIC_SHORT[k]]), WL.metric)}</div>
    <div class="grid2">
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title small">Acute vs chronic</h2><span class="panel-note">rolling averages per day</span></div>
        <div class="chart" id="sq-scatter"></div>
        <p class="panel-foot">Dashed lines: ACWR 0.8 · 1.3 · 1.5. Shaded wedge: 0.8–1.3.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title small">Squad weekly load</h2><span class="panel-note">average available player · weeks start Sunday</span></div>
        <div class="chart" id="sq-weekly"></div>
        <div class="panel-head"><h2 class="panel-title small">Squad ACWR · rolling 7:28</h2></div>
        <div class="chart" id="sq-team-acwr"></div>
      </section>
    </div>
    <div class="legend-row">
      <span><i style="background:${STATUS_COL.green}"></i>ACWR 0.8–1.3</span>
      <span><i style="background:${STATUS_COL.orange}"></i>1.3–1.5 or &lt;0.8 (underload)</span>
      <span><i style="background:${STATUS_COL.red}"></i>&gt;1.5 · spike z ≥ 2</span>
    </div>`;
  bindSeg('sq-model', (v) => { WL.model = v; drawSquad(); });
  bindSeg('sq-metric', (v) => { WL.metric = v; drawSquad(); });
  withData('workload', (d) => { WL.data = d; drawSquad(); }, (err) => { root.innerHTML = loadError(err); });
  withData('wellness', (d) => { WL.wellness = d; drawSquad(); }, () => {});
}

function drawSquad() {
  const d = WL.data;
  if (!d || document.getElementById('view-squad').hidden) return;
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
    <div class="tile"><div class="tile-label">Squad ACWR</div>
      <div class="tile-value chips">${['td', 'hit', 'spr'].map((k) => `<span><small>${METRIC_SHORT[k]}</small>${acwrChip(d.team.acwr_now[k])}</span>`).join('')}</div>
      <div class="tile-sub">rolling 7:28 on the average available player</div></div>
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

  const k = WL.metric;
  const pts = ps.filter((p) => p.status === 'available' && p.chronic[k] > 0).map((p) => {
    const lv = acwrLevel(p.acwr[k]);
    return { id: p.id, x: p.chronic[k], y: p.acute[k], label: p.name, color: STATUS_COL[lv === 'low' ? 'orange' : lv] || STATUS_COL.na, showLabel: p.acwr[k] > 1.3 || p.acwr[k] < 0.6, r: p.acwr[k] };
  });
  chScatter(document.getElementById('sq-scatter'), {
    points: pts, height: 300, rays: [{ r: 0.8, color: '#ff9f0a', label: '0.8' }, { r: 1.3, color: '#ff9f0a', label: '1.3' }, { r: 1.5, color: '#ff3b30', label: '1.5' }],
    zone: { from: 0.8, to: 1.3, color: STATUS_COL.green },
    xLabel: `Chronic · 28-day avg ${METRIC_UNIT[k]}`, yLabel: `Acute · 7-day avg ${METRIC_UNIT[k]}`,
    tip: (p) => `<b>${escapeHtml(p.label)}</b><span>ACWR ${p.r.toFixed(2)} · acute ${fmtN(p.y)} · chronic ${fmtN(p.x)}</span>`,
    onClick: (p) => switchView('player', { player: p.id }),
  });
  chXY(document.getElementById('sq-weekly'), {
    x: weeks.map((w) => w.start), height: 190,
    bars: { values: weeks.map((w) => w[k]), color: (v, i) => (weeks[i].days < 7 ? 'rgba(42,120,214,.45)' : 'var(--accent)') },
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => `<b>${fmtN(weeks[i][k])} ${METRIC_UNIT[k]}</b><span>Week of ${fmtDay(weeks[i].start, { day: 'numeric', month: 'short' })}${weeks[i].days < 7 ? ` · ${weeks[i].days} days so far` : ''}</span>`,
  });
  const tdates = d.team.acwr[k].map((_, i) => addDays(d.team.start, i));
  const tv = d.team.acwr[k];
  chXY(document.getElementById('sq-team-acwr'), {
    x: tdates, height: 170, yMin: 0, yMax: 2.5, bands: ACWR_BANDS,
    lines: [{ values: tv, color: 'var(--ink)' }],
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => `<b>${tv[i] == null ? '—' : tv[i].toFixed(2)}</b><span>${fmtDay(tdates[i])}</span>`,
  });
}

// ------------------------------------------------------------------ Player
function renderPlayerLoad(opts) {
  if (opts && opts.player) WL.player = opts.player;
  const root = document.getElementById('view-player');
  root.innerHTML = `
    ${pageHead('Workload', 'Player', 'pl-sub', `<div class="picker"><span id="pl-avatar"></span><select class="select" id="pl-select" aria-label="Player"></select></div>`)}
    <div id="pl-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  withData('workload', (d) => { WL.data = d; drawPlayerLoad(); }, (err) => { root.innerHTML = loadError(err); });
  withData('wellness', (d) => { WL.wellness = d; drawPlayerLoad(); }, () => {});
  withData('tests', (d) => { WL.tests = d; drawPlayerLoad(); }, () => {});
}

function drawPlayerLoad(opts) {
  if (opts && opts.player) WL.player = opts.player;
  const d = WL.data;
  if (!d || document.getElementById('view-player').hidden) return;
  const players = d.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!WL.player || !d.series[WL.player]) WL.player = (players.find((p) => p.risk === 'red') || players[0]).id;
  const sel = document.getElementById('pl-select');
  if (sel.options.length !== players.length) {
    sel.innerHTML = players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    sel.onchange = () => { WL.player = sel.value; drawPlayerLoad(); };
  }
  sel.value = WL.player;
  const p = d.players.find((x) => x.id === WL.player), s = d.series[WL.player];
  document.getElementById('pl-avatar').innerHTML = avatarHtml(p.id, p.name, 34);
  document.getElementById('pl-sub').innerHTML = `${escapeHtml(p.pos || '')} · ${STATUS_LABEL[p.status]}${p.today ? ` · today: ${escapeHtml(p.today)}` : ''} · data up to ${fmtDay(d.as_of, { day: 'numeric', month: 'short' })}`;

  const w = WL.wellness && WL.wellness.byId ? WL.wellness.byId[p.id] : null;
  document.getElementById('pl-body').innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="tile-label">ACWR · rolling 7:28</div><div class="tile-value chips">${METRIC_KEYS.map((k) => `<span><small>${METRIC_SHORT[k]}</small>${acwrChip(p.acwr[k])}</span>`).join('')}</div>
        <div class="tile-sub">EWMA: ${METRIC_KEYS.map((k) => `${METRIC_SHORT[k]} ${p.ewma[k] == null ? '—' : p.ewma[k].toFixed(2)}`).join(' · ')}</div></div>
      <div class="tile"><div class="tile-label">Load spike (weekly z)</div><div class="tile-value">${spikeHtml(maxSpike(p))}</div>
        <div class="tile-sub">${METRIC_KEYS.map((k) => `${METRIC_SHORT[k]} ${fmtSigned(p.z7[k])}`).join(' · ')}</div></div>
      <div class="tile"><div class="tile-label">Monotony · strain</div><div class="tile-value">${p.monotony == null ? '—' : p.monotony.toFixed(2)}<small> · ${fmtN(p.strain)}</small></div>
        <div class="tile-sub">sRPE, last 7 days (Foster) · flag ≥ 2.0</div></div>
      <div class="tile"><div class="tile-label">High-speed exposure</div><div class="tile-value">${p.days_hsv == null ? '—' : p.days_hsv}<small> days</small></div>
        <div class="tile-sub">since ≥90% of Vmax · Vmax ${fmtN(p.vmax_ref, 1)} km/h (180 d)</div></div>
      <div class="tile"><div class="tile-label">Last 28 days</div><div class="tile-value">${p.sessions_28}<small> sessions · </small>${p.matches_28}<small> matches</small></div>
        <div class="tile-sub">${fmtN(p.minutes_28)} match min · ${p.injury_days_season} injury/rehab days this season</div></div>
      <div class="tile"><div class="tile-label">Wellness today</div><div class="tile-value">${w && w.score != null ? `<span class="chip-v ${w.status}">${w.score}%</span>` : '—'}</div>
        <div class="tile-sub">${w && w.worst && w.status !== 'green' ? `lowest: ${escapeHtml(w.worst.label)} ${w.worst.value}/5` : w && w.score != null ? 'no item flagged' : 'no check-in today'}</div></div>
    </div>
    ${p.flags.length ? `<div class="panel flags-panel">${flagsHtml(p.flags)}</div>` : ''}
    <div class="panel-head bare"><h2 class="panel-title">Load</h2>${segHtml('pl-metric', METRIC_KEYS.map((k) => [k, METRIC_SHORT[k]]), WL.plMetric)}</div>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small" id="pl-load-title"></h2>
        <span class="legend-inline"><span><i style="background:#9fc2ee"></i>training</span><span><i style="background:#2a78d6"></i>match</span><span><i class="ln" style="background:var(--ink)"></i>acute 7 d</span><span><i class="ln" style="background:#8e8e93"></i>chronic 28 d</span></span></div>
      <div class="chart" id="pl-load"></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">ACWR</h2>
        <span class="legend-inline"><span><i class="ln" style="background:var(--ink)"></i>player</span><span><i class="ln dash"></i>squad</span></span>
        ${segHtml('pl-model', [['acwr', 'Rolling 7:28'], ['ewma', 'EWMA']], WL.plModel)}</div>
      <div class="chart" id="pl-acwr"></div>
    </section>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Weekly load z-score</h2><span class="panel-note">vs the player's previous 6 weeks · end of each week</span></div>
        <div class="table-wrap" id="pl-z"></div></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Availability · last ${s.cat.length} days</h2></div>
        <div id="pl-timeline"></div></section>
    </div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Match demands · per 90 min</h2><span class="panel-note">${p.match_ref_n ? `median of last ${p.match_ref_n} matches ≥60 min` : 'no recent full match — positional reference'}</span></div>
        <div class="kv">${METRIC_KEYS.map((k) => `<div><span>${METRIC_LONG[k]}</span><b>${fmtN(p.match_ref[k])} <small>${METRIC_UNIT[k]}</small></b></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Physical tests</h2><a class="link" id="pl-tests-link">Open tests</a></div>
        <div id="pl-tests"></div></section>
    </div>`;
  bindSeg('pl-metric', (v) => { WL.plMetric = v; drawPlayerCharts(p, s); });
  bindSeg('pl-model', (v) => { WL.plModel = v; drawPlayerCharts(p, s); });
  document.getElementById('pl-tests-link').onclick = () => switchView('testing', { athlete: p.id, tab: 'profile' });
  drawPlayerCharts(p, s);
  drawZTable(s);
  drawTimeline(s);
  drawPlayerTests(p);
}

function drawPlayerCharts(p, s) {
  const k = WL.plMetric, n = s.cat.length;
  const dates = Array.from({ length: n }, (_, i) => addDays(s.start, i));
  document.getElementById('pl-load-title').textContent = `${METRIC_LONG[k]}${METRIC_UNIT[k] ? ` (${METRIC_UNIT[k]})` : ''} · daily`;
  chXY(document.getElementById('pl-load'), {
    x: dates, height: 230,
    bars: { values: s.load[k], color: (v, i) => (s.cat[i] === 'm' ? '#2a78d6' : '#9fc2ee') },
    lines: [{ values: s.acute[k], color: 'var(--ink)', width: 2 }, { values: s.chronic[k], color: '#8e8e93', width: 2, dash: '5 4' }],
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => `<b>${fmtN(s.load[k][i])} ${METRIC_UNIT[k]}</b><span>${fmtDay(dates[i])} · ${CAT_INFO[s.cat[i]] ? CAT_INFO[s.cat[i]][0] : ''}${s.min[i] ? ` · ${s.min[i]} min` : ''}</span><span>acute ${fmtN(s.acute[k][i])} · chronic ${fmtN(s.chronic[k][i])}</span>`,
  });
  const vals = (WL.plModel === 'ewma' ? s.ewma : s.acwr)[k].map((v, i) => (s.cat[i] === 'x' || s.cat[i] === 'r' ? null : v)); // meaningless while injured
  const team = WL.data.team;
  const off = daysBetween(team.start, s.start);
  const squad = dates.map((_, i) => team.acwr[k][i + off] ?? null);
  chXY(document.getElementById('pl-acwr'), {
    x: dates, height: 200, yMin: 0, yMax: 2.5, bands: ACWR_BANDS,
    lines: [{ values: squad, color: '#8e8e93', width: 1.5, dash: '4 3' }, { values: vals, color: 'var(--ink)', width: 2.2 }],
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => `<b>${vals[i] == null ? '—' : vals[i].toFixed(2)}</b><span>${fmtDay(dates[i])} · squad ${squad[i] == null ? '—' : squad[i].toFixed(2)}</span>`,
  });
}

function drawZTable(s) {
  const n = s.cat.length, idx = [];
  for (let i = n - 1; i >= 0 && idx.length < 8; i -= 7) idx.unshift(i);
  const head = idx.map((i) => `<th class="c">${fmtDay(addDays(s.start, i), { day: 'numeric', month: 'short' })}</th>`).join('');
  const body = METRIC_KEYS.map((k) => `<tr><td>${METRIC_SHORT[k]}</td>${idx.map((i) => {
    const z = s.z7[k][i];
    const cls = z == null ? '' : z >= 2 ? 'hz-red' : z >= 1.5 ? 'hz-orange' : z <= -2 ? 'hz-low' : '';
    return `<td class="c ${cls}">${z == null ? '·' : fmtSigned(z)}</td>`;
  }).join('')}</tr>`).join('');
  document.getElementById('pl-z').innerHTML = `<table class="dtable compact"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function drawTimeline(s) {
  const lead = dateOf(s.start).getUTCDay(); // grid rows are Sun..Sat
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<i class="tl-pad"></i>');
  for (let i = 0; i < s.cat.length; i++) {
    const c = s.cat[i], info = CAT_INFO[c] || CAT_INFO['-'];
    cells.push(`<i style="background:${info[1]}" title="${fmtDay(addDays(s.start, i))} · ${info[0]}${s.min[i] ? ` · ${s.min[i]} min` : ''}"></i>`);
  }
  const used = new Set(s.cat.split(''));
  document.getElementById('pl-timeline').innerHTML = `<div class="tl">${cells.join('')}</div>
    <div class="legend-row tight">${Object.entries(CAT_INFO).filter(([k]) => used.has(k) && k !== '-').map(([, [l, c]]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
}

function drawPlayerTests(p) {
  const el = document.getElementById('pl-tests');
  const t = WL.tests;
  if (!t || !t.dates || !t.dates.length) { el.innerHTML = emptyState(t ? 'No test data yet.' : 'Loading…'); return; }
  const date = t.dates[0], sess = t.sessions[date];
  const a = sess.athletes.find((x) => x.id === p.id);
  el.innerHTML = a ? `<p class="panel-note">${fmtDay(date, { day: 'numeric', month: 'long', year: 'numeric' })} · z-score vs squad</p>${testZBarsHtml(a, t, sess, true)}` : emptyState('Not tested in the latest session.');
}
