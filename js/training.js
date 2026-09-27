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
    ${s.team_ref ? `<p class="note tiles-note">Team averages coloured by <b>z-score vs the usual ${s.md}${s.kind === 'match' ? ' (per 90 min)' : ''} of ${TYPE_LABEL[cyc.type].toLowerCase()} microcycles</b> (${s.team_ref.n} past sessions): <span class="zs on">on target</span> |z| &lt; 1 · <span class="zs below">below</span> z ≤ −1 · <span class="zs above">slightly above</span> z 1–2 · <span class="zs high">well above</span> z ≥ 2</p>` : `<p class="note tiles-note">No reference for this day (outside a standard microcycle) — team averages only.</p>`}
    <div class="tiles">
      ${[['td', 'Total distance', 'm'], ['d15', 'Distance > 15 km/h', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'], ['spr_n', 'Sprints', ''], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE load', 'AU']].map(([k, l, u]) => teamTile(s, k, l, u)).join('')}
      <div class="tile"><div class="tile-label">Intensity</div><div class="tile-value">${fmtN(t.mpm)}<small> m/min</small></div><div class="tile-sub">max speed ${fmtN(t.vmax, 1)} km/h (avg) · ${fmtN(t.hit_n)} efforts >20</div></div>
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

const Z_STATUS = Z_LABEL, zStatus = zLevel; // shared colour code (ui.js)

/** Team-average tile, coloured by the team z-score vs the usual for this MD tag and microcycle type. */
function teamTile(s, k, label, unit) {
  const ref = s.team_ref && s.team_ref[k], st = ref ? zStatus(ref.z) : null;
  const perMatch = s.kind === 'match' ? ' / 90 min' : '';
  return `<div class="tile ${st ? 'zt-' + st : ''}"><div class="tile-label">${label}</div>
    <div class="tile-value">${fmtN(s.team[k])}<small> ${unit}</small></div>${st ? `<div class="tile-z"><span class="zs ${st}">${Z_STATUS[st]} · z ${fmtSigned(ref.z)}</span></div>` : ''}
    <div class="tile-sub">${ref ? `usual ${fmtN(ref.mean)}${perMatch} · 25–75th ${fmtN(ref.p25)}–${fmtN(ref.p75)}` : 'team average'}</div></div>`;
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
function renderObjectives(opts) {
  if (opts && opts.cycle) TR.cycle = opts.cycle;
  const root = document.getElementById('view-objectives');
  root.innerHTML = `
    ${pageHead('Training', 'Session objectives', 'ob-sub', segHtml('ob-type', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']], TR.type))}
    <div id="ob-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  bindSeg('ob-type', (v) => { TR.type = v; drawObjectives(); });
  withData('objectives', (d) => { TR.obj = d; drawObjectives(); }, (err) => { root.innerHTML = loadError(err); });
  withData('calendar', (d) => { CAL.data = d; drawObjectives(); }, () => {}); // staff edits of the next match date
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
    <section class="panel" id="pl-panel"></section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Microcycle totals across the season · done vs typical</h2><span class="panel-note">click a bar to open that microcycle</span></div>
      <div id="pl-season"></div>
      <p class="panel-foot">Bar = team total of the microcycle's training days · line = what those same days usually add up to (median of each day). Green within ±15 %, blue below, orange 15–30 % above, red more than 30 % above.</p>
    </section>
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
  drawPlanner();
  drawPlanSeason();
}

// ------------------------------------------------------------------ Microcycle planner
const PLAN_METRICS = [['td', 'TD', 'm'], ['d15', '>15', 'm'], ['hit', '>20', 'm'], ['spr', '>25', 'm'], ['acc_dec', 'Acc+Dec', ''], ['srpe', 'sRPE', 'AU']];
const PLAN_LONG = { td: 'Total distance', d15: 'Distance > 15 km/h', hit: 'Distance > 20 km/h', spr: 'Distance > 25 km/h', acc_dec: 'HIT Acc + Dec', srpe: 'sRPE load' };
const PLAN_COL = Z_COL;
TR.cycle = 'next'; TR.planK = 'td'; TR.off = {};

function planRound(v) { return v == null ? null : Math.abs(v) >= 1000 ? Math.round(v / 10) * 10 : Math.round(v); }

/** Cycle days with their usual values. Past days without a team session, MD+1 (recovery) and days set as off are not planned. */
function planDays(o, cyc) {
  return cyc.days.map((d) => {
    const cell = objectiveFor(o, cyc.type, d.tag) || objectiveFor(o, 'long', d.tag) || objectiveFor(o, 'normal', d.tag); // MD-6/MD-5 only exist in long cycles
    const past = d.date <= o.as_of;
    const why = d.tag === 'MD+1' ? 'Recovery' : !cell ? 'No reference' : past && !d.actual ? 'No team session' : !past && TR.off[cyc.id + '|' + d.date] ? 'Off' : null;
    return { ...d, cell, past, off: !!why, why };
  });
}

/** Share `rem` over the days in proportion to their usual value, each kept within [lo, hi]. */
function shareOut(rem, items) {
  const out = items.map(() => null);
  let free = items.map((_, i) => i), left = rem;
  for (let pass = 0; pass <= items.length && free.length; pass++) {
    const sum = free.reduce((a, i) => a + items[i].med, 0) || 1;
    const fixed = [];
    free.forEach((i) => {
      const v = left * (items[i].med || 0) / sum;
      if (v < items[i].lo) fixed.push([i, items[i].lo]); else if (v > items[i].hi) fixed.push([i, items[i].hi]);
    });
    if (!fixed.length) { free.forEach((i) => { out[i] = left * (items[i].med || 0) / sum; }); break; }
    fixed.forEach(([i, v]) => { out[i] = v; left -= v; });
    free = free.filter((i) => out[i] == null);
  }
  return out;
}

/**
 * Adaptive plan for one metric. Target of the microcycle = sum of the usual (median) value of each planned day.
 * Objective of a day = what was still left to do the evening before, shared over that day and the following ones.
 */
function planMetric(days, k) {
  const act = days.filter((d) => !d.off && d.cell[k] && !(d.past && d.actual[k] == null)); // e.g. sRPE not entered yet
  const total = act.reduce((a, d) => a + d.cell[k].med, 0);
  let known = act.findIndex((d) => !d.past);
  if (known < 0) known = act.length;
  const byDate = {};
  act.forEach((d, i) => {
    const cut = Math.min(i, known);
    const done = act.slice(0, cut).reduce((a, x) => a + (x.actual[k] || 0), 0);
    const rest = act.slice(cut);
    const items = rest.map((x) => ({ med: x.cell[k].med, lo: x.cell[k].p10, hi: x.tag === 'MD-1' ? x.cell[k].p75 : x.cell[k].p90 }));
    const obj = planRound(shareOut(total - done, items)[i - cut]);
    const c = d.cell[k], v = d.actual ? d.actual[k] : null;
    const tol = Math.max((c.p75 - c.p25) / 2, 0.1 * obj, 1);
    const status = v == null ? null : v > obj + 2 * tol ? 'high' : v > obj + tol ? 'above' : v < obj - tol ? 'below' : 'on';
    byDate[d.date] = { obj, usual: c.med, p25: c.p25, p75: c.p75, actual: v, status };
  });
  const done = act.slice(0, known).reduce((a, x) => a + (x.actual[k] || 0), 0);
  const due = act.slice(0, known).reduce((a, x) => a + x.cell[k].med, 0);
  const planned = act.slice(known).reduce((a, x) => a + byDate[x.date].obj, 0);
  return { byDate, total, done, due, planned, left: act.length - known, known };
}

/** Past microcycles from the build + the upcoming one rebuilt here from the calendar (with staff edits applied). */
function plannerCycles(o) {
  const list = o.cycles || [];
  if (!CAL.data || !o.prev_match) return list;
  const nxt = upcomingCycle(o, CAL.data), rest = list.filter((c) => !c.upcoming);
  return nxt ? [nxt, ...rest] : rest;
}

function upcomingCycle(o, cal) {
  const today = todayIso(), when = (e) => e.confirmed_date || e.start;
  const evs = applyCalendarEdits(cal).filter((e) => e.kind === 'match' && e.gharafa === 'yes' && !e.played_date && when(e) > today);
  if (!evs.length) return null;
  const nx = evs.reduce((a, b) => (when(a) <= when(b) ? a : b)), nd = when(nx), prev = o.prev_match;
  const length = daysBetween(prev, nd), brk = length > 12;
  let typ = cycleType(length), start = addDays(prev, 1);
  if (!typ) { start = addDays(nd, -6); typ = 'normal'; } // long break: plan the last week as a normal microcycle
  const firm = !!nx.confirmed_date || nx.start === nx.end; // a confirmed date beats the tags typed in the GPS file
  const days = [];
  for (let d = start; d < nd; d = addDays(d, 1)) {
    const rec = o.recent && o.recent[d], calc = computedTag(d, brk ? null : prev, nd);
    days.push({ date: d, tag: (firm ? calc : null) || (rec && rec.md) || calc, actual: rec ? rec.actual : null, n: rec ? rec.n : 0 });
  }
  return { id: 'next', from: addDays(start, -1), to: nd, type: typ, length, upcoming: true, break: brk, days,
    label: `${nx.round || nx.competition}${nx.opponent ? ' · ' + nx.opponent : ''}`, provisional: !nx.confirmed_date && nx.start !== nx.end };
}

function drawPlanner() {
  const o = TR.obj, mount = document.getElementById('pl-panel');
  if (!mount) return;
  const cycles = plannerCycles(o);
  if (!cycles.length) { mount.innerHTML = '<p class="note">No microcycle to plan yet.</p>'; return; }
  const cyc = cycles.find((c) => c.id === TR.cycle) || cycles[0];
  TR.cycle = cyc.id;
  const days = planDays(o, cyc);
  const plans = {};
  PLAN_METRICS.forEach(([k]) => { plans[k] = planMetric(days, k); });
  const k = TR.planK, p = plans[k];
  const matchDay = cyc.to;
  const opt = (c) => `<option value="${c.id}" ${c.id === cyc.id ? 'selected' : ''}>${c.upcoming ? 'Next · ' : ''}${fmtDay(c.to, { day: 'numeric', month: 'short' })} · ${escapeHtml(c.label || 'Match')}</option>`;
  const intro = cyc.upcoming && cyc.break
    ? `${cyc.length} days since the last match — no standard microcycle. The last ${cyc.days.length} days before the match are planned as a <b>${cyc.type}</b> microcycle${cyc.provisional ? ' (match date to be confirmed)' : ''}.`
    : `<b>${TYPE_LABEL[cyc.type]} microcycle</b> · ${cyc.length} days${cyc.provisional ? ' · match date to be confirmed' : ''}.`;
  const next = days.find((d) => !d.past && !d.off);
  const lead = !next ? (cyc.upcoming ? '' : 'Microcycle completed — objectives shown as they were re-adjusted day by day.')
    : `Proposed next: <b>${next.tag}</b> on ${fmtDay(next.date, { weekday: 'long', day: 'numeric', month: 'short' })}${p.known ? `, re-adjusted from the ${p.known} session${p.known > 1 ? 's' : ''} already done` : ''}.`;

  const cellHtml = (d, key) => {
    const r = plans[key].byDate[d.date];
    if (!r) return '<td class="c muted">—</td>';
    const act = r.actual != null ? `<div><span class="zs ${r.status}">${fmtN(r.actual)}</span></div>` : '';
    return `<td class="c pl-cell ${key === k ? 'sel' : ''}"><b>${fmtN(r.obj)}</b><small>usual ${fmtN(r.usual)}</small>${act}</td>`;
  };
  const rows = days.map((d) => `<tr class="${d.off ? 'off' : ''} ${next && d.date === next.date ? 'is-next' : ''}">
      <td>${fmtDay(d.date)}</td><td><span class="tag">${d.tag || '—'}</span></td>
      ${d.off ? `<td class="c muted" colspan="${PLAN_METRICS.length}">${d.why}${!d.past && d.why === 'Off' ? ` · <button type="button" class="linkbtn" data-off="${d.date}">plan it</button>` : ''}</td>`
        : PLAN_METRICS.map(([key]) => cellHtml(d, key)).join('')}
      <td class="c">${!d.past && !d.off && d.tag !== 'MD+1' ? `<button type="button" class="linkbtn" data-off="${d.date}">set off</button>` : ''}</td></tr>`).join('');

  const bars = PLAN_METRICS.map(([key, short, unit]) => {
    const q = plans[key];
    if (!q.total) return '';
    const max = Math.max(q.total, q.done + q.planned) * 1.05;
    const pc = (v) => Math.max(0, Math.min(100, v / max * 100));
    const gap = q.known ? (q.done - q.due) / Math.max(q.due, 1) : null;
    const st = gap == null ? null : gap > 0.15 ? 'above' : gap < -0.15 ? 'below' : 'on';
    return `<div class="pl-prog ${key === k ? 'sel' : ''}" data-k="${key}">
      <div class="pl-prog-head"><span>${PLAN_LONG[key]}</span><span><b>${fmtN(q.done)}</b> / ${fmtN(planRound(q.total))} ${unit}${st ? ` <span class="zs ${st}">${gap > 0 ? '+' : ''}${Math.round(gap * 100)}% vs usual so far</span>` : ''}</span></div>
      <div class="pl-track"><i class="done" style="width:${pc(q.done)}%;background:${st ? PLAN_COL[st] : '#2a78d6'}"></i><i class="todo" style="left:${pc(q.done)}%;width:${pc(q.planned)}%"></i>${q.known ? `<span class="due" style="left:${pc(q.due)}%" title="usual by now"></span>` : ''}<span class="tot" style="left:${pc(q.total)}%"></span></div></div>`;
  }).join('');

  mount.innerHTML = `
    <div class="panel-head"><h2 class="panel-title small">Microcycle planner · team average</h2>
      <select class="select" id="pl-cycle" aria-label="Microcycle">${cycles.map(opt).join('')}</select></div>
    <p class="note">${intro} Match: ${fmtDay(matchDay, { weekday: 'long', day: 'numeric', month: 'long' })}. ${lead}</p>
    ${segHtml('pl-metric', PLAN_METRICS.map(([key, short]) => [key, short]), k)}
    <div class="pl-legend"><span><i class="lg-band"></i>usual range (25–75th)</span><span><i class="lg-obj"></i>objective</span><span><i class="lg-todo"></i>to do</span><span><i style="background:${PLAN_COL.on}"></i>on target</span><span><i style="background:${PLAN_COL.below}"></i>below</span><span><i style="background:${PLAN_COL.above}"></i>slightly above</span><span><i style="background:${PLAN_COL.high}"></i>well above</span></div>
    <div id="pl-chart"></div>
    <div class="table-wrap"><table class="dtable compact plan"><thead><tr><th>Day</th><th>Tag</th>${PLAN_METRICS.map(([key, short, unit]) => `<th class="c ${key === k ? 'sel' : ''}">${short}${unit ? ` <small>${unit}</small>` : ''}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 class="pl-sub">Microcycle total · done / target</h3>
    <div class="pl-progs">${bars}</div>
    <p class="panel-foot">Target of the microcycle = the usual (median) team value of each planned day, added up. Each day's objective = what is still left to do, shared over the remaining days in proportion to their usual load and kept within the club's usual range for that day (10th–90th percentile; MD-1 capped at the 75th to stay fresh). Every synced session re-adjusts the following days — e.g. after MD-2, the MD-1 objective absorbs what was over- or under-done. Coloured values = actual team average (green on target, blue below, orange slightly above, red well above the objective). Use “set off” for a day without team training.</p>`;

  document.getElementById('pl-cycle').addEventListener('change', (e) => { TR.cycle = e.target.value; drawPlanner(); drawPlanSeason(); });
  bindSeg('pl-metric', (v) => { TR.planK = v; drawPlanner(); drawPlanSeason(); });
  mount.querySelectorAll('.pl-prog').forEach((el) => el.addEventListener('click', () => { TR.planK = el.dataset.k; drawPlanner(); drawPlanSeason(); }));
  mount.querySelectorAll('[data-off]').forEach((b) => b.addEventListener('click', () => {
    const key = cyc.id + '|' + b.dataset.off;
    if (TR.off[key]) delete TR.off[key]; else TR.off[key] = true;
    drawPlanner();
  }));
  planChart(document.getElementById('pl-chart'), days, p, k);
}

/** One column per day: usual range (band), objective (dark line), actual (bar coloured by status) or "to do" (hollow bar). */
function planChart(mount, days, p, k) {
  const W = Math.max(280, Math.round(mount.clientWidth)), H = 240, P = { l: 44, r: 12, t: 24, b: 40 };
  const n = days.length, iw = W - P.l - P.r, ih = H - P.t - P.b, step = iw / n;
  const vals = [0];
  days.forEach((d) => { const r = p.byDate[d.date]; if (r) vals.push(r.obj, r.p75, r.actual || 0); });
  const top = Math.max(...vals) * 1.12 || 1, ticks = chNiceTicks(0, top).filter((t) => t <= top);
  const yMax = Math.max(top, ticks[ticks.length - 1]);
  const xAt = (i) => P.l + step * (i + 0.5), yAt = (v) => P.t + ih * (1 - Math.max(0, Math.min(yMax, v)) / yMax);
  const bw = Math.min(46, step * 0.5), base = yAt(0);
  let s = '';
  ticks.forEach((t) => { s += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${yAt(t)}" y2="${yAt(t)}"/><text class="ch-axis" x="${P.l - 6}" y="${yAt(t) + 3.5}" text-anchor="end">${chFmt(t)}</text>`; });
  days.forEach((d, i) => {
    const r = p.byDate[d.date], x = xAt(i);
    s += `<text class="ch-axis" x="${x}" y="${H - 22}" text-anchor="middle" style="font-weight:600">${d.tag || ''}</text><text class="ch-axis" x="${x}" y="${H - 8}" text-anchor="middle">${fmtDay(d.date, { weekday: 'short', day: 'numeric' })}</text>`;
    if (!r) { s += `<text class="ch-axis" x="${x}" y="${base - 8}" text-anchor="middle">${d.why || ''}</text>`; return; }
    const bx = x - bw / 2;
    s += `<rect x="${bx - 6}" y="${yAt(r.p75)}" width="${bw + 12}" height="${Math.max(1, yAt(r.p25) - yAt(r.p75))}" rx="4" style="fill:var(--ink-muted)" opacity=".13"/>`;
    if (r.actual != null) {
      const y = yAt(r.actual), h = Math.max(1, base - y), rr = Math.min(4, h);
      s += `<path d="M${bx},${base}V${y + rr}Q${bx},${y} ${bx + rr},${y}H${bx + bw - rr}Q${bx + bw},${y} ${bx + bw},${y + rr}V${base}Z" style="fill:${PLAN_COL[r.status]}"/>`;
    } else {
      s += `<rect x="${bx + 1}" y="${yAt(r.obj)}" width="${bw - 2}" height="${Math.max(1, base - yAt(r.obj))}" rx="4" style="fill:rgba(42,120,214,.08);stroke:#2a78d6" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      s += `<text class="ch-axis" x="${x}" y="${yAt(r.obj) - 12}" text-anchor="middle" style="font-weight:700;fill:var(--ink)">${fmtN(r.obj)}</text>`;
    }
    s += `<line x1="${bx - 8}" x2="${bx + bw + 8}" y1="${yAt(r.obj)}" y2="${yAt(r.obj)}" style="stroke:var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
  });
  mount.innerHTML = `<svg class="ch-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
  const svg = mount.querySelector('svg');
  chHover(mount, svg, P.t, H - P.b, (rx) => {
    const i = Math.floor((rx - P.l) / step);
    if (i < 0 || i >= n) return null;
    const d = days[i], r = p.byDate[d.date];
    const html = r ? `<b>${d.tag} · ${fmtDay(d.date)}</b><span>Objective ${fmtN(r.obj)} · usual ${fmtN(r.usual)} (${fmtN(r.p25)}–${fmtN(r.p75)})</span>${r.actual != null ? `<span>Done ${fmtN(r.actual)} — ${Z_STATUS[r.status].toLowerCase()}</span>` : '<span>To do</span>'}`
      : `<b>${d.tag || ''} · ${fmtDay(d.date)}</b><span>${d.why}</span>`;
    return { x: xAt(i), y: r ? yAt(Math.max(r.obj, r.p75, r.actual || 0)) : base - 20, html };
  });
}

/** Each past microcycle: team total done vs the usual total of the same days. */
function drawPlanSeason() {
  const o = TR.obj, mount = document.getElementById('pl-season');
  if (!mount) return;
  const k = TR.planK;
  const rows = (o.cycles || []).filter((c) => !c.upcoming).map((c) => {
    let done = 0, usual = 0, n = 0;
    planDays(o, c).forEach((d) => { if (!d.off && d.actual && d.cell[k]) { done += d.actual[k] || 0; usual += d.cell[k].med; n++; } });
    return { c, done, usual, n };
  }).filter((r) => r.n).reverse();
  if (!rows.length) { mount.innerHTML = emptyState('No completed microcycle this season yet.'); return; }
  const stOf = (r) => { const g = (r.done - r.usual) / Math.max(r.usual, 1); return g > 0.3 ? 'high' : g > 0.15 ? 'above' : g < -0.15 ? 'below' : 'on'; };
  chXY(mount, {
    x: rows.map((r) => r.c.to), height: 200,
    bars: { values: rows.map((r) => r.done), color: (v, i) => (rows[i].c.id === TR.cycle ? '#1d1d1f' : PLAN_COL[stOf(rows[i])]) },
    markers: [{ values: rows.map((r) => r.usual), color: 'var(--ink)' }],
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => { const r = rows[i]; return `<b>${fmtN(r.done)} / ${fmtN(planRound(r.usual))}</b><span>${escapeHtml(r.c.label || '')} · ${fmtDay(r.c.to, { day: 'numeric', month: 'short' })}</span><span>${TYPE_LABEL[r.c.type]} · ${r.n} training day${r.n > 1 ? 's' : ''} · ${PLAN_LONG[k]}</span>`; },
    onClick: (i) => { TR.cycle = rows[i].c.id; drawPlanner(); drawPlanSeason(); document.getElementById('pl-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  });
}
