/**
 * Testing: VALD force-plate / NordBord / ForceFrame / submaximal aerobic results.
 * Data: sync/build.py → "tests" payload (one entry per test date; z-scores vs the squad tested that day).
 * Asymmetry convention (VALD report): left stronger = negative, right stronger = positive.
 */
const TS = { data: null, date: null, tab: 'squad', athlete: null };

function asymHtml(v, bands) {
  if (v == null) return '<span class="muted">—</span>';
  const a = Math.abs(v), side = v < 0 ? 'L' : v > 0 ? 'R' : '';
  const cls = a >= bands.red ? 'red' : a >= bands.orange ? 'orange' : '';
  return `<span class="${cls ? 'chip-v ' + cls : 'num'}">${a.toFixed(1)}% ${side}</span>`;
}
function testValue(m, v) {
  if (v == null) return '—';
  return m.key === 'dsi' || m.key === 'addabd' ? v.toFixed(2) : m.key === 'imtp_pf' ? fmtN(v) : fmtN(v, v >= 100 ? 0 : v >= 10 ? 1 : 2);
}
function dsiNote(v) {
  if (v == null) return '';
  if (v > 1) return 'CMJ force ≥ IMTP force — check IMTP effort';
  if (v >= 0.8) return 'High DSI — maximal-strength emphasis';
  if (v >= 0.6) return 'Moderate DSI — concurrent strength & ballistic work';
  return 'Low DSI — ballistic / rate-of-force emphasis';
}

/** Diverging z bars (−3…+3). Metrics with a "better" direction are coloured green (better) / red (worse). */
function testZBarsHtml(a, data, sess, compact) {
  const groups = {};
  data.metrics.forEach((m) => { (groups[m.group] = groups[m.group] || []).push(m); });
  const rows = Object.entries(groups).map(([g, ms]) => {
    const inner = ms.filter((m) => !compact || a[m.key] != null).map((m) => {
      const z = a['z_' + m.key], v = a[m.key];
      if (v == null) return `<div class="zrow"><span class="zl">${m.label}</span><span class="zv muted">not tested</span><span class="zbar"></span></div>`;
      const zz = z == null ? 0 : Math.max(-3, Math.min(3, z));
      const good = m.dir === 0 ? null : zz * m.dir >= 0;
      const col = good == null ? '#8e8e93' : good ? STATUS_COL.green : STATUS_COL.red;
      const left = zz < 0 ? 50 + zz / 3 * 50 : 50, width = Math.abs(zz) / 3 * 50;
      return `<div class="zrow"><span class="zl">${m.label}</span><span class="zv">${testValue(m, v)} <small>${m.unit}</small></span>
        <span class="zbar"><i class="mid"></i><b style="left:${left}%;width:${width}%;background:${col}"></b></span><span class="zz">${z == null ? '' : fmtSigned(z)}</span></div>`;
    }).join('');
    return inner ? `<div class="zgroup"><div class="zg">${g}</div>${inner}</div>` : '';
  }).join('');
  return `<div class="zbars">${rows}</div>`;
}

function renderTesting(opts) {
  if (opts) { if (opts.athlete) TS.athlete = opts.athlete; if (opts.tab) TS.tab = opts.tab; }
  const root = document.getElementById('view-testing');
  root.innerHTML = `
    ${pageHead('Performance', 'Physical tests', 'ts-sub', `<select class="select" id="ts-date" hidden></select>${segHtml('ts-tab', [['squad', 'Squad'], ['asym', 'Asymmetries'], ['profile', 'Player profile']], TS.tab)}`)}
    <div id="ts-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  bindSeg('ts-tab', (v) => { TS.tab = v; drawTesting(); });
  withData('tests', (d) => { TS.data = d; drawTesting(); }, (err) => { root.innerHTML = loadError(err); });
}

function drawTesting(opts) {
  if (opts) {
    if (opts.athlete) TS.athlete = opts.athlete;
    if (opts.tab) { TS.tab = opts.tab; document.querySelectorAll('#ts-tab button').forEach((b) => b.classList.toggle('active', b.dataset.v === TS.tab)); }
  }
  const d = TS.data;
  if (!d || document.getElementById('view-testing').hidden) return;
  if (!d.dates.length) { document.getElementById('ts-body').innerHTML = '<div class="panel"><div class="empty">No test file found yet.</div></div>'; return; }
  if (!TS.date || !d.sessions[TS.date]) TS.date = d.dates[0];
  const dsel = document.getElementById('ts-date');
  dsel.hidden = d.dates.length < 2;
  dsel.innerHTML = d.dates.map((x) => `<option value="${x}">${fmtDay(x, { day: 'numeric', month: 'short', year: 'numeric' })}</option>`).join('');
  dsel.value = TS.date;
  dsel.onchange = () => { TS.date = dsel.value; drawTesting(); };
  const sess = d.sessions[TS.date];
  document.getElementById('ts-sub').textContent = `VALD · ${fmtDay(TS.date, { day: 'numeric', month: 'long', year: 'numeric' })} · ${sess.athletes.length} athletes · z-scores vs the squad tested that day · ${fmtUpdated(d.generated_at)}`;
  const body = document.getElementById('ts-body');
  if (TS.tab === 'squad') drawTestSquad(body, d, sess);
  else if (TS.tab === 'asym') drawTestAsym(body, d, sess);
  else drawTestProfile(body, d, sess);
}

function drawTestSquad(body, d, sess) {
  body.innerHTML = `<section class="panel"><div class="table-wrap" id="ts-table"></div>
    <p class="panel-foot">Cell colour = distance from the squad mean (z): green better, red weaker. DSI and ADD:ABD are descriptive (no colour) — read them over time. SMFT peak %HRmax: lower is fitter.</p></section>
    <div class="legend-row"><span><i style="background:rgba(52,199,89,.45)"></i>above squad</span><span><i style="background:rgba(255,59,48,.45)"></i>below squad</span><span>click a row for the player profile</span></div>`;
  const ms = d.metrics.filter((m) => m.key !== 'imtp_pf');
  const rows = sess.athletes.map((a) => ({
    id: a.id,
    cells: [playerCell(a.id, a.name, a.linked ? '' : 'not linked to GPS'), ...ms.map((m) => `<span class="cellv" style="${m.dir ? perfTint(a['z_' + m.key] == null ? null : a['z_' + m.key] * m.dir) : ''}">${testValue(m, a[m.key])}</span>`)],
    keys: [a.name, ...ms.map((m) => a[m.key])],
  }));
  const st = sess.stats;
  const foot = `<tr><td>Squad mean</td>${ms.map((m) => `<td class="c">${testValue(m, st[m.key].mean)}</td>`).join('')}</tr>
    <tr><td>SD · n</td>${ms.map((m) => `<td class="c muted">${st[m.key].sd == null ? '—' : testValue(m, st[m.key].sd)} · ${st[m.key].n}</td>`).join('')}</tr>`;
  sortableTable(document.getElementById('ts-table'), [{ label: 'Athlete' }, ...ms.map((m) => ({ label: `${m.label}${m.unit ? `<small> ${m.unit}</small>` : ''}`, cls: 'c', desc: true }))],
    rows, { col: 0, dir: 1 }, (r) => `data-id="${r.id}" class="clickable"`, foot);
  document.getElementById('ts-table').onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) { TS.athlete = tr.dataset.id; TS.tab = 'profile'; drawTesting({ tab: 'profile' }); }
  };
}

function drawTestAsym(body, d, sess) {
  const b = d.asym_bands;
  const counts = d.asym.map((m) => ({ m, red: sess.athletes.filter((a) => a[m.key] != null && Math.abs(a[m.key]) >= b.red).length, n: sess.athletes.filter((a) => a[m.key] != null).length }));
  body.innerHTML = `<div class="tiles">${counts.map((c) => `<div class="tile"><div class="tile-label">${c.m.label}</div><div class="tile-value">${c.red}<small> / ${c.n} ≥ ${b.red}%</small></div><div class="tile-sub">athletes above the red threshold</div></div>`).join('')}</div>
    <section class="panel"><div class="table-wrap" id="ts-asym"></div>
    <p class="panel-foot">Signed asymmetry: L = left stronger, R = right stronger. Amber ${b.orange}–${b.red - 0.1}%, red ≥ ${b.red}% (report convention). Bars: left ◀ │ ▶ right, scale ±40%.</p></section>`;
  const bar = (v) => {
    if (v == null) return '';
    const c = Math.max(-40, Math.min(40, v)), a = Math.abs(v);
    const col = a >= b.red ? STATUS_COL.red : a >= b.orange ? STATUS_COL.orange : '#8e8e93';
    return `<span class="abar"><i class="mid"></i><b style="left:${c < 0 ? 50 + c / 40 * 50 : 50}%;width:${Math.abs(c) / 40 * 50}%;background:${col}"></b></span>`;
  };
  const rows = sess.athletes.map((a) => ({
    id: a.id,
    cells: [playerCell(a.id, a.name), ...d.asym.map((m) => `<span class="asymcell">${asymHtml(a[m.key], b)}${bar(a[m.key])}</span>`)],
    keys: [a.name, ...d.asym.map((m) => (a[m.key] == null ? null : Math.abs(a[m.key])))],
  }));
  sortableTable(document.getElementById('ts-asym'), [{ label: 'Athlete' }, ...d.asym.map((m) => ({ label: m.label, desc: true }))], rows, { col: 1, dir: -1 }, (r) => `data-id="${r.id}" class="clickable"`);
  document.getElementById('ts-asym').onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) { TS.athlete = tr.dataset.id; drawTesting({ tab: 'profile' }); }
  };
}

function drawTestProfile(body, d, sess) {
  const list = sess.athletes;
  if (!TS.athlete || !list.find((a) => a.id === TS.athlete)) TS.athlete = list[0].id;
  const a = list.find((x) => x.id === TS.athlete);
  const inWorkload = WL.data && WL.data.players.some((p) => p.id === a.id);
  body.innerHTML = `
    <div class="panel-head bare"><div class="picker"><span id="ts-av">${avatarHtml(a.id, a.name, 34)}</span>
      <select class="select" id="ts-athlete">${list.map((x) => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}</select></div>
      ${a.linked ? `<a class="link" id="ts-to-load">Open workload</a>` : '<span class="panel-note">Not linked to a GPS player — add the name in sync/players.csv</span>'}</div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Profile vs squad</h2><span class="panel-note">z-score · green better · red weaker · grey descriptive</span></div>
        ${testZBarsHtml(a, d, sess, false)}</section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title small">Asymmetries</h2></div>
        <div class="kv">${d.asym.map((m) => `<div><span>${m.label}</span><b>${asymHtml(a[m.key], d.asym_bands)}</b></div>`).join('')}</div>
        <div class="panel-head"><h2 class="panel-title small">Left / right</h2></div>
        <div class="kv">
          <div><span>IMTP (N)</span><b>${fmtN(a.imtp_l)} / ${fmtN(a.imtp_r)}</b></div>
          <div><span>Nordic (N/kg)</span><b>${fmtN(a.nordic_l, 2)} / ${fmtN(a.nordic_r, 2)}</b></div>
          <div><span>Adduction (N/kg)</span><b>${fmtN(a.add_l, 2)} / ${fmtN(a.add_r, 2)}</b></div>
          <div><span>Abduction (N/kg)</span><b>${fmtN(a.abd_l, 2)} / ${fmtN(a.abd_r, 2)}</b></div>
          <div><span>ADD:ABD ratio</span><b>${a.addabd_l == null ? '—' : a.addabd_l.toFixed(2)} / ${a.addabd_r == null ? '—' : a.addabd_r.toFixed(2)}</b></div>
        </div>
        ${a.dsi != null ? `<div class="panel-head"><h2 class="panel-title small">Dynamic strength index</h2></div><p class="note"><b>${a.dsi.toFixed(2)}</b> — ${dsiNote(a.dsi)}</p>` : ''}
      </section>
    </div>`;
  const sel = document.getElementById('ts-athlete');
  sel.value = a.id;
  sel.onchange = () => { TS.athlete = sel.value; drawTesting(); };
  const link = document.getElementById('ts-to-load');
  if (link) link.onclick = () => (inWorkload || !WL.data ? switchView('player', { player: a.id }) : alert('No recent GPS data for this player.'));
}
