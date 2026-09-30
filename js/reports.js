/**
 * Reports — the daily training report (Claude Design handoff "2a", same look as the PDF sent to the group).
 * Pages (1290 × 790, landscape): full-session table · TD & >20 km/h charts · Acc+Dec & sprints charts ·
 * total week load · one page per drill. "Download PDF" prints only the report pages (one PDF page each).
 * Data: the `reports` payload (sync/build.py → build_reports); week load and % top-3 game avg are derived here.
 */
const RP = { data: null, idx: -1, wanted: null };
const RP_W = 1290;
const RP_LOGO = 'img/logo.png';

const RP_COLORS = { td: '#6fb0ee', d15: '#e3c85e', d20: '#ea8a63', vmax: '#c4c7cf', sprints: '#e98b96', accdec: '#6cd13c' };
const RP_LABELS = { time: 'Time', min: 'Min', mpm: 'm/min', td: 'TOTAL DISTANCE', d15: 'DIST > 15km/h', d20: 'DIST > 20km/h', vmax: 'MAX SPEED', pmax: '% Max Speed', days: 'Days', sprints: 'Sprints', accdec: 'High Acc+Dec' };
const RP_WIDTHS = { td: 'minmax(0,2.3fr)', d15: 'minmax(0,1.7fr)', d20: 'minmax(0,1.15fr)', vmax: 'minmax(0,1.3fr)', accdec: 'minmax(0,1fr)', pmax: '54px', mpm: '48px', sprints: '52px', time: '36px', min: '40px', days: '44px' };
const RP_BARS = ['td', 'd15', 'd20', 'vmax', 'accdec'];
const RP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const rpEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rpFmt = (k, v) => v == null || Number.isNaN(v) ? '–' : k === 'vmax' ? v.toFixed(1) : k === 'pmax' ? v.toFixed(2) : Number(v).toLocaleString('en-US');
const rpPct = (v, m) => (m > 0 ? Math.min(100, (v || 0) / m * 100) : 0).toFixed(1) + '%';
const RP_JS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const rpLerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Days since the last exposure ≥ 90 % of max speed (thresholds from the handoff — to confirm with the staff)
const rpDaysColor = (d) => d == null ? ['#f0f1f5', '#6a6f80'] : d <= 5 ? ['#d5f2d5', '#1c6b1c'] : d <= 10 ? ['#fbd9c6', '#8a3b12'] : ['#f6c4c4', '#9b1c1c'];
// light red: many sprints is not "bad", just highlighted (staff request); the number stays black
const rpSprintColor = (t) => [`rgb(${rpLerp([254, 242, 242], [244, 172, 172], t)})`, '#111'];
const rpGmColor = (v) => v >= 60 ? '#e8743b' : v >= 40 ? '#d6a90a' : '#8fdc88';

function rpDateLabel(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${RP_MONTHS[m - 1]} ${y}`; }
function rpRangeLabel(a, b) {
  if (a === b) return rpDateLabel(a);
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} – ${d2} ${RP_MONTHS[m2 - 1]} ${y2}`;
  return y1 === y2 ? `${d1} ${RP_MONTHS[m1 - 1]} – ${d2} ${RP_MONTHS[m2 - 1]} ${y2}` : `${rpDateLabel(a)} – ${rpDateLabel(b)}`;
}
function rpWeekStart(iso) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); } // weeks start on Sunday

/** Payload session → the handoff's report JSON (session, positions, players, fullSession, gameAvg, weekLoad, drills). */
function rpDoc(data, i) {
  const s = data.sessions[i], order = data.positions.order;
  const known = (n) => order.includes(data.pos[n]);
  const fullSession = s.full.filter((r) => known(r[0])).map(([name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro]) =>
    ({ name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro }));
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
    session: { id: s.id, date: s.date, dateLabel: rpDateLabel(s.date), week: s.week, md: s.md, ampm: s.ampm, time: s.time, exercise: s.ex },
    positions: data.positions, players: data.pos, pids: data.pid || {}, fullSession, gameAvg,
    weekLoad: { from, to: s.date, label: rpRangeLabel(from, s.date), rows: Object.values(acc) },
    drills: s.drills.map((d) => ({ n: d.n, name: d.name, time: d.time,
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
  const photo = D.photoSrc ? D.photoSrc[pid] : typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid];
  // background image (cover, top) rather than <img>: renders identically in the PDF (html2canvas ignores object-fit)
  return `<span class="rp-face"${photo ? ` style="background-image:url('${photo}')"` : ''}></span>`;
}

function rpTable(D, rows, cols, fixed = {}) {
  // grey track = max of the players who did the typical team session (ProTraining / game): an individual session
  // (e.g. extra running) must not shrink everyone else's bars — his own bar is then capped at 100 %
  const ref = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows;
  const teamMax = (k) => Math.max(0, ...ref.map((r) => r[k] || 0));
  // scale = everyone (an individual session may go past the grey track); grey track = team max
  const scaleMax = (k) => Math.max(teamMax(k), ...rows.map((r) => r[k] || 0));
  const lo = (k) => Math.min(...rows.map((r) => r[k] ?? 0)), hi = (k) => Math.max(...rows.map((r) => r[k] ?? 0));
  const t01 = (k, v) => hi(k) > lo(k) ? ((v ?? 0) - lo(k)) / (hi(k) - lo(k)) : 0;
  const tpl = '150px ' + cols.map((k) => RP_WIDTHS[k] || '44px').join(' ');
  const rowH = rows.length > 17 ? 23 : 25;
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
  let html = `<div class="rp-tbl"><div class="rp-tr rp-th" style="grid-template-columns:${tpl}"><span>Players</span>${cols.map((k) => `<span>${RP_LABELS[k]}</span>`).join('')}</div>`;
  for (const p of D.positions.order) {
    const g = rows.filter((r) => D.players[r.name] === p).sort((a, b) => a.name.localeCompare(b.name));
    if (!g.length) continue;
    html += `<div class="rp-grp">${p}<small>${rpEsc(D.positions.labels[p])}</small></div>`;
    html += g.map((r) => `<div class="rp-tr rp-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>${cols.map((k) => cell(r, k)).join('')}</div>`).join('');
  }
  return html + `</div>
  <div class="rp-legend"><span><b style="background:#6fb0ee"></b>player value</span><span><b style="background:#e6e8ee"></b>team max</span></div>`;
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
  pages.push(rpHeader('FULL SESSION', title, meta) + rpTable(D, D.fullSession, ['time', 'mpm', 'td', 'd15', 'd20', 'vmax', 'pmax', 'days', 'sprints', 'accdec']));
  pages.push(rpHeader('FULL SESSION', title, meta) + rpChart(D, 'td', 'TOTAL DISTANCE', 'TOTAL DISTANCE', 'td') + rpChart(D, 'd20', 'DISTANCE >20kmh', 'DISTANCE >20kmh', 'd20'));
  pages.push(rpHeader('FULL SESSION', title, meta) + rpChart(D, 'accdec', 'Acceleration + Deceleration', 'HI Acc+Dec', 'accdec') + rpChart(D, 'sprints', 'Number of Sprints >25kmh', 'SPRINTS', 'sprints'));
  if (D.weekLoad && D.weekLoad.rows.length) pages.push(rpHeader('TOTAL WEEK LOAD', D.weekLoad.label, [['WEEK', s.week], ['FROM', D.weekLoad.from], ['TO', D.weekLoad.to]]) + rpTable(D, D.weekLoad.rows, ['min', 'td', 'd15', 'd20', 'vmax', 'pmax', 'sprints', 'accdec']));
  for (const d of D.drills || []) {
    if (!d.rows.length) continue;
    pages.push(rpHeader('DRILLS', d.name, [['WEEK', s.week], ['MD', s.md], ['TIME', d.time + "'"], ['N EXERCICE', d.n], ['N SESSION', s.id]]) + rpTable(D, d.rows, ['time', 'mpm', 'td', 'd15', 'd20', 'vmax', 'sprints', 'accdec'], { time: d.time }));
  }
  return pages.map((p) => `<div class="rp-page">${p}</div>`).join('');
}

// ---------------------------------------------------------------- page
function renderReports(opts) {
  if (opts && opts.date) RP.wanted = opts.date;
  const root = document.getElementById('view-reports');
  root.innerHTML = `
    ${pageHead('Daily report', 'Reports', 'rp-sub', `<div class="stepper"><button type="button" id="rp-prev" aria-label="Previous session">‹</button>
        <select class="select" id="rp-pick" aria-label="Session"></select><button type="button" id="rp-next" aria-label="Next session">›</button></div>
      <button type="button" class="btn-primary" id="rp-pdf" disabled>Download PDF</button>`)}
    <div class="rp-preview" id="rp-preview"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  document.getElementById('rp-prev').onclick = () => rpGo(RP.idx - 1);
  document.getElementById('rp-next').onclick = () => rpGo(RP.idx + 1);
  document.getElementById('rp-pick').onchange = (e) => rpGo(Number(e.target.value));
  document.getElementById('rp-pdf').onclick = rpPrint;
  withData('reports', (d) => {
    RP.data = d;
    const list = d.sessions || [];
    const want = RP.wanted ? list.findIndex((s) => s.date === RP.wanted) : -1;
    RP.idx = want >= 0 ? want : RP.idx >= 0 && RP.idx < list.length ? RP.idx : list.length - 1;
    document.getElementById('rp-pick').innerHTML = list.map((s, i) => `<option value="${i}">${rpEsc(rpOption(s))}</option>`).reverse().join('');
    drawReports();
  }, (err) => { document.getElementById('rp-preview').innerHTML = loadError(err); });
}

function rpOption(s) {
  const d = new Date(s.date + 'T12:00:00Z');
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${s.id} · ${day} · ${s.md || (s.type === 'match' ? 'Match' : 'Training')}${s.cycle ? ' · ' + s.cycle : ''}${s.ampm === 'AM' ? ' · AM' : ''}`;
}

function rpGo(i) {
  if (!RP.data || i < 0 || i >= RP.data.sessions.length) return;
  RP.idx = i; RP.wanted = null;
  history.replaceState(null, '', '#reports/' + RP.data.sessions[i].date);
  drawReports();
}

function drawReports() {
  const box = document.getElementById('rp-preview');
  if (!box || !RP.data) return;
  const list = RP.data.sessions;
  if (!list.length) { box.innerHTML = `<div class="panel">${emptyState('No sessions this season yet.')}</div>`; return; }
  const D = rpDoc(RP.data, RP.idx);
  document.getElementById('rp-pick').value = String(RP.idx);
  document.getElementById('rp-prev').disabled = RP.idx <= 0;
  document.getElementById('rp-next').disabled = RP.idx >= list.length - 1;
  document.getElementById('rp-pdf').disabled = false;
  const n = 3 + (D.weekLoad.rows.length ? 1 : 0) + D.drills.filter((d) => d.rows.length).length;
  document.getElementById('rp-sub').textContent = `${D.session.id} · ${D.session.dateLabel} · ${n} pages · ${D.fullSession.length} players`;
  box.innerHTML = `<div class="rp rp-doc">${rpPages(D)}</div>`;
  rpFit();
  rpPhotos(D); // warm up: fetch this session's photos for the PDF in the background, so "Download PDF" is quick
}

/** The pages keep their exact print size (1290 px); the preview is zoomed to the available width. */
function rpFit() {
  const box = document.getElementById('rp-preview'), doc = box && box.querySelector('.rp-doc');
  if (doc) doc.style.zoom = Math.min(1, box.clientWidth / RP_W);
}

/** Loads a script once (the PDF libraries are only fetched when someone downloads a report). */
function rpScript(src) {
  return new Promise((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const el = document.createElement('script');
    el.src = src; el.onload = ok; el.onerror = () => ko(new Error('could not load the PDF tools'));
    document.head.appendChild(el);
  });
}

/** Photos as data URIs through the API (Drive images can't be drawn into a canvas straight from the browser). */
async function rpPhotos(D) {
  const byDrive = {}, out = {};
  for (const r of D.fullSession) {
    const pid = D.pids[r.name], url = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid];
    const id = url && (url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/) || [])[1];
    if (id) byDrive[id] = pid;
  }
  RP.photoCache = RP.photoCache || {};
  const need = Object.keys(byDrive).filter((id) => !(id in RP.photoCache));
  if (need.length && !AUTH.demo) {
    try { Object.assign(RP.photoCache, await callApi('photos', null, { ids: need })); } catch (err) { /* PDF without photos */ }
  }
  for (const [id, pid] of Object.entries(byDrive)) out[pid] = RP.photoCache[id] || '';
  return out;
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
    const D = rpDoc(RP.data, RP.idx);
    D.photoSrc = await rpPhotos(D);
    host = document.createElement('div');
    host.className = 'rp rp-render';
    host.innerHTML = rpPages(D);
    document.body.appendChild(host);
    await Promise.all([...host.querySelectorAll('img')].map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })));
    if (document.fonts) await document.fonts.ready;
    const pages = [...host.querySelectorAll('.rp-page')];
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
    for (let i = 0; i < pages.length; i++) {
      btn.textContent = `Preparing PDF… ${i + 1}/${pages.length}`;
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage([W, H], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST');
    }
    pdf.save(`${D.session.id}_${D.session.date}_Training_report.pdf`);
  } catch (err) {
    alert('Could not create the PDF: ' + (err.message || err));
  } finally {
    if (host) host.remove();
    RP.busy = false; btn.disabled = false; btn.textContent = label;
  }
}
