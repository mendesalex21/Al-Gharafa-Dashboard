/**
 * Wellness page — near-verbatim port of the old dashboard's renderAll()/fillGrid()/fillDetailTable()
 * (see site/js/wellness-ring.js and photo-data.js). The backend (Compute.gs > buildWellnessView)
 * returns exactly the same shape as the old getDashboardData(): {date, byId, teamToday, teamScore, teamStatus}.
 * This file only rebuilds the DOM from that, same as the original.
 */
const Q_LABELS = { fatigue: 'Fatigue', soreness: 'Soreness', sleep: 'Sleep', energy: 'Energy', recovery: 'Recovery' };
const QUESTIONS_ORDER = ['fatigue', 'soreness', 'sleep', 'energy', 'recovery'];

async function renderWellness() {
  const root = document.getElementById('view-wellness');
  try {
    const data = await fetchWellness();
    root.innerHTML = wellnessSkeleton();
    renderAllWellness(data);
    initWellnessTrends();
  } catch (err) {
    root.innerHTML = `<div class="card" style="padding:24px"><strong>Couldn't load data.</strong><p class="hint">${escapeHtml(err.message)}</p></div>`;
  }
}

function wellnessSkeleton() {
  return `
    <section class="w-team-card">
      <div class="w-team-card-top">
        <div class="w-ring" id="w-teamRing"><div class="w-inner"><span class="w-team-ring-label" id="w-teamRingLabel">—</span></div></div>
        <div class="w-team-info">
          <div class="w-team-title" id="w-teamTitle">Team average today</div>
          <div class="w-team-sub" id="w-teamSub">—</div>
        </div>
      </div>
      <div class="w-theme-rings" id="w-themeRings"></div>
    </section>

    <section class="w-group" id="w-grp-alert">
      <h2>Players in alert <span class="w-count" id="w-cnt-alert"></span></h2>
      <div class="w-grid" id="w-grid-alert"></div>
    </section>
    <section class="w-group" id="w-grp-gk">
      <h2>Goalkeepers <span class="w-count" id="w-cnt-gk"></span></h2>
      <div class="w-grid" id="w-grid-gk"></div>
    </section>
    <section class="w-group" id="w-grp-squad">
      <h2>Squad <span class="w-count" id="w-cnt-squad"></span></h2>
      <div class="w-grid" id="w-grid-squad"></div>
    </section>
    <section class="w-group" id="w-grp-detail">
      <h2>Detailed view</h2>
      <div class="w-table-scroll"><table class="w-detail" id="w-detailTable"></table></div>
    </section>
    <section class="w-group" id="w-grp-none">
      <h2>No check-in yet <span class="w-count" id="w-cnt-none"></span></h2>
      <div class="w-grid" id="w-grid-none"></div>
    </section>

    ${trendsSkeleton()}
  `;
}

function wFillGrid(gridId, countId, list) {
  const grid = document.getElementById(gridId);
  const cnt = document.getElementById(countId);
  cnt.textContent = list.length ? `(${list.length})` : '';
  grid.innerHTML = list.length
    ? list.map((item) => playerCardHtml(item.p, item.info)).join('')
    : '<div class="w-empty-hint">Nobody here right now.</div>';
}

function wFillDetailTable(byId) {
  const rows = ROSTER.map((p) => ({ p, info: byId[p.id] })).filter((x) => x.info && x.info.today);
  rows.sort((a, b) => (a.info.score || 0) - (b.info.score || 0));
  const table = document.getElementById('w-detailTable');
  if (!rows.length) { table.innerHTML = ''; document.getElementById('w-grp-detail').style.display = 'none'; return; }
  document.getElementById('w-grp-detail').style.display = '';
  const thead = `<thead><tr><th>Player</th>${QUESTIONS_ORDER.map((q) => `<th>${Q_LABELS[q]}</th>`).join('')}<th>Score</th></tr></thead>`;
  const tbody = '<tbody>' + rows.map(({ p, info }) => {
    const photo = PHOTO_DATA[p.id];
    const photoCell = photo ? `<img src="${photo}" alt="">` : `<div class="w-initials" style="width:26px;height:26px;font-size:11px">${wInitials(p.name)}</div>`;
    const cells = QUESTIONS_ORDER.map((q) => {
      const v = info.today[q] ? info.today[q].value : null;
      const color = info.today[q] ? info.today[q].color : null;
      const bg = color ? wTint(WCOLORS[color], 0.85) : 'transparent';
      const fg = color ? WCOLORS[color] : 'inherit';
      return `<td class="w-score" style="background:${bg};color:${fg}">${v != null ? v : '—'}</td>`;
    }).join('');
    return `<tr><td class="w-pcell">${photoCell}${escapeHtml(p.name)}</td>${cells}<td class="w-total">${info.score}%</td></tr>`;
  }).join('') + '</tbody>';
  table.innerHTML = thead + tbody;
}

function renderAllWellness(data) {
  const byId = data.byId || {};
  const groups = { gk: [], alert: [], squad: [], none: [] };
  ROSTER.forEach((p) => {
    const info = byId[p.id];
    const isGk = GOALKEEPER_IDS.indexOf(p.id) !== -1;
    const hasToday = info && info.today;
    let bucket;
    if (isGk) bucket = 'gk';
    else if (!hasToday) bucket = 'none';
    else if (info.alert) bucket = 'alert';
    else bucket = 'squad';
    groups[bucket].push({ p, info });
  });
  ['gk', 'alert', 'squad'].forEach((k) => {
    groups[k].sort((a, b) => {
      const sa = a.info && a.info.score != null ? a.info.score : Infinity;
      const sb = b.info && b.info.score != null ? b.info.score : Infinity;
      return sa - sb; // worst score first; no check-in sinks to the end
    });
  });
  groups.none.sort((a, b) => a.p.name.localeCompare(b.p.name));

  wFillGrid('w-grid-gk', 'w-cnt-gk', groups.gk);
  wFillGrid('w-grid-alert', 'w-cnt-alert', groups.alert);
  wFillGrid('w-grid-squad', 'w-cnt-squad', groups.squad);
  wFillGrid('w-grid-none', 'w-cnt-none', groups.none);
  wFillDetailTable(byId);
  document.getElementById('w-grp-alert').style.display = groups.alert.length ? '' : 'none';

  const teamRing = document.getElementById('w-teamRing');
  const teamRingLabel = document.getElementById('w-teamRingLabel');
  const teamTitle = document.getElementById('w-teamTitle');
  const teamSub = document.getElementById('w-teamSub');
  const checkedInCount = groups.gk.length + groups.alert.length + groups.squad.length;
  if (data.teamScore != null && data.teamStatus) {
    teamRing.style.background = progressRingBackground(data.teamStatus, data.teamScore / 100);
    teamRingLabel.textContent = data.teamScore + '%';
    teamRingLabel.style.color = WCOLORS[data.teamStatus] || '';
    teamTitle.innerHTML = `Team average today — <b>${data.teamScore}</b>%`;
  } else {
    teamRing.style.background = progressRingBackground(null, null);
    teamRingLabel.textContent = '—';
    teamTitle.textContent = 'Team average today';
  }
  if (data.teamToday) {
    const tv = QUESTIONS_ORDER.map((q) => data.teamToday[q]).filter((v) => v != null);
    const tavg = tv.length ? (tv.reduce((a, b) => a + b, 0) / tv.length).toFixed(1) : '—';
    teamSub.textContent = `${tavg} / 5 average across ${checkedInCount} players checked in today`;
    document.getElementById('w-themeRings').innerHTML = QUESTIONS_ORDER.map((q) => themeRingHtml(Q_LABELS[q], data.teamToday[q])).join('');
  } else {
    document.getElementById('w-themeRings').innerHTML = '';
  }
}
