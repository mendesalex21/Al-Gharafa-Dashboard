/* Tactical › New version: the parts of the old version moved in (his ask, 2026-11-06 — the goal: one Tactical tab only).
 *   Teams › Style       the Team style radars (overview, with / without the ball) vs the league or a team, + transitions
 *                       and space control (old Team style)
 *   Teams › Set pieces  corners attacking / defending from the tracking: players in the box, man-marking and zonal at the
 *                       delivery (a drawing of the average set-up), where the ball goes, the takers, every team
 *   Teams › Line-up     the predicted line-up: his last XI, a suspended player (red card) or — for us — an unavailable one
 *                       (Workload status) replaced by the most frequent starter of the same line; starts in the last 5
 *   Matches             + the goals (▶ their 2D clip), team numbers, effective playing time, the line-ups
 * Data: payload tactical (matches, radar, ideas = old version) next to tactical.v2; functions of js/tactical.js reused. */
const T2X = { rdvs: 'league', wl: null };
const t2Raw = () => T2.raw || {};
const t2OldMatch = (id) => (t2Raw().matches || []).find((m) => m.id === id) || null;
function t2Redraw() { const box = document.getElementById('t2-body'), y = window.scrollY; box.innerHTML = t2TeamPage(); t2Bind(); t2BindX(); window.scrollTo(0, y); }

// ------------------------------------------------------------------ Style (the old Team style)
function t2StylePage(team) {
  const R = t2Raw().radar;
  if (!R || !R.teams || !R.teams[team]) return '<div class="card"><p class="muted">No Team style for this team — QSL matches only.</p></div>';
  const others = Object.keys(R.teams).filter((t) => t !== team).sort(), vs = T2X.rdvs !== 'league' && R.teams[T2X.rdvs] && T2X.rdvs !== team ? T2X.rdvs : 'league';
  const sel = `<select class="select" id="t2-rdvs">${['league', ...others].map((t) => `<option value="${escapeHtml(t)}" ${t === vs ? 'selected' : ''}>${t === 'league' ? 'League average' : escapeHtml(t)}</option>`).join('')}</select>`;
  const hasIdeas = t2Raw().ideas && typeof ixQsl === 'function' && ixQsl(team).length;
  return `<div class="card"><h3>Team style <small>QSL · per match · centre = the league's lowest team · dotted ring = league average · edge = the highest · ⓘ = how it is calculated</small><span class="sp"></span><span class="muted" style="font-size:12px">compared with</span> ${sel}</h3>
      <span class="rd-lg"><span><i style="background:#1f3a9e"></i>${escapeHtml(team)}</span><span><i style="background:#9a9aa5"></i>${vs === 'league' ? 'league average' : escapeHtml(vs)}</span></span>
      <div class="rd-row"><div>${rdRadar(R, RD_AX.G, team, vs)}</div><div>${rdTable(R, RD_AX.G, team, vs)}</div></div></div>
    <div class="rd-two"><div class="card"><h3>With the ball</h3>${rdRadar(R, RD_AX.C1, team, vs, 420)}${rdTable(R, RD_AX.C1, team, vs)}</div><div class="card"><h3>Without the ball</h3>${rdRadar(R, RD_AX.C2, team, vs, 440)}${rdTable(R, RD_AX.C2, team, vs)}</div></div>
    ${hasIdeas ? `<div class="t2-old">${ixTransitions(team)}${ixSpace(team)}</div>` : ''}`;
}

// ------------------------------------------------------------------ Set pieces (corners from the tracking)
/** The average set-up at the delivery, drawn on the attacking half: the defenders in a zone on the 6-yard line (squares),
 * each man-marker with his attacker (pairs), the other attackers around the penalty spot. */
/** The last 23 m seen from the pitch, the goal at the top (the whole width): P(x, y) → [sx, sy] in pitch metres. */
function t2BoxPitch(w, inner) {
  const sc = w / 68, h = 23 * sc, P = (x, y) => [y * sc, (105 - x) * sc], L = 'stroke="rgba(255,255,255,.85)" stroke-width="1.3" fill="none"';
  const rect = (x0, x1, y0, y1) => { const [a, b] = P(x1, y0), [c, d] = P(x0, y1); return `<rect x="${a}" y="${b}" width="${c - a}" height="${d - b}" ${L}/>`; };
  const [gx0] = P(105, 30.34), [gx1] = P(105, 37.66), [px, py] = P(94, 34);
  return `<svg viewBox="-4 -8 ${w + 8} ${h + 12}" class="sp-pitch"><rect x="0" y="0" width="${w}" height="${h}" fill="#2f8a4c"/><line x1="0" y1="0" x2="${w}" y2="0" ${L}/>
    ${rect(88.5, 105, 13.84, 54.16)}${rect(99.5, 105, 24.84, 43.16)}<rect x="${gx0}" y="-5" width="${gx1 - gx0}" height="5" fill="rgba(255,255,255,.9)"/><circle cx="${px}" cy="${py}" r="1.6" fill="#fff"/>
    <path d="M ${P(88.5, 26.7)[0]} ${P(88.5, 26.7)[1]} A ${9.15 * sc} ${9.15 * sc} 0 0 0 ${P(88.5, 41.3)[0]} ${P(88.5, 41.3)[1]}" ${L}/>${inner(P)}</svg>`;
}
/** The average set-up at the delivery: the defenders in a zone on the 6-yard line (squares), each man-marker with his
 * attacker (pairs), the other attackers at the edge of the box, the other defenders inside it. */
function t2BoxDrawing(att, man, zonal, defBox, title) {
  const A = Math.round(att || 0), M = Math.min(Math.round(man || 0), A), Z = Math.round(zonal || 0), D = Math.max(Math.round(defBox || 0), M + Z);
  const dot = ([x, y], f, r = 5.5) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${f}" stroke="#fff" stroke-width="1"/>`;
  return `<div class="sp-draw"><div class="sp-dt">${title}</div>${t2BoxPitch(340, (P) => {
    let g = '';
    for (let i = 0; i < Z; i++) { const [x, y] = P(99.3, 34 + (i - (Z - 1) / 2) * Math.min(3.6, 17 / Math.max(1, Z))); g += `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" rx="2" fill="#2a78d6" stroke="#fff" stroke-width="1"/>`; }
    for (let i = 0; i < M; i++) { const yy = 34 + (i - (M - 1) / 2) * Math.min(4.6, 24 / Math.max(1, M)), xx = 95.5 - (i % 2) * 2; g += dot(P(xx, yy), '#e5484d') + dot(P(xx + 1.2, yy + 1), '#2a78d6'); }
    for (let i = 0; i < A - M; i++) g += dot(P(90 - (i % 2) * 1.5, 34 + (i - (A - M - 1) / 2) * 5), '#e5484d');
    for (let i = 0; i < D - M - Z; i++) g += dot(P(97.5, 34 + (i - (D - M - Z - 1) / 2) * 6), '#9ec3f0', 5);
    return g + dot(P(105, 0.6), '#f5c518', 4);
  })}<div class="sp-leg"><span><i class="r"></i>attacker</span><span><i class="b"></i>man-marker (with his attacker)</span><span><i class="z"></i>zonal</span>${D - M - Z > 0 ? '<span><i class="l"></i>other defender in the box</span>' : ''}</div></div>`;
}
function t2SetPage(team) {
  const C = (t2Raw().ideas || {}).corners || [];
  if (!C.length) return '<div class="card"><p class="muted">No corner read from a tracking yet.</p></div>';
  const att = C.filter((c) => c.team === team), def = C.filter((c) => c.opp === team), teams = [...new Set(C.map((c) => c.team))].sort();
  const avg = (xs, f) => (xs.length ? xs.reduce((a, c) => a + (f(c) || 0), 0) / xs.length : null), f1 = (v) => (v == null ? '—' : v.toFixed(1));
  const pct = (xs, f) => (xs.length ? Math.round(xs.filter(f).length / xs.length * 100) : null);
  const lgA = (f) => { const v = teams.map((x) => avg(C.filter((c) => c.team === x), f)).filter((y) => y != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const lgD = (f) => { const v = teams.map((x) => avg(C.filter((c) => c.opp === x), f)).filter((y) => y != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const kpi = (l, v, sub) => `<div><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const zones = (xs) => IX_ZONES.map((z) => { const n = xs.filter((c) => c.zone === z).length; return `<div class="ix-z"><span>${z}</span><div><i style="width:${xs.length ? n / xs.length * 100 : 0}%"></i></div><span>${n}</span></div>`; }).join('');
  const dots = (xs) => `<div class="sp-draw"><div class="sp-dt">Where the ball goes · first contact</div>${t2BoxPitch(340, (P) => xs.filter((c) => c.ball && c.ball[0] >= 82).map((c) => { const [x, y] = P(c.ball[0], c.ball[1]); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${c.goal ? '#f5c518' : c.shot ? '#e5484d' : 'rgba(255,255,255,.8)'}" stroke="#0b0b0b" stroke-width=".7"/>`; }).join('') + (() => { const [x, y] = P(105, 0.6); return `<circle cx="${x}" cy="${y}" r="4" fill="#16269e"/>`; })())}</div>`;
  const man = avg(def, (c) => c.man), zon = avg(def, (c) => c.zonal);
  const sys = man == null ? '—' : zon >= 2 * man ? 'mainly zonal' : man >= 2 * zon ? 'mainly man-to-man' : 'mixed (zonal + man)';
  // the takers (the v2 moments of the matches loaded for this team)
  const mo = typeof t2Moments === 'function' ? t2Moments(team).filter((x) => x.c === 'corner') : [], tk = {};
  mo.forEach((x) => { const k = x.p || '?'; const r = tk[k] || (tk[k] = { n: 0, shot: 0, goal: 0 }); r.n++; if (x.tag === 'shot') r.shot++; if (x.tag === 'goal') r.goal++; });
  const takers = Object.entries(tk).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([p, r]) => `<div class="ix-z"><span>${escapeHtml(t2Name(p) || '—')}</span><div><i style="width:${mo.length ? r.n / mo.length * 100 : 0}%"></i></div><span>${r.n}${r.shot + r.goal ? ` <small class="muted">· ${r.shot + r.goal} shot${r.shot + r.goal > 1 ? 's' : ''}</small>` : ''}</span></div>`).join('');
  const rows = teams.map((x) => { const a = C.filter((c) => c.team === x), d = C.filter((c) => c.opp === x), mm = avg(d, (c) => c.man), zz = avg(d, (c) => c.zonal);
    return `<tr class="${x === team ? 'on' : ''}${x === T2_US ? ' us' : ''}" data-team="${escapeHtml(x)}" style="cursor:pointer"><td class="l">${crestHtml(x, 16)} ${escapeHtml(x)}</td><td>${a.length}</td><td>${f1(avg(a, (c) => c.att_box))}</td><td>${pct(a, (c) => c.shot) ?? '—'} %</td><td>${a.filter((c) => c.goal).length}</td><td>${d.length}</td><td>${f1(avg(d, (c) => c.def_box))}</td><td>${f1(mm)}</td><td>${f1(zz)}</td><td>${mm == null ? '—' : zz >= 2 * mm ? 'zonal' : mm >= 2 * zz ? 'man' : 'mixed'}</td><td>${pct(d, (c) => c.shot) ?? '—'} %</td><td>${d.filter((c) => c.goal).length}</td></tr>`; }).join('');
  return `<div class="card"><h3>Set pieces <small>corners of the QSL matches with a tracking · at the delivery, goalkeepers left out · man-marking = an attacker with a defender within 1.5 m · zonal = a defender in the box with no attacker within 2 m · where the ball goes = the first contact, every corner drawn from the same side · shot = within 10 s</small><span class="sp"></span>${t2See('corner', {}, 'corners')}${t2See('free_kick', {}, 'free kicks')}</h3></div>
    <div class="grid2"><div class="card"><h3>${crestHtml(team, 18)} Attacking · ${att.length} corners</h3>
        <div class="ix-kpis">${kpi('Attackers in the box', f1(avg(att, (c) => c.att_box)), `league ${f1(lgA((c) => c.att_box))}`)}${kpi('Marked man-to-man', f1(avg(att, (c) => c.man)), 'of them, by the opponent')}${kpi('A shot', `${pct(att, (c) => c.shot) ?? '—'} %`, `league ${f1(lgA((c) => (c.shot ? 100 : 0)))} %`)}${kpi('Goals', att.filter((c) => c.goal).length)}</div>
        <div class="sp-two">${t2BoxDrawing(avg(att, (c) => c.att_box), avg(att, (c) => c.man), avg(att, (c) => c.zonal), avg(att, (c) => c.def_box), 'How many he sends · average set-up')}<div>${dots(att)}<div class="pk-leg"><span><i class="dot" style="background:#fff;border:1px solid #333"></i>no shot</span><span><i class="dot" style="background:#e5484d"></i>shot</span><span><i class="dot" style="background:#f5c518"></i>goal</span></div></div></div>
        <div class="sp-two"><div><b class="sp-h">Where the ball goes</b>${zones(att)}</div><div><b class="sp-h">Takers <small class="muted">${mo.length} corners in his files</small></b>${takers || '<p class="muted">—</p>'}</div></div></div>
      <div class="card"><h3>${crestHtml(team, 18)} Defending · ${def.length} corners</h3>
        <div class="ix-kpis">${kpi('Marking', sys)}${kpi('Defenders in the box', f1(avg(def, (c) => c.def_box)), `league ${f1(lgD((c) => c.def_box))}`)}${kpi('Man-markers', f1(man), `league ${f1(lgD((c) => c.man))}`)}${kpi('Zonal', f1(zon), `league ${f1(lgD((c) => c.zonal))}`)}${kpi('A shot conceded', `${pct(def, (c) => c.shot) ?? '—'} %`)}${kpi('Goals conceded', def.filter((c) => c.goal).length)}</div>
        <div class="sp-two">${t2BoxDrawing(avg(def, (c) => c.att_box), man, zon, avg(def, (c) => c.def_box), 'How he defends · average set-up')}<div>${dots(def)}</div></div>
        <div><b class="sp-h">Where the ball goes</b>${zones(def)}</div></div></div>
    <div class="card"><h3>Every team <small>click a team</small></h3><div class="tc-scroll"><table class="tt-tbl"><thead><tr><th class="l">Team</th><th>Corners for</th><th>Attackers in box</th><th>Shot</th><th>Goals</th><th>Corners against</th><th>Defenders in box</th><th>Man-markers</th><th>Zonal</th><th>Marking</th><th>Shot conceded</th><th>Goals conceded</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ------------------------------------------------------------------ Line-up (predicted)
const t2Skel = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => (w[0] + w.slice(1).replace(/[aeiouy]/g, '')).replace(/(.)\1+/g, '$1'));
/** Our player in Workload for a line-up name (last name + first names): every word of his Workload name in it. */
function t2WlOf(p) {
  if (!T2X.wl) return null;
  const words = new Set([...t2Skel(p.name), ...t2Skel(p.first)]);
  return T2X.wl.find((w) => { const k = t2Skel(w.name); return k.length && k.every((x) => words.has(x)); }) || null;
}
const T2_LINE = (pos) => (pos === 'GK' ? 0 : ['CD', 'WD'].includes(pos) ? 1 : ['DM', 'CM', 'AM', 'WM'].includes(pos) ? 2 : 3);
function t2Lineup(team) {
  const ms = (t2Raw().matches || []).filter((m) => m.home === team || m.away === team).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ms.length) return null;
  const side = (m) => (m.home === team ? 'home' : 'away'), last5 = ms.slice(0, 5), key = (p) => `${p.first} ${p.name}`;
  const P = {};
  last5.forEach((m, i) => m.lineups[side(m)].forEach((p) => {
    const r = P[key(p)] || (P[key(p)] = { p, starts: 0, apps: 0, min: 0, pos: {}, lastXI: false, lastSeen: i });
    if (p.starter) { r.starts++; r.pos[p.pos] = (r.pos[p.pos] || 0) + 1; }
    if ((p.min || 0) > 0) r.apps++;
    r.min += p.min || 0; r.lastSeen = Math.min(r.lastSeen, i);
    if (i === 0) r.lastXI = !!p.starter;
  }));
  // his position = the one he started most at over ALL the team's matches with a file (a sub's listed position is not reliable)
  const posAll = {}; ms.forEach((m) => m.lineups[side(m)].forEach((p) => { if (p.starter && p.pos && p.pos !== 'Undefined') { const o = posAll[key(p)] || (posAll[key(p)] = {}); o[p.pos] = (o[p.pos] || 0) + 1; } }));
  Object.values(P).forEach((r) => { const m = Object.entries(posAll[key(r.p)] || r.pos).sort((a, b) => b[1] - a[1])[0]; r.main = m ? m[0] : r.p.pos; r.line = T2_LINE(r.main); });
  const out = new Map();
  ms[0].lineups[side(ms[0])].forEach((p) => { if (p.r) out.set(key(p), 'red card in the last match'); });
  if (team === T2_US && T2X.wl) Object.values(P).forEach((r) => { const w = t2WlOf(r.p); if (w && w.status && w.status !== 'available') out.set(key(r.p), w.status); });
  const XI = [], used = new Set();
  Object.values(P).filter((r) => r.lastXI).forEach((r) => {
    if (!out.has(key(r.p))) { XI.push({ r, why: null }); used.add(key(r.p)); return; }
    // the same position first (a player who played there), else the same line — most starts, then most minutes
    const free = Object.values(P).filter((x) => !x.lastXI && !used.has(key(x.p)) && !out.has(key(x.p))), by = (a, b) => b.starts - a.starts || b.min - a.min;
    const c = free.filter((x) => x.main === r.main && x.min > 0).sort(by)[0] || free.filter((x) => x.line === r.line).sort(by)[0];
    if (c) { XI.push({ r: c, why: `in for ${r.p.name} (${out.get(key(r.p))})` }); used.add(key(c.p)); } else XI.push({ r, why: `${out.get(key(r.p))} — no like-for-like` });
  });
  const form = (lst) => [1, 2, 3].map((l) => lst.filter((x) => x === l).length).join('-');
  const usual = {}; last5.forEach((m) => { const f = form(m.lineups[side(m)].filter((p) => p.starter && p.pos !== 'GK').map((p) => T2_LINE(p.pos))); usual[f] = (usual[f] || 0) + 1; });
  return { ms, last5, P, XI, out, form: form(XI.filter((x) => x.r.line).map((x) => x.r.line)), usual: Object.entries(usual).sort((a, b) => b[1] - a[1])[0][0], side };
}
function t2LineupPage(team) {
  const L = t2Lineup(team);
  if (!L) return '<div class="card"><p class="muted">No match with a line-up for this team.</p></div>';
  const n = L.last5.length, col = (s) => (s >= n - 1 ? '#1d7a35' : s >= Math.ceil(n / 2) ? '#9a5b00' : '#b02a2a');
  const chip = (x) => `<div class="lu-pl${x.why ? ' ch' : ''}" title="${escapeHtml(`${x.r.p.first} ${x.r.p.name} · ${x.r.main} · started ${x.r.starts} of the last ${n} · ${x.r.min} min${x.why ? ' · ' + x.why : ''}`)}"><b>${x.r.p.num}</b><span>${escapeHtml(x.r.p.name)}</span><small style="color:${col(x.r.starts)}">${x.r.starts}/${n}${x.why ? ' · new' : ''}</small></div>`;
  const pitch = `<div class="lu-pitch">${[3, 2, 1, 0].map((l) => `<div class="lu-row">${L.XI.filter((x) => x.r.line === l).map(chip).join('')}</div>`).join('')}</div>`;
  const chg = L.XI.filter((x) => x.why);
  const outs = [...L.out.entries()].map(([k, why]) => `<li><b>${escapeHtml(L.P[k] ? L.P[k].p.name : k)}</b> — ${escapeHtml(why)}</li>`).join('');
  const rows = Object.values(L.P).sort((a, b) => b.starts - a.starts || b.min - a.min).map((r) => `<tr class="${L.XI.some((x) => x.r === r) ? 'on' : ''}"><td class="l"><b>${r.p.num}</b> ${escapeHtml(r.p.first)} <b>${escapeHtml(r.p.name)}</b></td><td>${escapeHtml(r.main || '')}</td><td>${r.starts}/${n}</td><td>${r.apps}</td><td>${r.min}'</td><td>${r.lastXI ? '✓' : ''}</td><td>${L.out.has(`${r.p.first} ${r.p.name}`) ? `<span class="tg ko">${escapeHtml(L.out.get(`${r.p.first} ${r.p.name}`))}</span>` : ''}</td></tr>`).join('');
  const m0 = L.ms[0], opp = m0.home === team ? m0.away : m0.home;
  return `<div class="grid2"><div class="card"><h3>Predicted line-up <small>${L.form} · usual ${L.usual} over the last ${n} matches</small></h3>${pitch}
        <p class="muted" style="font-size:12px;margin:6px 0 0">From his last XI (${t2day(m0.date)} v ${escapeHtml(opp)}) · x/${n} = starts in the last ${n} matches · "new" = replaces a player out, by the most frequent starter of the same line.</p></div>
      <div class="card"><h3>Changes</h3>${chg.length ? `<ul class="lu-ul">${chg.map((x) => `<li><b>${escapeHtml(x.r.p.name)}</b> ${escapeHtml(x.why)}</li>`).join('')}</ul>` : '<p class="muted">Same XI as the last match.</p>'}
        <h3 style="margin-top:10px">Out</h3>${outs ? `<ul class="lu-ul">${outs}</ul>` : '<p class="muted">Nobody known.</p>'}
        <p class="muted" style="font-size:12px">${team === T2_US ? 'Our players: their Workload status of today (injured, rehab, sick, national team) and a red card in the last match.' : 'Other teams: only a red card in the last match is known — injuries and yellow-card bans are not in the files.'} Rotation risk: a player in the XI with few starts (orange / red).</p></div></div>
    <div class="card"><h3>Starts in the last ${n} matches <small>${L.last5.map((m) => `${t2day(m.date)} ${m.home === team ? 'v' : '@'} ${escapeHtml(m.home === team ? m.away : m.home)}`).join(' · ')}</small></h3>
      <div class="tc-scroll"><table class="tt-tbl"><thead><tr><th class="l">Player</th><th>Position</th><th>Starts</th><th>Played</th><th>Minutes</th><th>Last XI</th><th>Out</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ------------------------------------------------------------------ Matches: goals, team numbers, effective time, line-ups
function t2GoalGoals(om, mom) {
  if (!om) return [];
  const H = om.home, A = om.away, shots = mom.filter((x) => x.c === 'shot' && x.tag === 'goal');
  return om.timeline.filter((e) => ['goal', 'pen', 'og'].includes(e.type)).map((e) => {
    const team = e.type === 'og' ? (e.side === 'home' ? A : H) : (e.side === 'home' ? H : A);
    const at = (x) => (x.h === 2 ? (om.length && om.length.h1) || 45 : 0) + (x.a + (T2_PRE.shot || 0)) / 60000; // the timeline's clock runs on through the first half's added time
    const x = shots.filter((s) => s.t === team).map((s) => [Math.abs(at(s) - e.c), s]).sort((a, b) => a[0] - b[0])[0];
    return { e, team, mo: x && x[0] <= 3 ? x[1] : null };
  });
}
function t2MatchExtras(om, goals) {
  if (!om) return '<div class="card"><p class="muted">No match sheet for this match.</p></div>';
  const g = goals.map((x, i) => `<button class="gl-b ${x.e.side}" ${x.mo ? `data-goal="${i}"` : 'disabled title="no clip for this goal"'}>${x.mo ? '▶' : '⚽'} <b>${escapeHtml(x.e.m)}</b> ${escapeHtml(x.e.player || '')}${x.e.type === 'pen' ? ' (p)' : x.e.type === 'og' ? ' (og)' : ''} <small>${crestHtml(x.team, 14)} ${x.e.score ? x.e.score.join('–') : ''}${x.e.assist ? ' · ' + escapeHtml(x.e.assist) : ''}</small></button>`).join('');
  return `<div class="card"><h3>Goals <small>click: the goal in 2D below${goals.some((x) => !x.mo) ? ' · ⚽ = no clip (no tracking, or an own goal)' : ''}</small></h3><div class="gl-row">${g || '<span class="muted">0–0</span>'}</div></div>
    <div class="t2-old"><div class="tt-two">${tcEffective(om)}${tcStats(om)}</div>${tcLineups(om)}</div>`;
}

// ------------------------------------------------------------------ bindings of the moved parts
function t2BindX() {
  const v = document.getElementById('t2-rdvs'); if (v) v.onchange = () => { T2X.rdvs = v.value; t2Redraw(); };
  document.querySelectorAll('#t2-body [data-def]').forEach((b) => { if (b.closest('.rd-row, .rd-two')) b.onclick = () => { const k = b.dataset.def; TC.rd.open.has(k) ? TC.rd.open.delete(k) : TC.rd.open.add(k); t2Redraw(); }; });
}
