/**
 * Training › Sessions (session review: objectives compliance, players vs squad, drills) and
 * Training › Objectives (targets by microcycle type from the club's own history + upcoming week plan).
 * Data: sync/build.py → "sessions" and "objectives" payloads.
 */
const TR = { sessions: null, obj: null, date: null, type: 'normal', mode: 'bars', mdz: 'td', week: null, weekMode: 'train' };
const TYPE_LABEL = { short: 'Short', normal: 'Normal', long: 'Long' };
const OBJ_METRICS = ['td', 'hit', 'spr', 'acc_dec', 'srpe'];

function objectiveFor(obj, type, tag) {
  return obj && type && tag && obj.table[type] ? obj.table[type][tag] || null : null;
}
function complianceOf(v, cell) {
  if (v == null || !cell || cell.p25 == null) return null;
  return v < cell.p25 ? 'below' : v > cell.p75 ? 'above' : 'on';
}
const COMPLIANCE = { on: ['On target', STATUS_COL.green], above: ['Above', STATUS_COL.orange], below: ['Below', STATUS_COL.orange] };

/** Bullet bar: interquartile target band, median tick, actual marker. */
function bulletHtml(label, unit, actual, cell) {
  const max = Math.max(cell.p75 * 1.35, (actual || 0) * 1.08, 1);
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const c = complianceOf(actual, cell);
  return `<div class="bullet">
    <div class="bl-head"><span>${label}</span><span class="bl-val">${fmtN(actual)} <small>${unit}</small>${c ? ` <em style="color:${COMPLIANCE[c][1]}">${COMPLIANCE[c][0]}</em>` : ''}</span></div>
    <div class="bl-track"><span class="bl-range" style="left:${pct(cell.p25)}%;width:${pct(cell.p75) - pct(cell.p25)}%"></span>
      <span class="bl-med" style="left:${pct(cell.med)}%"></span>${actual != null ? `<span class="bl-act" style="left:${pct(actual)}%"></span>` : ''}</div>
    <div class="bl-foot">target ${fmtN(cell.p25)}–${fmtN(cell.p75)} · median ${fmtN(cell.med)}${cell.pct != null ? ` · ${cell.pct}% of match` : ''}</div></div>`;
}

// ------------------------------------------------------------------ Sessions
function renderSessions(opts) {
  if (opts && opts.date) TR.date = opts.date;
  const root = document.getElementById('view-sessions');
  root.innerHTML = `
    ${pageHead('Training', 'Sessions', 'se-sub', `<div class="stepper"><button type="button" id="se-prev" aria-label="Previous session">‹</button><select class="select" id="se-pick" aria-label="Session"></select><button type="button" id="se-next" aria-label="Next session">›</button></div>`)}
    <div id="se-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  withData('sessions', (d) => { TR.sessions = d; drawSessions(); }, (err) => { root.innerHTML = loadError(err); });
  withData('objectives', (d) => { TR.obj = d; drawSessions(); }, () => {});
}

function sessionLabel(s) {
  const kind = s.kind === 'match' ? `Match${s.cycle.opponent ? ' · ' + s.cycle.opponent : ''}` : s.md || 'Training';
  return `${fmtDay(s.date)} · ${kind}`;
}

function drawSessions(opts) {
  if (opts && opts.date) TR.date = opts.date;
  const d = TR.sessions;
  if (!d || document.getElementById('view-sessions').hidden) return;
  const list = d.sessions;
  if (!list.length) { document.getElementById('se-body').innerHTML = '<div class="panel"><div class="empty">No session this season yet.</div></div>'; return; }
  let idx = list.findIndex((s) => s.date === TR.date);
  if (idx < 0) { idx = 0; TR.date = list[0].date; }
  const pick = document.getElementById('se-pick');
  if (pick.options.length !== list.length) pick.innerHTML = list.map((s) => `<option value="${s.date}">${escapeHtml(sessionLabel(s))}</option>`).join('');
  pick.value = TR.date;
  pick.onchange = () => { TR.date = pick.value; drawSessions(); };
  document.getElementById('se-prev').onclick = () => { if (idx < list.length - 1) { TR.date = list[idx + 1].date; drawSessions(); } };
  document.getElementById('se-next').onclick = () => { if (idx > 0) { TR.date = list[idx - 1].date; drawSessions(); } };
  document.getElementById('se-prev').disabled = idx >= list.length - 1;
  document.getElementById('se-next').disabled = idx <= 0;
  const s = list[idx];
  document.getElementById('se-sub').textContent = `${list.length} sessions since the start of the season · ${fmtUpdated(d.generated_at)}`;

  const cyc = s.cycle;
  const cycText = cyc.type ? `${TYPE_LABEL[cyc.type]} microcycle · ${cyc.length} days` : cyc.length ? `${cyc.length}-day gap` : 'Outside a microcycle';
  const obj = s.kind === 'training' ? objectiveFor(TR.obj, cyc.type, s.md) : null;
  const t = s.team;
  const body = document.getElementById('se-body');
  body.innerHTML = `
    <section class="panel sess-head">
      <div class="sh-date">${fmtDay(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div class="sh-tags">
        <span class="tag ${s.kind === 'match' ? 'strong' : ''}">${s.kind === 'match' ? 'Match' : 'Training'}</span>
        ${s.md ? `<span class="tag">${s.md}</span>` : ''}
        <span class="tag">${cycText}</span>
        ${cyc.competition ? `<span class="tag">${escapeHtml(cyc.competition)}${cyc.opponent ? ' · ' + escapeHtml(cyc.opponent) : ''}</span>` : ''}
      </div>
      <div class="sh-meta">${fmtN(s.minutes)} min · ${s.n} players${s.n_core !== s.n ? ` · team averages on ${s.n_core} ${s.kind === 'match' ? 'players ≥60 min' : 'full-session players'}` : ''}</div>
    </section>
    <div class="tiles">
      ${[['td', 'Total distance', 'm'], ['d15', 'Distance > 15 km/h', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE load', 'AU']].map(([k, l, u]) => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${fmtN(t[k])}<small> ${u}</small></div><div class="tile-sub">team average${s.team_p3 && s.team_p3[k] != null ? ` · <b>${s.team_p3[k]}%</b> of top-3 match` : ''}</div></div>`).join('')}
      <div class="tile"><div class="tile-label">Intensity</div><div class="tile-value">${fmtN(t.mpm)}<small> m/min</small></div><div class="tile-sub">max speed ${fmtN(t.vmax, 1)} km/h (avg) · ${fmtN(t.hit_n)} efforts >20 · ${fmtN(t.spr_n)} sprints</div></div>
    </div>
    <div class="panel-head bare"><h2 class="panel-title">Who did the most</h2>
      <span class="legend-inline"><span><i style="background:var(--accent)"></i>above team average</span><span><i style="background:#9fc2ee"></i>below</span><span><i class="ln dash"></i>team average</span><span>% = of his top-3 match</span></span></div>
    <div class="boards" id="se-boards">${SESSION_BOARDS.map((b) => boardHtml(s, b)).join('')}</div>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">vs his usual for this day</h2>${s.mdref ? segHtml('se-mdz-metric', MDZ_METRICS.map(([k, l]) => [k, l]).concat([['all', 'All metrics']]), TR.mdz) : ''}</div>
      <p class="note" id="se-mdz-note"></p>
      <div id="se-mdz"></div>
    </section>
    ${obj ? `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Objectives · ${s.md} of a ${TYPE_LABEL[cyc.type].toLowerCase()} microcycle</h2><span class="panel-note">from ${obj.n} similar sessions since ${fmtDay(TR.obj.since, { month: 'short', year: 'numeric' })}</span></div>
      <div class="bullets">${OBJ_METRICS.map((k) => bulletHtml(METRIC_LONG[k], METRIC_UNIT[k], t[k], obj[k])).join('')}${bulletHtml('Duration', 'min', s.minutes, obj.minutes)}</div></section>`
      : s.kind === 'training' ? `<section class="panel"><p class="note">No objective for this day${cyc.type ? '' : ' — it is outside a standard microcycle (break or pre-season)'}${s.md && cyc.type ? ` — not enough ${s.md} sessions in ${cyc.type} microcycles` : ''}.</p></section>` : ''}
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Players</h2>
        <span class="panel-note">grouped by position · click a column to sort</span>${segHtml('se-mode', [['bars', 'Data bars'], ['z', 'z vs session'], ...(s.mdref ? [['mdz', `z vs usual ${s.md}`]] : [])], s.mdref || TR.mode !== 'mdz' ? TR.mode : 'bars')}</div>
      <div class="table-wrap" id="se-players"></div>
      ${s.absent.length ? `<p class="panel-foot"><b>Not in the session:</b> ${s.absent.map((a) => `${escapeHtml(playerName(a.id))} <span class="muted">(${escapeHtml(a.type)})</span>`).join(', ')}</p>` : ''}
    </section>
    ${s.drills.length ? `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Drills</h2><span class="panel-note">team average per drill · "vs match" = per-minute intensity as % of the players' match intensity · tap a drill for players</span></div><div class="drills-wrap" id="se-drills"></div></section>` : ''}`;

  bindSeg('se-mode', (v) => { TR.mode = v; drawSessionPlayers(s); });
  if (s.mdref) bindSeg('se-mdz-metric', (v) => { TR.mdz = v; drawMdz(s); });
  drawMdz(s);
  document.getElementById('se-mdz').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) switchView('player', { player: r.dataset.id }); };
  document.getElementById('se-boards').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) switchView('player', { player: r.dataset.id }); };
  drawSessionPlayers(s);
  if (s.drills.length) drawDrills(s);
}

const MDZ_METRICS = [['td', 'TD'], ['d15', '>15'], ['hit', '>20'], ['spr', '>25'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc+Dec'], ['srpe', 'sRPE']];
const MDZ_UNIT = { td: 'm', d15: 'm', hit: 'm', spr: 'm', spr_n: '', acc_dec: '', srpe: 'AU' };

/** z-score of each player vs his own past sessions with the same MD tag in the same microcycle type. */
function drawMdz(s) {
  const note = document.getElementById('se-mdz-note'), mount = document.getElementById('se-mdz');
  const ref = s.mdref;
  if (!ref) {
    note.textContent = 'No reference for this day: it is outside a standard microcycle (break or pre-season), or there is no comparable history yet.';
    mount.innerHTML = '';
    return;
  }
  const day = ref.tag === 'MD' ? `matches ending a ${TYPE_LABEL[ref.type].toLowerCase()} microcycle (per 90 min, players ≥ 45 min)` : `${ref.tag} sessions of ${TYPE_LABEL[ref.type].toLowerCase()} microcycles`;
  note.innerHTML = `Each player is compared with <b>his own</b> previous ${day} since ${fmtDay(ref.since, { month: 'short', year: 'numeric' })} (${ref.sessions} sessions in the club history); with fewer than 5 of his own, the squad's is used. <span class="muted">z = (today − his usual) / his usual variation · orange = more than usual, blue = less.</span>`;
  const ps = s.players.filter((p) => p.mdref);
  if (!ps.length) { mount.innerHTML = emptyState('No player with a reference for this session.'); return; }
  const srcTag = (m) => `<small class="muted">${m.src === 'own' ? `his ${m.n}` : 'squad'}</small>`;
  if (TR.mdz === 'all') {
    const cell = (z) => `<td class="c"><span class="cellv" style="${zTint(z)}">${z == null ? '—' : fmtSigned(z)}</span></td>`;
    mount.innerHTML = `<div class="table-wrap"><table class="dtable compact"><thead><tr><th>Player</th>${MDZ_METRICS.map(([, l]) => `<th class="c">${l}</th>`).join('')}<th class="c">Reference</th></tr></thead><tbody>
      ${ps.slice().sort((a, b) => (b.mdref.z.td ?? -9) - (a.mdref.z.td ?? -9)).map((p) => `<tr data-id="${p.id}" class="clickable"><td>${playerCell(p.id, playerName(p.id), p.type)}</td>${MDZ_METRICS.map(([k]) => cell(p.mdref.z[k])).join('')}<td class="c">${srcTag(p.mdref)}</td></tr>`).join('')}
      </tbody></table></div>`;
    return;
  }
  const k = TR.mdz;
  const list = ps.filter((p) => p.mdref.z[k] != null).sort((a, b) => b.mdref.z[k] - a.mdref.z[k]);
  const val = (p) => (p.mdref.per90 && p.min ? p[k] * 90 / p.min : p[k]);
  mount.innerHTML = `<div class="dz-list">${list.map((p) => {
    const z = p.mdref.z[k], c = Math.max(-3, Math.min(3, z));
    const col = z >= 0 ? `rgba(200,88,26,${0.35 + Math.min(1, Math.abs(z) / 2) * 0.55})` : `rgba(42,120,214,${0.35 + Math.min(1, Math.abs(z) / 2) * 0.55})`;
    return `<div class="dz-row" data-id="${p.id}">
      <span class="lb-name">${escapeHtml(playerName(p.id))}</span>
      <span class="dz-val">${fmtN(val(p))} <small>vs ${fmtN(p.mdref.mean[k])} ${MDZ_UNIT[k]}</small></span>
      <span class="dz-track"><i class="mid"></i><b style="left:${c < 0 ? 50 + c / 3 * 50 : 50}%;width:${Math.abs(c) / 3 * 50}%;background:${col}"></b></span>
      <span class="dz-z ${Math.abs(z) >= 2 ? 'strong' : ''}">${fmtSigned(z)}</span>
      <span class="dz-src">${srcTag(p.mdref)}</span></div>`;
  }).join('')}</div>
  <div class="dz-axis"><span>less than usual</span><span>usual</span><span>more than usual</span></div>`;
}

const SESSION_BOARDS = [
  ['td', 'Total distance', 'm'], ['mpm', 'Intensity', 'm/min'], ['d15', 'Distance > 15 km/h', 'm'],
  ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'], ['spr_n', 'Sprints', 'n'],
  ['acc_dec', 'HIT Acc + Dec', 'n'], ['vmax', 'Max speed', 'km/h'], ['srpe', 'sRPE load', 'AU'],
];

/** Ranking of every player of the session on one metric: horizontal bars, top 3 highlighted, team-average line. */
function boardHtml(s, [k, label, unit]) {
  const list = s.players.filter((p) => p[k] != null && p.min > 0).sort((a, b) => b[k] - a[k]);
  if (!list.length || !list[0][k]) return '';
  const max = list[0][k];
  const avg = s.team[k] != null ? s.team[k] : list.reduce((a, p) => a + p[k], 0) / list.length;
  const d = k === 'vmax' ? 1 : 0;
  const rows = list.map((p, i) => {
    const extra = k === 'vmax' ? (p.vmax_pct != null ? `${p.vmax_pct}%` : '') : p['p3_' + k] != null ? `${p['p3_' + k]}%` : '';
    const partial = p.cat !== 't' && p.cat !== 'm';
    return `<div class="lb-row ${partial ? 'partial' : ''}" data-id="${p.id}" title="${escapeHtml(`${playerName(p.id)} · ${p.type} · ${p.min} min`)}">
      <span class="lb-rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span>
      <span class="lb-name">${escapeHtml(playerName(p.id))}${partial ? ` <small>${escapeHtml(p.type.toLowerCase())}</small>` : ''}</span>
      <span class="lb-track"><i class="lb-bar ${p[k] >= avg ? 'hi' : ''}" style="width:${Math.max(1.5, p[k] / max * 100)}%"></i><i class="lb-avg" style="left:${avg / max * 100}%"></i></span>
      <span class="lb-val">${fmtN(p[k], d)}${extra ? `<small>${extra}</small>` : ''}</span></div>`;
  }).join('');
  return `<section class="panel lb"><div class="panel-head"><h2 class="panel-title small">${label} <small class="muted">${unit}</small></h2><span class="panel-note">team ${fmtN(avg, d)}</span></div><div class="lb-list">${rows}</div></section>`;
}
const rpeTint = (v) => (v == null ? '' : `background:rgba(255,59,48,${Math.max(0, Math.min(1, (v - 3) / 7)) * 0.32})`);

function drawSessionPlayers(s) {
  const roster = TR.sessions.roster;
  const mode = TR.mode === 'mdz' && !s.mdref ? 'bars' : TR.mode;
  const zf = (k) => (r) => (mode === 'mdz' ? (r.raw.mdref ? r.raw.mdref.z[k] : null) : r.raw['z_' + k]);
  const pct = (k) => (r) => (r.v[k] == null ? '—' : `${r.v[k]}%`);
  const cols = [
    { key: 'min', label: 'Min' },
    { key: 'rpe', label: 'RPE', d: 0, tint: (r) => rpeTint(r.v.rpe) },
    { key: 'td', label: 'TD', unit: 'm', bar: true, z: zf('td') },
    { key: 'mpm', label: 'm/min' },
    { key: 'd15', label: '>15', unit: 'm', bar: true, z: zf('d15') },
    { key: 'hit', label: '>20', unit: 'm', bar: true, z: zf('hit') },
    { key: 'spr', label: '>25', unit: 'm', bar: true, z: zf('spr') },
    { key: 'vmax', label: 'Vmax', unit: 'km/h', d: 1 },
    { key: 'vmax_pct', label: '% Vmax', fmt: pct('vmax_pct'), tint: (r) => (r.v.vmax_pct >= 90 ? 'background:rgba(52,199,89,.18)' : '') },
    { key: 'days_hsv', label: 'Days ≥90%', tint: (r) => (r.v.days_hsv >= 10 ? 'background:rgba(255,59,48,.18);font-weight:700' : '') },
    { key: 'hit_n', label: 'Count >20', bar: true },
    { key: 'spr_n', label: 'Sprints', bar: true, z: zf('spr_n') },
    { key: 'acc', label: 'HIT Acc', bar: true },
    { key: 'dec', label: 'HIT Dec', bar: true },
    { key: 'acc_dec', label: 'Acc+Dec', bar: true, z: zf('acc_dec') },
    { key: 'srpe', label: 'sRPE', bar: true, z: zf('srpe') },
    { key: 'p3_td', label: 'TD %top3', fmt: pct('p3_td') },
    { key: 'p3_hit', label: '>20 %top3', fmt: pct('p3_hit') },
  ];
  const rows = s.players.map((p) => ({ id: p.id, name: playerName(p.id), sub: p.type, pos: posOf(p.id, roster), v: p, raw: p }));
  groupedTable(document.getElementById('se-players'), cols, rows, { mode, sortKey: 'td', onRow: (id) => switchView('player', { player: id }) });
}

function playerName(id) {
  const r = (TR.sessions && TR.sessions.roster && TR.sessions.roster[id]) || null;
  return r ? r.name : id;
}

function drawDrills(s) {
  const totalTd = s.drills.reduce((a, dr) => a + (dr.team.td || 0), 0) || 1;
  const vs = (v) => (v == null ? '<span class="muted">—</span>' : `<span class="${v > 110 ? 'chip-v orange' : 'num'}">${v}%</span>`);
  document.getElementById('se-drills').innerHTML = `
    <div class="drill-row drill-head"><span>Drill</span><span>Min</span><span>n</span><span>TD</span><span>m/min</span><span>>15</span><span>>20</span><span>>25</span><span>Acc+Dec</span><span>m/min vs match</span><span>>20 vs match</span><span>Acc+Dec vs match</span><span>Share of TD</span></div>
    ${s.drills.map((dr) => `<details class="drill"><summary class="drill-row">
      <span class="dname">${escapeHtml(dr.name)}${dr.ampm && dr.ampm !== 'PM' && dr.ampm !== 'nan' && dr.ampm !== '0' ? ` <small class="muted">${escapeHtml(dr.ampm)}</small>` : ''}</span>
      <span>${fmtN(dr.min)}</span><span>${dr.n}</span><span>${fmtN(dr.team.td)}</span><span>${fmtN(dr.team.mpm)}</span><span>${fmtN(dr.team.d15)}</span><span>${fmtN(dr.team.hit)}</span><span>${fmtN(dr.team.spr)}</span><span>${fmtN(dr.team.acc_dec)}</span>
      <span>${vs(dr.vs_match && dr.vs_match.td)}</span><span>${vs(dr.vs_match && dr.vs_match.hit)}</span><span>${vs(dr.vs_match && dr.vs_match.acc_dec)}</span>
      <span class="share"><i style="width:${Math.round((dr.team.td || 0) / totalTd * 100)}%"></i><small>${Math.round((dr.team.td || 0) / totalTd * 100)}%</small></span></summary>
      <table class="dtable compact"><thead><tr><th>Player</th><th class="c">Min</th><th class="c">TD</th><th class="c">m/min</th><th class="c">>15</th><th class="c">>20</th><th class="c">>25</th><th class="c">Sprints</th><th class="c">Acc+Dec</th><th class="c">Vmax</th></tr></thead><tbody>
      ${Object.entries(dr.players).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0)).map(([id, v]) => `<tr><td>${escapeHtml(playerName(id))}</td><td class="c">${fmtN(v[0])}</td><td class="c">${fmtN(v[1])}</td><td class="c">${v[0] ? fmtN(v[1] / v[0]) : '—'}</td><td class="c">${fmtN(v[6])}</td><td class="c">${fmtN(v[2])}</td><td class="c">${fmtN(v[3])}</td><td class="c">${fmtN(v[7])}</td><td class="c">${fmtN(v[4])}</td><td class="c">${fmtN(v[5], 1)}</td></tr>`).join('')}
      </tbody></table></details>`).join('')}`;
}

// ------------------------------------------------------------------ Week
const WEEK_TARGET_METRICS = [['td', 'Total distance'], ['hit', 'Distance > 20 km/h'], ['spr_n', 'Sprints (count)'], ['acc_dec', 'HIT Acc + Dec']];

function renderWeek() {
  const root = document.getElementById('view-week');
  root.innerHTML = `
    ${pageHead('Training', 'Week load', 'wk-sub', `<select class="select" id="wk-pick" aria-label="Week"></select>${segHtml('wk-mode', [['train', 'Training only'], ['all', 'All sessions']], TR.weekMode)}`)}
    <div id="wk-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  bindSeg('wk-mode', (v) => { TR.weekMode = v; drawWeek(); });
  withData('sessions', (d) => { TR.sessions = d; drawWeek(); }, (err) => { root.innerHTML = loadError(err); });
  withData('workload', (d) => { WL.data = d; drawWeek(); }, () => {});
}

function drawWeek() {
  const d = TR.sessions;
  if (!d || !d.weeks || document.getElementById('view-week').hidden) return;
  const list = d.weeks.list;
  if (!TR.week || !list.find((w) => w.start === TR.week)) TR.week = list[0].start;
  const pick = document.getElementById('wk-pick');
  if (pick.options.length !== list.length) pick.innerHTML = list.map((w) => `<option value="${w.start}">Week of ${fmtDay(w.start, { day: 'numeric', month: 'short' })}</option>`).join('');
  pick.value = TR.week;
  pick.onchange = () => { TR.week = pick.value; drawWeek(); };
  const w = list.find((x) => x.start === TR.week);
  const mode = TR.weekMode, bands = d.weeks.bands;
  const partial = w.data_to && w.data_to < w.end;
  document.getElementById('wk-sub').textContent = `Sunday ${fmtDay(w.start, { day: 'numeric', month: 'long' })} – Saturday ${fmtDay(w.end, { day: 'numeric', month: 'long' })}${partial ? ` · in progress, data up to ${fmtDay(w.data_to, { weekday: 'long', day: 'numeric' })}` : ''} · ${mode === 'train' ? 'training sessions only ("target without game")' : 'all sessions incl. matches'} · % = share of the player's top-3 match`;

  document.getElementById('wk-body').innerHTML = `
    <div class="panel-head bare"><h2 class="panel-title">Squad · day by day</h2><span class="panel-note">average of players in full training / match · dark = match day</span></div>
    <div class="grid4">${[['td', 'Total distance', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE', 'AU']].map(([k, l, u]) => `<section class="panel mini"><div class="panel-head"><h2 class="panel-title small">${l}</h2><span class="panel-note">${u}</span></div><div class="chart" id="wk-day-${k}"></div></section>`).join('')}</div>
    <div class="panel-head bare"><h2 class="panel-title">Weekly load vs top-3 match</h2><span class="panel-note">shaded = target range (${d.weeks.bands_source === 'config' ? 'staff targets' : `interquartile range of ${d.weeks.bands_n} past competitive player-weeks`})</span></div>
    <div class="grid2">${WEEK_TARGET_METRICS.map(([k, l]) => `<section class="panel"><div class="panel-head"><h2 class="panel-title small">% of top-3 match · ${l}</h2><span class="panel-note">${bands[k] ? `target ${bands[k][0]}–${bands[k][1]}%` : ''}</span></div><div class="chart" id="wk-pct-${k}"></div></section>`).join('')}</div>
    <section class="panel"><div class="panel-head"><h2 class="panel-title small">Players · week totals</h2><span class="panel-note">grouped by position · % of top-3 match next to each total</span></div><div class="table-wrap" id="wk-table"></div></section>
    <div class="panel-head bare"><h2 class="panel-title">Squad · week by week</h2><span class="panel-note">average available player · last 16 weeks</span></div>
    <div class="grid4">${[['td', 'Total distance'], ['hit', 'HIT distance'], ['acc_dec', 'HIT Acc + Dec'], ['srpe', 'sRPE']].map(([k, l]) => `<section class="panel mini"><div class="panel-head"><h2 class="panel-title small">${l}</h2></div><div class="chart" id="wk-season-${k}"></div></section>`).join('')}</div>`;

  ['td', 'hit', 'acc_dec', 'srpe'].forEach((k) => chXY(document.getElementById('wk-day-' + k), {
    x: w.days.map((x) => x.date), height: 170,
    bars: { values: w.days.map((x) => x[k]), color: (v, i) => (w.days[i].match ? '#1d3f73' : '#2a78d6') },
    tick: (x) => fmtDay(x, { weekday: 'short' }),
    tip: (i) => `<b>${fmtN(w.days[i][k])}</b><span>${fmtDay(w.days[i].date)} · ${w.days[i].n} players${w.days[i].match ? ' · match' : ''}</span>`,
  }));

  const roster = d.roster;
  const ids = Object.keys(w.players);
  WEEK_TARGET_METRICS.forEach(([k]) => {
    const vals = ids.map((id) => ({ id, v: w.players[id][mode + '_p3'][k] })).filter((x) => x.v != null && x.v > 0).sort((a, b) => b.v - a.v);
    const b = bands[k];
    chXY(document.getElementById('wk-pct-' + k), {
      x: vals.map((x) => playerName(x.id)), height: 270, slantTicks: true, yMin: 0,
      bands: b ? [{ from: b[0], to: b[1], color: STATUS_COL.green, alpha: 0.12 }] : [],
      bars: { values: vals.map((x) => x.v), color: (v) => (!b ? '#2a78d6' : v > b[1] * 1.25 ? STATUS_COL.red : v > b[1] ? STATUS_COL.orange : v >= b[0] ? '#34c759' : '#9fc2ee') },
      refs: [{ y: 100, dash: true, label: '1 match' }],
      tip: (i) => `<b>${escapeHtml(playerName(vals[i].id))} · ${vals[i].v}%</b><span>${fmtN(w.players[vals[i].id][mode][k])} this week${b ? ` · target ${b[0]}–${b[1]}%` : ''}</span>`,
    });
  });

  const pc = (k) => (r) => { const p = r.raw[mode + '_p3'][k]; return `${fmtN(r.v[k])}${p != null ? ` <small class="muted">${p}%</small>` : ''}`; };
  const cols = [
    { key: 'minutes', label: 'Time', unit: 'min' },
    { key: 'srpe', label: 'sRPE', bar: true },
    { key: 'td', label: 'TD', unit: 'm', bar: true, fmt: pc('td') },
    { key: 'd15', label: '>15', unit: 'm', bar: true, fmt: pc('d15') },
    { key: 'hit', label: '>20', unit: 'm', bar: true, fmt: pc('hit') },
    { key: 'spr', label: '>25', unit: 'm', bar: true, fmt: pc('spr') },
    { key: 'vmax', label: 'Vmax', unit: 'km/h', d: 1 },
    { key: 'spr_n', label: 'Sprints', bar: true, fmt: pc('spr_n') },
    { key: 'acc_dec', label: 'Acc+Dec', bar: true, fmt: pc('acc_dec') },
    { key: 'n', label: 'Sessions', fmt: (r) => `${r.raw.n_train}${r.raw.n_match ? ` + ${r.raw.n_match} match` : ''}${r.raw.unavail ? ` <small class="muted">· ${r.raw.unavail} d out</small>` : ''}` },
  ];
  const rows = ids.map((id) => {
    const p = w.players[id];
    return { id, name: playerName(id), pos: posOf(id, roster), raw: p, v: { ...p[mode], vmax: p.vmax, n: p.n_train + p.n_match } };
  });
  groupedTable(document.getElementById('wk-table'), cols, rows, { sortKey: 'td', onRow: (id) => switchView('player', { player: id }) });

  if (WL.data) {
    const weeks = WL.data.team.weeks;
    ['td', 'hit', 'acc_dec', 'srpe'].forEach((k) => chXY(document.getElementById('wk-season-' + k), {
      x: weeks.map((x) => x.start), height: 170,
      bars: { values: weeks.map((x) => x[k]), color: (v, i) => (weeks[i].start === w.start ? '#1d3f73' : weeks[i].days < 7 ? 'rgba(42,120,214,.45)' : '#2a78d6') },
      tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
      tip: (i) => `<b>${fmtN(weeks[i][k])}</b><span>Week of ${fmtDay(weeks[i].start, { day: 'numeric', month: 'short' })}${weeks[i].days < 7 ? ` · ${weeks[i].days} days` : ''}</span>`,
    }));
  }
}

// ------------------------------------------------------------------ Objectives
function renderObjectives() {
  const root = document.getElementById('view-objectives');
  root.innerHTML = `
    ${pageHead('Training', 'Session objectives', 'ob-sub', segHtml('ob-type', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']], TR.type))}
    <div id="ob-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  bindSeg('ob-type', (v) => { TR.type = v; drawObjectives(); });
  withData('objectives', (d) => { TR.obj = d; drawObjectives(); }, (err) => { root.innerHTML = loadError(err); });
}

function drawObjectives() {
  const o = TR.obj;
  if (!o || document.getElementById('view-objectives').hidden) return;
  document.getElementById('ob-sub').textContent = `${TYPE_LABEL[TR.type]} microcycle = ${o.types[TR.type]} · team averages of full-session players since ${fmtDay(o.since, { month: 'long', year: 'numeric' })} · ${fmtUpdated(o.generated_at)}`;
  const tab = o.table[TR.type] || {};
  const tags = o.tags.filter((t) => tab[t]);
  const cell = (c, k, unit) => (c && c[k] ? `<b>${fmtN(c[k].med)}</b><small>${fmtN(c[k].p25)}–${fmtN(c[k].p75)}${unit ? ' ' + unit : ''}</small>${c[k].pct != null && k !== 'minutes' ? `<em>${c[k].pct}%</em>` : ''}` : '—');
  const body = document.getElementById('ob-body');
  body.innerHTML = `
    ${planHtml(o)}
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Targets by day · ${TYPE_LABEL[TR.type].toLowerCase()} microcycle</h2><span class="panel-note">median · interquartile range · % of match demands</span></div>
      <div class="table-wrap"><table class="dtable objectives"><thead><tr><th>Day</th><th class="c">n</th>${OBJ_METRICS.map((k) => `<th class="c">${METRIC_SHORT[k]}${METRIC_UNIT[k] ? ` <small>${METRIC_UNIT[k]}</small>` : ''}</th>`).join('')}<th class="c">Duration <small>min</small></th><th class="c">m/min</th></tr></thead>
      <tbody>${tags.map((t) => `<tr class="${t === 'MD' ? 'md-row' : ''}"><td><span class="tag ${t === 'MD' ? 'strong' : ''}">${t}</span></td><td class="c muted">${tab[t].n}</td>${OBJ_METRICS.map((k) => `<td class="c obj">${cell(tab[t], k)}</td>`).join('')}<td class="c obj">${cell(tab[t], 'minutes')}</td><td class="c obj">${tab[t].mpm ? `<b>${fmtN(tab[t].mpm.med)}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="panel-foot">MD row = match demands per 90 min (players ≥60 min). MD+1 is usually recovery / compensatory work and has no team target.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Load profile · % of match demands</h2></div>
      <div class="profile">${tags.filter((t) => t !== 'MD').map((t) => `<div class="prow"><span class="tag">${t}</span>${['td', 'hit', 'spr', 'acc_dec'].map((k) => {
        const p = tab[t][k] ? tab[t][k].pct : null;
        return `<span class="pbar" title="${METRIC_LONG[k]}"><i style="width:${Math.min(100, p || 0)}%"></i><small>${METRIC_SHORT[k]} ${p == null ? '—' : p + '%'}</small></span>`;
      }).join('')}</div>`).join('') || emptyState('Not enough sessions of this type yet.')}</div>
    </section>`;
}

function planHtml(o) {
  const p = o.plan;
  if (!p) return '<section class="panel"><p class="note">No upcoming Al Gharafa fixture found in the calendar.</p></section>';
  const n = p.next;
  const when = n.start === n.end || n.confirmed_date ? fmtDay(p.next_date, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtDay(n.start, { day: 'numeric', month: 'short' })} – ${fmtDay(n.end, { day: 'numeric', month: 'short' })} (date TBC — planned on ${fmtDay(p.next_date, { day: 'numeric', month: 'short' })})`;
  const intro = p.break
    ? `${p.length} days since the last match (${fmtDay(p.prev_match, { day: 'numeric', month: 'short' })}) — no standard microcycle. The last 6 days before the match are planned as a <b>normal</b> microcycle.`
    : `${TYPE_LABEL[p.type]} microcycle · ${p.length} days since the last match (${fmtDay(p.prev_match, { day: 'numeric', month: 'short' })}).`;
  const rows = p.days.map((day) => {
    const c = objectiveFor(o, p.type, day.tag);
    const tgt = (k) => (c && c[k] ? `${fmtN(c[k].p25)}–${fmtN(c[k].p75)}` : '—');
    const act = (k) => {
      if (!day.actual) return '';
      const comp = complianceOf(day.actual[k], c && c[k]);
      return `<div class="act" style="color:${comp ? COMPLIANCE[comp][1] : 'inherit'}">${fmtN(day.actual[k])}</div>`;
    };
    return `<tr><td>${fmtDay(day.date)}</td><td><span class="tag">${day.tag || '—'}</span></td>${OBJ_METRICS.map((k) => `<td class="c">${tgt(k)}${act(k)}</td>`).join('')}</tr>`;
  }).join('');
  return `<section class="panel">
    <div class="panel-head"><h2 class="panel-title small">Next: ${escapeHtml(n.round || n.competition || '')}${n.opponent ? ' vs ' + escapeHtml(n.opponent) : ''}</h2><span class="panel-note">${when}</span></div>
    <p class="note">${intro}</p>
    <div class="table-wrap"><table class="dtable compact"><thead><tr><th>Day</th><th>Tag</th>${OBJ_METRICS.map((k) => `<th class="c">${METRIC_SHORT[k]} target</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="panel-foot">Actual team values appear under each target once the session is synced (green = on target, orange = outside the range).</p>
  </section>`;
}
