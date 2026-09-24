/**
 * Wellness "Trends" section — longitudinal view (Apple Health style): pick the team or a player,
 * pick a granularity (day/week/month), see the wellness score plotted over time.
 * Backend payload (Compute.gs > buildWellnessHistory): {players:[{id,name}], days:[{date, byId, teamScore}]}.
 */
const TREND_RANGE_DAYS = { day: 30, week: 26 * 7, month: 24 * 30 }; // lookback window per granularity
const TREND_RANGE_LABEL = { day: 'last 30 days', week: 'last 26 weeks', month: 'last 24 months' };
let TREND_DATA = null;
const TREND_STATE = { player: 'team', granularity: 'day' };

function trendsSkeleton() {
  return `
    <section class="w-group w-trends">
      <div class="w-trends-head">
        <h2>Trends</h2>
        <div class="w-trends-controls">
          <select class="w-trends-select" id="w-trends-player"><option value="team">Team</option></select>
          <div class="w-segmented" id="w-trends-seg">
            <button type="button" data-g="day" class="active">Day</button>
            <button type="button" data-g="week">Week</button>
            <button type="button" data-g="month">Month</button>
          </div>
        </div>
      </div>
      <div class="w-trends-summary" id="w-trends-summary">Loading…</div>
      <div class="w-trends-chart" id="w-trends-chart"><div class="w-trends-empty">Loading…</div></div>
      <div class="w-trends-legend">
        <span><i style="background:${WCOLORS.green}"></i>≥70 good</span>
        <span><i style="background:${WCOLORS.orange}"></i>50–70 fair</span>
        <span><i style="background:${WCOLORS.red}"></i>&lt;50 low</span>
      </div>
    </section>
  `;
}

async function initWellnessTrends() {
  const select = document.getElementById('w-trends-player');
  const names = ROSTER.slice().sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="team">Team</option>' +
    names.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  select.value = TREND_STATE.player;
  select.addEventListener('change', () => { TREND_STATE.player = select.value; renderTrendsNow(); });

  document.querySelectorAll('#w-trends-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#w-trends-seg button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      TREND_STATE.granularity = btn.dataset.g;
      renderTrendsNow();
    });
  });

  try {
    TREND_DATA = await fetchWellnessHistory();
    renderTrendsNow();
  } catch (err) {
    document.getElementById('w-trends-chart').innerHTML = `<div class="w-trends-empty">Couldn't load trends.</div>`;
    document.getElementById('w-trends-summary').textContent = '';
  }
}

function scoreLevelClient(pct) { return pct == null ? null : pct < 50 ? 'red' : pct < 70 ? 'orange' : 'green'; }

function dayIdxOf(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function idxDateOf(idx) { return new Date(idx * 86400000).toISOString().slice(0, 10); }
function weekStartIdx(idx) { return idx - new Date(idx * 86400000).getUTCDay(); } // week_start = Sunday, same as backend default

function trendSeriesFor(data, playerId) {
  return data.days
    .map((d) => ({ date: d.date, score: playerId === 'team' ? d.teamScore : (d.byId[playerId] != null ? d.byId[playerId] : null) }))
    .filter((p) => p.score != null);
}

function aggregateSeries(series, granularity) {
  if (granularity === 'day') return series;
  const buckets = new Map();
  series.forEach((p) => {
    const idx = dayIdxOf(p.date);
    const key = granularity === 'week' ? weekStartIdx(idx) : p.date.slice(0, 7);
    const label = granularity === 'week' ? idxDateOf(key) : key + '-01';
    if (!buckets.has(key)) buckets.set(key, { label, vals: [] });
    buckets.get(key).vals.push(p.score);
  });
  return Array.from(buckets.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((b) => ({ date: b.label, score: Math.round(b.vals.reduce((s, v) => s + v, 0) / b.vals.length) }));
}

function buildTrendPoints(data, playerId, granularity) {
  const full = trendSeriesFor(data, playerId);
  if (!full.length) return [];
  const cutoff = dayIdxOf(full[full.length - 1].date) - TREND_RANGE_DAYS[granularity] + 1;
  const windowed = full.filter((p) => dayIdxOf(p.date) >= cutoff);
  return aggregateSeries(windowed, granularity);
}

function formatTrendDate(dateStr, granularity) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (granularity === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function formatTrendDateFull(dateStr, granularity) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (granularity === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return (granularity === 'week' ? 'Week of ' : '') + d.toLocaleDateString('en-GB', opts);
}

function renderTrendChart(mount, points, granularity) {
  if (points.length < 2) {
    mount.innerHTML = '<div class="w-trends-empty">Not enough data yet for this range.</div>';
    return;
  }
  const W = 640, H = 220, PAD_L = 30, PAD_R = 12, PAD_T = 14, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const xAt = (i) => PAD_L + (innerW * i) / (points.length - 1);
  const yAt = (v) => PAD_T + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);

  const zoneRect = (v0, v1, color) => `<rect x="${PAD_L}" y="${yAt(v1).toFixed(1)}" width="${innerW}" height="${(yAt(v0) - yAt(v1)).toFixed(1)}" fill="${color}" opacity="0.07"/>`;
  const zones = zoneRect(0, 50, WCOLORS.red) + zoneRect(50, 70, WCOLORS.orange) + zoneRect(70, 100, WCOLORS.green);
  const grid = [0, 50, 70, 100].map((v) => `
    <line x1="${PAD_L}" y1="${yAt(v).toFixed(1)}" x2="${W - PAD_R}" y2="${yAt(v).toFixed(1)}" stroke="var(--w-border)" stroke-width="1"/>
    <text x="${PAD_L - 6}" y="${(yAt(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--w-muted)">${v}</text>
  `).join('');
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.score).toFixed(1)}" r="3" fill="${WCOLORS[scoreLevelClient(p.score)]}"/>`).join('');
  const step = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points.map((p, i) => (i % step === 0 || i === points.length - 1)
    ? `<text x="${xAt(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--w-muted)">${formatTrendDate(p.date, granularity)}</text>`
    : '').join('');

  mount.innerHTML = `<div class="w-trends-svgwrap">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-trends-svg">
      ${zones}${grid}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <line class="w-trends-crosshair" x1="${xAt(0).toFixed(1)}" y1="${PAD_T}" x2="${xAt(0).toFixed(1)}" y2="${H - PAD_B}" style="display:none"/>
      ${xLabels}
    </svg>
    <div class="w-trends-tooltip" style="display:none"></div>
  </div>`;

  const svg = mount.querySelector('.w-trends-svg');
  const crosshair = mount.querySelector('.w-trends-crosshair');
  const tooltip = mount.querySelector('.w-trends-tooltip');
  const wrap = mount.querySelector('.w-trends-svgwrap');

  function showAt(i) {
    const cx = xAt(i);
    crosshair.setAttribute('x1', cx.toFixed(1));
    crosshair.setAttribute('x2', cx.toFixed(1));
    crosshair.style.display = '';
    const p = points[i];
    const col = WCOLORS[scoreLevelClient(p.score)];
    tooltip.style.display = '';
    tooltip.innerHTML = `<b style="color:${col}">${p.score}%</b><span>${formatTrendDateFull(p.date, granularity)}</span>`;
    const rect = wrap.getBoundingClientRect();
    let left = (cx / W) * rect.width;
    left = Math.max(48, Math.min(rect.width - 48, left));
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(0, (yAt(p.score) / H) * rect.height - 44) + 'px';
  }
  function hide() { crosshair.style.display = 'none'; tooltip.style.display = 'none'; }
  function onPointer(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    let i = Math.round(((relX - PAD_L) / innerW) * (points.length - 1));
    i = Math.max(0, Math.min(points.length - 1, i));
    showAt(i);
  }
  svg.addEventListener('pointermove', (e) => onPointer(e.clientX));
  svg.addEventListener('pointerdown', (e) => onPointer(e.clientX));
  svg.addEventListener('pointerleave', hide);
}

function renderTrendsNow() {
  if (!TREND_DATA) return;
  const chart = document.getElementById('w-trends-chart');
  const summary = document.getElementById('w-trends-summary');
  const points = buildTrendPoints(TREND_DATA, TREND_STATE.player, TREND_STATE.granularity);
  renderTrendChart(chart, points, TREND_STATE.granularity);
  if (points.length) {
    const avg = Math.round(points.reduce((s, p) => s + p.score, 0) / points.length);
    const last = points[points.length - 1];
    const who = TREND_STATE.player === 'team' ? 'Team' : (ROSTER.find((p) => p.id === TREND_STATE.player) || {}).name || TREND_STATE.player;
    summary.innerHTML = `${escapeHtml(who)} · ${TREND_RANGE_LABEL[TREND_STATE.granularity]} · latest <b style="color:${WCOLORS[scoreLevelClient(last.score)]}">${last.score}%</b> · average <b>${avg}%</b>`;
  } else {
    summary.textContent = 'No data for this range yet.';
  }
}
