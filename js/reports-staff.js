/**
 * Reports — staff version of the training report (mockup "staff3", chosen by the staff on 2026-10-02).
 * Pages: full table + team strip · TD & >20 km/h · Acc+Dec & sprints (bar colour = the player's z vs his usual MD of the
 * same microcycle type; grey = individual / rehab session, not compared) · A:C 7:28 and 14:35 · drills summary ·
 * team microcycle so far · players microcycle & week so far.
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
  return `<div class="rs-acleg"><span><i class="rs-sw" style="background:#34c759"></i>7:28 this week</span><span><i class="rs-dash"></i>previous week (14:35)</span><span><b class="rs-2w over">2W</b> both weeks above 1.37</span><span><b class="rs-2w under">2W</b> both weeks below 0.78</span>${[['#9fc9f5', '< 0.5'], ['#3d95f0', '0.5–0.78'], ['#34c759', '0.78–1.37'], ['#d4a800', '1.37–1.5'], ['#e5484d', '> 1.5']].map(([c, l]) => `<span><i class="rs-sw" style="background:${c}"></i>${l}</span>`).join('')}<span class="rs-lz">bars capped at 2.5 (▲ = higher)</span></div>`;
}
function rsAcPanel(D, C, key, title) {
  const rows = D.fullSession.map((r) => ({ name: r.name, v: C.ac(r.name, key) })).filter((x) => x.v && x.v[0] != null).sort((a, b) => b.v[0] - a.v[0]);
  const MAX = 2.5, y = (v) => (Math.min(Math.max(v, 0), MAX) / MAX * 100).toFixed(1) + '%';
  const lines = [[0.78, 'lo'], [1.37, 'hi'], [1.5, 'red']].map(([v, c]) => `<i class="rs-hl ${c}" style="bottom:${y(v)}"><b>${v.toFixed(2)}</b></i>`).join('');
  return `<div class="rs-panel"><div class="rs-pt">${title}</div>
    <div class="rs-acplot">${lines}${rows.map((r) => {
      const [a, b] = r.v, two = b != null && (a > 1.37 && b > 1.37 ? 'over' : a < 0.78 && b < 0.78 ? 'under' : '');
      return `<div class="rs-col"><i class="rs-acbar" style="height:${y(a)};background:${stAcCol(a)}"><em>${two ? `<b class="rs-2w ${two}">2W</b>` : ''}${a > MAX ? '▲' : ''}${a.toFixed(2)}</em></i>${b != null ? `<u class="rs-dash" style="bottom:${y(b)}"></u>` : ''}</div>`;
    }).join('')}${rows.length ? '' : '<span class="rp-empty">No A:C yet (4 weeks of data needed)</span>'}</div>
    <div class="rs-names">${rows.map((r) => `<div><span>${rpEsc(r.name)}</span></div>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------- page 6: team, microcycle so far — dot = this week, grey bar = usual range of that MD
function rsProfile(C, k, title, unit) {
  const days = [...C.X.profile, ...(C.X.plan || [])], W = 600, H = 255, padL = 10, padB = 36, padT = 24; // done days, then planned
  const slots = [...days.map((d) => d.md), 'MD'], bw = Math.max(30, Math.min(52, (W - padL) / slots.length - 12)), hw = bw / 2;
  const pts = days.map((d) => d[k] && d[k][0] != null ? d[k] : null);
  const max = Math.max(1, ...days.map((d) => (d[k] ? Math.max(d[k][0] || 0, d[k][3] || 0) : 0))) * 1.12;
  const x = (i) => padL + (i + 0.5) * ((W - padL) / slots.length), y = (v) => padT + (1 - v / max) * (H - padT - padB);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  slots.forEach((md, i) => {
    const d = days[i], p = d && d[k];
    if (d) {
      if (p && p[2] != null && p[3] != null) svg += `<rect x="${x(i) - hw}" y="${y(p[3])}" width="${bw}" height="${Math.max(3, y(p[2]) - y(p[3]))}" rx="7" fill="${d.fut ? '#f1f2f6' : '#e9ebf1'}"${d.fut ? ' stroke="#d5d8e0" stroke-dasharray="3 3"' : ''}/>`;
      if (p && p[1] != null) svg += `<line x1="${x(i) - hw}" x2="${x(i) + hw}" y1="${y(p[1])}" y2="${y(p[1])}" stroke="#b8bcc8" stroke-width="2"/>`;
      svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="#8a8f9e">${stDay(d.date, { weekday: 'short', day: 'numeric' })}${d.comp ? ' · comp.' : d.fut && !d.planned ? ' · no plan' : ''}</text>`;
    } else {
      svg += `<rect x="${x(i) - hw}" y="${padT}" width="${bw}" height="${H - padT - padB}" rx="7" fill="none" stroke="#c9ccd6" stroke-dasharray="4 4"/><text x="${x(i)}" y="${(padT + H - padB) / 2}" text-anchor="middle" font-size="11" fill="#8a8f9e" font-weight="700">match</text>`;
    }
    svg += `<text x="${x(i)}" y="${H - 20}" text-anchor="middle" font-size="12" font-weight="800" fill="${d && d.fut ? '#7d86b8' : '#16269e'}">${rpEsc(md)}</text>`;
  });
  const done = pts.map((p, i) => (p && !days[i].fut ? i : -1)).filter((i) => i >= 0), plan = pts.map((p, i) => (p && days[i].fut ? i : -1)).filter((i) => i >= 0);
  const line = (ix, dash) => (ix.length > 1 ? `<polyline points="${ix.map((i) => `${x(i)},${y(pts[i][0])}`).join(' ')}" fill="none" stroke="#16269e" stroke-width="2" stroke-opacity="${dash ? '.35' : '.5'}"${dash ? ' stroke-dasharray="5 4"' : ''}/>` : '');
  svg += line(done, false) + line([...done.slice(-1), ...plan], true);
  pts.forEach((p, i) => {
    if (!p) return;
    if (days[i].fut) { // planned in the Session Plan: a hollow dot, its forecast written above
      svg += `<circle cx="${x(i)}" cy="${y(p[0])}" r="7" fill="#fff" stroke="#16269e" stroke-width="2.5"/><text x="${x(i)}" y="${y(p[0]) - 13}" text-anchor="middle" font-size="12" font-weight="700" fill="#5a63a8">${stK(p[0])}</text>`;
      return;
    }
    const [v, , , , z] = p, c = ST_DOT[stMz(z)] || '#8a8f9e';
    svg += `<circle cx="${x(i)}" cy="${y(v)}" r="8" fill="${c}" stroke="#fff" stroke-width="2.5"/><text x="${x(i)}" y="${y(v) - 14}" text-anchor="middle" font-size="12.5" font-weight="800" fill="#111">${stK(v)}</text>`;
    if (z != null && stMz(z) !== 'ok') svg += `<text x="${x(i) + 13}" y="${y(v) + 4}" font-size="10.5" font-weight="800" fill="${c}">${stSigned(z)}</text>`;
  });
  return `<div class="rs-prof"><div class="rs-proft">${title}<span>${unit}</span></div>${svg}</svg></div>`;
}
function rsMicro(C, s) {
  const n = C.X.next, ac = C.X.team_ac || {};
  const dd = n ? Math.round((new Date(n.date + 'T12:00:00Z') - new Date(s.date + 'T12:00:00Z')) / 864e5) : null;
  const next = n ? `<span class="rs-next">${typeof crestHtml === 'function' ? crestHtml(n.opponent, 22) : ''} Next: <b>${rpEsc([n.competition, n.round].filter(Boolean).join(' '))} · ${rpEsc(n.opponent || '')}</b> · ${dd === 1 ? 'tomorrow' : dd === 0 ? 'today' : 'in ' + dd + ' days'} ${rpEsc(n.time || '')}</span>` : '';
  const body = C.X.profile.length || (C.X.plan || []).length
    ? `<div class="rs-profs">${rsProfile(C, 'td', 'TOTAL DISTANCE', 'm')}${rsProfile(C, 'hit', 'DISTANCE > 20 km/h', 'm')}${rsProfile(C, 'acc_dec', 'HIGH ACC + DEC', '')}${rsProfile(C, 'srpe', 'SESSION × RPE', 'AU')}</div>`
    : '<div class="rs-profs"><span class="rp-empty">No usual reference for these days yet</span></div>';
  const comp = C.X.profile.some((d) => d.comp) ? ' · comp. = compensatory session (the players who did not play), vs the usual compensatory session' : '';
  const planned = (C.X.plan || []).length ? ' · hollow dot = planned in the Session Plan (its forecast; sRPE is not forecast) · dashed bar = a day still to come' : '';
  return `<div class="rs-intro"><span>Team · each dot = this week${planned} · grey bar = the team's usual range for that MD (p25–p75) in a ${rpEsc(C.X.cycle || '')} microcycle · line = usual average · z shown when not usual${comp}</span>${next}</div>
    ${body}
    <div class="rs-acrow"><span class="rs-acl">Team A:C 7:28 today</span>${[['td', 'Total distance'], ['hit', 'HIT > 20'], ['acc_dec', 'Acc + Dec'], ['srpe', 'sRPE']].map(([k, l]) => `<div class="rs-act"><i style="background:${stAcCol(ac[k])}"></i>${l}<b>${ac[k] != null ? ac[k].toFixed(2) : '–'}</b></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- page 7: players, microcycle so far + week so far (z chips) + speed
function rsCycle(D, C, s) {
  const mc = [['td', 'TD'], ['hit', '> 20'], ['acc_dec', 'Acc+Dec'], ['spr_n', 'Sprints']], wk = [['td', 'TD'], ['hit', '> 20'], ['acc_dec', 'Acc+Dec'], ['spr_n', 'Sprints']];
  const tpl = '160px repeat(4, minmax(0,0.68fr)) 14px repeat(4, minmax(0,1.5fr)) 14px 60px 84px';
  const from = (C.X.micro && C.X.micro.md[0]) || '';
  const rowH = rpRowH(D, D.fullSession, RP_TABLE_H - 41, 25);
  let html = `<div class="rs-tbl${rowH < 21 ? ' rp-tight' : ''}"><div class="rs-tr rs-gh" style="grid-template-columns:${tpl}"><span></span><span style="grid-column:span 4">MICROCYCLE SO FAR · ${rpEsc(from)}${from && from !== s.md ? ' → ' + rpEsc(s.md) : ''} vs his usual</span><span></span><span style="grid-column:span 4">WEEK SO FAR · Sun → today · value, bar = z vs his weeks</span><span></span><span style="grid-column:span 2">MAX SPEED</span></div>
    <div class="rs-tr rs-th" style="grid-template-columns:${tpl}"><span>Players</span>${mc.map(([, l]) => `<span>${l}</span>`).join('')}<span></span>${wk.map(([, l]) => `<span>${l}</span>`).join('')}<span></span><span>Days</span><span>This week</span></div>`;
  for (const p of D.positions.order) {
    const g = D.fullSession.filter((r) => D.players[r.name] === p).sort((a, b) => a.name.localeCompare(b.name));
    if (!g.length) continue;
    html += `<div class="rp-grp">${p}<small>${rpEsc(D.positions.labels[p])}</small></div>`;
    html += g.map((r) => {
      const x = C.px(r.name) || {}, [dbg, dfg] = rpDaysColor(r.days);
      return `<div class="rs-tr rs-row" style="grid-template-columns:${tpl};height:${rowH}px"><span class="rp-nm">${rpFace(D, r.name)}${rpEsc(r.name)}</span>${mc.map(([k]) => `<span>${stChip(C.mc(r.name, k))}</span>`).join('')}<span></span>${wk.map(([k]) => `<span>${rsWeekCell(C.wv(r.name, k), C.wk(r.name, k))}</span>`).join('')}<span></span>
        <span><span class="mz" style="background:${dbg};color:${dfg}">${r.days ?? '–'}</span></span><span class="rs-v">${x.vmax != null ? x.vmax.toFixed(1) + ' km/h' : '–'}</span></div>`;
    }).join('');
  }
  return html + `</div><div class="rp-legend">${ST_LEG5}<span>Week so far: value · bar and number = z vs the same days of his previous weeks</span><span>Days = days since his last run ≥ 90 % of max speed</span></div>`;
}
/** A week-so-far cell: his value, a bar from the middle (right = above his usual, left = below; full width = 3 SD) and z. */
function rsWeekCell(v, z) {
  if (v == null) return '<div class="rs-wc"><span class="v">–</span></div>';
  const val = Math.round(v).toLocaleString('en-US');
  if (z == null) return `<div class="rs-wc"><span class="v">${val}</span><span class="rs-zb"><i class="mid"></i></span><span class="z"></span></div>`;
  const w = Math.min(Math.abs(z), 3) / 3 * 50;
  return `<div class="rs-wc"><span class="v">${val}</span><span class="rs-zb"><i class="mid"></i><i style="${z < 0 ? 'right:50%' : 'left:50%'};width:${w.toFixed(1)}%;background:${stZCol(z)}"></i></span><span class="z" style="color:${stZCol(z)}">${stSigned(z)}</span></div>`;
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
  const kicker = (comp ? 'COMPENSATORY SESSION' : 'FULL SESSION') + ' · STAFF' + (s.part ? ' · ' + s.part.toUpperCase() : '');
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
  const planDays = X.plan || [], toMatch = X.next ? X.next.date : null;
  pages.push(rpHeader(planDays.length ? 'TEAM · MICROCYCLE · DONE AND PLANNED' : 'TEAM · MICROCYCLE SO FAR',
    `${from !== s.date ? short(from) + ' – ' : ''}${short(s.date)} · up to ${s.md}${planDays.length && toMatch ? ` · then planned until the match (${short(toMatch)})` : ''}`,
    [['MICROCYCLE', cycle], ['WEEK', s.week], ['SESSIONS', String(X.micro ? X.micro.md.length : X.profile.length)]]) + rsMicro(C, s));
  pages.push(rpHeader('MICROCYCLE & WEEK · PLAYER BY PLAYER', title, [['MD', s.md], ['MICROCYCLE', cycle], ['PLAYERS', String(D.fullSession.length)]]) + rsCycle(D, C, s));
  return pages.map((p) => `<div class="rp-page rp-staff">${p}</div>`).join('');
}
