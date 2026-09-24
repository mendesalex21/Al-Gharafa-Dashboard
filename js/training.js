/**
 * Training › Sessions (session review: objectives compliance, players vs squad, drills) and
 * Training › Objectives (targets by microcycle type from the club's own history + upcoming week plan).
 * Data: sync/build.py → "sessions" and "objectives" payloads.
 */
const TR = { sessions: null, obj: null, date: null, type: 'normal' };
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
      ${OBJ_METRICS.map((k) => `<div class="tile"><div class="tile-label">${METRIC_LONG[k]}</div><div class="tile-value">${fmtN(t[k])}<small> ${METRIC_UNIT[k]}</small></div><div class="tile-sub">team average</div></div>`).join('')}
      <div class="tile"><div class="tile-label">Intensity</div><div class="tile-value">${fmtN(t.mpm)}<small> m/min</small></div><div class="tile-sub">max speed ${fmtN(t.vmax, 1)} km/h (avg)</div></div>
    </div>
    ${obj ? `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Objectives · ${s.md} of a ${TYPE_LABEL[cyc.type].toLowerCase()} microcycle</h2><span class="panel-note">from ${obj.n} similar sessions since ${fmtDay(TR.obj.since, { month: 'short', year: 'numeric' })}</span></div>
      <div class="bullets">${OBJ_METRICS.map((k) => bulletHtml(METRIC_LONG[k], METRIC_UNIT[k], t[k], obj[k])).join('')}${bulletHtml('Duration', 'min', s.minutes, obj.minutes)}</div></section>`
      : s.kind === 'training' ? `<section class="panel"><p class="note">No objective for this day${cyc.type ? '' : ' — it is outside a standard microcycle (break or pre-season)'}${s.md && cyc.type ? ` — not enough ${s.md} sessions in ${cyc.type} microcycles` : ''}.</p></section>` : ''}
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Players</h2><span class="panel-note">colour = z-score vs the team average of this session · blue below, orange above</span></div>
      <div class="table-wrap" id="se-players"></div>
      ${s.absent.length ? `<p class="panel-foot"><b>Not in the session:</b> ${s.absent.map((a) => `${escapeHtml(playerName(a.id))} <span class="muted">(${escapeHtml(a.type)})</span>`).join(', ')}</p>` : ''}
    </section>
    ${s.drills.length ? `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Drills</h2><span class="panel-note">team average per drill · tap a drill for players</span></div><div id="se-drills"></div></section>` : ''}`;

  const rows = s.players.map((p) => ({
    id: p.id,
    cells: [playerCell(p.id, playerName(p.id), p.type), fmtN(p.min),
      ...OBJ_METRICS.map((k) => `<span class="cellv" style="${zTint(p['z_' + k])}">${fmtN(p[k])}</span>`),
      p.rpe == null ? '—' : fmtN(p.rpe), fmtN(p.mpm), p.vmax == null ? '—' : `${fmtN(p.vmax, 1)}${p.vmax_pct ? ` <small class="muted">${p.vmax_pct}%</small>` : ''}`,
      p.pct_td == null ? '—' : `${p.pct_td}%`],
    keys: [playerName(p.id), p.min, ...OBJ_METRICS.map((k) => p[k]), p.rpe, p.mpm, p.vmax, p.pct_td],
  }));
  sortableTable(document.getElementById('se-players'), [
    { label: 'Player' }, { label: 'Min', cls: 'c', desc: true }, ...OBJ_METRICS.map((k) => ({ label: `${METRIC_SHORT[k]}${METRIC_UNIT[k] ? ` <small>${METRIC_UNIT[k]}</small>` : ''}`, cls: 'c', desc: true })),
    { label: 'RPE', cls: 'c', desc: true }, { label: 'm/min', cls: 'c', desc: true }, { label: 'Vmax <small>km/h</small>', cls: 'c', desc: true }, { label: 'TD % match', cls: 'c', desc: true },
  ], rows, { col: 2, dir: -1 }, (r) => `data-id="${r.id}" class="clickable"`);
  document.getElementById('se-players').onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) switchView('player', { player: tr.dataset.id });
  };
  if (s.drills.length) drawDrills(s);
}

function playerName(id) {
  const r = (TR.sessions && TR.sessions.roster && TR.sessions.roster[id]) || null;
  return r ? r.name : id;
}

function drawDrills(s) {
  const totalTd = s.drills.reduce((a, dr) => a + (dr.team.td || 0), 0) || 1;
  document.getElementById('se-drills').innerHTML = `
    <div class="drill-row drill-head"><span>Drill</span><span>Min</span><span>n</span><span>TD</span><span>m/min</span><span>HIT</span><span>Sprint</span><span>Acc+Dec</span><span>Share of TD</span></div>
    ${s.drills.map((dr) => `<details class="drill"><summary class="drill-row">
      <span class="dname">${escapeHtml(dr.name)}${dr.ampm && dr.ampm !== 'PM' && dr.ampm !== 'nan' && dr.ampm !== '0' ? ` <small class="muted">${escapeHtml(dr.ampm)}</small>` : ''}</span>
      <span>${fmtN(dr.min)}</span><span>${dr.n}</span><span>${fmtN(dr.team.td)}</span><span>${fmtN(dr.team.mpm)}</span><span>${fmtN(dr.team.hit)}</span><span>${fmtN(dr.team.spr)}</span><span>${fmtN(dr.team.acc_dec)}</span>
      <span class="share"><i style="width:${Math.round((dr.team.td || 0) / totalTd * 100)}%"></i><small>${Math.round((dr.team.td || 0) / totalTd * 100)}%</small></span></summary>
      <table class="dtable compact"><thead><tr><th>Player</th><th class="c">Min</th><th class="c">TD</th><th class="c">m/min</th><th class="c">HIT</th><th class="c">Sprint</th><th class="c">Acc+Dec</th><th class="c">Vmax</th></tr></thead><tbody>
      ${Object.entries(dr.players).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0)).map(([id, v]) => `<tr><td>${escapeHtml(playerName(id))}</td><td class="c">${fmtN(v[0])}</td><td class="c">${fmtN(v[1])}</td><td class="c">${v[0] ? fmtN(v[1] / v[0]) : '—'}</td><td class="c">${fmtN(v[2])}</td><td class="c">${fmtN(v[3])}</td><td class="c">${fmtN(v[4])}</td><td class="c">${fmtN(v[5], 1)}</td></tr>`).join('')}
      </tbody></table></details>`).join('')}`;
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
