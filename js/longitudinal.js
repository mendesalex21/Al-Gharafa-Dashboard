/**
 * Wellness > Longitudinal: team and individual weighted wellness score over time, by day / week / month.
 * Data: Compute.gs > buildWellnessHistory → {players:[{id,name}], days:[{date, byId:{id:score}, teamScore}]}.
 * Windowing and weekly/monthly averaging happen here, client-side.
 */
const LG_RANGE_DAYS = { day: 30, week: 26 * 7, month: 24 * 30 };
const LG_STATUS_WORD = { green: 'Good', orange: 'Fair', red: 'Low' };
const LG = { granularity: 'day', player: null, data: null };

/** Shared by the Overview page (background prefetch) and this page, so the data is fetched once. */
function loadWellnessHistory() { return loadData('wellness_history'); }

function longitudinalSkeleton() {
  return `
    ${pageHead('Wellness', 'Longitudinal', 'lg-subline', segHtml('lg-period', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], LG.granularity))}
    <section class="panel" id="lg-team">
      <div class="panel-head"><h2 class="panel-title">Team</h2></div>
      <div class="stat"></div>
      <div class="chart"><div class="empty">Loading…</div></div>
    </section>
    <section class="panel" id="lg-player">
      <div class="panel-head">
        <h2 class="panel-title">Individual</h2>
        <div class="picker"><span id="lg-avatar"></span><select class="select" id="lg-player-select" aria-label="Player"></select></div>
      </div>
      <div class="stat"></div>
      <div class="chart"><div class="empty">Loading…</div></div>
    </section>
    <div class="legend-row">
      <span><i style="background:${WCOLORS.green}"></i>Good ≥70%</span>
      <span><i style="background:${WCOLORS.orange}"></i>Fair 50–70%</span>
      <span><i style="background:${WCOLORS.red}"></i>Low &lt;50%</span>
    </div>`;
}

async function renderLongitudinal() {
  const root = document.getElementById('view-longitudinal');
  root.innerHTML = longitudinalSkeleton();
  document.getElementById('lg-subline').textContent = 'Weighted wellness score over time';

  const players = ROSTER.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!LG.player) LG.player = players[0].id;
  const select = document.getElementById('lg-player-select');
  select.innerHTML = players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  select.value = LG.player;
  select.addEventListener('change', () => { LG.player = select.value; drawLongitudinal(); });
  bindSeg('lg-period', (g) => { LG.granularity = g; drawLongitudinal(); });

  withData('wellness_history', (d) => { LG.data = d; drawLongitudinal(); },
    (err) => root.querySelectorAll('.chart').forEach((c) => { c.innerHTML = emptyState(`Couldn't load data — ${err.message}`); }));
}

function drawLongitudinal() {
  if (!LG.data || document.getElementById('view-longitudinal').hidden) return;
  drawLgCard(document.getElementById('lg-team'), 'team');
  drawLgCard(document.getElementById('lg-player'), LG.player);
  const p = ROSTER.find((x) => x.id === LG.player);
  document.getElementById('lg-avatar').innerHTML = avatarHtml(LG.player, p ? p.name : '', 32);
}

function scoreLevelClient(pct) { return pct == null ? null : pct < 50 ? 'red' : pct < 70 ? 'orange' : 'green'; }
function weekStartOf(iso) { return addDays(iso, -dateOf(iso).getUTCDay()); } // weeks start on Sunday, like the backend

/** Daily scores inside the window (ending on the latest day in the data), plus their day/week/month aggregation. */
function lgSeries(data, who, g) {
  if (!data.days.length) return { daily: [], points: [] };
  const cutoff = addDays(data.days[data.days.length - 1].date, -LG_RANGE_DAYS[g] + 1);
  const daily = data.days.filter((d) => d.date >= cutoff)
    .map((d) => ({ date: d.date, score: who === 'team' ? d.teamScore : d.byId[who] }))
    .filter((p) => p.score != null);
  if (g === 'day') return { daily, points: daily };
  const buckets = new Map();
  daily.forEach((p) => {
    const key = g === 'week' ? weekStartOf(p.date) : p.date.slice(0, 7) + '-01';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p.score);
  });
  const points = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({ date, score: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) }));
  return { daily, points };
}

function lgRangeLabel(from, to) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDay(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function lgTooltipDate(date, g) {
  if (g === 'month') return fmtDay(date, { month: 'long', year: 'numeric' });
  if (g === 'week') return 'Week of ' + fmtDay(date, { day: 'numeric', month: 'short', year: 'numeric' });
  return fmtDay(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function drawLgCard(card, who) {
  const g = LG.granularity;
  const { daily, points } = lgSeries(LG.data, who, g);
  const stat = card.querySelector('.stat');
  const chart = card.querySelector('.chart');
  if (!points.length) {
    stat.innerHTML = '<span class="stat-label">Average</span><span class="stat-row"><span class="stat-value">—</span></span><span class="stat-sub">No check-ins in this period</span>';
    chart.innerHTML = emptyState('No data for this period yet.');
    return;
  }
  const avg = Math.round(daily.reduce((s, p) => s + p.score, 0) / daily.length);
  const level = scoreLevelClient(avg);
  const count = who === 'team' ? `${daily.length} day${daily.length > 1 ? 's' : ''}` : `${daily.length} check-in${daily.length > 1 ? 's' : ''}`;
  stat.innerHTML = `
    <span class="stat-label">Average</span>
    <span class="stat-row"><span class="stat-value">${avg}<small>%</small></span>
      <span class="badge"><i style="background:${WCOLORS[level]}"></i>${LG_STATUS_WORD[level]}</span></span>
    <span class="stat-sub">${lgRangeLabel(daily[0].date, daily[daily.length - 1].date)} · ${count}</span>`;
  chXY(chart, {
    x: points.map((p) => p.date), yMin: 0, yMax: 100, yTicks: [0, 50, 70, 100],
    bands: [{ from: 0, to: 50, color: WCOLORS.red, alpha: 0.06 }, { from: 50, to: 70, color: WCOLORS.orange, alpha: 0.06 }, { from: 70, to: 100, color: WCOLORS.green, alpha: 0.06 }],
    lines: [{ values: points.map((p) => p.score), color: 'var(--accent)', dots: (v) => WCOLORS[scoreLevelClient(v)] }],
    tick: (d) => g === 'month' ? fmtDay(d, { month: 'short', year: '2-digit' }) : fmtDay(d, { day: 'numeric', month: 'short' }),
    tip: (i) => `<b><i style="background:${WCOLORS[scoreLevelClient(points[i].score)]}"></i>${points[i].score}%</b><span>${lgTooltipDate(points[i].date, g)}</span>`,
  });
}
