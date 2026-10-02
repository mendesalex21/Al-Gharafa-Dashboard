/**
 * Calendar: season fixtures (sync/calendar.csv, transcribed from the club PDF) + staff edits made here
 * (match date confirmed, opponent, kick-off, venue, home / away, score, added / removed fixtures — saved in the
 * CalendarEdits sheet) merged with what actually happened (GPS: matches, sessions with MD tags and load, days off).
 * Page: next matches (cards) · month (crests on match days, team bars, MD tags) · season fixtures (scrolling list)
 * with the players unavailable today. Weeks run Sunday → Saturday; upcoming days show the MD tag planned from
 * the next match.
 */
const CAL = { data: null, month: null, showB: false, sheet: null, form: null, fx: 'all' };
const FX_FILTERS = [['all', 'All'], ['QSL', 'QSL'], ['ACL Elite', 'ACL Elite'], ['cups', 'Cups'], ['Friendly', 'Friendlies']];
const COMP_COLOR = {
  QSL: '#8e1b4f', 'Qatar Cup': '#ff9500', 'Amir Cup': '#e63322', 'ACL Elite': '#1d3fd8', 'QSL Cup': '#5b9bd5',
  Friendly: '#34a853', International: '#d4ac0d', 'QSL 2': '#8e8e93', Camp: '#34c759',
};
const MATCH_COMPS = ['QSL', 'Qatar Cup', 'Amir Cup', 'QSL Cup', 'ACL Elite', 'Friendly'];
const CAL_METRICS = [['td', 'TD'], ['hit', 'HIT'], ['acc_dec', 'A/D'], ['srpe', 'RPE']];

// ------------------------------------------------------------------ edits (same rules as sync/build.py apply_edits)
function applyCalendarEdits(cal) {
  const events = cal.events.map((e) => ({ ...e }));
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  (cal.edits || []).forEach((ed) => {
    const d = ed.data || {};
    let e = byId[ed.id];
    if (!e) {
      if (!d.added || !d.date) return;
      e = { id: ed.id, kind: 'match', start: d.date, end: d.date, gharafa: 'yes', competition: d.competition || 'Friendly', added: true };
      events.push(e);
      byId[ed.id] = e;
    }
    e.edit = ed;
    if (d.hidden) e.hidden = true;
    if (d.date) {
      Object.assign(e, { start: d.date, end: d.date, confirmed_date: d.date, gharafa: 'yes' });
      if (e.kind === 'window') e.kind = 'match';
    }
    ['opponent', 'time', 'venue', 'competition', 'round', 'note', 'ha', 'gf', 'ga'].forEach((f) => { if (d[f] != null && d[f] !== '') e[f] = d[f]; });
  });
  const played = cal.match_days || [];
  return events.filter((e) => !e.hidden).map((e) => {
    if (e.edit && (e.kind === 'match' || e.kind === 'window')) {
      const hit = played.filter((m) => m >= e.start && m <= (e.end || e.start));
      if (hit.length === 1) e.played_date = hit[0]; else delete e.played_date;
    }
    return e;
  }).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Al Gharafa match dates: played (GPS) + upcoming fixtures (confirmed date, else first day of the window). */
function gharafaMatchDates(cal, events) {
  const set = new Set(cal.match_days || []);
  events.forEach((e) => { if (e.kind === 'match' && e.gharafa === 'yes' && !e.played_date) set.add(e.confirmed_date || e.start); });
  return [...set].sort();
}

function computedTag(d, prev, next) {
  const since = prev ? daysBetween(prev, d) : null, until = next ? daysBetween(d, next) : null;
  if (since != null && since >= 3 && (until == null || until > 7)) return null;
  if (since === 1) return 'MD+1';
  if (since === 2 && (until == null || until >= 4)) return 'MD+2';
  if (until != null) return `MD-${until}`;
  return since != null ? `MD+${since}` : null;
}
function cycleType(len) { return len == null ? null : len <= 4 ? 'short' : len <= 7 ? 'normal' : len <= 12 ? 'long' : null; }

// ------------------------------------------------------------------ page
function renderCalendar(opts) {
  const root = document.getElementById('view-calendar');
  root.innerHTML = `
    ${pageHead('Season 2026/27', 'Calendar', 'ca-sub', `<button type="button" class="btn-light" id="ca-add">+ Add match</button>
      <label class="toggle"><input type="checkbox" id="ca-b"> B-team (QSL 2)</label>`)}
    <div class="ca-sec" id="ca-next-h">Next matches</div><div class="ca-up" id="ca-next"></div>
    <div class="ca-sec ca-month-h"><div class="stepper"><button type="button" id="ca-prev" aria-label="Previous month">‹</button><span class="month-label" id="ca-month"></span><button type="button" id="ca-next-m" aria-label="Next month">›</button></div>
      <button type="button" class="btn-light" id="ca-today">Today</button></div>
    <section class="panel cal-panel"><div class="cal2" id="ca-grid"></div></section>
    <div class="legend-row" id="ca-legend"></div>
    <div class="ca-sec">Season fixtures</div>
    <div class="ca-below"><div class="fxb" id="ca-fx"></div><div id="ca-unav"></div></div>
    <details class="panel ca-cycles"><summary class="panel-title small">Microcycles this season <span class="panel-note">days between consecutive matches</span></summary><div id="ca-cycles"></div></details>
    <div class="sheet-backdrop" id="ca-sheet-bg" hidden></div>
    <aside class="sheet" id="ca-sheet" hidden aria-modal="true" role="dialog"></aside>`;
  document.getElementById('ca-prev').onclick = () => { CAL.month = shiftMonth(CAL.month, -1); drawCalendar(); };
  document.getElementById('ca-next-m').onclick = () => { CAL.month = shiftMonth(CAL.month, 1); drawCalendar(); };
  document.getElementById('ca-today').onclick = () => { CAL.month = todayIso().slice(0, 7); drawCalendar(); };
  document.getElementById('ca-add').onclick = () => openDay(CAL.data && todayIso() > CAL.data.as_of ? todayIso() : addDays((CAL.data || {}).as_of || todayIso(), 1), { add: true });
  document.getElementById('ca-b').onchange = (e) => { CAL.showB = e.target.checked; drawCalendar(); };
  document.getElementById('ca-sheet-bg').onclick = closeDay;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CAL.sheet) closeDay(); });
  withData('calendar', (d) => { CAL.data = d; drawCalendar(); }, (err) => { root.innerHTML = loadError(err); });
  withData('squad', (d) => { CAL.squad = d; drawUnavailable(); }, () => { CAL.squad = null; drawUnavailable(); });
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function eventColor(e) { return COMP_COLOR[e.kind === 'camp' ? 'Camp' : e.kind === 'international' ? 'International' : e.competition] || '#8e8e93'; }
function eventTitle(e) {
  if (e.kind === 'match') {
    const r = e.round || '';
    const name = !r ? e.competition : r.includes(e.competition) || e.competition === 'Friendly' ? r : `${e.competition} ${r}`;
    return `${name}${e.opponent ? ' · ' + e.opponent : ''}`;
  }
  if (e.kind === 'window') return `${e.competition} · ${e.round}`;
  if (e.kind === 'b_team') return `B · QSL 2 ${e.round}`;
  return e.note || e.competition || e.kind;
}
function isEditable(e) { return e.kind === 'match' || e.kind === 'window'; }
function eventsOn(events, iso) {
  return events.filter((e) => (CAL.showB || e.kind !== 'b_team') && iso >= e.start && iso <= (e.end || e.start)
    && !(e.played_date && e.played_date !== iso && (e.kind === 'match' || e.kind === 'window')));
}

/** Mini bar: length = % of match demands, colour = team z vs the usual for this MD tag and microcycle type. */
function calMetricsHtml(g) {
  if (!g || !g.m) return '';
  return `<div class="cms">${CAL_METRICS.map(([k, l]) => {
    const v = g.m[k];
    if (!v) return '';
    const lv = zLevel(v[1]);
    const txt = k === 'td' ? (v[0] / 1000).toFixed(1) + 'k' : fmtN(v[0]);
    return `<div class="cm" title="${METRIC_LONG[k] || l}: ${fmtN(v[0])}${v[1] != null ? ` · z ${fmtSigned(v[1])} (${Z_LABEL[lv]})` : ''}"><span>${l}</span><b><i style="width:${Math.max(4, Math.min(100, v[2] || 0))}%;background:${lv ? Z_COL[lv] : '#aeaeb2'}"></i></b><em>${txt}</em></div>`;
  }).join('')}</div>`;
}

/** Home / away: as set by the staff, else from the venue (Thani Bin Jassim = home, "(away)" in the club calendar). */
function matchHA(e) { return e.ha || (/\(away\)/i.test(e.venue || '') ? 'A' : /thani bin jassim/i.test(e.venue || '') ? 'H' : ''); }
function matchResult(e) {
  if (e.gf == null || e.ga == null || e.gf === '' || e.ga === '') return null;
  const gf = Number(e.gf), ga = Number(e.ga);
  return { gf, ga, r: gf > ga ? 'W' : gf < ga ? 'L' : 'D' };
}
const RES_COL = { W: '#34c759', D: '#aeaeb2', L: '#e5484d' };
function resultHtml(e, big) {
  const r = matchResult(e);
  return r ? `<span class="res${big ? ' big' : ''}"><i style="background:${RES_COL[r.r]}"></i>${r.gf} – ${r.ga}</span>` : '';
}
function venueShort(v) { return String(v || '').replace(/\s*\(away\)/i, '').replace(/ International$/, ''); }
function matchDate(e) { return e.played_date || e.confirmed_date || e.start; }
function compChip(e) { return `<span class="comp" style="--cc:${eventColor(e)}">${escapeHtml(e.kind === 'b_team' ? 'QSL 2' : e.competition || '')}</span>`; }

function drawCalendar() {
  const d = CAL.data;
  if (!d || document.getElementById('view-calendar').hidden) return;
  if (!CAL.month) CAL.month = todayIso().slice(0, 7);
  const nEdits = (d.edits || []).length;
  document.getElementById('ca-sub').textContent = `Fixtures from the club calendar${nEdits ? ` + ${nEdits} staff edit${nEdits > 1 ? 's' : ''}` : ''} · sessions and matches from GPS up to ${fmtDay(d.as_of, { day: 'numeric', month: 'short' })} · tap a day or a match to edit it`;
  const [y, m] = CAL.month.split('-').map(Number);
  document.getElementById('ca-month').textContent = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const events = applyCalendarEdits(d);
  const today = todayIso();
  drawNextMatches(events, today);
  drawMonth(events, today);
  drawFixtures(events, today);
  drawUnavailable();
  document.getElementById('ca-cycles').innerHTML = d.cycles.length ? `<div class="list">${d.cycles.slice().reverse().map((c) => `<div class="li"><span class="tag">${c.type ? TYPE_LABEL[c.type] : 'Break'}</span><div><b>${c.length} days</b><small>${fmtDay(c.from, { day: 'numeric', month: 'short' })} → ${fmtDay(c.to, { day: 'numeric', month: 'short' })}</small></div></div>`).join('')}</div>` : emptyState('No completed microcycle yet.');
  if (CAL.sheet) drawDay();
}

/** The next four Al Gharafa matches, as cards. */
function drawNextMatches(events, today) {
  const up = events.filter((e) => e.kind === 'match' && e.gharafa === 'yes' && !e.played_date && matchDate(e) >= today).slice(0, 4);
  const box = document.getElementById('ca-next');
  document.getElementById('ca-next-h').hidden = box.hidden = !up.length;
  box.innerHTML = up.map((e, i) => {
    const dd = daysBetween(today, matchDate(e)), ha = matchHA(e), tbc = e.start !== (e.end || e.start) && !e.confirmed_date;
    return `<button type="button" class="upc${i ? '' : ' first'}" data-ev="${e.id}" data-date="${matchDate(e)}">
      <div class="t"><span>${fmtDay(matchDate(e), { weekday: 'short', day: '2-digit', month: '2-digit' })}${tbc ? ' · TBC' : ''} · <b>${dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : `in ${dd} days`}</b></span>${compChip(e)}</div>
      <div class="m">${crestHtml('Al Gharafa', 46)}<span>${escapeHtml(e.time || 'vs')}</span>${crestHtml(e.opponent, 46)}</div>
      <h4>${escapeHtml(e.opponent || 'Opponent tbc')}</h4>
      <div class="w">${ha ? `<span class="ha ha-${ha}">${ha}</span>` : ''}<span>${escapeHtml([e.round, venueShort(e.venue) || 'venue tbc'].filter(Boolean).join(' · '))}</span></div></button>`;
  }).join('');
  box.onclick = (ev) => { const c = ev.target.closest('[data-ev]'); if (c) openDay(c.dataset.date, { edit: c.dataset.ev }); };
}

/** Month grid: MD tag, opponent crest on match days, team load bars, days off, windows. */
function drawMonth(events, today) {
  const d = CAL.data, [y, m] = CAL.month.split('-').map(Number);
  const matchDates = gharafaMatchDates(d, events);
  const days = Object.fromEntries(d.days.map((x) => [x.date, x]));
  const lead = dateOf(`${CAL.month}-01`).getUTCDay(), nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => `<div class="cal-dow">${w}</div>`).join('');
  for (let i = 0; i < lead; i++) html += '<div class="dc pad"></div>';
  for (let day = 1; day <= nDays; day++) {
    const iso = `${CAL.month}-${String(day).padStart(2, '0')}`, g = days[iso], future = iso > d.as_of;
    const evs = eventsOn(events, iso);
    const match = evs.find((e) => e.kind === 'match' && e.gharafa === 'yes' && (e.played_date === iso || (!e.played_date && (e.start === (e.end || e.start) || e.confirmed_date))));
    const camp = evs.find((e) => e.kind === 'camp');
    let kind = g ? g.kind : null, tag = g ? (g.kind === 'match' ? 'MD' : g.md) : null, planned = false;
    if (match) { kind = 'match'; tag = 'MD'; }
    if (future && !g) {
      const prev = matchDates.filter((x) => x < iso).pop(), next = matchDates.find((x) => x > iso);
      tag = match ? 'MD' : computedTag(iso, prev, next);
      planned = !match;
      if (!kind && tag) kind = 'plan';
    }
    const col = match ? eventColor(match) : null;
    const chip = tag ? `<span class="ctag ${kind === 'match' ? 'match' : planned ? 'plan' : 'train'}"${col ? ` style="background:${col}"` : ''}>${tag}</span>` : kind === 'training' ? '<span class="ctag train">Training</span>' : '';
    let inner = '';
    if (match) inner += `<div class="dm" data-ev="${match.id}">${crestHtml(match.opponent, 30)}<b>${escapeHtml(match.opponent || match.competition)}</b><small>${escapeHtml(match.round || match.competition || '')}${match.time && !matchResult(match) ? ' · ' + escapeHtml(match.time) : ''}</small>${resultHtml(match)}</div>`;
    evs.filter((e) => e !== match && e.kind !== 'camp').forEach((e) => {
      const multi = e.start !== (e.end || e.start);
      if (multi && iso !== e.start && dateOf(iso).getUTCDay() !== 0 && day !== 1) return; // long windows: label on the first day of each week only
      const tbc = (e.kind === 'match' || e.kind === 'window') && !e.played_date && multi && !e.confirmed_date;
      inner += `<span class="dnote${tbc ? ' tbc' : ''}" style="--cc:${eventColor(e)}" ${isEditable(e) ? `data-ev="${e.id}"` : ''} title="${escapeHtml([eventTitle(e), e.time, e.venue, tbc ? 'date TBC' : ''].filter(Boolean).join(' · '))}">${escapeHtml(eventTitle(e))}</span>`;
    });
    if (camp && iso === camp.start) inner += `<span class="dnote" style="--cc:${eventColor(camp)}">${escapeHtml(camp.note || 'Camp')}</span>`;
    if (kind === 'off') inner += '<span class="doff">Day off</span>';
    else if (kind === 'individual') inner += '<span class="dnote">Recovery / individual</span>';
    inner += calMetricsHtml(g);
    const stripe = evs.find((e) => e.kind === 'international' || (e.kind === 'window' && e.start !== e.end));
    html += `<div class="dc k-${kind || 'none'} ${iso === today ? 'today' : ''} ${camp ? 'camp' : ''}" data-date="${iso}" ${col ? `style="--cc:${col}"` : ''}>
      <div class="dh"><span class="dn">${day}</span>${chip}${match && match.edit ? '<u title="edited by staff">✎</u>' : ''}</div>${inner}${stripe ? `<i class="dstripe" style="--sc:${eventColor(stripe)}"></i>` : ''}</div>`;
  }
  const grid = document.getElementById('ca-grid');
  grid.innerHTML = html;
  grid.onclick = (e) => {
    const ev = e.target.closest('[data-ev]'), c = e.target.closest('[data-date]');
    if (c) openDay(c.dataset.date, ev ? { edit: ev.dataset.ev } : {});
  };
  const used = new Set(events.filter((e) => e.competition || e.kind === 'camp' || e.kind === 'international').map((e) => (e.kind === 'camp' ? 'Camp' : e.kind === 'international' ? 'International' : e.competition)));
  document.getElementById('ca-legend').innerHTML = `<span class="lg-k"><b class="ctag match">MD</b>match</span><span class="lg-k"><b class="ctag train">MD-2</b>training</span><span class="lg-k"><b class="ctag plan">MD-3</b>planned</span><span class="lg-k"><b class="coff sm">Off</b>day off</span>`
    + `<span class="lg-sep"></span>${Object.entries(Z_LABEL).map(([k, l]) => `<span><i style="background:${Z_COL[k]}"></i>${l}</span>`).join('')}<span class="muted">bars: team TD · HIT · Acc/Dec · sRPE — length = % of a match, colour = z vs the usual for that MD</span>`
    + `<span class="lg-sep"></span>${Object.entries(COMP_COLOR).filter(([k]) => used.has(k)).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<span><i class="dashed"></i>window · date TBC</span>`;
}

/** Season fixtures in a scrolling box, opened on the last results and the next match. */
function drawFixtures(events, today) {
  const isCup = (c) => /Cup/.test(c || '');
  const list = events.filter((e) => ((e.kind === 'match' && e.gharafa === 'yes') || e.kind === 'window' || (CAL.showB && e.kind === 'b_team'))
    && (CAL.fx === 'all' || (CAL.fx === 'cups' ? isCup(e.competition) : e.competition === CAL.fx)))
    .map((e) => ({ e, date: matchDate(e) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const nextIdx = list.findIndex((x) => x.date >= today && !x.e.played_date);
  let rows = '', month = '';
  list.forEach(({ e, date }, i) => {
    const mo = fmtDay(date, { month: 'long', year: 'numeric' });
    if (mo !== month) { month = mo; rows += `<tr class="mo"><td colspan="6">${mo}</td></tr>`; }
    const ha = matchHA(e), past = date < today || e.played_date, tbc = e.start !== (e.end || e.start) && !e.confirmed_date && !e.played_date;
    const res = resultHtml(e) || (past && e.kind === 'match' ? '<span class="add">+ Score</span>' : '');
    rows += `<tr class="${i === nextIdx ? 'nx' : ''} ${e.kind === 'window' ? 'win' : ''}" ${isEditable(e) ? `data-ev="${e.id}" data-date="${date}"` : ''}>
      <td>${fmtDay(date, { weekday: 'short', day: '2-digit', month: '2-digit' })}${tbc ? ' <small>TBC</small>' : ''}</td><td class="muted">${escapeHtml(e.time || '—')}</td>
      <td><span class="fx-op">${crestHtml(e.opponent || e.competition, 24)}${escapeHtml(e.opponent || (e.kind === 'window' ? 'Participation tbc' : ''))}</span></td>
      <td>${ha ? `<span class="ha ha-${ha}">${ha}</span>` : ''}</td><td>${res}</td><td>${compChip(e)} <small class="muted">${escapeHtml(e.round || '')}</small></td></tr>`;
  });
  const box = document.getElementById('ca-fx');
  box.innerHTML = `<div class="fxb-h"><h3>Matches</h3><div class="chips">${FX_FILTERS.map(([k, l]) => `<button type="button" data-fx="${k}" class="${CAL.fx === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="fxs" id="ca-fxs">${rows ? `<table class="fx-tbl"><tbody>${rows}</tbody></table>` : emptyState('No match for this filter.')}</div>`;
  box.querySelectorAll('[data-fx]').forEach((b) => { b.onclick = () => { CAL.fx = b.dataset.fx; drawFixtures(applyCalendarEdits(CAL.data), todayIso()); }; });
  box.querySelector('#ca-fxs').onclick = (ev) => { const r = ev.target.closest('[data-ev]'); if (r) openDay(r.dataset.date, { edit: r.dataset.ev }); };
  const sc = box.querySelector('#ca-fxs'), nx = sc.querySelector('tr.nx');
  if (nx) sc.scrollTop = Math.max(0, nx.offsetTop - 44 - 2 * nx.offsetHeight); // the last results stay visible above the next match
}

/** Players unavailable today (Squad data: status on the last day of GPS data). */
function drawUnavailable() {
  const el = document.getElementById('ca-unav');
  if (!el) return;
  const sq = CAL.squad, st = sq && sq.stats && sq.stats.players;
  if (!st) { el.innerHTML = ''; return; }
  const active = (sq.profiles || []).filter((p) => p.status !== 'left' && st[p.player_id]);
  const out = active.filter((p) => st[p.player_id].status !== 'available');
  const col = { injured: '#e5484d', rehab: '#ff9f0a', sick: '#a463f2', 'national team': '#2a78d6' };
  const lab = { injured: 'Injured', rehab: 'Rehab', sick: 'Sick', 'national team': 'National team' };
  el.innerHTML = `<div class="news"><h4>Unavailable<b>${active.length - out.length}/${active.length} available</b></h4>
    ${out.length ? out.map((p) => `<div><i style="background:${col[st[p.player_id].status]}"></i><b>${escapeHtml(p.display_name || p.player_id)}</b><span>${lab[st[p.player_id].status]}</span></div>`).join('') : '<p class="note">Everybody is available.</p>'}
    <p class="note">On ${fmtDay(sq.stats.as_of, { day: 'numeric', month: 'short' })} (last GPS data) · <a href="#roster" class="linkbtn">Squad ›</a></p></div>`;
}

// ------------------------------------------------------------------ day sheet (details + edit)
function openDay(iso, opts = {}) {
  CAL.sheet = iso;
  CAL.form = opts.add ? { id: null, add: true } : opts.edit ? { id: opts.edit } : null;
  document.getElementById('ca-sheet').hidden = false;
  document.getElementById('ca-sheet-bg').hidden = false;
  drawDay();
}
function closeDay() {
  CAL.sheet = null; CAL.form = null;
  document.getElementById('ca-sheet').hidden = true;
  document.getElementById('ca-sheet-bg').hidden = true;
}

function drawDay() {
  const d = CAL.data, iso = CAL.sheet, el = document.getElementById('ca-sheet');
  if (!d || !iso) return;
  const events = applyCalendarEdits(d);
  const g = d.days.find((x) => x.date === iso);
  const evs = eventsOn(events, iso).filter(isEditable);
  const other = eventsOn(events, iso).filter((e) => !isEditable(e));
  const hiddenIds = new Set((d.edits || []).filter((x) => x.data && x.data.hidden).map((x) => x.id));
  const removed = d.events.filter((e) => hiddenIds.has(e.id) && iso >= e.start && iso <= (e.end || e.start));
  const sess = g && (g.kind === 'training' || g.kind === 'match');
  const metrics = g && g.m ? `<div class="sh-metrics">${CAL_METRICS.map(([k]) => {
    const v = g.m[k];
    if (!v) return '';
    const lv = zLevel(v[1]);
    return `<div><span>${METRIC_LONG[k]}${g.per90 ? ' <small>/90</small>' : ''}</span><b>${fmtN(v[0])}</b>${lv ? `<span class="zs ${lv}">${Z_LABEL[lv]} · z ${fmtSigned(v[1])}</span>` : '<small class="muted">no reference</small>'}</div>`;
  }).join('')}</div>` : '';
  const kindTxt = g ? ({ match: 'Match', training: `Training${g.md ? ' · ' + g.md : ''}`, off: 'Day off', individual: 'Recovery / individual work', none: 'No team session' }[g.kind]) : iso > d.as_of ? 'Upcoming' : 'No GPS data';

  const evRow = (e) => `<div class="li"><i style="background:${eventColor(e)}"></i><div><b>${escapeHtml(eventTitle(e))}${e.edit ? ' <span class="edited">edited</span>' : ''}</b><small>${e.start === e.end ? fmtDay(e.start) : `${fmtDay(e.start, { day: 'numeric', month: 'short' })} – ${fmtDay(e.end, { day: 'numeric', month: 'short' })} · date TBC`}${e.time ? ' · ' + escapeHtml(e.time) : ''}${e.venue ? ' · ' + escapeHtml(e.venue) : ''}${e.edit ? ` · by ${escapeHtml(String(e.edit.by || '').split('@')[0])}` : ''}</small></div><button type="button" class="btn-light" data-edit="${e.id}">Edit</button></div>`;

  el.innerHTML = `
    <div class="sheet-head"><div><div class="pg-eyebrow">${kindTxt}</div><h2>${fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><button type="button" class="sheet-x" aria-label="Close">×</button></div>
    ${metrics}
    ${sess ? `<button type="button" class="btn-light wide" id="sh-open">Open the session report ›</button>` : ''}
    ${other.length ? `<div class="sh-notes">${other.map((e) => `<span class="cnote">${escapeHtml(eventTitle(e))}</span>`).join('')}</div>` : ''}
    <h3 class="sh-sub">Fixtures</h3>
    ${evs.length ? `<div class="list">${evs.map(evRow).join('')}</div>` : '<p class="note">No fixture on this day.</p>'}
    ${removed.length ? `<p class="note">Removed: ${removed.map((e) => `${escapeHtml(eventTitle(e))} <button type="button" class="linkbtn" data-restore="${e.id}">restore</button>`).join(' · ')}</p>` : ''}
    ${CAL.form ? formHtml(events, iso) : `<button type="button" class="btn-light wide" id="sh-add">+ Add a match on this day</button>`}`;
  el.querySelector('.sheet-x').onclick = closeDay;
  const open = el.querySelector('#sh-open');
  if (open) open.onclick = () => { closeDay(); switchView('sessions', { date: iso }); };
  const add = el.querySelector('#sh-add');
  if (add) add.onclick = () => { CAL.form = { id: null, add: true }; drawDay(); };
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => { CAL.form = { id: b.dataset.edit }; drawDay(); }; });
  el.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = async () => {
    b.disabled = true;
    try { CAL.data.edits = await saveCalendarEdit(b.dataset.restore, null); cacheSet('calendar', CAL.data); drawCalendar(); } catch (err) { alert(err.message || err); b.disabled = false; }
  }; });
  if (CAL.form) bindForm(el, events, iso);
}

function formHtml(events, iso) {
  const f = CAL.form, e = f.id ? events.find((x) => x.id === f.id) || null : null;
  const isNew = !e || e.added;
  const date = e ? (e.confirmed_date || (e.start === e.end ? e.start : iso)) : iso;
  const v = (k) => escapeHtml((e && e[k]) || '');
  return `<form class="cal-form" id="sh-form" autocomplete="off">
    <h3 class="sh-sub">${isNew && !e ? 'New match' : 'Edit fixture'}</h3>
    ${e && e.kind === 'window' ? '<p class="note">Saving with a date turns this window into an Al Gharafa match on that day.</p>' : ''}
    ${e && e.start !== e.end && !e.confirmed_date ? `<p class="note">Window ${fmtDay(e.start, { day: 'numeric', month: 'short' })} – ${fmtDay(e.end, { day: 'numeric', month: 'short' })}: pick the match day.</p>` : ''}
    <label>Match day<input type="date" name="date" value="${date}" required></label>
    ${isNew ? `<label>Competition<select name="competition">${MATCH_COMPS.map((c) => `<option ${e && e.competition === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Round <small>optional</small><input name="round" value="${v('round')}" placeholder="e.g. QSL 7, Round of 16"></label>` : ''}
    <label>Opponent<input name="opponent" value="${v('opponent')}" placeholder="e.g. Al Sadd"></label>
    <div class="f2"><label>Kick-off<input type="time" name="time" value="${/^\d{1,2}:\d{2}$/.test((e && e.time) || '') ? e.time.padStart(5, '0') : ''}"></label>
      <label>Home / away<select name="ha"><option value="">—</option>${[['H', 'Home'], ['A', 'Away'], ['N', 'Neutral']].map(([k, l]) => `<option value="${k}" ${e && matchHA(e) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label>Stadium<input name="venue" value="${v('venue')}" placeholder="e.g. Thani Bin Jassim"></label>
    <div class="cal-score"><span>Al Gharafa</span><input type="number" name="gf" min="0" max="20" value="${e && e.gf != null ? escapeHtml(e.gf) : ''}" aria-label="Al Gharafa goals"><b>–</b><input type="number" name="ga" min="0" max="20" value="${e && e.ga != null ? escapeHtml(e.ga) : ''}" aria-label="Opponent goals"><span>${escapeHtml((e && e.opponent) || 'Opponent')}</span></div>
    <label>Note <small>optional</small><input name="note" value="${v('note')}" placeholder="e.g. extra time, penalties"></label>
    <div class="f-actions">
      <button type="submit" class="btn-primary">Save</button>
      <button type="button" class="btn-light" id="sh-cancel">Cancel</button>
      ${e && e.edit && !e.added ? '<button type="button" class="btn-light" id="sh-reset">Restore original</button>' : ''}
      ${e ? '<button type="button" class="btn-danger" id="sh-remove">Remove</button>' : ''}
    </div>
    <p class="f-msg" id="sh-msg"></p>
  </form>`;
}

function bindForm(el, events, iso) {
  const f = CAL.form, e = f.id ? events.find((x) => x.id === f.id) : null;
  const form = el.querySelector('#sh-form'), msg = el.querySelector('#sh-msg');
  const prev = (e && e.edit && e.edit.data) || {};
  const save = async (id, data, done) => {
    form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    msg.textContent = 'Saving…';
    try {
      CAL.data.edits = await saveCalendarEdit(id, data);
      cacheSet('calendar', CAL.data);
      CAL.form = null;
      if (done) CAL.sheet = done;
      drawCalendar();
      if (VIEWS.objectives && TR.obj) drawObjectives(); // planner follows the new match date
    } catch (err) {
      msg.textContent = err.message || String(err);
      form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!fd.date) { msg.textContent = 'Pick the match day.'; return; }
    const data = { ...prev, date: fd.date, opponent: fd.opponent.trim(), time: fd.time, venue: fd.venue.trim(), ha: fd.ha, note: fd.note.trim() };
    if ((fd.gf === '') !== (fd.ga === '')) { msg.textContent = 'Enter both scores (or none).'; return; }
    data.gf = fd.gf; data.ga = fd.ga; // empty = no score yet
    if (!e || e.added) Object.assign(data, { added: true, competition: fd.competition, round: fd.round.trim() });
    delete data.hidden;
    const id = e ? e.id : `added-${fd.date}-${Date.now().toString(36)}`;
    save(id, data, fd.date);
    CAL.month = fd.date.slice(0, 7);
  };
  el.querySelector('#sh-cancel').onclick = () => { CAL.form = null; drawDay(); };
  const reset = el.querySelector('#sh-reset');
  if (reset) reset.onclick = () => save(e.id, null);
  const rm = el.querySelector('#sh-remove');
  if (rm) rm.onclick = () => { if (confirm(`Remove “${eventTitle(e)}” from the calendar?`)) save(e.id, e.added ? null : { ...prev, hidden: true }); };
}
