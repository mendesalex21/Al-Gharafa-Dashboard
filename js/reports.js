/**
 * Downloads (view id "reports") — the daily training report (Claude Design handoff "2a", same look as the PDF sent to the group).
 * Pages (1290 × 790, landscape): full-session table · TD & >20 km/h charts · Acc+Dec & sprints charts ·
 * total week load · drills summary (rankings by m/min, 4 drills a page). "Download PDF" builds the PDF in the browser.
 * Players / Staff: the staff version (reports-staff.js) adds RPE, z vs the usual MD, A:C and the microcycle pages.
 * Data: the `reports` payload (sync/build.py → build_reports); week load and % top-3 game avg are derived here;
 * the staff pages also read the `staff_report` payload (loaded the first time "Staff" is chosen).
 */
const RP = { data: null, idx: -1, part: 'all', wanted: null, version: 'players', staff: null, week: null, who: '' };
const RP_W = 1290;
const RP_LOGO = 'img/logo.png';

const RP_COLORS = { hitn: '#e3c85e', td: '#6fb0ee', d15: '#e3c85e', d20: '#ea8a63', d25: '#e98b96', vmax: '#c4c7cf', sprints: '#e98b96', accdec: '#6cd13c' };
const RP_LABELS = { hitn: 'count > 20km/h', time: 'Time', min: 'Min', rpe: 'RPE', mpm: 'm/min', td: 'TOTAL DISTANCE', d15: 'DIST > 15km/h', d20: 'DIST > 20km/h', d25: 'DIST > 25km/h', vmax: 'MAX SPEED', pmax: '% Max Speed', days: 'Days', sprints: 'Sprints', accdec: 'High Acc+Dec' };
const RP_WIDTHS = { hitn: 'minmax(0,1fr)', td: 'minmax(0,2.3fr)', d15: 'minmax(0,1.7fr)', d20: 'minmax(0,1.15fr)', d25: 'minmax(0,1fr)', vmax: 'minmax(0,1.3fr)', accdec: 'minmax(0,1fr)', pmax: '54px', mpm: '48px', sprints: '52px', time: '36px', min: '40px', days: '44px', rpe: '36px' };
const RP_BARS = ['td', 'd15', 'd20', 'd25', 'vmax', 'accdec', 'hitn'];
const RP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const rpEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rpFmt = (k, v) => v == null || Number.isNaN(v) ? '–' : k === 'vmax' ? v.toFixed(1) : k === 'pmax' ? v.toFixed(2) : Number(v).toLocaleString('en-US');
const rpPct = (v, m) => (m > 0 ? Math.min(100, (v || 0) / m * 100) : 0).toFixed(1) + '%';
const RP_PHOTO_CACHE = 'rp-photos-v1'; // a replaced photo in Drive: bump the version to fetch everything again
const RP_JS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const rpLerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Days since the last exposure ≥ 90 % of max speed (thresholds from the handoff — to confirm with the staff)
const RP_GREEN = ['#d5f2d5', '#1c6b1c']; // % max speed ≥ 90 % (the "Days" green)
const rpRec = (r) => (r.rec ? '<i class="rp-rec" title="His fastest of the last 12 months">★</i>' : ''); // a new max-speed record
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
  const fullSession = s.full.filter((r) => known(r[0]) && inPart(r)).map(([name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro, , rec]) =>
    ({ name, time, mpm, td, d15, d20, vmax, pmax, days, sprints, accdec, pro: part === 'b' ? 1 : pro, rec: rec === 1 }));
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
    for (const [name, time, , td, d15, d20, vmax, pmax, , sprints, accdec, pro, , rec] of x.full) {
      if (!known(name)) continue;
      const a = acc[name] || (acc[name] = { name, min: 0, td: 0, d15: 0, d20: 0, vmax: null, pmax: null, sprints: 0, accdec: 0, pro: 1 });
      a.pro = a.pro && pro; // an individual / adapted day this week keeps him out of the team max
      a.min += time || 0; a.td += td || 0; a.d15 += d15 || 0; a.d20 += d20 || 0; a.sprints += sprints || 0; a.accdec += accdec || 0;
      if (vmax != null && (a.vmax == null || vmax > a.vmax)) a.vmax = vmax;
      if (pmax != null && (a.pmax == null || pmax > a.pmax)) a.pmax = pmax;
      if (rec === 1) a.rec = true; // a new max-speed record this week
    }
  }
  return {
    session: { id: s.id, date: s.date, dateLabel: rpDateLabel(s.date), week: s.week, md: pm.md ?? s.md, ampm: s.ampm, time: pm.time ?? s.time, exercise: s.ex, type: s.type,
      part: s.parts && part !== 'all' ? rpPartLabel(s, part) : '' },
    positions: data.positions, players: data.pos, pids: data.pid || {}, fullSession, gameAvg,
    weekLoad: { from, to: s.date, label: rpRangeLabel(from, s.date), rows: Object.values(acc) },
    drills: (part === 'b' ? [] : s.drills).map((d) => ({ n: d.n, name: d.name, time: d.time,
      rows: d.rows.filter((r) => known(r[0])).map(([name, mpm, td, d15, d20, vmax, sprints, accdec, pro, time, hitn]) => ({ name, mpm, td, d15, d20, vmax, sprints, accdec, pro,
        time: time ?? (mpm ? Math.round(td / mpm) : null), hitn })) })), // his minutes in the drill (older data: distance ÷ m/min), his efforts > 20 km/h
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
function rpTable(D, rows, cols, fixed = {}, budget = RP_TABLE_H, opts = {}) {
  const all = opts.all || rows; // the scales: every row, also when the table runs over two pages (a match's page 4)
  // grey track = max of the players who did the typical team session (ProTraining / game): an individual session
  // (e.g. extra running) must not shrink everyone else's bars — his own bar is then capped at 100 %
  const ref = all.some((r) => r.pro) ? all.filter((r) => r.pro) : all;
  const teamMax = (k) => Math.max(0, ...ref.map((r) => r[k] || 0));
  // scale = everyone (an individual session may go past the grey track); grey track = team max
  const scaleMax = (k) => Math.max(teamMax(k), ...all.map((r) => r[k] || 0));
  // m/min colour scale: the players of the team session only — an individual / rehab session is not compared (grey)
  const span = (k) => (k === 'mpm' ? ref : all);
  const lo = (k) => Math.min(...span(k).map((r) => r[k] ?? 0)), hi = (k) => Math.max(...span(k).map((r) => r[k] ?? 0));
  const t01 = (k, v) => hi(k) > lo(k) ? Math.max(0, Math.min(1, ((v ?? 0) - lo(k)) / (hi(k) - lo(k)))) : 0;
  const tpl = '150px ' + cols.map((k) => RP_WIDTHS[k] || '44px').join(' ');
  const rowH = opts.rowH || rpRowH(D, rows, budget - 32, rows.length > 17 ? 23 : 25);
  const midH = Math.max(10, Math.min(18, rowH - 6)); // the max-speed bar follows the row: a gap between players, as the other bars
  const cell = (r, k) => {
    const v = fixed[k] ?? r[k];
    if (RP_BARS.includes(k)) {
      const m = scaleMax(k), trk = rpPct(teamMax(k), m);
      if (k === 'vmax') return `<div class="rp-c"><div class="rp-bar rp-mid" style="height:${midH}px"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${RP_COLORS[k]}"></i><em>${rpFmt(k, v)}</em></div></div>`;
      return `<div class="rp-c"><span class="rp-v">${rpFmt(k, v)}</span><div class="rp-bar"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${RP_COLORS[k]}"></i></div></div>`;
    }
    if (k === 'mpm') return !r.pro && all.some((x) => x.pro) ? `<div class="rp-c rp-chip"><span class="rp-v rp-off" title="individual / rehab session: not in the team average">${rpFmt(k, v)}</span></div>`
      : `<div class="rp-c rp-chip"><span class="rp-v" style="background:rgb(${rpLerp([235, 244, 253], [110, 175, 240], t01(k, v))})">${rpFmt(k, v)}</span></div>`;
    if (k === 'sprints') { const [bg, fg] = rpSprintColor(t01(k, v)); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${rpFmt(k, v)}</span></div>`; }
    if (k === 'days') { const [bg, fg] = rpDaysColor(v); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${rpFmt(k, v)}</span></div>`; }
    if (k === 'pmax' && v != null && v >= 0.9 - 1e-9) return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${RP_GREEN[0]};color:${RP_GREEN[1]}">${rpFmt(k, v)}${rpRec(r)}</span></div>`;
    if (k === 'pmax') return `<div class="rp-c rp-txt"><span class="rp-v">${rpFmt(k, v)}${rpRec(r)}</span></div>`;
    return `<div class="rp-c rp-txt"><span class="rp-v">${rpFmt(k, v)}</span></div>`;
  };
  let html = `<div class="rp-tbl${rowH < 21 ? ' rp-tight' : ''}"><div class="rp-tr rp-th" style="grid-template-columns:${tpl}"><span>Players</span>${cols.map((k) => `<span>${RP_LABELS[k]}</span>`).join('')}</div>`;
  if (opts.byPlayer) { // a match's halves (his Power BI page 4): the player's name, then his halves below it
    for (const n of rpByPosition(D, rows)) {
      html += `<div class="rp-pname" style="height:${opts.nameH || 16}px">${rpFace(D, n)}${rpEsc(n)}</div>`; // his photo, as on page 1
      html += rows.filter((r) => r.name === n).sort((a, b) => a.half - b.half).map((r) => `<div class="rp-tr rp-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm rp-hn">${rpEsc(r.label)}</span>${cols.map((k) => cell(r, k)).join('')}</div>`).join('');
    }
  } else {
    for (const p of D.positions.order) {
      const g = rows.filter((r) => D.players[r.name] === p).sort((a, b) => a.name.localeCompare(b.name));
      if (!g.length) continue;
      html += `<div class="rp-grp">${p}<small>${rpEsc(D.positions.labels[p])}</small></div>`;
      html += g.map((r) => `<div class="rp-tr rp-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>${cols.map((k) => cell(r, k)).join('')}</div>`).join('');
    }
  }
  return html + `</div>
  <div class="rp-legend"><span><b style="background:#6fb0ee"></b>player value</span><span><b style="background:#e6e8ee"></b>team max</span>${cols.includes('pmax') ? `<span><b style="background:${RP_GREEN[0]}"></b>≥ 90 % of his max speed</span>${rows.some((r) => r.rec) ? '<span><i class="rp-rec">★</i> his fastest of the last 12 months</span>' : ''}` : ''}</div>`;
}

/** Row height for a player table grouped by position: `space` px for the rows and group bands, at most `max`. */
function rpRowH(D, rows, space, max) {
  const groups = D.positions.order.filter((p) => rows.some((r) => D.players[r.name] === p)).length;
  return Math.max(17, Math.min(max, Math.floor((space - groups * 26) / Math.max(1, rows.length))));
}
/** The players of some rows, by position (the report's order), then by name. */
function rpByPosition(D, rows) {
  const o = D.positions.order, pos = (n) => (o.includes(D.players[n]) ? o.indexOf(D.players[n]) : o.length);
  return [...new Set(rows.map((r) => r.name))].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

// ---------------------------------------------------------------- a match: the halves (his Power BI "Game Data" pages 4–7)
const RP_HALF_COLS = ['time', 'mpm', 'td', 'd15', 'd20', 'vmax', 'hitn', 'sprints', 'accdec']; // his columns
function rpHalves(D) {
  const half = (k) => ((D.drills || []).find((d) => d.name === `Game_${k}Half`) || { rows: [] }).rows;
  return [half('1st'), half('2nd')];
}
const rpHalfTime = (rows) => Math.max(0, ...rows.map((r) => r.time || 0));
/** The team in each half (his Power BI page 5): every outfield player with GPS — distances, efforts, sprints and
 * Acc + Dec added up, m/min = their average, max speed = the fastest. */
function rpTeamHalves(h1, h2) {
  const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const tot = (rows) => ({ time: rpHalfTime(rows), mpm: rows.length ? Math.round(sum(rows, 'mpm') / rows.length) : null, td: sum(rows, 'td'), d15: sum(rows, 'd15'),
    d20: sum(rows, 'd20'), vmax: Math.max(0, ...rows.map((r) => r.vmax || 0)) || null, hitn: sum(rows, 'hitn'), sprints: sum(rows, 'sprints'), accdec: sum(rows, 'accdec') });
  const a = tot(h1), b = tot(h2), cols = RP_HALF_COLS, mx = (k) => Math.max(a[k] || 0, b[k] || 0) || 1;
  const tpl = '150px ' + cols.map((k) => RP_WIDTHS[k] || '44px').join(' ');
  const cell = (t, k) => (RP_BARS.includes(k) ? `<div class="rp-c"><span class="rp-v">${rpFmt(k, t[k])}</span><div class="rp-bar"><i style="width:${rpPct(t[k], mx(k))};background:${RP_COLORS[k]}"></i></div></div>`
    : `<div class="rp-c rp-txt"><span class="rp-v">${rpFmt(k, t[k])}</span></div>`);
  const row = (label, t) => `<div class="rp-tr rp-row rp-team" style="grid-template-columns:${tpl}"><span class="rp-nm rp-hn">${label}</span>${cols.map((k) => cell(t, k)).join('')}</div>`;
  return `<div class="rp-tbl"><div class="rp-tr rp-th" style="grid-template-columns:${tpl}"><span>Type</span>${cols.map((k) => `<span>${RP_LABELS[k]}</span>`).join('')}</div>
    ${row('Game_1stHalf', a)}${row('Game_2ndHalf', b)}</div>
    <div class="rp-legend"><span>Team = every outfield player with GPS data in that half (substitutes included): distances, efforts, sprints and Acc + Dec added up, m/min = their average, max speed = the fastest.</span></div>`;
}
/** Pages 4–7 of a match: every player's two halves, the team per half, the 1st half, the 2nd half. */
function rpMatchPages(D, title) {
  const s = D.session, [h1, h2] = rpHalves(D), cols = RP_HALF_COLS;
  const meta = (time) => [['WEEK', s.week], ['MD', s.md], ['TIME', time + "'"], ['N SESSION', s.id]];
  const pages = [];
  // page 4 (his Power BI page): each player's name, then his Game_1stHalf and Game_2ndHalf lines; a second page when
  // there are too many players for one
  const both = [...h1.map((r) => ({ ...r, half: 1, label: 'Game_1stHalf' })), ...h2.map((r) => ({ ...r, half: 2, label: 'Game_2ndHalf' }))];
  const names = rpByPosition(D, both), nameH = 16, space = RP_TABLE_H - 32 - 16, fits = (ns) => Math.floor((space - ns.length * nameH) / both.filter((r) => ns.includes(r.name)).length);
  let chunks = [names];
  if (names.length && fits(names) < 15) { // two pages: the players split where the lines are halved
    let k = 0, n = 0;
    while (k < names.length && n + both.filter((r) => r.name === names[k]).length <= both.length / 2) n += both.filter((r) => r.name === names[k++]).length;
    chunks = [names.slice(0, Math.max(1, k)), names.slice(Math.max(1, k))];
  }
  for (const ns of chunks) {
    if (!ns.length) continue;
    pages.push(rpHeader('GAME · 1ST HALF & 2ND HALF', title, meta(s.time)) + rpTable(D, both.filter((r) => ns.includes(r.name)), cols, {}, RP_TABLE_H, { byPlayer: true, all: both, nameH, rowH: Math.max(15, Math.min(22, fits(ns))) }));
  }
  if (h1.length && h2.length) pages.push(rpHeader('TOTAL TEAM · 1ST HALF & 2ND HALF', title, meta(s.time)) + rpTeamHalves(h1, h2));
  if (h1.length) pages.push(rpHeader('GAME · 1ST HALF', title, [['WEEK', s.week], ['MD', s.md], ['EXERCICE', 'Game_1stHalf'], ['TIME', rpHalfTime(h1) + "'"], ['N SESSION', s.id]]) + rpTable(D, h1, cols));
  if (h2.length) pages.push(rpHeader('GAME · 2ND HALF', title, [['WEEK', s.week], ['MD', s.md], ['EXERCICE', 'Game_2ndHalf'], ['TIME', rpHalfTime(h2) + "'"], ['N SESSION', s.id]]) + rpTable(D, h2, cols));
  return pages;
}

/** The "% top 3 game avg" list beside a chart: every player fits in the block (325 px, 24 of them for the title) — the
 * rows, then the text, get smaller when there are many players (a match day with 20+ players). */
const RP_GM_H = 298;
function rpGmList(gm) {
  const slot = Math.max(9, Math.min(21, Math.floor(RP_GM_H / Math.max(1, gm.length))));
  const fs = slot >= 18 ? 11 : slot >= 14 ? 10 : 9, bar = slot >= 16 ? 8 : 6;
  return `<div class="rp-gm rp-gm-fit"><div class="rp-gh"><span>PLAYERS</span><span>% TOP 3 GAME AVG</span></div>
    ${gm.map(([n, v]) => `<div class="rp-gr" style="height:${slot}px;font-size:${fs}px"><span>${rpEsc(n)}</span><div class="rp-tk" style="height:${bar}px"><i style="width:${Math.min(v, 100)}%;background:${rpGmColor(v)}"></i></div><span>${v}</span></div>`).join('')}
  </div>`;
}

function rpChart(D, key, title, legend, gmKey) {
  const rows = [...D.fullSession].sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.name.localeCompare(b.name));
  const team = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows; // team average: the players of the team session (not individual / rehab)
  const m = Math.max(0, ...rows.map((r) => r[key] || 0)), avg = team.length ? team.reduce((s, r) => s + (r[key] || 0), 0) / team.length : 0;
  const h = (v) => m ? ((v || 0) / m * 85).toFixed(1) + '%' : '0%';
  const gm = Object.entries(D.gameAvg[gmKey] || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `<div class="rp-blk"><div class="rp-ch">
    <div class="rp-top"><span class="rp-ti">${rpEsc(title)}</span><span class="rp-lg"><span><b style="width:10px;height:10px;border-radius:2px;background:${RP_COLORS[key]}"></b>${rpEsc(legend)}</span><span><b style="width:14px;border-top:2px dashed #16269e"></b>Team avg ${key === 'td' ? Math.round(avg).toLocaleString('en-US') : avg.toFixed(1)}</span></span></div>
    <div class="rp-plot">${rows.map((r) => `<div class="rp-col">${r[key] ? rpFmt(key, r[key]) : ''}<i style="height:${h(r[key])};background:${RP_COLORS[key]}"></i></div>`).join('')}
      <div class="rp-avg" style="bottom:${h(avg)}"></div>${m ? '' : '<span class="rp-empty">No values in this session</span>'}</div>
    <div class="rp-names">${rows.map((r) => `<div><span>${rpEsc(r.name)}</span></div>`).join('')}</div>
  </div>${rpGmList(gm)}</div>`;
}

function rpPages(D) {
  const s = D.session, pages = [];
  const meta = [['WEEK', s.week], ['MD', s.md], ['TIME', s.time + "'"], ['N EXERCICE', s.exercise], ['AM/PM', s.ampm]];
  const title = `${s.id} · ${s.dateLabel}`;
  const kicker = 'FULL SESSION' + (s.part ? ' · ' + s.part.toUpperCase() : '');
  pages.push(rpHeader(kicker, title, meta) + rpTable(D, D.fullSession, ['time', 'mpm', 'td', 'd15', 'd20', 'vmax', 'pmax', 'days', 'sprints', 'accdec']));
  pages.push(rpHeader(kicker, title, meta) + rpChart(D, 'td', 'TOTAL DISTANCE', 'TOTAL DISTANCE', 'td') + rpChart(D, 'd20', 'DISTANCE >20kmh', 'DISTANCE >20kmh', 'd20'));
  pages.push(rpHeader(kicker, title, meta) + rpChart(D, 'accdec', 'Acceleration + Deceleration', 'HI Acc+Dec', 'accdec') + rpChart(D, 'sprints', 'Number of Sprints >25kmh', 'SPRINTS', 'sprints'));
  const halves = rpHalves(D);
  if (s.type === 'match' && (halves[0].length || halves[1].length)) pages.push(...rpMatchPages(D, title)); // a match: his halves pages
  else {
    // drills: rankings by m/min (+ High Acc+Dec), up to 4 drills per page — high-speed running is rare in drills
    const drills = (D.drills || []).filter((d) => d.rows.length), cols = rpDrillColumns(drills);
    for (let k = 0; k < cols.length; k += 4) {
      pages.push(rpHeader('DRILLS SUMMARY', title, [['WEEK', s.week], ['MD', s.md], ['DRILLS', drills.length], ['N SESSION', s.id]]) + rpDrillBoards(D, cols.slice(k, k + 4)));
    }
  }
  // the total week load is the last page (the user's order)
  if (D.weekLoad && D.weekLoad.rows.length) pages.push(rpHeader('TOTAL WEEK LOAD', D.weekLoad.label, [['WEEK', s.week], ['FROM', D.weekLoad.from], ['TO', D.weekLoad.to]]) + rpTable(D, D.weekLoad.rows, ['min', 'td', 'd15', 'd20', 'vmax', 'pmax', 'sprints', 'accdec']));
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
    const team = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows; // individual / rehab players left out of the average
    const avg = team.reduce((t, r) => t + (r.mpm || 0), 0) / team.length, at = rpPct(avg, max);
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
  if (opts && opts.date === 'data') RP.version = 'data';
  else if (opts && opts.date === 'weekly') { RP.version = 'weekly'; if (opts.version) RP.week = opts.version; } // #reports/weekly/<sunday>
  else if (opts && opts.date) RP.wanted = opts.date;
  if (opts && opts.version && opts.date !== 'weekly') RP.version = opts.version === 'staff' ? 'staff' : 'players';
  const root = document.getElementById('view-reports');
  root.innerHTML = `
    ${pageHead('PDF reports · Excel data', 'Downloads', 'rp-sub', `${segHtml('rp-ver', [['players', 'Players'], ['staff', 'Staff'], ['weekly', 'Weekly'], ['data', 'Excel data']], RP.version)}<div class="stepper" id="rp-step"><button type="button" id="rp-prev" aria-label="Previous session">‹</button>
        <select class="select" id="rp-pick" aria-label="Session"></select><button type="button" id="rp-next" aria-label="Next session">›</button></div>
      <select class="select" id="rp-who" aria-label="Player" hidden></select>
      <button type="button" class="btn-light" id="rp-pptx" title="The players' report as slides, for the gym screen">PowerPoint</button>
      <button type="button" class="btn-primary" id="rp-pdf" disabled>Download PDF</button>`)}
    <div class="rp-preview" id="rp-preview"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  const step = (d) => {
    if (RP.version === 'weekly') { const ws = rwWeeks(RP.data && RP.data.weekly).map((w) => w.ws), k = ws.indexOf(RP.week) - d; if (ws[k]) { RP.week = ws[k]; rpHash(); drawReports(); } return; }
    const o = (RP.opts || [])[rpOptIndex() + d]; if (o) rpGo(o[0], o[1]);
  };
  document.getElementById('rp-prev').onclick = () => step(-1);
  document.getElementById('rp-next').onclick = () => step(1);
  document.getElementById('rp-pick').onchange = (e) => {
    if (RP.version === 'weekly') { RP.week = e.target.value; rpHash(); drawReports(); return; }
    const [i, part] = e.target.value.split('|'); rpGo(Number(i), part);
  };
  document.getElementById('rp-who').onchange = (e) => { RP.who = e.target.value; drawReports(); };
  document.getElementById('rp-pdf').onclick = () => (RP.version === 'weekly' ? rwPrint() : rpPrint());
  document.getElementById('rp-pptx').onclick = rpPptx;
  bindSeg('rp-ver', (v) => { RP.version = v; rpHash(); drawReports(); });
  withData('reports', (d) => {
    RP.data = d;
    const list = d.sessions || [];
    const want = RP.wanted ? list.findIndex((s) => s.date === RP.wanted) : -1;
    const shown = list.map((s, i) => i).filter((i) => !list[i].hidden);
    // a day with a B-team game alongside the team session offers three reports: all players, the session, the game
    RP.opts = shown.flatMap((i) => list[i].parts ? [[i, 'all'], [i, 't'], [i, 'b']] : [[i, 'all']]);
    rpGpsPlayers(); // the Excel data view's player list, if it is open
    RP.idx = want >= 0 ? want : RP.idx >= 0 && RP.idx < list.length ? RP.idx : shown[shown.length - 1] ?? -1;
    if (!list[RP.idx] || !list[RP.idx].parts) RP.part = 'all';
    // newest session first; within a day: all players, the session, the B game
    const byDay = shown.slice().reverse().flatMap((i) => RP.opts.filter((o) => o[0] === i));
    RP.sessOpts = byDay.map(([i, part]) => `<option value="${i}|${part}">${rpEsc(rpOption(list[i], part))}</option>`).join('');
    document.getElementById('rp-pick').innerHTML = RP.sessOpts;
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
  if (RP.version === 'data') history.replaceState(null, '', '#reports/data');
  else if (RP.version === 'weekly') history.replaceState(null, '', '#reports/weekly' + (RP.week ? '/' + RP.week : ''));
  else if (s) history.replaceState(null, '', '#reports/' + s.date + (RP.version === 'staff' ? '/staff' : ''));
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
  if (!box) return;
  const data = RP.version === 'data', weekly = RP.version === 'weekly', pick = document.getElementById('rp-pick');
  document.getElementById('rp-step').style.display = data ? 'none' : '';
  document.getElementById('rp-pdf').style.display = data ? 'none' : '';
  document.getElementById('rp-who').hidden = !weekly;
  document.getElementById('rp-pptx').style.display = RP.version === 'players' ? '' : 'none';
  if (data) { if (!box.querySelector('.rp-data')) rpDataDraw(); return; } // (re)drawn once: a late reports load must not reset the form
  if (!RP.data) return;
  if (weekly) { rwDraw(); return; }
  if (pick.dataset.mode !== 'sessions' && RP.sessOpts) { pick.innerHTML = RP.sessOpts; pick.dataset.mode = 'sessions'; }
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
    html = rpPages(D); n = (html.match(/class="rp-page"/g) || []).length;
  }
  document.getElementById('rp-pdf').disabled = false;
  document.getElementById('rp-sub').textContent = `${D.session.id} · ${D.session.dateLabel}${D.session.part ? ' · ' + D.session.part : ''}${RP.version === 'staff' ? ' · Staff' : ''} · ${n} pages · ${D.fullSession.length} players`;
  box.innerHTML = `<div class="rp rp-doc">${html}</div>`;
  rpFit();
  // warm up in the background so "Download PDF" is quick: this session's photos and the PDF tools
  rpPhotos(D);
  Promise.all(RP_JS.map(rpScript)).catch(() => { /* retried on click */ });
}

// ---------------------------------------------------------------- Excel data: the GPS file shared for Power BI
const RP_GPS = { info: null, err: null, busy: false };
const RP_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function rpDataDraw() {
  const box = document.getElementById('rp-preview');
  document.getElementById('rp-sub').textContent = 'GPS data · Data_Full + Data_Drills · the same file feeds the physical coach’s Power BI';
  if (!RP_GPS.info && !RP_GPS.err) {
    box.innerHTML = '<div class="panel"><div class="empty">Loading…</div></div>';
    (AUTH.demo ? Promise.resolve({ url: null, demo: true }) : callApi('gps_rows', null, {}))
      .then((d) => { RP_GPS.info = d || {}; }).catch((e) => { RP_GPS.err = e; })
      .then(() => { if (RP.version === 'data') rpDataDraw(); });
    return;
  }
  if (RP_GPS.err) { box.innerHTML = loadError(RP_GPS.err); return; }
  const g = RP_GPS.info, n = (x) => Number(x || 0).toLocaleString('en-GB');
  const when = g.updated ? new Date(g.updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  box.innerHTML = `<div class="panel rp-data">
    <div class="rp-data-h"><b>GPS data</b><small>The columns of your Data_Full and Data_Drills files, sessions published from the Session Plan included, and the Team sheet (computed as your Team macro), since 1 Jul 2023.</small></div>
    <div class="rp-data-row"><div><b>Google Sheet</b><small>${g.url ? `${n(g.full)} full-session rows · ${n(g.drills)} drill rows${when ? ` · updated ${rpEsc(when)}` : ''}` : g.demo ? 'Not available in the local demo' : 'Created at the next “Update dashboard”'}</small></div>
      ${g.url ? `<a class="btn-light" href="${rpEsc(g.url)}" target="_blank" rel="noopener">Open in Google Sheets ↗</a>` : ''}</div>
    <div class="rp-data-row rp-data-form"><div><b>Download Excel</b><small>Same columns as your files · one sheet per file chosen</small></div>
      <div class="rp-data-grid">
        <span class="rp-data-k">Files</span><div class="rp-data-chips" id="rp-gps-files">${RP_GPS_FILES.map(([k, l]) => `<label><input type="checkbox" value="${k}"${(RP_GPS.files || ['full']).includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>
        <span class="rp-data-k">Player</span><div><select class="select" id="rp-gps-player" aria-label="Player"><option value="">All players</option></select></div>
        <span class="rp-data-k">Period</span><div class="rp-data-dl"><select class="select" id="rp-gps-period" aria-label="Period">
          <option value="session">Last session</option><option value="week">This week</option><option value="4w">Last 4 weeks</option>
          <option value="season" selected>This season</option><option value="custom">Choose the dates…</option><option value="all">Everything since 2023</option></select>
          <span id="rp-gps-dates" hidden><input type="date" id="rp-gps-from" aria-label="From"> → <input type="date" id="rp-gps-to" aria-label="To"></span></div>
        <span></span><div><button type="button" class="btn-primary" id="rp-gps-dl"${g.url ? '' : ' disabled'}>Download</button></div>
      </div></div>
    <p class="rp-data-note" id="rp-gps-msg"></p></div>`;
  const sel = document.getElementById('rp-gps-period');
  sel.onchange = () => { document.getElementById('rp-gps-dates').hidden = sel.value !== 'custom'; };
  document.getElementById('rp-gps-player').onchange = rpGpsFiles;
  document.getElementById('rp-gps-files').onchange = rpGpsFiles;
  document.getElementById('rp-gps-dl').onclick = rpGpsDownload;
  rpGpsPlayers();
}

const RP_GPS_FILES = [['full', 'Full session'], ['drills', 'Drills'], ['team', 'Team']];
/** The players of the season (their name in the Excel files), once the reports are loaded. */
function rpGpsPlayers() {
  const el = document.getElementById('rp-gps-player');
  if (!el || !RP.data || el.options.length > 1) return;
  const roster = RP.data.roster || {}, label = (gps) => { const p = roster[RP.data.pid[gps]]; return p && p.name.toUpperCase() !== gps ? `${p.name} (${gps})` : gps; };
  Object.keys(RP.data.pid || {}).map((gps) => [gps, label(gps)]).sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([gps, l]) => el.add(new Option(l, gps)));
}
/** Team rows are the team's average: not offered for one player. */
function rpGpsFiles() {
  const one = !!document.getElementById('rp-gps-player').value, team = document.querySelector('#rp-gps-files input[value="team"]');
  if (one) team.checked = false;
  team.disabled = one;
  team.parentElement.title = one ? 'The Team sheet is the team average, not one player' : '';
  RP_GPS.files = [...document.querySelectorAll('#rp-gps-files input:checked')].map((i) => i.value);
}

/** [from, to] of the chosen period ('yyyy-mm-dd'). */
function rpGpsPeriod(kind) {
  const today = todayIso(), list = (RP.data && RP.data.sessions || []).filter((s) => !s.hidden);
  if (kind === 'session') { const d = list.length ? list[list.length - 1].date : today; return [d, d]; }
  if (kind === 'week') return [addDays(today, -new Date(today + 'T12:00:00Z').getUTCDay()), today];
  if (kind === '4w') return [addDays(today, -27), today];
  if (kind === 'custom') return [document.getElementById('rp-gps-from').value, document.getElementById('rp-gps-to').value || today];
  return [list.length ? list[0].date : addDays(today, -120), today];
}

async function rpGpsDownload() {
  const kind = document.getElementById('rp-gps-period').value, msg = document.getElementById('rp-gps-msg'), btn = document.getElementById('rp-gps-dl');
  const player = document.getElementById('rp-gps-player').value;
  const tables = [...document.querySelectorAll('#rp-gps-files input:checked')].map((i) => i.value);
  if (!tables.length) { msg.textContent = 'Tick at least one file.'; return; }
  // the whole file, as it is in Google Sheets (all players, all three sheets): Google's own Excel export, quicker
  if (kind === 'all' && !player && tables.length === RP_GPS_FILES.length) { window.open(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(RP_GPS.info.id)}/export?format=xlsx`, '_blank', 'noopener'); return; }
  const [from, to] = kind === 'all' ? ['2023-07-01', todayIso()] : rpGpsPeriod(kind);
  if (!from || from > to) { msg.textContent = 'Choose a start date before the end date.'; return; }
  btn.disabled = true; msg.textContent = 'Preparing the file…';
  try {
    const [d] = await Promise.all([callApi('gps_rows', null, { from, to, tables, player }), rpScript(RP_XLSX)]);
    if (d.too_many) { msg.textContent = 'Too many rows for one file: choose a shorter period, one player, or fewer files.'; return; }
    const got = tables.filter((t) => (d['rows_' + t] || []).length);
    if (!got.length) { msg.textContent = player ? 'No GPS data for this player in this period.' : 'No GPS data in this period.'; return; }
    const sheet = (cols, rows) => window.XLSX.utils.aoa_to_sheet([cols, ...rows.map((r) => r.map((v, j) => (j === 0 && v ? new Date(v + 'T00:00:00') : v)))], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    const names = { full: 'Data_Full', drills: 'Data_Drills', team: 'Team' }, short = { full: 'Full', drills: 'Drills', team: 'Team' };
    const wb = window.XLSX.utils.book_new();
    tables.forEach((t) => window.XLSX.utils.book_append_sheet(wb, sheet(d['cols_' + t] || [], d['rows_' + t] || []), names[t]));
    const who = player ? '_' + player.replace(/[^A-Za-z0-9]+/g, '-') : '';
    window.XLSX.writeFile(wb, `GPS_${tables.map((t) => short[t]).join('-')}${who}_${from === to ? from : `${from}_to_${to}`}.xlsx`);
    msg.textContent = tables.map((t) => `${(d['rows_' + t] || []).length} ${short[t].toLowerCase()} rows`).join(' · ') + ' downloaded.';
  } catch (e) {
    msg.textContent = 'Not downloaded — ' + (e.message || e);
  } finally { btn.disabled = false; }
}

/** The pages keep their exact print size (1290 px); the preview is zoomed to the available width. */
function rpFit() {
  const box = document.getElementById('rp-preview'), doc = box && box.querySelector('.rp-doc'), wdoc = box && box.querySelector('.rw-doc');
  if (doc) doc.style.zoom = Math.min(1, box.clientWidth / RP_W);
  if (wdoc) wdoc.style.zoom = Math.min(1, box.clientWidth / RW_W);
}

// ---------------------------------------------------------------- Weekly: the weekly player report (js/reports-weekly.js)
function rwPhoto(pid) { const u = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[pid]; return u && u.startsWith('data:') ? u : ''; }
function rwDraw() {
  const box = document.getElementById('rp-preview'), W = RP.data.weekly, pick = document.getElementById('rp-pick'), who = document.getElementById('rp-who');
  const weeks = rwWeeks(W);
  if (!weeks.length) {
    box.innerHTML = `<div class="panel rp-msg">${emptyState('The weekly reports come with the next update of the data.')}</div>`;
    document.getElementById('rp-pdf').disabled = true;
    return;
  }
  if (!RP.week || !weeks.some((w) => w.ws === RP.week)) RP.week = (weeks.find((w) => w.done) || weeks[0]).ws; // the last complete week
  pick.innerHTML = weeks.map((w) => `<option value="${w.ws}">${rpEsc(w.label || w.ws)} · ${rwRange(w.ws, w.we)}${w.done ? '' : ' · in progress'}</option>`).join('');
  pick.dataset.mode = 'weeks';
  pick.value = RP.week;
  const k = weeks.findIndex((w) => w.ws === RP.week), wk = weeks[k];
  document.getElementById('rp-prev').disabled = k >= weeks.length - 1;
  document.getElementById('rp-next').disabled = k <= 0;
  const players = rwPlayersOf(W, RP.week);
  if (RP.who && !players.some((p) => p.pid === RP.who)) RP.who = '';
  who.innerHTML = `<option value="">All players (${players.length})</option>` + players.map((p) => `<option value="${p.pid}">${rpEsc(p.name)}</option>`).join('');
  who.value = RP.who;
  const pids = RP.who ? [RP.who] : players.map((p) => p.pid);
  document.getElementById('rp-pdf').disabled = !pids.length;
  document.getElementById('rp-sub').textContent = `Weekly report · ${wk.label} · ${rwRange(wk.ws, wk.we)} · ${RP.who ? W.players[RP.who].name : `${players.length} players`}${wk.done ? '' : ' · week in progress'}`;
  box.innerHTML = pids.length ? `<div class="rw-doc">${pids.map((pid) => `<div class="rw-page">${rwPage(W, pid, RP.week, rwPhoto(pid))}</div>`).join('')}</div>`
    : `<div class="panel rp-msg">${emptyState('No player with data this week.')}</div>`;
  rpFit();
  if (!RW_PHOTOS_ASKED && typeof loadPlayerPhotos === 'function') { // the photos arrive after the first drawing
    RW_PHOTOS_ASKED = true;
    loadPlayerPhotos().then(() => { if (RP.version === 'weekly') rwDraw(); }).catch(() => {});
  }
  Promise.all(RP_JS.map(rpScript)).catch(() => { /* retried on click */ });
}
let RW_PHOTOS_ASKED = false;
/** One PDF: the selected player, or every player of the week (one page each) — printed online for a complete week,
 * otherwise made here, page by page, at the report's own size. */
async function rwPrint() {
  if (!RP.data || RP.busy) return;
  const W = RP.data.weekly, ws = RP.week, btn = document.getElementById('rp-pdf'), label = btn.textContent;
  const pids = RP.who ? [RP.who] : rwPlayersOf(W, ws).map((p) => p.pid), file = rwFile(W, ws, RP.who || null);
  RP.busy = true; btn.disabled = true; btn.textContent = 'Preparing PDF…';
  let host = null;
  try {
    if (await rpReadyPdf(file)) return;
    await Promise.all(RP_JS.map(rpScript));
    if (typeof loadPlayerPhotos === 'function') await loadPlayerPhotos().catch(() => {});
    host = document.createElement('div');
    host.className = 'rw-render';
    host.innerHTML = pids.map((pid) => `<div class="rw-page">${rwPage(W, pid, ws, rwPhoto(pid))}</div>`).join('');
    document.body.appendChild(host);
    await Promise.all([...host.querySelectorAll('img')].map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })));
    if (document.fonts) await document.fonts.ready;
    let pdf = null;
    const pages = [...host.querySelectorAll('.rw-page')];
    for (let i = 0; i < pages.length; i++) {
      btn.textContent = `Preparing PDF… ${i + 1}/${pages.length}`;
      const el = pages[i], w = el.offsetWidth * 0.75, h = el.offsetHeight * 0.75;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#e9ecf4', useCORS: true, logging: false, ignoreElements: (x) => x.parentElement === document.body && x !== host });
      if (!pdf) pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: [w, h], compress: true });
      else pdf.addPage([w, h], 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST');
    }
    if (pdf) pdf.save(file);
  } catch (err) {
    alert('Could not create the PDF: ' + (err.message || err));
  } finally {
    if (host) host.remove();
    RP.busy = false; btn.disabled = false; btn.textContent = label;
  }
}
/** The players' report as a PowerPoint (one page per slide, 16:9) for the gym screen — made online with the PDF. */
async function rpPptx() {
  if (!RP.data || RP.busy) return;
  const D = rpDoc(RP.data, RP.idx, RP.part), btn = document.getElementById('rp-pptx'), label = btn.textContent;
  const file = `${D.session.id}_${D.session.date}_Training_slides.pptx`;
  btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    if (D.session.part || !(await rpReadyPdf(file))) {
      alert('The PowerPoint is made online with the PDF reports of the last 10 days: it is ready a few minutes after the session is published.');
    }
  } finally { btn.disabled = false; btn.textContent = label; }
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
/** The PDF prepared by Update dashboard on the Cloudflare server (sharp text, instant), when there is one. */
async function rpReadyPdf(file) {
  if (typeof cfOn !== 'function' || !cfOn()) return false;
  try {
    const r = await fetch('/api/pdf/' + encodeURIComponent(file), { headers: cfHeaders() });
    if (!r.ok) return false;
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) { return false; }
}
async function rpPrint() {
  if (!RP.data || RP.busy) return;
  const btn = document.getElementById('rp-pdf'), label = btn.textContent;
  const W = RP_W * 0.75, H = 790 * 0.75; // pt
  RP.busy = true; btn.disabled = true; btn.textContent = 'Preparing PDF…';
  let host = null;
  try {
    const D = rpDoc(RP.data, RP.idx, RP.part);
    const file = `${D.session.id}_${D.session.date}${D.session.part ? '_' + D.session.part.replace(/\s+/g, '') : ''}_${RP.version === 'staff' ? 'Staff' : 'Training'}_report.pdf`;
    if (!D.session.part && await rpReadyPdf(file)) return; // ready on the server: no picture of each page to take
    await Promise.all(RP_JS.map(rpScript));
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
    pdf.save(file);
  } catch (err) {
    alert('Could not create the PDF: ' + (err.message || err));
  } finally {
    if (host) host.remove();
    RP.busy = false; btn.disabled = false; btn.textContent = label;
  }
}
