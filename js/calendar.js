/**
 * Calendar: season fixtures (sync/calendar.csv, transcribed from the club PDF) merged with what actually
 * happened (GPS: matches, sessions with MD tags and load, days off) and this season's microcycles.
 * Fixture windows (e.g. "10–12 Sep") show until a GPS match inside the window confirms the real date.
 */
const CAL = { data: null, month: null, showB: false };
const COMP_COLOR = {
  QSL: '#8e1b4f', 'Qatar Cup': '#ff9500', 'Amir Cup': '#e63322', 'ACL Elite': '#1d3fd8', 'QSL Cup': '#5b9bd5',
  Friendly: '#34a853', International: '#d4ac0d', 'QSL 2': '#8e8e93', Camp: '#34c759',
};

function renderCalendar(opts) {
  const root = document.getElementById('view-calendar');
  root.innerHTML = `
    ${pageHead('Season 2026/27', 'Calendar', 'ca-sub', `<div class="stepper"><button type="button" id="ca-prev" aria-label="Previous month">‹</button><span class="month-label" id="ca-month"></span><button type="button" id="ca-next" aria-label="Next month">›</button></div>
      <button type="button" class="btn-light" id="ca-today">Today</button>
      <label class="toggle"><input type="checkbox" id="ca-b"> B-team (QSL 2)</label>`)}
    <section class="panel cal-panel"><div class="cal" id="ca-grid"></div></section>
    <div class="legend-row" id="ca-legend"></div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Upcoming</h2></div><div id="ca-upcoming"></div></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Microcycles this season</h2><span class="panel-note">days between consecutive matches</span></div><div id="ca-cycles"></div></section>
    </div>`;
  document.getElementById('ca-prev').onclick = () => { CAL.month = shiftMonth(CAL.month, -1); drawCalendar(); };
  document.getElementById('ca-next').onclick = () => { CAL.month = shiftMonth(CAL.month, 1); drawCalendar(); };
  document.getElementById('ca-today').onclick = () => { CAL.month = todayIso().slice(0, 7); drawCalendar(); };
  document.getElementById('ca-b').onchange = (e) => { CAL.showB = e.target.checked; drawCalendar(); };
  withData('calendar', (d) => { CAL.data = d; drawCalendar(); }, (err) => { root.innerHTML = loadError(err); });
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

function drawCalendar() {
  const d = CAL.data;
  if (!d || document.getElementById('view-calendar').hidden) return;
  if (!CAL.month) CAL.month = todayIso().slice(0, 7);
  document.getElementById('ca-sub').textContent = `Fixtures from the club calendar · sessions and matches from GPS up to ${fmtDay(d.as_of, { day: 'numeric', month: 'short' })}`;
  const [y, m] = CAL.month.split('-').map(Number);
  document.getElementById('ca-month').textContent = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const days = Object.fromEntries(d.days.map((x) => [x.date, x]));
  const events = d.events.filter((e) => CAL.showB || e.kind !== 'b_team');
  const first = `${CAL.month}-01`;
  const lead = (dateOf(first).getUTCDay() + 6) % 7; // Monday-first grid
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayIso();
  let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<div class="cal-dow">${w}</div>`).join('');
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell pad"></div>';
  for (let day = 1; day <= nDays; day++) {
    const iso = `${CAL.month}-${String(day).padStart(2, '0')}`;
    const g = days[iso];
    const evs = events.filter((e) => iso >= e.start && iso <= (e.end || e.start) && !(e.played_date && e.played_date !== iso && (e.kind === 'match' || e.kind === 'window')));
    const camp = evs.find((e) => e.kind === 'camp');
    let inner = '';
    evs.filter((e) => e.kind !== 'camp').forEach((e) => {
      const col = eventColor(e);
      if (e.kind === 'match' || e.kind === 'window' || e.kind === 'international') {
        const tbc = !e.played_date && e.start !== (e.end || e.start) && !e.confirmed_date;
        const faded = e.kind === 'window' && !e.played_date;
        inner += `<div class="cev ${faded ? 'win' : ''} ${tbc ? 'tbc' : ''}" style="--c:${col}" title="${escapeHtml([eventTitle(e), e.time, e.venue, tbc ? 'date TBC' : ''].filter(Boolean).join(' · '))}"><i></i>${escapeHtml(eventTitle(e))}${e.time && !tbc ? ` <small>${escapeHtml(e.time)}</small>` : ''}</div>`;
      } else {
        inner += `<div class="cnote">${escapeHtml(eventTitle(e))}</div>`;
      }
    });
    if (g && g.kind === 'training') inner += `<div class="csess"><span class="tag">${g.md || 'Training'}</span>${g.td ? `<span class="cbar"><i style="width:${Math.min(100, g.td / 80)}%"></i></span><small>${(g.td / 1000).toFixed(1)} km</small>` : ''}</div>`;
    else if (g && g.kind === 'match' && !evs.some((e) => e.kind === 'match' || e.played_date)) inner += `<div class="csess"><span class="tag strong">MD</span>${g.td ? `<small>${(g.td / 1000).toFixed(1)} km</small>` : ''}</div>`;
    else if (g && g.kind === 'off') inner += '<div class="cnote">Off</div>';
    const clickable = g && (g.kind === 'training' || g.kind === 'match');
    html += `<div class="cal-cell ${iso === today ? 'today' : ''} ${camp ? 'camp' : ''} ${clickable ? 'clickable' : ''}" ${clickable ? `data-date="${iso}"` : ''}>
      <div class="cday">${day}${camp && iso === camp.start ? `<span class="cnote inline">${escapeHtml(camp.note || 'Camp')}</span>` : ''}</div>${inner}</div>`;
  }
  const grid = document.getElementById('ca-grid');
  grid.innerHTML = html;
  grid.onclick = (e) => { const c = e.target.closest('[data-date]'); if (c) switchView('sessions', { date: c.dataset.date }); };

  const used = new Set(d.events.filter((e) => e.competition || e.kind === 'camp' || e.kind === 'international').map((e) => (e.kind === 'camp' ? 'Camp' : e.kind === 'international' ? 'International' : e.competition)));
  document.getElementById('ca-legend').innerHTML = Object.entries(COMP_COLOR).filter(([k]) => used.has(k)).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')
    + '<span><i class="dashed"></i>window · date TBC</span><span>tap a session day to open it</span>';

  const up = d.events.filter((e) => ['match', 'window', 'international'].includes(e.kind) && (e.end || e.start) >= today && !e.played_date).slice(0, 10);
  document.getElementById('ca-upcoming').innerHTML = up.length ? `<div class="list">${up.map((e) => {
    const range = e.start === (e.end || e.start) ? fmtDay(e.start) : `${fmtDay(e.start, { day: 'numeric', month: 'short' })} – ${fmtDay(e.end, { day: 'numeric', month: 'short' })}`;
    const status = e.kind === 'match' ? (e.start === e.end || e.confirmed_date ? 'Al Gharafa' : 'Al Gharafa · date TBC') : e.kind === 'international' ? 'International window' : 'Participation / date TBC';
    return `<div class="li"><i style="background:${eventColor(e)}"></i><div><b>${escapeHtml(eventTitle(e))}</b><small>${range} · ${status}${e.time ? ' · ' + escapeHtml(e.time) : ''}${e.venue ? ' · ' + escapeHtml(e.venue) : ''}</small></div></div>`;
  }).join('')}</div>` : emptyState('No upcoming fixture in the calendar.');

  document.getElementById('ca-cycles').innerHTML = d.cycles.length ? `<div class="list">${d.cycles.slice().reverse().map((c) => `<div class="li"><span class="tag">${c.type ? TYPE_LABEL[c.type] : 'Break'}</span><div><b>${c.length} days</b><small>${fmtDay(c.from, { day: 'numeric', month: 'short' })} → ${fmtDay(c.to, { day: 'numeric', month: 'short' })}</small></div></div>`).join('')}</div>` : emptyState('No completed microcycle yet.');
}
