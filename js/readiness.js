/**
 * Workload › Readiness: fatigue assessment combining three independent signals, each against the player's
 * OWN baseline — perceived (wellness vs his last 28 days), neuromuscular (CMJ vs his previous tests) and
 * external load (workload risk flags: ACWR, weekly spike). Plus an aligned load · wellness · CMJ timeline.
 * Data: workload (sync/build.py), wellness_history (Apps Script), tests (sync/build.py).
 */
const RD = { player: null };
const RD_STATUS = { red: 'Fatigued', orange: 'Monitor', green: 'Ready', na: 'No data' };

/** Wellness: latest score (≤3 days old) vs the player's previous 28 days. */
function wellnessSignal(hist, id) {
  if (!hist || !hist.days || !hist.days.length) return null;
  const days = hist.days, end = days[days.length - 1].date;
  let li = -1;
  for (let i = days.length - 1; i >= 0 && daysBetween(days[i].date, end) <= 3; i--) if (days[i].byId[id] != null) { li = i; break; }
  if (li < 0) return null;
  const latest = days[li];
  const base = days.filter((d) => d.date < latest.date && daysBetween(d.date, latest.date) <= 28 && d.byId[id] != null).map((d) => d.byId[id]);
  if (base.length < 5) return { score: latest.byId[id], date: latest.date, diff: null, z: null, n: base.length };
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (base.length - 1));
  const diff = latest.byId[id] - mean;
  return { score: latest.byId[id], date: latest.date, mean, sd, diff, z: diff / Math.max(sd, 3), n: base.length };
}

/** CMJ: with ≥2 tests, latest vs mean of previous tests (%); with one test only the squad z is known. */
function cmjSignal(tests, id) {
  if (!tests || !tests.dates) return null;
  const hist = tests.dates.slice().reverse()
    .map((dt) => ({ date: dt, a: tests.sessions[dt].athletes.find((x) => x.id === id) }))
    .filter((x) => x.a && x.a.cmj_h != null);
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  if (hist.length < 2) return { cm: last.a.cmj_h, date: last.date, pct: null, zSquad: last.a.z_cmj_h, n: 1 };
  const prev = hist.slice(0, -1).map((x) => x.a.cmj_h);
  const base = prev.reduce((a, b) => a + b, 0) / prev.length;
  return { cm: last.a.cmj_h, date: last.date, pct: (last.a.cmj_h - base) / base * 100, base, zSquad: last.a.z_cmj_h, n: hist.length };
}

function readinessOf(p) {
  const w = wellnessSignal(WL.history, p.id), c = cmjSignal(WL.tests, p.id);
  const signals = [];
  if (w && w.z != null && w.z <= -1) signals.push(`Wellness ${fmtSigned(w.diff, 0)} pts vs usual`);
  if (c && c.pct != null && c.pct <= -5) signals.push(`CMJ ${fmtSigned(c.pct, 1)}% vs baseline`);
  if (p.risk === 'red') signals.push('Load: ' + ((p.flags.find((f) => f.level === 'red') || {}).text || 'high risk'));
  const hasData = (w && w.z != null) || (c && c.pct != null) || p.risk !== 'na';
  const level = !hasData || p.status !== 'available' ? 'na' : signals.length >= 2 ? 'red' : signals.length === 1 ? 'orange' : 'green';
  return { w, c, signals, level };
}

function renderReadiness() {
  const root = document.getElementById('view-readiness');
  root.innerHTML = `
    ${pageHead('Workload', 'Readiness', 'rd-sub')}
    <div class="tiles" id="rd-tiles"></div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Wellness × CMJ</h2><span class="panel-note">each vs the player's own baseline · colour = readiness</span></div>
        <div class="chart" id="rd-quad"></div><p class="panel-foot" id="rd-quad-note"></p></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">How it works</h2></div>
        <div class="kv">
          <div><span>Perceived fatigue</span><b>wellness z ≤ −1 vs his last 28 days</b></div>
          <div><span>Neuromuscular fatigue</span><b>CMJ ≤ −5% vs his previous tests</b></div>
          <div><span>Load</span><b>red flag on the Workload board</b></div>
          <div><span>Readiness</span><b>0 signal Ready · 1 Monitor · 2+ Fatigued</b></div>
        </div>
        <p class="panel-foot">Each signal is compared with the player himself, not with the squad: some players always score low on wellness or jump high — only a change from their usual matters.</p></section>
    </div>
    <section class="panel"><div class="panel-head"><h2 class="panel-title small">Squad</h2><span class="panel-note">click a player for his timeline</span></div><div class="table-wrap" id="rd-table"></div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title small">Timeline · load, wellness, CMJ</h2>
      <div class="picker"><span id="rd-av"></span><select class="select" id="rd-player" aria-label="Player"></select></div></div>
      <div id="rd-timeline"></div></section>`;
  const redraw = () => drawReadiness();
  withData('workload', (d) => { WL.data = d; redraw(); }, (err) => { root.innerHTML = loadError(err); });
  withData('wellness_history', (d) => { WL.history = d; redraw(); }, () => {});
  withData('tests', (d) => { WL.tests = d; redraw(); }, () => {});
}

function drawReadiness() {
  const d = WL.data;
  if (!d || document.getElementById('view-readiness').hidden) return;
  const rows = d.players.map((p) => ({ p, r: readinessOf(p) }));
  const cnt = (lv) => rows.filter((x) => x.r.level === lv).length;
  const multiTest = rows.some((x) => x.r.c && x.r.c.n > 1);
  document.getElementById('rd-sub').textContent = `Perceived (wellness) · neuromuscular (CMJ) · external load — each against the player's own baseline · GPS up to ${fmtDay(d.as_of, { day: 'numeric', month: 'short' })}`;
  document.getElementById('rd-tiles').innerHTML = ['green', 'orange', 'red'].map((lv) => `<div class="tile"><div class="tile-label">${RD_STATUS[lv]}</div>
    <div class="tile-value"><span class="dotnum"><i style="background:${STATUS_COL[lv]}"></i>${cnt(lv)}</span></div>
    <div class="tile-sub">${lv === 'green' ? 'no fatigue signal' : lv === 'orange' ? 'one signal — adjust or check' : 'two or more signals'}</div></div>`).join('')
    + `<div class="tile"><div class="tile-label">CMJ tests</div><div class="tile-value">${WL.tests ? WL.tests.dates.length : '—'}<small> date${WL.tests && WL.tests.dates.length > 1 ? 's' : ''}</small></div>
      <div class="tile-sub">${multiTest ? 'change vs each player\'s previous tests' : 'one test so far: CMJ becomes a fatigue signal from the 2nd test'}</div></div>`;

  // quadrant
  const pts = rows.filter((x) => x.r.w && x.r.w.z != null && x.r.c).map(({ p, r }) => ({
    id: p.id, label: p.name, x: r.w.z, y: r.c.pct != null ? r.c.pct : r.c.zSquad,
    color: STATUS_COL[r.level], showLabel: r.level === 'red' || r.level === 'orange', r, p,
  }));
  chQuad(document.getElementById('rd-quad'), {
    points: pts, xRange: 2.5, yRange: multiTest ? 8 : 2.5,
    xLabel: 'Wellness vs usual (z)', yLabel: multiTest ? 'CMJ vs baseline (%)' : 'CMJ vs squad (z)',
    quadrants: { tl: 'Perceived fatigue', tr: 'Fresh', bl: 'Fatigued', br: multiTest ? 'Neuromuscular fatigue' : 'Weaker jumper' },
    tip: (pt) => `<b>${escapeHtml(pt.label)} · ${RD_STATUS[pt.r.level]}</b><span>wellness ${pt.r.w.score}% (${fmtSigned(pt.r.w.diff, 0)} pts vs usual)</span><span>CMJ ${fmtN(pt.r.c.cm, 1)} cm${pt.r.c.pct != null ? ` (${fmtSigned(pt.r.c.pct, 1)}%)` : ''}</span>`,
    onClick: (pt) => { RD.player = pt.id; drawReadinessTimeline(); document.getElementById('rd-timeline').scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  });
  document.getElementById('rd-quad-note').textContent = multiTest ? 'Bottom-left = both perceived and neuromuscular fatigue.'
    : 'Only one CMJ test so far, so the vertical axis shows each player vs the squad (not fatigue yet). With a second test it switches to the change vs his own baseline.';

  // table
  const order = { red: 0, orange: 1, green: 2, na: 3 };
  const trs = rows.map(({ p, r }) => ({
    id: p.id,
    cells: [`<i class="riskdot" style="background:${STATUS_COL[r.level]}"></i>`, playerCell(p.id, p.name, p.pos),
      `<span class="badge"><i style="background:${STATUS_COL[r.level]}"></i>${p.status !== 'available' ? STATUS_LABEL[p.status] : RD_STATUS[r.level]}</span>`,
      r.w ? `<span class="chip-v ${scoreLevelClient(r.w.score)}">${r.w.score}%</span> <small class="muted">${r.w.diff == null ? '' : fmtSigned(r.w.diff, 0) + ' pts'}</small>` : '<span class="muted">—</span>',
      r.c ? `${fmtN(r.c.cm, 1)} <small class="muted">cm${r.c.pct != null ? ' · ' + fmtSigned(r.c.pct, 1) + '%' : ''}</small>` : '<span class="muted">—</span>',
      acwrChip(p.acwr.td), spikeHtml(maxSpike(p)),
      r.signals.length ? `<span class="flags one" title="${escapeHtml(r.signals.join('\n'))}"><span>${escapeHtml(r.signals[0])}</span>${r.signals.length > 1 ? `<small class="muted">+${r.signals.length - 1}</small>` : ''}</span>` : '<span class="muted">—</span>'],
    keys: [order[r.level], p.name, order[r.level], r.w ? r.w.diff : null, r.c ? (r.c.pct ?? r.c.zSquad) : null, p.acwr.td, (maxSpike(p) || {}).z, r.signals.length],
  }));
  sortableTable(document.getElementById('rd-table'), [
    { label: '', cls: 'c' }, { label: 'Player' }, { label: 'Readiness' }, { label: 'Wellness', desc: true }, { label: 'CMJ', desc: true },
    { label: 'ACWR TD', cls: 'c', desc: true }, { label: 'Spike z', cls: 'c', desc: true }, { label: 'Signals', desc: true },
  ], trs, { col: 0, dir: 1 }, (r) => `data-id="${r.id}" class="clickable"`);
  document.getElementById('rd-table').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { RD.player = tr.dataset.id; drawReadinessTimeline(); } };

  const sel = document.getElementById('rd-player');
  const list = d.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!RD.player) RD.player = (rows.find((x) => x.r.level === 'red') || rows[0]).p.id;
  sel.innerHTML = list.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  sel.onchange = () => { RD.player = sel.value; drawReadinessTimeline(); };
  drawReadinessTimeline();
}

function drawReadinessTimeline() {
  const sel = document.getElementById('rd-player');
  sel.value = RD.player;
  const p = WL.data.players.find((x) => x.id === RD.player);
  document.getElementById('rd-av').innerHTML = avatarHtml(p.id, p.name, 32);
  fatigueTimeline(document.getElementById('rd-timeline'), p.id, 60);
}

/** Three aligned charts on the same day axis: daily load, wellness score, CMJ height. */
function fatigueTimeline(mount, id, nDays) {
  const s = WL.data && WL.data.series[id];
  const end = [WL.data.as_of, WL.history && WL.history.days.length ? WL.history.days[WL.history.days.length - 1].date : null].filter(Boolean).sort().pop();
  const dates = Array.from({ length: nDays }, (_, i) => addDays(end, i - nDays + 1));
  const at = (arr, start) => dates.map((dt) => { const i = daysBetween(start, dt); return i >= 0 && i < arr.length ? arr[i] : null; });
  const tick = (x) => fmtDay(x, { day: 'numeric', month: 'short' });
  mount.innerHTML = `
    <div class="tl-row"><div class="tl-lab">Load · TD <small>m / day · line = 7-day avg</small></div><div class="chart" id="${mount.id}-load"></div></div>
    <div class="tl-row"><div class="tl-lab">Wellness <small>% · band = his usual ± 1 SD</small></div><div class="chart" id="${mount.id}-well"></div></div>
    <div class="tl-row"><div class="tl-lab">CMJ height <small>cm · VALD tests</small></div><div class="chart" id="${mount.id}-cmj"></div></div>`;
  if (s) {
    const load = at(s.load.td, s.start), acute = at(s.acute.td, s.start), cat = dates.map((dt) => { const i = daysBetween(s.start, dt); return i >= 0 && i < s.cat.length ? s.cat[i] : '-'; });
    chXY(document.getElementById(mount.id + '-load'), {
      x: dates, height: 150, bars: { values: load, color: (v, i) => (cat[i] === 'm' ? '#2a78d6' : '#9fc2ee') }, lines: [{ values: acute, color: 'var(--ink)' }], tick,
      tip: (i) => `<b>${fmtN(load[i])} m</b><span>${fmtDay(dates[i])} · ${(CAT_INFO[cat[i]] || CAT_INFO['-'])[0]}</span>`,
    });
  } else document.getElementById(mount.id + '-load').innerHTML = emptyState('No GPS data for this player.');
  const hist = WL.history;
  if (hist) {
    const byDate = Object.fromEntries(hist.days.map((x) => [x.date, x.byId[id]]));
    const vals = dates.map((dt) => (byDate[dt] == null ? null : byDate[dt]));
    const w = wellnessSignal(hist, id);
    const bands = w && w.mean != null ? [{ from: w.mean - w.sd, to: w.mean + w.sd, color: '#8e8e93', alpha: 0.12 }] : [];
    chXY(document.getElementById(mount.id + '-well'), {
      x: dates, height: 150, yMin: 0, yMax: 100, yTicks: [0, 50, 70, 100], bands,
      refs: w && w.mean != null ? [{ y: w.mean, dash: true, label: `usual ${Math.round(w.mean)}%` }] : [],
      lines: [{ values: vals, color: 'var(--accent)', dots: (v) => WCOLORS[scoreLevelClient(v)] }], tick,
      tip: (i) => `<b>${vals[i] == null ? 'no check-in' : vals[i] + '%'}</b><span>${fmtDay(dates[i])}</span>`,
    });
  } else document.getElementById(mount.id + '-well').innerHTML = emptyState('Loading wellness…');
  const t = WL.tests;
  if (t) {
    const cm = Object.fromEntries(t.dates.map((dt) => [dt, (t.sessions[dt].athletes.find((a) => a.id === id) || {}).cmj_h]));
    const vals = dates.map((dt) => (cm[dt] == null ? null : cm[dt]));
    const all = Object.values(cm).filter((v) => v != null);
    if (!all.length) { document.getElementById(mount.id + '-cmj').innerHTML = emptyState('No CMJ test for this player yet.'); return; }
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    chXY(document.getElementById(mount.id + '-cmj'), {
      x: dates, height: 150, yMin: Math.floor(Math.min(...all) - 6), yMax: Math.ceil(Math.max(...all) + 6),
      refs: [{ y: mean, dash: true, label: all.length > 1 ? `baseline ${mean.toFixed(1)} cm` : 'only test so far' }],
      lines: [{ values: vals, color: '#bf5af2', dots: () => '#bf5af2' }], tick,
      tip: (i) => `<b>${vals[i] == null ? 'no test' : vals[i].toFixed(1) + ' cm'}</b><span>${fmtDay(dates[i])}</span>`,
    });
  }
}
