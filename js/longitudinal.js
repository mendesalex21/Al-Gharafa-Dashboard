/**
 * Wellness > Longitudinal: team and individual weighted wellness score over time, by day / week / month.
 * Data: Compute.gs > buildWellnessHistory → {players:[{id,name}], days:[{date, byId:{id:score}, teamScore}]}.
 * Windowing and weekly/monthly averaging happen here, client-side.
 */
const LG_RANGE_DAYS = { day: 30, week: 26 * 7, month: 24 * 30 };
const LG_STATUS_WORD = { green: 'Good', orange: 'Fair', red: 'Low' };
const LG = { granularity: 'day', player: null, data: null };
let HISTORY_PROMISE = null;

/** Shared by the Overview page (background prefetch) and this page, so the data is fetched once. */
function loadWellnessHistory() {
  if (!HISTORY_PROMISE) HISTORY_PROMISE = fetchWellnessHistory().catch((err) => { HISTORY_PROMISE = null; throw err; });
  return HISTORY_PROMISE;
}

function longitudinalSkeleton() {
  return `
    <div class="lg-head">
      <div>
        <div class="lg-eyebrow">Wellness</div>
        <h1 class="lg-title">Longitudinal</h1>
        <p class="lg-sub">Weighted wellness score over time</p>
      </div>
      <div class="lg-seg" id="lg-seg" role="group" aria-label="Period">
        <button type="button" data-g="day" class="active">Day</button>
        <button type="button" data-g="week">Week</button>
        <button type="button" data-g="month">Month</button>
      </div>
    </div>

    <section class="lg-card" id="lg-team">
      <div class="lg-card-head"><h2 class="lg-card-title">Team</h2></div>
      <div class="lg-stat"></div>
      <div class="lg-chart"><div class="lg-empty">Loading…</div></div>
    </section>

    <section class="lg-card" id="lg-player">
      <div class="lg-card-head">
        <h2 class="lg-card-title">Individual</h2>
        <div class="lg-picker">
          <span class="lg-avatar" id="lg-avatar"></span>
          <select class="lg-select" id="lg-player-select" aria-label="Player"></select>
        </div>
      </div>
      <div class="lg-stat"></div>
      <div class="lg-chart"><div class="lg-empty">Loading…</div></div>
    </section>

    <div class="lg-legend">
      <span><i style="background:${WCOLORS.green}"></i>Good ≥70%</span>
      <span><i style="background:${WCOLORS.orange}"></i>Fair 50–70%</span>
      <span><i style="background:${WCOLORS.red}"></i>Low &lt;50%</span>
    </div>`;
}

async function renderLongitudinal() {
  const root = document.getElementById('view-longitudinal');
  root.innerHTML = longitudinalSkeleton();

  const players = ROSTER.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!LG.player) LG.player = players[0].id;
  const select = document.getElementById('lg-player-select');
  select.innerHTML = players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  select.value = LG.player;
  select.addEventListener('change', () => { LG.player = select.value; drawLongitudinal(); });

  const segButtons = root.querySelectorAll('#lg-seg button');
  segButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      segButtons.forEach((b) => b.classList.toggle('active', b === btn));
      LG.granularity = btn.dataset.g;
      drawLongitudinal();
    });
  });

  const cached = !AUTH.demo && cacheGet('wellness_history');
  if (cached) { LG.data = cached; drawLongitudinal(); }
  try {
    LG.data = await loadWellnessHistory();
    drawLongitudinal();
  } catch (err) {
    if (!LG.data) root.querySelectorAll('.lg-chart').forEach((c) => { c.innerHTML = `<div class="lg-empty">Couldn't load data — ${escapeHtml(err.message)}</div>`; });
  }
}

function drawLongitudinal() {
  if (!LG.data || document.getElementById('view-longitudinal').hidden) return;
  drawLgCard(document.getElementById('lg-team'), 'team');
  drawLgCard(document.getElementById('lg-player'), LG.player);
  drawLgAvatar(LG.player);
}

/** Initials first, swapped for the photo only once it has actually loaded (never a broken-image icon). */
function drawLgAvatar(id) {
  const av = document.getElementById('lg-avatar');
  const p = ROSTER.find((x) => x.id === id);
  av.textContent = wInitials(p ? p.name : '');
  const photo = PHOTO_DATA[id];
  if (!photo) return;
  const img = new Image();
  img.alt = '';
  img.onload = () => { if (LG.player === id) { av.textContent = ''; av.appendChild(img); } };
  img.src = photo;
}

// ---------- data shaping ----------
function scoreLevelClient(pct) { return pct == null ? null : pct < 50 ? 'red' : pct < 70 ? 'orange' : 'green'; }
function dayIdxOf(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function idxDateOf(idx) { return new Date(idx * 86400000).toISOString().slice(0, 10); }
function weekStartIdx(idx) { return idx - new Date(idx * 86400000).getUTCDay(); } // weeks start on Sunday, like the backend

/** Daily scores inside the window (ending on the latest day in the data), plus their day/week/month aggregation. */
function lgSeries(data, who, g) {
  if (!data.days.length) return { daily: [], points: [] };
  const cutoff = dayIdxOf(data.days[data.days.length - 1].date) - LG_RANGE_DAYS[g] + 1;
  const daily = data.days
    .filter((d) => dayIdxOf(d.date) >= cutoff)
    .map((d) => ({ date: d.date, score: who === 'team' ? d.teamScore : d.byId[who] }))
    .filter((p) => p.score != null);
  if (g === 'day') return { daily, points: daily };
  const buckets = new Map();
  daily.forEach((p) => {
    const key = g === 'week' ? idxDateOf(weekStartIdx(dayIdxOf(p.date))) : p.date.slice(0, 7) + '-01';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p.score);
  });
  const points = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({ date, score: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) }));
  return { daily, points };
}

// ---------- formatting ----------
const fmtDate = (s, opts) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
function lgRangeLabel(from, to) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDate(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function lgTick(date, g) {
  return g === 'month' ? fmtDate(date, { month: 'short', year: '2-digit' }) : fmtDate(date, { day: 'numeric', month: 'short' });
}
function lgTooltipDate(date, g) {
  if (g === 'month') return fmtDate(date, { month: 'long', year: 'numeric' });
  if (g === 'week') return 'Week of ' + fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
  return fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- rendering ----------
function drawLgCard(card, who) {
  const g = LG.granularity;
  const { daily, points } = lgSeries(LG.data, who, g);
  const stat = card.querySelector('.lg-stat');
  const chart = card.querySelector('.lg-chart');
  if (!points.length) {
    stat.innerHTML = '<span class="lg-stat-label">Average</span><span class="lg-stat-row"><span class="lg-stat-value">—</span></span><span class="lg-stat-range">No check-ins in this period</span>';
    chart.innerHTML = '<div class="lg-empty">No data for this period yet.</div>';
    return;
  }
  const avg = Math.round(daily.reduce((s, p) => s + p.score, 0) / daily.length);
  const level = scoreLevelClient(avg);
  const count = who === 'team' ? `${daily.length} day${daily.length > 1 ? 's' : ''}` : `${daily.length} check-in${daily.length > 1 ? 's' : ''}`;
  stat.innerHTML = `
    <span class="lg-stat-label">Average</span>
    <span class="lg-stat-row">
      <span class="lg-stat-value">${avg}<small>%</small></span>
      <span class="lg-badge"><i style="background:${WCOLORS[level]}"></i>${LG_STATUS_WORD[level]}</span>
    </span>
    <span class="lg-stat-range">${lgRangeLabel(daily[0].date, daily[daily.length - 1].date)} · ${count}</span>`;
  lgChart(chart, points, g);
}

function lgChart(mount, points, g) {
  const W = Math.max(300, Math.round(mount.clientWidth)), H = 240;
  const PAD_L = 34, PAD_R = 14, PAD_T = 12, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const n = points.length;
  const xAt = (i) => (n === 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (n - 1));
  const yAt = (v) => PAD_T + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);

  const band = (v0, v1, color) => `<rect x="${PAD_L}" y="${yAt(v1)}" width="${innerW}" height="${yAt(v0) - yAt(v1)}" fill="${color}" opacity="0.06"/>`;
  const bands = band(0, 50, WCOLORS.red) + band(50, 70, WCOLORS.orange) + band(70, 100, WCOLORS.green);
  const grid = [0, 50, 70, 100].map((v) => `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yAt(v)}" y2="${yAt(v)}" class="lg-grid"/><text x="${PAD_L - 8}" y="${yAt(v) + 3.5}" text-anchor="end" class="lg-axis">${v}</text>`).join('');
  const line = n > 1 ? `<path class="lg-line" d="${points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`).join(' ')}"/>` : '';
  const r = n > 40 ? 2.5 : 3.5;
  const dots = points.map((p, i) => `<circle class="lg-dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.score).toFixed(1)}" r="${r}" fill="${WCOLORS[scoreLevelClient(p.score)]}"/>`).join('');
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 80))));
  const ticks = points.map((p, i) => {
    if ((n - 1 - i) % step !== 0) return ''; // count back from the latest point so it always gets a label
    const anchor = n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle';
    return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" class="lg-axis">${lgTick(p.date, g)}</text>`;
  }).join('');

  mount.innerHTML = `
    <svg class="lg-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wellness score over time">
      ${bands}${grid}${line}${dots}
      <line class="lg-crosshair" x1="0" x2="0" y1="${PAD_T}" y2="${H - PAD_B}" style="display:none"/>
      ${ticks}
    </svg>
    <div class="lg-tooltip" style="display:none"></div>`;

  const svg = mount.querySelector('.lg-svg');
  const crosshair = mount.querySelector('.lg-crosshair');
  const tooltip = mount.querySelector('.lg-tooltip');
  const show = (clientX) => {
    const rel = clientX - svg.getBoundingClientRect().left;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((rel - PAD_L) / innerW) * (n - 1))));
    const p = points[i], cx = xAt(i);
    crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx); crosshair.style.display = '';
    tooltip.innerHTML = `<b><i style="background:${WCOLORS[scoreLevelClient(p.score)]}"></i>${p.score}%</b><span>${lgTooltipDate(p.date, g)}</span>`;
    tooltip.style.display = '';
    tooltip.style.left = Math.max(70, Math.min(W - 70, cx)) + 'px';
    tooltip.style.top = Math.max(0, yAt(p.score) - 58) + 'px';
  };
  const hide = () => { crosshair.style.display = 'none'; tooltip.style.display = 'none'; };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
}

let lgResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(lgResizeTimer);
  lgResizeTimer = setTimeout(drawLongitudinal, 150);
});
