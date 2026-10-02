/**
 * Reports — the daily training report (Claude Design handoff "2a", same look as the PDF sent to the group).
 * Pages (1290 × 790, landscape): full-session table · TD & >20 km/h charts · Acc+Dec & sprints charts ·
 * total week load · drills summary (rankings by m/min, 4 drills a page). "Download PDF" builds the PDF in the browser.
 * Players / Staff: the staff version (reports-staff.js) adds RPE, z vs the usual MD, A:C and the microcycle pages.
 * Data: the `reports` payload (sync/build.py → build_reports); week load and % top-3 game avg are derived here;
 * the staff pages also read the `staff_report` payload (loaded the first time "Staff" is chosen).
 */
const RP = { data: null, idx: -1, part: 'all', wanted: null, version: 'players', staff: null };
const RP_W = 1290;
const RP_LOGO = 'img/logo.png';

const RP_COLORS = { td: '#6fb0ee', d15: '#e3c85e', d20: '#ea8a63', d25: '#e98b96', vmax: '#c4c7cf', sprints: '#e98b96', accdec: '#6cd13c' };
const RP_LABELS = { time: 'Time', min: 'Min', rpe: 'RPE', mpm: 'm/min', td: 'TOTAL DISTANCE', d15: 'DIST > 15km/h', d20: 'DIST > 20km/h', d25: 'DIST > 25km/h', vmax: 'MAX SPEED', pmax: '% Max Speed', days: 'Days', sprints: 'Sprints', accdec: 'High Acc+Dec' };
const RP_WIDTHS = { td: 'minmax(0,2.3fr)', d15: 'minmax(0,1.7fr)', d20: 'minmax(0,1.15fr)', d25: 'minmax(0,1fr)', vmax: 'minmax(0,1.3fr)', accdec: 'minmax(0,1fr)', pmax: '54px', mpm: '48px', sprints: '52px', time: '36px', min: '40px', days: '44px', rpe: '36px' };
const RP_BARS = ['td', 'd15', 'd20', 'd25', 'vmax', 'accdec'];
const RP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const rpEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rpFmt = (k, v) => v == null || Number.isNaN(v) ? '–' : k === 'vmax' ? v.toFixed(1) : k === 'pmax' ? v.toFixed(2) : Number(v).toLocaleString('en-US');
const rpPct = (v, m) => (m > 0 ? Math.min(100, (v || 0) / m * 100) : 0).toFixed(1) + '%';
const RP_PHOTO_CACHE = 'rp-photos-v1'; // a replaced photo in Drive: bump the version to fetch everything again
const RP_JS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const rpLerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Days since the last exposure ≥ 90 % of max speed (thresholds from the handoff — to confirm with the staff)
const rpDaysColor = (d) => d == null ? ['#f0f1f5', '#6a6f80'] : d <= 5 ? ['#d5f2d5', '#1c6b1c'] : d <= 10 ? ['#fbd9c6', '#8a3b12'] : ['#f6c4c4', '#9b1c1c'];
// light red: many sprints is not "bad", just highlighted (staff request); the number stays black
const rpSprintColor = (t) => [`rgb(${rpLerp([254, 242, 242], [244, 172, 172], t)})`, '#111'];
const rpGmColor = (v) => v >= 60 ? '#e8743b' : v >= 40 ? '#d6a90a' : '#8fdc88';

function rpPartLabel(s, part) { return part === 'b' ? 'Game B' : part === 't' ? (s.type === 'match' ? 'Match' : 'Training') : 'All players'; }
function rpDateLabel(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${RP_MONTHS[m - 1]} ${y}`; }
function rpRangeLabel(a, b) {
  if (a === b) return rpDateLabel(a);
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} – ${d2} ${RP_MONTHS[m2 - 1]} ${y2}`;
  return y1 === y2 ? `${d1} ${RP_MONTHS[m1 - 1]} – ${d2} ${RP_MONTHS[m2 - 1]} ${y2}` : `${rpDateLabel(a)} – ${rpDateLabel(b)}`;
}
function rpWeekStart(iso) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); } // weeks start on Sunday

/** Payload session → the handoff's report JSON (session, positions, players, fullSession, gameAvg, weekLoad, drills). */
function rpDoc(data, i, part = 'all') {
  const s = data.sessions[i], order = data.positions.order;
  const known = (n) => order.includes(data.pos[n]);
  // part: 'all' players · 't' the team session only · 'b' the B-team game only (days when both happened)
  const inPart = (r) => part === 'all' || (part === 'b') === (r[12] === 1);
  const fullSession = s.full.filter((r) => known(r[0]) && inPart(r)).map(([name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro]) =>
    ({ name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro: part === 'b' ? 1 : pro }));
  const pm = (s.parts && s.parts[part]) || {};
  const gameAvg = {};
  for (const k of ['td', 'd20', 'accdec', 'sprints']) {
    gameAvg[k] = {};
    for (const r of fullSession) { const t = (data.top3[r.name] || {})[k]; if (t > 0) gameAvg[k][r.name] = Math.floor((r[k] || 0) / t * 100); } // truncated, as Power BI shows it
  }
  // Total week load: every session from Sunday up to this one (an AM session counts before the PM one)
  const from = rpWeekStart(s.date), acc = {};
  for (let j = 0; j <= i; j++) {
    const x = data.sessions[j];
    if (x.date < from) continue;
    for (const [name, time, , td, d15, d20, vmax, pmax, , sprints, accdec, pro] of x.full) {
      if (!known(name)) continue;
      const a = acc[name] || (acc[name] = { name, min: 0, td: 0, d15: 0, d20: 0, vmax: null, pmax: null, sprints: 0, accdec: 0, pro: 1 });
      a.pro = a.pro && pro; // an individual / adapted day this week keeps him out of the team max
      a.min += time || 0; a.td += td || 0; a.d15 += d15 || 0; a.d20 += d20 || 0; a.sprints += sprints || 0; a.accdec += accdec || 0;
      if (vmax != null && (a.vmax == null || vmax > a.vmax)) a.vmax = vmax;
      if (pmax != null && (a.pmax == null || pmax > a.pmax)) a.pmax = pmax;
    }
  }
  return {
    session: { id: s.id, date: s.date, dateLabel: rpDateLabel(s.date), week: s.week, md: pm.md ?? s.md, ampm: s.ampm, time: pm.time ?? s.time, exercise: s.ex,
      part: s.parts && part !== 'all' ? rpPartLabel(s, part) : '' },
    positions: data.positions, players: data.pos, pids: data.pid || {}, fullSession, gameAvg,
    weekLoad: { from, to: s.date, label: rpRangeLabel(from, s.date), rows: Object.values(acc) },
    drills: (part === 'b' ? [] : s.drills).map((d) => ({ n: d.n, name: d.name, time: d.time,
      rows: d.rows.filter((r) => known(r[0])).map(([name, mpm, td, d15, d20, vmax, sprints, accdec, pro]) => ({ name, mpm, td, d15, d20, vmax, sprints, accdec, pro })) })),
  };
}

// ---------------------------------------------------------------- page builders (handoff report.html, namespaced rp-)
function rpHeader(kicker, title, meta) {
  return `<div class="rp-hd">${RP_LOGO ? `<img class="rp-logo" src="${RP_LOGO}" alt="">` : '<span class="rp-logo"></span>'}
    <div class="rp-t"><span class="rp-k">${rpEsc(kicker)}</span><span class="rp-n">${rpEsc(title)}</span></div>
    <div class="rp-meta">${meta.map(([l, v]) => `<div class="rp-m"><span>${rpEsc(l)}</span><span>${rpEsc(v)}</span></div>`).join('')}</div></div>`;
}

/** Player photo in front of the name (club Drive photos, as elsewhere on the site); an empty circle if none. */
function rpFace(D, name) {
  const pid = D.pids[name];
  const photo = D.noPhotos ? '' : typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid];
  // background image (cover, top); in the PDF the photo is laid on top of this circle at full resolution (rpPrint)
  return `<span class="rp-face" data-pid="${rpEsc(pid || '')}"${photo ? ` style="background-image:url('${photo}')"` : ''}></span>`;
}

const RP_TABLE_H = 634; // page height left for a table under the header (790 − padding − header − legend)

/** `budget`: px available for the table — a big squad (22–25 players) gets lower rows so the page still holds everyone. */
function rpTable(D, rows, cols, fixed = {}, budget = RP_TABLE_H) {
  // grey track = max of the players who did the typical team session (ProTraining / game): an individual session
  // (e.g. extra running) must not shrink everyone else's bars — his own bar is then capped at 100 %
  const ref = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows;
  const teamMax = (k) => Math.max(0, ...ref.map((r) => r[k] || 0));
  // scale = everyone (an individual session may go past the grey track); grey track = team max
  const scaleMax = (k) => Math.max(teamMax(k), ...rows.map((r) => r[k] || 0));
  const lo = (k) => Math.min(...rows.map((r) => r[k] ?? 0)), hi = (k) => Math.max(...rows.map((r) => r[k] ?? 0));
  const t01 = (k, v) => hi(k) > lo(k) ? ((v ?? 0) - lo(k)) / (hi(k) - lo(k)) : 0;
  const tpl = '150px ' + cols.map((k) => RP_WIDTHS[k] || '44px').join(' ');
  const rowH = rpRowH(D, rows, budget - 32, rows.length > 17 ? 23 : 25);
  const cell = (r, k) => {
    const v = fixed[k] ?? r[k];
    if (RP_BARS.includes(k)) {
      const m = scaleMax(k), trk = rpPct(teamMax(k), m);
      if (k === 'vmax') return `<div class="rp-c"><div class="rp-bar rp-mid"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${RP_COLORS[k]}"></i><em>${rpFmt(k, v)}</em></div></div>`;
      return `<div class="rp-c"><span class="rp-v">${rpFmt(k, v)}</span><div class="rp-bar"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${RP_COLORS[k]}"></i></div></div>`;
    }
    if (k === 'mpm') return `<div class="rp-c rp-chip"><span class="rp-v" style="background:rgb(${rpLerp([235, 244, 253], [110, 175, 240], t01(k, v))})">${rpFmt(k, v)}</span></div>`;
    if (k === 'sprints') { const [bg, fg] = rpSprintColor(t01(k, v)); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${rpFmt(k, v)}</span></div>`; }
    if (k === 'days') { const [bg, fg] = rpDaysColor(v); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${rpFmt(k, v)}</span></div>`; }
    return `<div class="rp-c rp-txt"><span class="rp-v">${rpFmt(k, v)}</span></div>`;
  };
  let html = `<div class="rp-tbl${rowH < 21 ? ' rp-tight' : ''}"><div class="rp-tr rp-th" style="grid-template-columns:${tpl}"><span>Players</span>${cols.map((k) => `<span>${RP_LABELS[k]}</span>`).join('')}</div>`;
  for (const p of D.positions.order) {
    const g = rows.filter((r) => D.players[r.name] === p).sort((a, b) => a.name.localeCompare(b.name));
    if (!g.length) continue;
    html += `<div class="rp-grp">${p}<small>${rpEsc(D.positions.labels[p])}</small></div>`;
    html += g.map((r) => `<div class="rp-tr rp-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>${cols.map((k) => cell(r, k)).join('')}</div>`).join('');
  }
  return html + `</div>
  <div class="rp-legend"><span><b style="background:#6fb0ee"></b>player value</span><span><b style="background:#e6e8ee"></b>team max</span></div>`;
}

/** Row height for a player table grouped by position: `space` px for the rows and group bands, at most `max`. */
function rpRowH(D, rows, space, max) {
  const groups = D.positions.order.filter((p) => rows.some((r) => D.players[r.name] === p)).length;
  return Math.max(17, Math.min(max, Math.floor((space - groups * 26) / Math.max(1, rows.length))));
}

function rpChart(D, key, title, legend, gmKey) {
  const rows = [...D.fullSession].sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.name.localeCompare(b.name));
  const m = Math.max(0, ...rows.map((r) => r[key] || 0)), avg = rows.length ? rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length : 0;
  const h = (v) => m ? ((v || 0) / m * 85).toFixed(1) + '%' : '0%';
  const gm = Object.entries(D.gameAvg[gmKey] || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `<div class="rp-blk"><div class="rp-ch">
    <div class="rp-top"><span class="rp-ti">${rpEsc(title)}</span><span class="rp-lg"><span><b style="width:10px;height:10px;border-radius:2px;background:${RP_COLORS[key]}"></b>${rpEsc(legend)}</span><span><b style="width:14px;border-top:2px dashed #16269e"></b>Team avg ${key === 'td' ? Math.round(avg).toLocaleString('en-US') : avg.toFixed(1)}</span></span></div>
    <div class="rp-plot">${rows.map((r) => `<div class="rp-col">${r[key] ? rpFmt(key, r[key]) : ''}<i style="height:${h(r[key])};background:${RP_COLORS[key]}"></i></div>`).join('')}
      <div class="rp-avg" style="bottom:${h(avg)}"></div>${m ? '' : '<span class="rp-empty">No values in this session</span>'}</div>
    <div class="rp-names">${rows.map((r) => `<div><span>${rpEsc(r.name)}</span></div>`).join('')}</div>
  </div><div class="rp-gm"><div class="rp-gh"><span>PLAYERS</span><span>% TOP 3 GAME AVG</span></div>
    ${gm.map(([n, v]) => `<div class="rp-gr"><span>${rpEsc(n)}</span><div class="rp-tk"><i style="width:${Math.min(v, 100)}%;background:${rpGmColor(v)}"></i></div><span>${v}</span></div>`).join('')}
  </div></div>`;
}

function rpPages(D) {
  const s = D.session, pages = [];
  const meta = [['WEEK', s.week], ['MD', s.md], ['TIME', s.time + "'"], ['N EXERCICE', s.exercise], ['AM/PM', s.ampm]];
  const title = `${s.id} · ${s.dateLabel}`;
  const kicker = 'FULL SESSION' + (s.part ? ' · ' + s.part.toUpperCase() : '');
  pages.push(rpHeader(kicker, title, meta) + rpTable(D, D.fullSession, ['time', 'mpm', 'td', 'd15', 'd20', 'vmax', 'pmax', 'days', 'sprints', 'accdec']));
  pages.push(rpHeader(kicker, title, meta) + rpChart(D, 'td', 'TOTAL DISTANCE', 'TOTAL DISTANCE', 'td') + rpChart(D, 'd20', 'DISTANCE >20kmh', 'DISTANCE >20kmh', 'd20'));
  pages.push(rpHeader(kicker, title, meta) + rpChart(D, 'accdec', 'Acceleration + Deceleration', 'HI Acc+Dec', 'accdec') + rpChart(D, 'sprints', 'Number of Sprints >25kmh', 'SPRINTS', 'sprints'));
  if (D.weekLoad && D.weekLoad.rows.length) pages.push(rpHeader('TOTAL WEEK LOAD', D.weekLoad.label, [['WEEK', s.week], ['FROM', D.weekLoad.from], ['TO', D.weekLoad.to]]) + rpTable(D, D.weekLoad.rows, ['min', 'td', 'd15', 'd20', 'vmax', 'pmax', 'sprints', 'accdec']));
  // drills: rankings by m/min (+ High Acc+Dec), up to 4 drills per page — high-speed running is rare in drills
  const drills = (D.drills || []).filter((d) => d.rows.length), cols = rpDrillColumns(drills);
  for (let k = 0; k < cols.length; k += 4) {
    pages.push(rpHeader('DRILLS SUMMARY', title, [['WEEK', s.week], ['MD', s.md], ['DRILLS', drills.length], ['N SESSION', s.id]]) + rpDrillBoards(D, cols.slice(k, k + 4)));
  }
  return pages.map((p) => `<div class="rp-page">${p}</div>`).join('');
}

/** Columns of the drills pages (4 a page): a small drill (1–3 players, e.g. individual or rehab work) goes under the
 * last ranking when the page is already full, instead of opening a nearly empty page. */
function rpDrillColumns(drills) {
  const cols = [];
  for (const d of drills) {
    const last = cols[cols.length - 1], onPage = cols.length ? cols.length % 4 || 4 : 0;
    if (d.rows.length <= 3 && last && onPage === 4 && last.units + d.rows.length + 4 <= 30) { last.items.push(d); last.units += d.rows.length + 4; }
    else cols.push({ items: [d], units: d.rows.length });
  }
  return cols;
}

/** One ranking per drill: players by m/min (bar, dashed team average), High Acc+Dec count alongside. */
function rpDrillBoards(D, cols) {
  const most = Math.max(...cols.map((c) => c.units));
  const rowH = Math.max(17, Math.min(24, Math.floor(600 / Math.max(1, most)))); // a big squad still fits the page
  const card = (d) => {
    const rows = [...d.rows].sort((x, y) => (y.mpm || 0) - (x.mpm || 0) || x.name.localeCompare(y.name));
    const max = Math.max(1, ...rows.map((r) => r.mpm || 0));
    const avg = rows.reduce((t, r) => t + (r.mpm || 0), 0) / rows.length, at = rpPct(avg, max);
    return `<div class="rp-lbc"><div class="rp-lbt"><b>${d.n} · ${rpEsc(d.name)}</b><span>${d.time}'</span><em>${rows.length} player${rows.length > 1 ? 's' : ''}</em></div>
      <div class="rp-lbh"><span>#</span><span>Players</span><span>m/min</span><span>Acc+Dec</span></div>
      ${rows.map((r, i) => `<div class="rp-lbr" style="height:${rowH}px"><span class="rp-lbn${i < 3 ? ' r' + (i + 1) : ''}">${i + 1}</span><span class="rp-lbnm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>
        <span class="rp-lbbar"><b>${rpFmt('mpm', r.mpm)}</b><span class="rp-bar"><i class="rp-trk" style="width:100%"></i><i style="width:${rpPct(r.mpm, max)};background:#6fb0ee"></i><i class="rp-avgl" style="left:${at}"></i></span></span>
        <span class="rp-ad${r.accdec ? '' : ' z'}">${rpFmt('accdec', r.accdec)}</span></div>`).join('')}
      <div class="rp-lbavg"><b></b>Team average ${Math.round(avg)} m/min</div></div>`;
  };
  return `<div class="rp-lbs" style="grid-template-columns:repeat(${Math.max(cols.length, 3)}, minmax(0,1fr))">${cols.map((c) => `<div class="rp-lbcol">${c.items.map(card).join('')}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- page
function renderReports(opts) {
  if (opts && opts.date) RP.wanted = opts.date;
  if (opts && opts.version) RP.version = opts.version === 'staff' ? 'staff' : 'players';
  const root = document.getElementById('view-reports');
  root.innerHTML = `
    ${pageHead('Daily report', 'Reports', 'rp-sub', `${segHtml('rp-ver', [['players', 'Players'], ['staff', 'Staff']], RP.version)}<div class="stepper"><button type="button" id="rp-prev" aria-label="Previous session">‹</button>
        <select class="select" id="rp-pick" aria-label="Session"></select><button type="button" id="rp-next" aria-label="Next session">›</button></div>
      <button type="button" class="btn-primary" id="rp-pdf" disabled>Download PDF</button>`)}
    <div class="rp-preview" id="rp-preview"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  const step = (d) => { const o = (RP.opts || [])[rpOptIndex() + d]; if (o) rpGo(o[0], o[1]); };
  document.getElementById('rp-prev').onclick = () => step(-1);
  document.getElementById('rp-next').onclick = () => step(1);
  document.getElementById('rp-pick').onchange = (e) => { const [i, part] = e.target.value.split('|'); rpGo(Number(i), part); };
  document.getElementById('rp-pdf').onclick = rpPrint;
  bindSeg('rp-ver', (v) => { RP.version = v; rpHash(); drawReports(); });
  withData('reports', (d) => {
    RP.data = d;
    const list = d.sessions || [];
    const want = RP.wanted ? list.findIndex((s) => s.date === RP.wanted) : -1;
    const shown = list.map((s, i) => i).filter((i) => !list[i].hidden);
    // a day with a B-team game alongside the team session offers three reports: all players, the session, the game
    RP.opts = shown.flatMap((i) => list[i].parts ? [[i, 'all'], [i, 't'], [i, 'b']] : [[i, 'all']]);
    RP.idx = want >= 0 ? want : RP.idx >= 0 && RP.idx < list.length ? RP.idx : shown[shown.length - 1] ?? -1;
    if (!list[RP.idx] || !list[RP.idx].parts) RP.part = 'all';
    // newest session first; within a day: all players, the session, the B game
    const byDay = shown.slice().reverse().flatMap((i) => RP.opts.filter((o) => o[0] === i));
    document.getElementById('rp-pick').innerHTML = byDay.map(([i, part]) => `<option value="${i}|${part}">${rpEsc(rpOption(list[i], part))}</option>`).join('');
    drawReports();
  }, (err) => { document.getElementById('rp-preview').innerHTML = loadError(err); });
}

function rpOptIndex() { return (RP.opts || []).findIndex(([i, part]) => i === RP.idx && part === RP.part); }

function rpOption(s, part = 'all') {
  const d = new Date(s.date + 'T12:00:00Z');
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const tag = s.md && s.md !== '/' ? s.md : s.parts ? '' : (s.type === 'match' ? 'Match' : 'Training');
  return `${s.id} · ${day}${tag ? ' · ' + tag : ''}${s.cycle ? ' · ' + s.cycle : ''}${s.ampm === 'AM' ? ' · AM' : ''}${s.parts ? ' · ' + rpPartLabel(s, part) : ''}`;
}

function rpGo(i, part = 'all') {
  if (!RP.data || i < 0 || i >= RP.data.sessions.length) return;
  RP.idx = i; RP.part = RP.data.sessions[i].parts ? part : 'all'; RP.wanted = null;
  rpHash();
  drawReports();
}

function rpHash() {
  const s = RP.data && RP.data.sessions[RP.idx];
  if (s) history.replaceState(null, '', '#reports/' + s.date + (RP.version === 'staff' ? '/staff' : ''));
}

/** Staff version of this report: its pages, or why there is none (match days and B-team games: later). */
function rpStaffState(D) {
  if (!RP.staff) return { wait: true };
  if (RP.part === 'b' || !RP.staff.days[D.session.date]) {
    const s = RP.data.sessions[RP.idx];
    return { msg: s.type === 'match' || RP.part === 'b' ? 'The staff version of match reports is coming later — the Players version is ready.'
      : 'No staff version for this session (no usual reference for this day yet).' };
  }
  return { html: rpStaffPages(D, RP.staff) };
}

function rpBuild(D) { return RP.version === 'staff' ? rpStaffState(D).html || '' : rpPages(D); }

function drawReports() {
  const box = document.getElementById('rp-preview');
  if (!box || !RP.data) return;
  const list = RP.data.sessions;
  if (!list.length) { box.innerHTML = `<div class="panel">${emptyState('No sessions this season yet.')}</div>`; return; }
  const D = rpDoc(RP.data, RP.idx, RP.part);
  document.getElementById('rp-pick').value = `${RP.idx}|${RP.part}`;
  const k = rpOptIndex();
  document.getElementById('rp-prev').disabled = k <= 0;
  document.getElementById('rp-next').disabled = k < 0 || k >= RP.opts.length - 1;
  const drillPages = Math.ceil(rpDrillColumns(D.drills.filter((d) => d.rows.length)).length / 4);
  let html, n;
  if (RP.version === 'staff') {
    const st = rpStaffState(D);
    if (st.wait) {
      box.innerHTML = '<div class="panel"><div class="empty">Loading the staff data…</div></div>';
      document.getElementById('rp-pdf').disabled = true;
      withData('staff_report', (d) => { RP.staff = d; if (RP.version === 'staff') drawReports(); },
        (err) => { if (RP.version === 'staff') box.innerHTML = loadError(err); });
      return;
    }
    if (st.msg) {
      box.innerHTML = `<div class="panel rp-msg">${emptyState(st.msg)}</div>`;
      document.getElementById('rp-pdf').disabled = true;
      document.getElementById('rp-sub').textContent = `${D.session.id} · ${D.session.dateLabel}${D.session.part ? ' · ' + D.session.part : ''} · Staff`;
      return;
    }
    html = st.html; n = 6 + drillPages;
  } else {
    html = rpPages(D); n = 3 + (D.weekLoad.rows.length ? 1 : 0) + drillPages;
  }
  document.getElementById('rp-pdf').disabled = false;
  document.getElementById('rp-sub').textContent = `${D.session.id} · ${D.session.dateLabel}${D.session.part ? ' · ' + D.session.part : ''}${RP.version === 'staff' ? ' · Staff' : ''} · ${n} pages · ${D.fullSession.length} players`;
  box.innerHTML = `<div class="rp rp-doc">${html}</div>`;
  rpFit();
  // warm up in the background so "Download PDF" is quick: this session's photos and the PDF tools
  rpPhotos(D);
  Promise.all(RP_JS.map(rpScript)).catch(() => { /* retried on click */ });
}

/** The pages keep their exact print size (1290 px); the preview is zoomed to the available width. */
function rpFit() {
  const box = document.getElementById('rp-preview'), doc = box && box.querySelector('.rp-doc');
  if (doc) doc.style.zoom = Math.min(1, box.clientWidth / RP_W);
}

/** Loads a script once (the PDF libraries are only fetched when someone downloads a report). */
const RP_SCRIPTS = {}; // one promise per script: a click during the warm-up waits until it has really loaded
function rpScript(src) {
  return RP_SCRIPTS[src] || (RP_SCRIPTS[src] = new Promise((ok, ko) => {
    const el = document.createElement('script');
    el.src = src; el.onload = ok;
    el.onerror = () => { delete RP_SCRIPTS[src]; el.remove(); ko(new Error('could not load the PDF tools')); };
    document.head.appendChild(el);
  }));
}

/** Photos as data URIs through the API (Drive images can't be drawn into a canvas straight from the browser). */
async function rpPhotos(D) {
  const byDrive = {}, out = {};
  for (const r of D.fullSession) {
    const pid = D.pids[r.name], url = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid];
    const id = url && (url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/) || [])[1];
    if (id) byDrive[id] = pid;
  }
  // usual case: the photos are already in this browser (loadPlayerPhotos), as data URIs
  await loadPlayerPhotos();
  for (const r of D.fullSession) { const pid = D.pids[r.name], u = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid]; if (u && u.startsWith('data:')) out[pid] = u; }
  for (const [id, pid] of Object.entries(byDrive)) if (out[pid]) delete byDrive[id];
  if (!Object.keys(byDrive).length) return out;
  // fallback (photo not in the payload yet): through the API, one by one
  RP.photoCache = RP.photoCache || {};
  RP.photoWait = RP.photoWait || {}; // requests in flight: a click during the warm-up waits for it instead of asking again
  let need = Object.keys(byDrive).filter((id) => !(id in RP.photoCache) && !RP.photoWait[id]);
  // photos kept in this browser (Cache Storage) from earlier reports
  if (need.length && window.caches) {
    try {
      const box = await caches.open(RP_PHOTO_CACHE);
      await Promise.all(need.map(async (id) => { const hit = await box.match('/rp-photo/' + id); if (hit) RP.photoCache[id] = await hit.text(); }));
      need = need.filter((id) => !(id in RP.photoCache));
    } catch (err) { /* storage unavailable: ask the server */ }
  }
  if (need.length && !AUTH.demo) {
    const ask = callApi('photos', null, { ids: need }).then(async (got) => {
      Object.assign(RP.photoCache, got);
      try { const box = await caches.open(RP_PHOTO_CACHE); await Promise.all(Object.entries(got).map(([id, uri]) => box.put('/rp-photo/' + id, new Response(uri)))); } catch (err) { /* not kept */ }
    }).catch(() => { /* PDF without photos */ }).finally(() => need.forEach((id) => { delete RP.photoWait[id]; }));
    need.forEach((id) => { RP.photoWait[id] = ask; });
  }
  await Promise.all(Object.keys(byDrive).map((id) => RP.photoWait[id]).filter(Boolean));
  for (const [id, pid] of Object.entries(byDrive)) out[pid] = RP.photoCache[id] || '';
  return out;
}

/** Natural size of each photo (to place it like CSS "cover, top"). */
function rpImageSizes(photos) {
  return Promise.all(Object.entries(photos).filter(([, src]) => src).map(([pid, src]) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok([pid, { w: im.naturalWidth, h: im.naturalHeight }]);
    im.onerror = () => ok([pid, null]);
    im.src = src;
  }))).then(Object.fromEntries);
}

/** Builds the PDF in the browser (one landscape page per report page) and downloads it: no print dialog. */
async function rpPrint() {
  if (!RP.data || RP.busy) return;
  const btn = document.getElementById('rp-pdf'), label = btn.textContent;
  const W = RP_W * 0.75, H = 790 * 0.75; // pt
  RP.busy = true; btn.disabled = true; btn.textContent = 'Preparing PDF…';
  let host = null;
  try {
    await Promise.all(RP_JS.map(rpScript));
    const D = rpDoc(RP.data, RP.idx, RP.part);
    btn.textContent = 'Loading photos…';
    const photos = await rpPhotos(D), dims = await rpImageSizes(photos);
    D.noPhotos = true; // the page picture is taken without them: a 21-px photo inside a picture gets blurred
    host = document.createElement('div');
    host.className = 'rp rp-render';
    host.innerHTML = rpBuild(D);
    document.body.appendChild(host);
    await Promise.all([...host.querySelectorAll('img')].map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })));
    if (document.fonts) await document.fonts.ready;
    const pages = [...host.querySelectorAll('.rp-page')];
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
    for (let i = 0; i < pages.length; i++) {
      btn.textContent = `Preparing PDF… ${i + 1}/${pages.length}`;
      // ignoreElements: only the report is copied, not every page of the site already open
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, ignoreElements: (el) => el.parentElement === document.body && el !== host });
      if (i) pdf.addPage([W, H], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST');
      // photos: the original Drive image, clipped to its circle (cover, top) — sharp at any zoom, embedded once per player
      const box = pages[i].getBoundingClientRect();
      for (const el of pages[i].querySelectorAll('.rp-face[data-pid]')) {
        const pid = el.dataset.pid, src = photos[pid], dim = dims[pid];
        if (!src || !dim) continue;
        const r = el.getBoundingClientRect();
        const x = (r.left - box.left) * 0.75, y = (r.top - box.top) * 0.75, w = r.width * 0.75, h = r.height * 0.75;
        const k = Math.max(w / dim.w, h / dim.h), dw = dim.w * k, dh = dim.h * k;
        pdf.saveGraphicsState();
        pdf.circle(x + w / 2, y + h / 2, w / 2, null);
        pdf.clip();
        pdf.discardPath();
        pdf.addImage(src, /^data:image\/png/.test(src) ? 'PNG' : 'JPEG', x + (w - dw) / 2, y, dw, dh, 'ph_' + pid);
        pdf.restoreGraphicsState();
      }
    }
    pdf.save(`${D.session.id}_${D.session.date}${D.session.part ? '_' + D.session.part.replace(/\s+/g, '') : ''}_${RP.version === 'staff' ? 'Staff' : 'Training'}_report.pdf`);
  } catch (err) {
    alert('Could not create the PDF: ' + (err.message || err));
  } finally {
    if (host) host.remove();
    RP.busy = false; btn.disabled = false; btn.textContent = label;
  }
}
