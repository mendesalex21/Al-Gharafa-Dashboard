/**
 * Reports — staff version of the training report (mockup "staff3", chosen by the staff on 2026-10-02).
 * Pages: full table + team strip · TD & >20 km/h · Acc+Dec & sprints (bar colour = the player's z vs his usual MD of the
 * same microcycle type; grey = individual / rehab session, not compared) · A:C 7:28 and 14:35 · drills summary ·
 * team microcycle with the objectives until the match · players microcycle & week so far.
 * Data: the `staff_report` payload (sync/build.py → build_staff_report), one block per training day.
 */
const STZ = { below: '#2a78d6', on: '#34c759', above: '#ff9f0a', high: '#e5484d' };
const stLvl = (z) => z == null ? null : z <= -1 ? 'below' : z < 1 ? 'on' : z < 2 ? 'above' : 'high';
const stZCol = (z) => STZ[stLvl(z)] || '#c4c7cf';
const stAcCol = (v) => v == null ? '#c4c7cf' : v > 1.5 ? '#e5484d' : v > 1.37 ? '#d4a800' : v >= 0.78 ? '#34c759' : v >= 0.5 ? '#3d95f0' : '#9fc9f5'; // Power BI colours
const stMz = (z) => z == null ? 'na' : z <= -2 ? 'vlow' : z <= -1 ? 'low' : z < 1 ? 'ok' : z < 2 ? 'up' : 'vup'; // site chips (5 levels)
const ST_DOT = { vlow: '#1d5fae', low: '#5b9bd5', ok: '#34c759', up: '#ff9f0a', vup: '#e5484d' };
const stK = (v) => v == null ? '–' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
const stSigned = (z) => z == null ? '–' : (z > 0 ? '+' : '') + z.toFixed(1);
const stChip = (z) => `<span class="mz ${stMz(z)}">${z == null ? '—' : stSigned(z)}</span>`;
const stDay = (iso, o) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const ST_CHART = { td: 'td', d20: 'hit', accdec: 'acc_dec', sprints: 'spr_n' }; // report column → staff metric
const ST_LEG5 = `<span class="rs-leg">${[['vlow', 'well below (z ≤ −2)'], ['low', 'below'], ['ok', 'usual'], ['up', 'slightly above'], ['vup', 'well above (z ≥ 2)']].map(([c, l]) => `<span><i class="mz ${c}"></i>${l}</span>`).join('')}</span>`;

/** The day's staff block for this report, with lookups by report name (null: no staff version for this session). */
function rpStaffCtx(D, S) {
  const X = S && S.days && S.days[D.session.date];
  if (!X) return null;
  const px = (name) => X.players[D.pids[name]] || null;
  const ki = (k) => S.keys.indexOf(k), wi = (k) => S.week_keys.indexOf(k);
  return { X, px, z: (name, k) => { const p = px(name); return p ? p.z[ki(k)] : null; },
    ac: (name, k) => { const p = px(name); return p ? p.ac[ki(k)] : null; },
    mc: (name, k) => { const p = px(name); return p ? p.mc[ki(k)] : null; },
    wk: (name, k) => { const p = px(name); return p ? p.wk[wi(k)] : null; },
    wv: (name, k) => { const p = px(name); return p && p.wv ? p.wv[wi(k)] : null; } };
}

// ---------------------------------------------------------------- page 1: team strip above the table
function rsTeamStrip(C, md) {
  const r = C.X.team, comp = C.X.group === 'compensatory'; // compensatory session: vs the past compensatory sessions
  if (!r) return '';
  return `<div class="rs-strip">${[['td', 'Total distance', 'm'], ['hit', 'HIT > 20', 'm'], ['acc_dec', 'High Acc+Dec', ''], ['srpe', 'sRPE', 'AU'], ['mpm', 'm/min', '']].map(([k, l, u]) => {
    const x = r[k];
    return x ? `<div class="rs-kpi"><span>${l} · ${comp ? 'comp.' : 'team'}</span><b>${stK(x.v)}<small> ${u}</small></b><em style="color:${stZCol(x.z)}">● z ${stSigned(x.z)} vs usual ${comp ? 'comp.' : rpEsc(md)}</em></div>` : '';
  }).join('')}<div class="rs-kpi rs-note"><span>${comp ? 'Usual compensatory' : 'Usual ' + rpEsc(md)}</span><b>${r.n || '—'}<small> sessions</small></b><em>${comp ? 'players who did not play' : rpEsc(C.X.cycle || '') + ' microcycle'}</em></div></div>`;
}

// ---------------------------------------------------------------- pages 2–3: bar colour = his z vs his usual MD, z printed when not green
function rsChart(D, C, key, title, legend) {
  const rows = [...D.fullSession].sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.name.localeCompare(b.name));
  const m = Math.max(1, ...rows.map((r) => r[key] || 0)), team = rows.some((r) => r.pro !== 0) ? rows.filter((r) => r.pro !== 0) : rows;
  const avg = team.reduce((t, r) => t + (r[key] || 0), 0) / Math.max(1, team.length); // individual / rehab left out
  const h = (v) => (Math.max(0, v || 0) / m * 80).toFixed(1) + '%';
  const gm = Object.entries(D.gameAvg[key] || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lg = legend ? Object.entries({ below: 'Below usual', on: 'Usual', above: 'Above', high: 'Well above' }).map(([k, l]) => `<span><b style="width:10px;height:10px;border-radius:2px;background:${STZ[k]}"></b>${l}</span>`).join('')
    + '<span><b style="width:10px;height:10px;border-radius:2px;background:#d5d8e0"></b>Indiv. / rehab</span>' : '';
  return `<div class="rp-blk"><div class="rp-ch">
    <div class="rp-top"><span class="rp-ti">${rpEsc(title)}</span><span class="rp-lg">${lg}<span><b style="width:14px;border-top:2px dashed #16269e"></b>Team avg ${key === 'td' ? Math.round(avg).toLocaleString('en-US') : avg.toFixed(1)}</span></span></div>
    <div class="rp-plot">${rows.map((r) => {
      const pro = r.pro !== 0, z = pro ? C.z(r.name, ST_CHART[key]) : null, lv = stLvl(z); // individual / rehab day: not compared with his MD
      return `<div class="rp-col">${r[key] ? rpFmt(key, r[key]) : ''}${lv && lv !== 'on' ? `<small class="rs-z" style="color:${stZCol(z)}">${stSigned(z)}</small>` : ''}<i style="height:${h(r[key])};background:${pro ? stZCol(z) : '#d5d8e0'}"></i></div>`;
    }).join('')}
      <div class="rp-avg" style="bottom:${h(avg)}"></div></div>
    <div class="rp-names">${rows.map((r) => `<div><span>${rpEsc(r.name)}</span></div>`).join('')}</div>
  </div>${rpGmList(gm)}</div>`;
}

// ---------------------------------------------------------------- page 4: A:C 7:28 = bar · previous week (14:35) = thin dash · 2W = both weeks out of the zone
function rsAcLegend() {
  return `<div class="rs-acleg"><span><i class="rs-sw" style="background:#34c759"></i>7:28 this week</span><span><i class="rs-dash"></i>previous week (14:35)</span><span><b class="rs-2w over">2W</b> both weeks above 1.5</span><span><b class="rs-2w under">2W</b> both weeks below 0.78</span>${[['#9fc9f5', '< 0.5'], ['#3d95f0', '0.5–0.78'], ['#34c759', '0.78–1.37'], ['#d4a800', '1.37–1.5'], ['#e5484d', '> 1.5']].map(([c, l]) => `<span><i class="rs-sw" style="background:${c}"></i>${l}</span>`).join('')}<span class="rs-lz">bars capped at 2.5 (▲ = higher)</span></div>`;
}
function rsAcPanel(D, C, key, title) {
  const rows = D.fullSession.map((r) => ({ name: r.name, v: C.ac(r.name, key) })).filter((x) => x.v && x.v[0] != null).sort((a, b) => b.v[0] - a.v[0]);
  const MAX = 2.5, y = (v) => (Math.min(Math.max(v, 0), MAX) / MAX * 100).toFixed(1) + '%';
  const lines = [[0.78, 'lo'], [1.37, 'hi'], [1.5, 'red']].map(([v, c]) => `<i class="rs-hl ${c}" style="bottom:${y(v)}"><b>${v.toFixed(2)}</b></i>`).join('');
  return `<div class="rs-panel"><div class="rs-pt">${title}</div>
    <div class="rs-acplot">${lines}${rows.map((r) => {
      const [a, b] = r.v, two = b != null && (a > 1.5 && b > 1.5 ? 'over' : a < 0.78 && b < 0.78 ? 'under' : ''); // overload 2W: above 1.5 both weeks (the user's rule)
      return `<div class="rs-col"><i class="rs-acbar" style="height:${y(a)};background:${stAcCol(a)}"><em>${two ? `<b class="rs-2w ${two}">2W</b>` : ''}${a > MAX ? '▲' : ''}${a.toFixed(2)}</em></i>${b != null ? `<u class="rs-dash" style="bottom:${y(b)}"></u>` : ''}</div>`;
    }).join('')}${rows.length ? '' : '<span class="rp-empty">No A:C yet (4 weeks of data needed)</span>'}</div>
    <div class="rs-names">${rows.map((r) => `<div><span>${rpEsc(r.name)}</span></div>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------- page 6: team, microcycle so far — dot = this week, grey bar = usual range of that MD
/** The microcycle bar's geometry, shared by the Sessions page (training.js wkBar) and this report: the days done (their
 * value), then the days left (their usual), then the gap to the target. Each day keeps at least `min` px so its MD stays
 * readable however small next to the others (his request, 2026-10-07: "je ne vois pas le MD-2 quand le MD-3 prend trop
 * de place"); xOf(cumulative value) puts the target and what goes over it through the same widths. */
function stMicroGeo(X, k, W, min = 26) {
  const [target = 0, done = 0, udone = 0] = (X.tot || {})[k] || [];
  const segs = [...X.profile.filter((d) => d[k]).map((d) => ({ md: d.md, v: Math.max(0, d[k][0] || 0), done: true })),
    ...(X.plan || []).filter((d) => d[k]).map((d) => ({ md: d.md, v: Math.max(0, d[k][1] || 0), o: Math.max(0, Math.min(d[k][0] || 0, d[k][1] || 0)) }))];
  const sum = segs.reduce((a, s) => a + s.v, 0), proj = sum, total = Math.max(target, sum, done) * 1.02 || 1;
  if (total > sum) segs.push({ gap: true, v: total - sum });
  const nDays = segs.filter((s) => !s.gap).length, m = Math.min(min, (W * 0.8) / Math.max(1, nDays));
  let free = W, freeV = total;
  for (let i = 0; i <= nDays; i++) {
    const kw = freeV > 0 ? free / freeV : 0;
    let changed = false;
    segs.forEach((s) => { if (!s.gap && !s.fixed && s.v * kw < m) { s.fixed = true; free -= m; freeV -= s.v; changed = true; } });
    if (!changed) break;
  }
  const kw = freeV > 0 ? Math.max(0, free) / freeV : 0;
  let x = 0, c = 0;
  segs.forEach((s) => { s.w = s.fixed ? m : s.v * kw; s.x = x; s.c = c; x += s.w; c += s.v; });
  const xOf = (v) => { for (const s of segs) if (v <= s.c + s.v) return s.x + (s.v > 0 ? (v - s.c) / s.v : 0) * s.w; return x; };
  return { segs, target, done, udone, proj, xOf };
}
const ST_BLUE = '#2a78d6';
const RS_WEEK = [['td', 'TOTAL DISTANCE', 'm'], ['d15', 'DISTANCE > 15 km/h', 'm'], ['hit', 'DISTANCE > 20 km/h', 'm'], ['spr', 'DISTANCE > 25 km/h', 'm'],
  ['spr_n', 'SPRINTS', ''], ['acc_dec', 'HIGH ACC + DEC', ''], ['srpe', 'SESSION × RPE', 'AU'], ['mpm', 'INTENSITY', 'm/min'], ['minutes', 'DURATION', 'min']];
/** The whole microcycle of one metric, above its chart — the Sessions page's bar: done (green), each day left at its usual
 * (dotted) with its objective inside, the target (black), over it in red (done) or hatched (if the days left are as usual). */
function rsMicroBar(C, k) {
  const t = (C.X.tot || {})[k];
  if (!t) return k === 'mpm' ? '<div class="rs-mbar rs-mnote">An intensity has no week total: each day left keeps its usual m/min.</div>' : '';
  const W = 360, H = 16, G = stMicroGeo(C.X, k, W), { target, done, udone, proj, xOf } = G, anyDone = G.segs.some((s) => s.done);
  let rects = `<rect x="0" y="1" width="${W}" height="${H - 2}" rx="5" fill="#f4f5f8"/>`, over = '', labs = '';
  G.segs.forEach((s) => {
    if (s.gap) return;
    const lab = (col) => (s.w > 17 ? `<text x="${s.x + s.w / 2}" y="${H - 4.5}" text-anchor="middle" font-size="8.5" font-weight="800" fill="${col}">${rpEsc(s.md)}</text>` : '');
    if (s.done) { rects += `<rect x="${s.x}" y="1" width="${s.w}" height="${H - 2}" fill="#34c759"/><line x1="${s.x + s.w}" x2="${s.x + s.w}" y1="1" y2="${H - 1}" stroke="#fff" stroke-width="1.5"/>`; labs += lab('#fff'); return; }
    rects += `<rect x="${s.x + 0.75}" y="1.75" width="${Math.max(0, s.w - 1.5)}" height="${H - 3.5}" rx="2" fill="none" stroke="${ST_BLUE}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
    if (s.o > 0 && s.v > 0) rects += `<rect x="${s.x + 1.5}" y="2.5" width="${Math.max(0, s.w * s.o / s.v - 3)}" height="${H - 5}" rx="1.5" fill="rgba(42,120,214,.28)"/>`;
    labs += lab('#1d5fae');
  });
  if (target && done > target) over += `<rect x="${xOf(target)}" y="1" width="${xOf(done) - xOf(target)}" height="${H - 2}" fill="#e5484d"/>`;
  else if (target && proj > target * 1.02) over += `<rect x="${xOf(target)}" y="1" width="${xOf(proj) - xOf(target)}" height="${H - 2}" fill="url(#rs-hatch)"/>`;
  if (anyDone && udone) over += `<line x1="${xOf(udone)}" x2="${xOf(udone)}" y1="0" y2="${H}" stroke="#8a8f9e" stroke-width="1.6" stroke-dasharray="2 1.5"/>`;
  if (target) over += `<line x1="${xOf(target)}" x2="${xOf(target)}" y1="0" y2="${H}" stroke="#111" stroke-width="2.5"/>`;
  const defs = '<defs><pattern id="rs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="rgba(229,72,77,.08)"/><line x1="0" y1="0" x2="0" y2="5" stroke="rgba(229,72,77,.65)" stroke-width="1.6"/></pattern></defs>';
  const vs = anyDone && udone ? Math.round((done / udone - 1) * 100) : null, col = vs == null ? '' : Math.abs(vs) < 10 ? '#1f7a37' : Math.abs(vs) < 25 ? '#c27c0e' : '#d64545';
  const pc = (v) => Math.round((v / target - 1) * 100);
  const warn = !target ? '' : done > target ? ` · <b class="rs-over">target passed: +${stK(done - target)} (+${pc(done)} %)</b>`
    : proj > target * 1.02 ? ` · <b class="rs-over">if as usual: +${stK(proj - target)} (+${pc(proj)} %)</b>` : '';
  return `<div class="rs-mbar"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${defs}${rects}${over}${labs}</svg><span>done <b>${stK(done)}</b>${vs != null ? ` <b style="color:${col}">${vs > 0 ? '+' : vs < 0 ? '−' : ''}${Math.abs(vs)} %</b> vs usual` : ''} · to do <b>${stK(Math.max(0, target - done))}</b> · target <b>${stK(target)}</b>${warn}</span></div>`;
}
/** One metric day by day — the Sessions page's chart: every day has a dotted slot up to its usual (grey: done, blue:
 * left); done = solid bar inside (colour = z vs usual), day left = its objective filled inside (red number when cut below
 * its usual); black line = usual, grey band = usual range (p25–p75), then the match. */
function rsProfile(C, k, title, unit) {
  const days = [...C.X.profile.map((d) => ({ ...d, done: 1 })), ...(C.X.plan || [])], W = 380, H = 134, L = 34, R = 6, T = 16, B = 32;
  const n = days.length + 1, iw = W - L - R, ih = H - T - B, step = iw / n, bw = Math.min(36, step * 0.5);
  const mt = C.X.match && C.X.match[k]; // the match itself, once played (the report of a match day's extra session)
  const raw = Math.max(1, ...days.flatMap((d) => (d[k] ? [d[k][0] || 0, d[k][1] || 0, d[k][3] || 0] : [0])), ...(mt ? [mt[0] || 0, mt[3] || 0] : [])) * 1.14;
  const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e, top = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  const y = (v) => T + ih * (1 - Math.min(v, top) / top), base = y(0);
  let g = '';
  [0, top / 2, top].forEach((t) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#eceef3"/><text x="${L - 5}" y="${y(t) + 3.5}" text-anchor="end" font-size="9" fill="#9aa0ad">${stK(t)}</text>`; });
  days.forEach((d, i) => {
    const x = L + step * (i + 0.5), bx = x - bw / 2, p = d[k], lab = [];
    if (p) {
      const u = p[1] || 0, txt = (yy, v, col) => `<text x="${x}" y="${Math.max(11, yy - 5)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${stK(v)}</text>`;
      if (p[2] != null && p[3] != null) g += `<rect x="${bx - 6}" y="${y(p[3])}" width="${bw + 12}" height="${Math.max(3, y(p[2]) - y(p[3]))}" rx="5" fill="#eef0f4"/>`;
      if (u > 0) g += `<rect x="${bx + 0.75}" y="${y(u)}" width="${bw - 1.5}" height="${Math.max(1, base - y(u))}" rx="4" fill="none" stroke="${d.done ? '#8a8f9e' : ST_BLUE}" stroke-width="1.3" stroke-dasharray="3.5 2.5"/>`;
      if (d.done && p[0] != null) {
        const yy = Math.min(y(p[0]), base - 2.5), col = stZCol(p[4]);
        g += `<rect x="${bx + 2.5}" y="${yy}" width="${bw - 5}" height="${base - yy}" rx="4" fill="${col}"/>`;
        lab.push(txt(Math.min(yy, y(u)), p[0], '#111'));
        if (p[4] != null && stLvl(p[4]) !== 'on') lab.push(`<text x="${x + bw / 2 + 4}" y="${yy + 11}" font-size="9" font-weight="800" fill="${col}">${stSigned(p[4])}</text>`);
      } else if (!d.done && (p[0] != null || u)) {
        const o = Math.min(p[0] || 0, u || p[0] || 0);
        if (o > 0) g += `<rect x="${bx + 2.5}" y="${y(o)}" width="${bw - 5}" height="${Math.max(1, base - y(o))}" rx="4" fill="rgba(42,120,214,.28)"/>`;
        lab.push(txt(Math.min(y(u), y(o)), p[0] || 0, u && (p[0] || 0) < u * 0.98 ? '#c4373c' : '#1d5fae'));
      }
      if (p[1] != null) g += `<line x1="${bx - 6}" x2="${bx + bw + 6}" y1="${y(p[1])}" y2="${y(p[1])}" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    g += lab.join('') + `<text x="${x}" y="${H - 17}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${d.done ? '#16269e' : ST_BLUE}">${rpEsc(d.md)}</text><text x="${x}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#8a8f9e">${stDay(d.date, { weekday: 'short', day: 'numeric' })}</text>`;
  });
  const xm = L + step * (n - 0.5);
  if (mt && mt[0] != null) { // the team's match (whole-game players): its value, in the colour of its z vs the usual match
    const yy = Math.min(y(mt[0]), base - 2.5), col = stZCol(mt[4]);
    if (mt[2] != null && mt[3] != null) g += `<rect x="${xm - bw / 2 - 6}" y="${y(mt[3])}" width="${bw + 12}" height="${Math.max(3, y(mt[2]) - y(mt[3]))}" rx="5" fill="#eef0f4"/>`;
    g += `<rect x="${xm - bw / 2 + 2.5}" y="${yy}" width="${bw - 5}" height="${base - yy}" rx="4" fill="${col}"/>`
      + (mt[1] != null ? `<line x1="${xm - bw / 2 - 6}" x2="${xm + bw / 2 + 6}" y1="${y(mt[1])}" y2="${y(mt[1])}" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>` : '')
      + `<text x="${xm}" y="${Math.max(11, Math.min(yy, mt[1] != null ? y(mt[1]) : yy) - 5)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${stK(mt[0])}</text>`
      + (mt[4] != null && stLvl(mt[4]) !== 'on' ? `<text x="${xm + bw / 2 + 4}" y="${yy + 11}" font-size="9" font-weight="800" fill="${col}">${stSigned(mt[4])}</text>` : '');
  } else g += `<rect x="${xm - bw / 2}" y="${T}" width="${bw}" height="${ih}" rx="7" fill="none" stroke="#c9ccd6" stroke-dasharray="4 4"/><text x="${xm}" y="${T + ih / 2}" text-anchor="middle" font-size="10" font-weight="700" fill="#8a8f9e">match</text>`;
  g += `<text x="${xm}" y="${H - 17}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#16269e">MD</text>${C.X.next ? `<text x="${xm}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#8a8f9e">${stDay(C.X.next.date, { weekday: 'short', day: 'numeric' })}</text>` : ''}`;
  return `<div class="rs-prof"><div class="rs-proft">${title}<span>${unit}</span></div>${rsMicroBar(C, k)}<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg></div>`;
}
function rsMicro(C) {
  const ac = C.X.team_ac || {}, all = [...C.X.profile, ...(C.X.plan || [])], mets = RS_WEEK.filter(([k]) => all.some((d) => d[k]));
  const body = C.X.profile.length || (C.X.plan || []).length
    ? `<div class="rs-profs rs-obj">${mets.map(([k, t, u]) => rsProfile(C, k, t, u)).join('')}</div>`
    : '<div class="rs-profs"><span class="rp-empty">No usual reference for these days yet</span></div>';
  const lg = '<span class="rs-olg"><i style="background:#34c759"></i>done</span><span class="rs-olg"><i class="dl"></i>usual (dotted)</span><span class="rs-olg"><i class="ob"></i>objective</span><span class="rs-olg"><i style="height:3px;background:#111"></i>usual · <i style="background:#eef0f4"></i>range</span><span class="rs-olg"><i style="background:#e5484d"></i>over the target</span><span class="rs-olg"><i class="hz"></i>over if as usual</span>';
  return `${body}
    <div class="rs-acrow rs-foot"><span class="rs-legs">${lg}</span><span class="rs-acl">Team A:C 7:28 today</span>${[['td', 'Total distance'], ['hit', 'HIT > 20'], ['acc_dec', 'Acc + Dec'], ['srpe', 'sRPE']].map(([k, l]) => `<div class="rs-act"><i style="background:${stAcCol(ac[k])}"></i>${l}<b>${ac[k] != null ? ac[k].toFixed(2) : '–'}</b></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- last page: today vs his usual MD + his microcycle so far
/** As the site's Training › Sessions table (his ask, 2026-10-12): each player's z today on the seven metrics, then his
 * microcycle since the last match on four of them — the bar cut in one piece per MD, each piece in the colour of its
 * own day, a black tick at his usual for those days, and the z of his total. */
const RS_MDZ = [['td', 'TD'], ['d15', '>15'], ['hit', '>20'], ['spr', '>25'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc+Dec'], ['srpe', 'sRPE']];
const RS_MC = [['td', 'TOTAL DISTANCE'], ['hit', 'DISTANCE > 20 km/h'], ['acc_dec', 'ACC + DEC'], ['spr_n', 'SPRINTS']];
function rsMcBar(parts, z, k) {
  const live = (parts || []).filter((d) => d), done = live.reduce((a, d) => a + (d[0] || 0), 0), exp = live.reduce((a, d) => a + (d[1] || 0), 0);
  if (!live.length) return '<div class="mcb"><b>–</b><div class="mcb-bar"></div><span class="mz na">—</span></div>';
  const scale = Math.max(done, exp, 1) * 1.15, shown = live.filter((d) => d[0] > 0);
  let x = 0;
  const segs = shown.map((d) => { const left = x; x += d[0];
    return `<i class="${d === shown[shown.length - 1] ? 'last' : ''}" style="left:${(left / scale * 100).toFixed(2)}%;width:${(d[0] / scale * 100).toFixed(2)}%;background:${ST_DOT[stMz(d[2])] || '#aeaeb2'}"></i>`; }).join('');
  return `<div class="mcb"><b>${k === 'td' ? stK(done) : Math.round(done).toLocaleString('en-US')}</b><div class="mcb-bar">${segs}${exp > 0 ? `<em style="left:${(exp / scale * 100).toFixed(2)}%"></em>` : ''}</div>${stChip(z)}</div>`;
}
function rsToday(D, C, s, S) {
  const mk = S.md_keys || [], tpl = '150px repeat(7, 46px) 50px 6px repeat(4, minmax(0, 1fr))', md = (C.X.micro && C.X.micro.md) || [];
  const rowH = rpRowH(D, D.fullSession, RP_TABLE_H - 41, 25), ki = (k) => S.keys.indexOf(k);
  let html = `<div class="rs-tbl rs-day${rowH < 21 ? ' rp-tight' : ''}"><div class="rs-tr rs-gh" style="grid-template-columns:${tpl}"><span></span><span style="grid-column:span 8">TODAY · VS HIS USUAL ${rpEsc(s.md || '')}</span><span></span>
      <span style="grid-column:span 4">MICROCYCLE SO FAR · ${md.map(rpEsc).join(' · ')}</span></div>
    <div class="rs-tr rs-th" style="grid-template-columns:${tpl}"><span>Players</span>${RS_MDZ.map(([, l]) => `<span>${l}</span>`).join('')}<span>Reference</span><span></span>${RS_MC.map(([, l]) => `<span class="l">${l}</span>`).join('')}</div>`;
  for (const p of D.positions.order) {
    const g = D.fullSession.filter((r) => D.players[r.name] === p).sort((a, b) => a.name.localeCompare(b.name));
    if (!g.length) continue;
    html += `<div class="rp-grp">${p}<small>${rpEsc(D.positions.labels[p])}</small></div>`;
    html += g.map((r) => {
      const x = C.px(r.name) || {}, z = x.mdz || [], src = x.src;
      return `<div class="rs-tr rs-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>${RS_MDZ.map(([k]) => `<span>${stChip(z[mk.indexOf(k)])}</span>`).join('')}
        <span class="rs-src">${!src || !src[0] ? '–' : src[0] === 'own' ? `his ${src[1]}` : 'squad'}${x.comp ? ' comp.' : ''}</span><span></span>${RS_MC.map(([k]) => `<span>${rsMcBar((x.parts || [])[ki(k)], (x.mc || [])[ki(k)], k)}</span>`).join('')}</div>`;
    }).join('');
  }
  return html + `</div><div class="rp-legend">${ST_LEG5}<span>Today: z vs his own sessions of that MD (the squad's when he has fewer than 5)</span>
    <span><span class="mcb-key"><i></i><i></i></span>microcycle: one piece of the bar per day since the last match, in the colour of that day · <em class="mcb-tick"></em>his usual for those days · the number = the z of his total</span></div>`;
}

/** The staff report pages (same 1290 × 790 pages and PDF as the players' report). */
function rpStaffPages(D, S) {
  const C = rpStaffCtx(D, S);
  if (!C) return '';
  const s = D.session, X = C.X;
  D.fullSession.forEach((r) => { const p = C.px(r.name); r.rpe = p ? p.rpe : null; });
  const title = `${s.id} · ${s.dateLabel}`, short = (iso) => stDay(iso, { day: 'numeric', month: 'short' });
  const meta = [['WEEK', s.week], ['MD', s.md], ['TIME', s.time + "'"], ['N EXERCICE', s.exercise], ['AM/PM', s.ampm]];
  const comp = X.group === 'compensatory', anyComp = Object.values(X.players).some((p) => p.comp);
  const kicker = s.extra ? 'EXTRA SESSION · MATCH DAY · STAFF' : (comp ? 'COMPENSATORY SESSION' : 'FULL SESSION') + ' · STAFF' + (s.part ? ' · ' + s.part.toUpperCase() : '');
  const cycle = (X.cycle || '—').toUpperCase(), pages = [];
  const strip = rsTeamStrip(C, s.md);
  pages.push(rpHeader(kicker, title, meta) + strip + rpTable(D, D.fullSession, ['time', 'rpe', 'mpm', 'td', 'd15', 'd20', 'vmax', 'pmax', 'days', 'sprints', 'accdec'], {}, RP_TABLE_H - (strip ? 73 : 0)));
  const note = comp ? `<div class="rp-legend"><span>Compensatory session (the players who did not play the match) · colour = the player's z vs his usual compensatory session, not vs a usual ${rpEsc(s.md)} · z printed when not usual · grey = individual or rehab session, not compared</span></div>`
    : `<div class="rp-legend"><span>Colour = the player's z vs his usual ${rpEsc(s.md)} (same microcycle type)${anyComp ? ' — compensatory players: vs their usual compensatory session' : ''} · z printed when not usual · grey = individual or rehab session, not compared with his ${rpEsc(s.md)}</span></div>`;
  pages.push(rpHeader(kicker, title, meta) + rsChart(D, C, 'td', 'TOTAL DISTANCE', true) + rsChart(D, C, 'd20', 'DISTANCE >20kmh') + note);
  pages.push(rpHeader(kicker, title, meta) + rsChart(D, C, 'accdec', 'Acceleration + Deceleration', true) + rsChart(D, C, 'sprints', 'Number of Sprints >25kmh') + note);
  pages.push(rpHeader('ACUTE : CHRONIC RATIO', title, [['WEEK', s.week], ['MD', s.md], ['RULE', '7:28 · 14:35']]) + rsAcLegend()
    + `<div class="rs-g4">${rsAcPanel(D, C, 'td', 'TOTAL DISTANCE')}${rsAcPanel(D, C, 'acc_dec', 'HIGH ACC + DEC')}${rsAcPanel(D, C, 'hit', 'DISTANCE > 20 km/h')}${rsAcPanel(D, C, 'spr_n', 'NUMBER OF SPRINTS')}</div>`);
  const drills = (D.drills || []).filter((d) => d.rows.length), cols = rpDrillColumns(drills);
  for (let k = 0; k < cols.length; k += 4) pages.push(rpHeader('DRILLS SUMMARY', title, [['WEEK', s.week], ['MD', s.md], ['DRILLS', drills.length], ['N SESSION', s.id]]) + rpDrillBoards(D, cols.slice(k, k + 4)));
  const from = X.micro ? X.micro.from : s.date;
  const first = (X.profile[0] || (X.plan || [])[0] || {}).date || from, toMatch = X.next ? X.next.date : null;
  pages.push(rpHeader('TEAM · MICROCYCLE · OBJECTIVES UNTIL THE MATCH',
    `${short(first)}${toMatch ? ' – ' + short(toMatch) : ''} · ${X.profile.length ? `done up to ${s.md} (${stDay(s.date, { weekday: 'short', day: 'numeric' })})` : 'objectives until the match'}`,
    [['MICROCYCLE', cycle], ['WEEK', s.week], ['NEXT', X.next ? [X.next.competition, X.next.opponent].filter(Boolean).join(' · ') : '—']]) + rsMicro(C));
  pages.push(rpHeader('TODAY & MICROCYCLE · PLAYER BY PLAYER', title, [['MD', s.md], ['MICROCYCLE', cycle], ['PLAYERS', String(D.fullSession.length)]]) + rsToday(D, C, s, S));
  if (X.wcs) pages.push(...rsWcsPages(D, X.wcs, s, title)); // the session against the matches' worst case scenarios (his ask, 2026-10-15)
  return pages.map((p) => `<div class="rp-page rp-staff">${p}</div>`).join('');
}

// ---------------------------------------------------------------- WCS: the session against each player's worst case scenarios
// of the matches (sync/wcs.py, raw GPS): A each player's best passage, B each drill, C the times at 80 / 90 % of his WCS
const RW_MET = [['td', 'DISTANCE', 'DIST'], ['hsr', '> 20 KM/H', '>20'], ['vhsr', '> 25 KM/H', '>25'], ['spr', 'SPRINTS', 'SPR'], ['ad', 'ACC + DEC', 'A+D']];
const RW_QC = { rq5: '#1f7a3d', rq4: '#34c759', rq3: '#bfeccc', rq2: '#ffe2b8', rq1: '#eef0f4' };
const rwQ = (p) => (p == null ? 'rq0' : p >= 100 ? 'rq5' : p >= 90 ? 'rq4' : p >= 80 ? 'rq3' : p >= 60 ? 'rq2' : 'rq1');
const rwMed = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b), n = v.length; return n ? Math.round(n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };
/** A StatSports drill title, short: "LSG 10v10", "Tech 1v1 · speed", "Physical · Warm Up". */
const rwShort = (t) => { const m = String(t).match(/^\s*([A-Za-z]+)\s*-\s*(\d+v\d+)/i); return m ? `${m[1]} ${m[2]}${/speed/i.test(t) ? ' · speed' : ''}` : String(t).replace(/\s*-\s*/g, ' · ').trim(); };

function rsWcsPages(D, W, s, title) {
  const P = W.players || {}, names = rpByPosition(D, D.fullSession.filter((r) => P[r.name]));
  if (!names.length) return [];
  const drills = (W.drills || []).filter((d) => names.some((n) => d.players[n]));
  const meta = [['WEEK', s.week], ['MD', s.md], ['MATCHES', String(W.matches || '–')], ['PLAYERS', String(names.length)]];
  const order = D.positions.order, rest = names.filter((n) => !order.includes(D.players[n]));
  const G = [...order.map((p) => [p, D.positions.labels[p], names.filter((n) => D.players[n] === p)]), ['—', 'Others', rest]].filter((g) => g[2].length);
  const rowH = (space) => Math.max(15, Math.min(26, Math.floor((space - G.length * 19) / names.length)));
  const nm = (n) => `<span class="rwc-nm">${rpFace(D, n)}${rpEsc(n)}${P[n].pos ? '<small class="pr">pos. WCS</small>' : ''}</span>`;
  const body = (row) => G.map(([p, l, ns]) => `<div class="rwc-grp">${rpEsc(p)}<small>${rpEsc(l)}</small></div>${ns.map(row).join('')}`).join('');
  const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const note = `WCS = his most intense 1, 3 and 5 minutes in the matches since ${W.since ? day(W.since) : 'August'} (the mean of his 3 best, 30 min or more) · under 3 matches → his position's${(W.idle || []).length ? ` · not shown, GPS on without training: ${W.idle.join(', ')}` : ''}`;
  const legend = `<span class="rwc-leg">${[['rq5', '100 % +'], ['rq4', '90–100'], ['rq3', '80–90'], ['rq2', '60–80'], ['rq1', 'under 60']].map(([c, l]) => `<span><i style="background:${RW_QC[c]}"></i>${l}</span>`).join('')}</span>`;
  const foot = (txt, leg = legend) => `<div class="rwc-foot"><span>${rpEsc(txt)}</span>${leg}</div>`;
  const pages = [];

  // A · each player's best passage of the session, as a % of his WCS
  const sum = (f, k) => names.reduce((a, n) => a + ((P[n][f] || {})[k] || 0), 0);
  const tile = (k, v, s2, cls = '') => `<div class="rwc-tile ${cls}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s2}</span></div>`;
  const tiles = RW_MET.map(([k, l]) => {
    const v = names.map((n) => P[n].pct[k][0]), m = rwMed(v), n90 = v.filter((x) => x != null && x >= 90).length;
    const bd = drills.map((d) => [d, rwMed(Object.values(d.players).map((x) => x[k]))]).sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))[0];
    return tile(`${l} · 1 MIN`, `${m == null ? '–' : m + ' %'}<small>squad median</small>`, `${n90}/${names.length} at 90 %+${bd ? ' · ' + rpEsc(rwShort(bd[0].name)) : ''}`);
  }).join('') + tile('TIME AT MATCH INTENSITY · SQUAD', `${sum('t80', 'td').toFixed(1)}<small>min dist.</small> ${sum('t80', 'hsr').toFixed(1)}<small>min &gt; 20</small>`,
    `≥ 80 % of the 1-min WCS · ≥ 90 %: ${sum('t90', 'td').toFixed(1)} · ${sum('t90', 'hsr').toFixed(1)}`, 'tm');
  const ca = `170px 30px ${RW_MET.map(() => '50px 62px').join(' ')} 40px 40px 40px 40px minmax(0, 1fr)`, ha = rowH(452);
  const tm = (v, c) => (v == null || v < 0.05 ? '<span class="rwc-t z">0</span>' : `<span class="rwc-t ${c}">${v.toFixed(1)}</span>`);
  const rowA = (n) => { const x = P[n]; return `<div class="rwc-tr rwc-r" style="grid-template-columns:${ca};height:${ha}px">${nm(n)}<span class="rwc-c rwc-mu">${x.min}'</span>
    ${RW_MET.map(([k]) => `<span class="rwc-c"><span class="rwc-p ${rwQ(x.pct[k][0])}" style="height:${ha - 5}px">${x.pct[k][0] == null ? '–' : x.pct[k][0] + ' %'}</span></span><span class="rwc-c"><small>${[1, 2].map((i) => (x.pct[k][i] == null ? '–' : x.pct[k][i] + '%')).join(' · ')}</small></span>`).join('')}
    <span class="rwc-c">${tm((x.t80 || {}).td, 't8')}</span><span class="rwc-c">${tm((x.t90 || {}).td, 't9')}</span><span class="rwc-c">${tm((x.t80 || {}).hsr, 't8')}</span><span class="rwc-c">${tm((x.t90 || {}).hsr, 't9')}</span>
    <span class="rwc-c l">${x.best_in ? rpEsc(rwShort(x.best_in)) : '–'}</span></div>`; };
  pages.push(rpHeader('TRAINING · WCS · THE SESSION AGAINST THE MATCH', title, meta) + `<div class="rwc-tiles">${tiles}</div>
    <div class="rwc-ti">Each player's best passage of the session, as a % of his match WCS<small>1, 3 and 5 minutes · time at match intensity = the minutes when the minute just played reached 80 % / 90 % of his 1-minute WCS</small></div>
    <div class="rwc-tbl"><div class="rwc-tr rwc-gh" style="grid-template-columns:${ca}"><span></span><span></span>${RW_MET.map(([, l]) => `<span style="grid-column:span 2">${l}</span>`).join('')}<span class="g" style="grid-column:span 4">MATCH INTENSITY · MIN</span><span></span></div>
      <div class="rwc-tr rwc-th" style="grid-template-columns:${ca}"><span class="l">PLAYER</span><span>MIN</span>${RW_MET.map(() => '<span>1 MIN</span><span>3 · 5 MIN</span>').join('')}<span>DIST.<br>≥ 80 %</span><span>DIST.<br>≥ 90 %</span><span>&gt; 20<br>≥ 80 %</span><span>&gt; 20<br>≥ 90 %</span><span class="l">HIS BEST<br>MINUTE IN</span></div>
      ${body(rowA)}</div>${foot(note)}`);

  if (drills.length) {
    // B · each drill: his best minute in it, as a % of his 1-minute WCS
    const cb = `170px ${drills.map(() => RW_MET.map(() => 'minmax(0, 1fr)').join(' ')).join(' 8px ')}`, hb = rowH(520);
    const rowB = (n) => `<div class="rwc-tr rwc-r" style="grid-template-columns:${cb};height:${hb}px">${nm(n)}${drills.map((d) => RW_MET.map(([k]) => { const x = d.players[n], v = x ? x[k] : null;
      return `<span class="rwc-h ${x ? rwQ(v) : 'rq0'}" style="height:${hb - 4}px">${x ? (v == null ? '–' : v) : '·'}</span>`; }).join('')).join('<span></span>')}</div>`;
    const med = `<div class="rwc-tr rwc-r team" style="grid-template-columns:${cb};height:${hb + 2}px"><span class="rwc-nm">Squad median</span>${drills.map((d) => RW_MET.map(([k]) => { const v = rwMed(names.map((n) => (d.players[n] || {})[k]));
      return `<span class="rwc-h ${rwQ(v)}" style="height:${hb - 4}px">${v == null ? '–' : v}</span>`; }).join('')).join('<span></span>')}</div>`;
    pages.push(rpHeader('TRAINING · WCS · EACH DRILL AGAINST THE MATCH', title, meta) + `<div class="rwc-ti">Each drill: his best minute in it, as a % of his 1-minute match WCS<small>distance, > 20 km/h, > 25 km/h, sprints, Acc + Dec · 100 = his most intense minute of a match</small></div>
      <div class="rwc-tbl"><div class="rwc-tr rwc-gh" style="grid-template-columns:${cb}"><span></span>${drills.map((d) => `<span style="grid-column:span ${RW_MET.length}">${rpEsc(rwShort(d.name).toUpperCase())} · ${d.min}'</span>`).join('<span></span>')}</div>
        <div class="rwc-tr rwc-th" style="grid-template-columns:${cb}"><span class="l">PLAYER</span>${drills.map(() => RW_MET.map(([, , a]) => `<span>${a}</span>`).join('')).join('<span></span>')}</div>
        ${body(rowB)}${med}</div>${foot(note + ' · “·” = not in the drill')}`);
  }

  // C · how many times the minute just played reached 80 % / 90 % of his 1-minute WCS: m/min, > 20 km/h per minute, Acc + Dec per minute
  const CK = [['td', 'M/MIN'], ['hsr', '>20/MIN'], ['ad', 'A+D/MIN']], parts = [['all', `WHOLE SESSION · ${Math.max(...names.map((n) => P[n].min || 0))}'`], ...drills.map((d) => [d.name, `${rwShort(d.name).toUpperCase()} · ${d.min}'`])];
  const cc = `170px ${parts.map(() => CK.map(() => 'minmax(0, 1fr)').join(' ')).join(' 8px ')}`, hc = rowH(520);
  const cnt = (n, part) => (part === 'all' ? ((P[n].cnt || {}).all || {}) : (((P[n].cnt || {}).d || {})[part] || null));
  const cell = (c, k) => { if (!c) return `<span class="rwc-h rq0" style="height:${hc - 4}px">·</span>`; const [a, b] = c[k] || [];
    return `<span class="rwc-h ${b ? 'rq5' : a ? 'rq3' : 'rq1'}" style="height:${hc - 4}px">${a ? `${a}<small>&nbsp;·&nbsp;${b || 0}</small>` : '–'}</span>`; };
  const rowC = (n) => `<div class="rwc-tr rwc-r" style="grid-template-columns:${cc};height:${hc}px">${nm(n)}${parts.map(([p]) => CK.map(([k]) => cell(cnt(n, p), k)).join('')).join('<span></span>')}</div>`;
  const tot = `<div class="rwc-tr rwc-r team" style="grid-template-columns:${cc};height:${hc + 2}px"><span class="rwc-nm">Squad total</span>${parts.map(([p]) => CK.map(([k]) => {
    const a = names.reduce((t, n) => t + (((cnt(n, p) || {})[k] || [])[0] || 0), 0), b = names.reduce((t, n) => t + (((cnt(n, p) || {})[k] || [])[1] || 0), 0);
    return `<span class="rwc-h ${b ? 'rq5' : a ? 'rq3' : 'rq1'}" style="height:${hc - 4}px">${a ? `${a}<small>&nbsp;·&nbsp;${b}</small>` : '–'}</span>`; }).join('')).join('<span></span>')}</div>`;
  const legC = `<span class="rwc-leg"><span><i style="background:${RW_QC.rq5}"></i>reached 90 %</span><span><i style="background:#d9f5e1"></i>reached 80 %</span><span><i style="background:${RW_QC.rq1}"></i>never</span><span>cell = times at 80 % · of which at 90 %</span></span>`;
  pages.push(rpHeader('TRAINING · WCS · TIMES AT MATCH INTENSITY', title, meta) + `<div class="rwc-ti">Times the minute just played reached 80 % · 90 % of his 1-minute WCS<small>m/min · > 20 km/h per minute · Acc + Dec per minute · each passage counts once · whole session, then each drill</small></div>
    <div class="rwc-tbl"><div class="rwc-tr rwc-gh" style="grid-template-columns:${cc}"><span></span>${parts.map(([p, l]) => `<span class="${p === 'all' ? 'g' : ''}" style="grid-column:span ${CK.length}">${rpEsc(l)}</span>`).join('<span></span>')}</div>
      <div class="rwc-tr rwc-th" style="grid-template-columns:${cc}"><span class="l">PLAYER</span>${parts.map(() => CK.map(([, l]) => `<span>${l}</span>`).join('')).join('<span></span>')}</div>
      ${body(rowC)}${tot}</div>${foot(note + ' · “·” = not in the drill', legC)}`);
  return pages;
}
