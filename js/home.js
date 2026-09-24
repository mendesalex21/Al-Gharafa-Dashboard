/** Renders the home page from the pre-computed payload (see Compute.gs > buildHome). */

const STATUS_WORD = { green: 'Healthy', orange: 'Attention', red: 'Alert', na: 'Unavailable', none: 'No data' };
const METRIC_META = {
  dt: { label: 'Total distance', fmt: (v) => (v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' km' },
  hit_dt: { label: 'High-intensity distance', fmt: (v) => Math.round(v).toLocaleString('en-GB') + ' m' },
  acc_dec: { label: 'Acc + Dec', fmt: (v) => Math.round(v).toLocaleString('en-GB') },
  sprint_dt: { label: 'Sprints', fmt: (v) => Math.round(v).toLocaleString('en-GB') + ' m' },
  rpe_load: { label: 'RPE load', fmt: (v) => Math.round(v).toLocaleString('en-GB') },
};
const SEVERITY = { red: 0, orange: 1, green: 2, none: 3, na: 4 };

function fmtDay(d) { return capitalize(new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(d + 'T12:00:00'))); }
function fmtFull(d) { return capitalize(new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00'))); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function badge(status) { return `<span class="status-badge ${status}"><span class="dot"></span>${STATUS_WORD[status] || status}</span>`; }

async function renderHome() {
  let data;
  try {
    data = await fetchHome();
  } catch (err) {
    document.getElementById('view-home').innerHTML = `<div class="card" style="padding:24px"><strong>Couldn't load data.</strong><p class="hint">${escapeHtml(err.message)}</p></div>`;
    return;
  }
  window.APP_TODAY = data.today;
  document.getElementById('today-pill').textContent = fmtFull(data.today);
  if (AUTH.user) document.getElementById('avatar').textContent = (AUTH.user.name || AUTH.user.email || '?').slice(0, 1).toUpperCase();

  renderAlerts(data.alerts);
  renderSession(data.session);
  renderWeek(data.week);
  renderPlayers(data.players);
}

// ---------- 1. Wellness alerts ----------
function renderAlerts(alerts) {
  const root = document.getElementById('view-home');
  const isAlert = alerts.count > 0;
  const banner = isAlert
    ? `<div class="alert-banner is-alert"><div class="alert-count">${alerts.count}</div><div class="alert-copy"><strong>${alerts.count} player${alerts.count > 1 ? 's' : ''} in alert</strong><br>wellness trending down — check before today's session</div></div>`
    : `<div class="alert-banner is-calm"><div class="alert-count">0</div><div class="alert-copy"><strong>Everyone's doing fine</strong><br>no concerning wellness signal today</div></div>`;

  const cards = alerts.players.map((p) => `
    <div class="card alert-card ${p.base_low ? 'base-low' : ''}">
      <div class="alert-card-top">
        <div><div class="alert-card-name">${escapeHtml(p.name)}</div><div class="alert-card-pos">${escapeHtml(p.position || '')}</div></div>
        ${badge(p.level)}
      </div>
      <div class="alert-card-metrics">
        <div class="metric-mini"><div class="v">${p.avg != null ? p.avg.toFixed(1) : '—'}</div><div class="l">average / 5</div></div>
        <div class="metric-mini"><div class="v">${p.trend != null ? (p.trend > 0 ? '+' : '') + p.trend.toFixed(1) : '—'}</div><div class="l">vs usual</div></div>
      </div>
      <div class="alert-card-reason">${escapeHtml(p.reasons || '')}</div>
      ${p.base_low ? `<span class="base-low-note">Personal baseline already low — take with a grain of salt</span>` : ''}
    </div>`).join('');

  const calmChips = alerts.ok.map((p) => `<span class="chip"><span class="dot" style="background:var(--good)"></span>${escapeHtml(p.name)}</span>`).join('');
  const missingLine = alerts.missing.length
    ? `<p class="hint" style="margin-top:14px">No check-in yet today: ${alerts.missing.map((m) => escapeHtml(m.name)).join(', ')}</p>` : '';

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-head"><div><h2 class="section-title">Today's wellness</h2><p class="section-sub">Based on this morning's check-in, compared with each player's usual pattern</p></div></div>
    ${banner}
    ${cards ? `<div class="alert-grid">${cards}</div>` : ''}
    ${alerts.ok.length ? `<p class="calm-list-label">Rest of the squad — all in the green</p><div class="calm-chips">${calmChips}</div>` : ''}
    ${missingLine}
  `;
  root.appendChild(section);
}

// ---------- 2. Yesterday's session ----------
function renderSession(session) {
  const root = document.getElementById('view-home');
  const section = document.createElement('section');
  section.className = 'section';

  if (!session) {
    section.innerHTML = `<div class="section-head"><h2 class="section-title">Last session</h2></div><div class="card rest-day"><div class="big">Rest day</div><p class="hint">No session recorded recently</p></div>`;
    root.appendChild(section);
    return;
  }
  const kpis = Object.keys(METRIC_META).map((k) => `
    <div class="kpi"><div class="label">${METRIC_META[k].label}</div><div class="value">${METRIC_META[k].fmt(session.totals[k])}</div>
      <div class="delta">avg. ${METRIC_META[k].fmt(session.per_player[k])} / player</div></div>`).join('');
  const absentees = session.not_participating.length ? `
    <div class="absentees"><p class="absentees-title">Did not take part (${session.not_participating.length})</p>
      <div class="calm-chips">${session.not_participating.map((p) => `<span class="chip muted">${escapeHtml(p.name)} · ${escapeHtml(p.reason || '—')}</span>`).join('')}</div>
    </div>` : '';

  section.innerHTML = `
    <div class="section-head"><div><h2 class="section-title">${session.is_yesterday ? 'Yesterday’s session' : 'Last session'}</h2><p class="section-sub">${fmtFull(session.date)}</p></div></div>
    <div class="card session-card">
      <div class="session-head">
        <span class="session-date">${session.is_match ? 'Match' : 'Training'}</span>
        ${session.md_tag ? `<span class="tag ${session.is_match ? 'match' : ''}">${escapeHtml(session.md_tag)}</span>` : ''}
        <span class="tag">Avg RPE ${session.avg_rpe != null ? session.avg_rpe : '—'}/10</span>
        <span class="participation-note">${session.participants} / ${session.squad} players took part</span>
      </div>
      <div class="kpi-row">${kpis}</div>
      ${absentees}
    </div>`;
  root.appendChild(section);
}

// ---------- 3. Current week load ----------
function renderWeek(week) {
  const root = document.getElementById('view-home');
  const max = Math.max(1, ...week.days.map((d) => d.dt));
  const bars = week.days.map((d) => {
    const isToday = d.date === APP_TODAY;
    const h = Math.round((d.dt / max) * 100);
    return `<div class="bar-col"><div class="bar ${isToday ? 'is-today' : ''}" style="height:${d.dt ? Math.max(h, 3) : 0}%" title="${METRIC_META.dt.fmt(d.dt)}"></div><span class="daylabel ${isToday ? 'is-today' : ''}">${fmtDay(d.date)}</span></div>`;
  }).join('');
  const kpis = Object.keys(METRIC_META).map((k) => {
    const delta = week.delta_pct[k];
    const arrow = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    return `<div class="kpi"><div class="label">${METRIC_META[k].label}</div><div class="value">${METRIC_META[k].fmt(week.totals[k])}</div>
      <div class="delta">${arrow} ${delta != null ? Math.abs(delta) + '%' : '—'} vs last week</div></div>`;
  }).join('');

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-head"><div><h2 class="section-title">This week's load</h2><p class="section-sub">Week of ${fmtFull(week.start)} — team overview</p></div></div>
    <div class="card week-card">
      <div class="kpi-row">${kpis}</div>
      <div class="chart-wrap"><div class="bars">${bars}</div></div>
    </div>`;
  root.appendChild(section);
}

// ---------- 4. Player rings ----------
function renderPlayers(players) {
  const root = document.getElementById('view-home');
  const sorted = [...players].sort((a, b) => (SEVERITY[a.global.status] - SEVERITY[b.global.status]) || a.name.localeCompare(b.name));

  const cards = sorted.map((p) => {
    const unavailable = !p.available;
    const segs = unavailable
      ? [{ status: 'na', name: 'GPS' }, { status: 'na', name: 'RPE' }, { status: 'na', name: 'Wellness' }]
      : [
          { status: p.gps.status, name: 'GPS (external load)', detail: p.gps.worst ? 'flagged: ' + METRIC_META[p.gps.worst].label : '' },
          { status: p.rpe.status, name: 'RPE (internal load)', detail: p.rpe.acwr != null ? 'ACWR ' + p.rpe.acwr.toFixed(2) : '' },
          { status: p.wellness.status, name: 'Wellness', detail: p.wellness.avg != null ? 'average ' + p.wellness.avg.toFixed(1) : '' },
        ];
    const overall = unavailable ? 'na' : p.global.status;
    return `<div class="card player-card ${unavailable ? 'unavailable' : ''}">
      ${ringSVG(segs)}
      <div class="player-info">
        <div class="player-name">${escapeHtml(p.name)}</div>
        <div class="player-pos">${escapeHtml(p.position || '')}</div>
        ${badge(overall)}
      </div>
    </div>`;
  }).join('');

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-head"><div><h2 class="section-title">Squad</h2><p class="section-sub">Ring = GPS · RPE · Wellness, in that order</p></div></div>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--good)"></span>Healthy</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--warning)"></span>Attention</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--critical)"></span>Alert</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--na)"></span>Unavailable / no data</span>
    </div>
    <div class="player-grid">${cards}</div>`;
  root.appendChild(section);
}
