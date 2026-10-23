/* Tactical tab — the admin only (2026-10-23), from the match files he drops on Admin › Match files (event XML + 10 fps
 * tracking; payload "tactical", served to the admin only, and the Match 2D files of /api/tactical-2d).
 *   Al Gharafa  our season: the matches with their numbers, two trends; a click opens the match sheet below
 *   League      every team from the files (a table built from them), a team's matches, then the match sheet
 *   Team style  each QSL team against the league average or another team: overview, with the ball, without the ball
 *               (centre = the fewest, dotted ring = the league average, edge = the most; tables = season totals)
 *   Match 2D    our matches with a tracking: the key moments (shots, high regains) and each player's sprints in 2D */
const TC = { s: 'us', id: null, team: 'Al Gharafa', rd: { team: 'Al Gharafa', vs: 'league', open: new Set() }, data: null };
const TC_US = 'Al Gharafa';
const TC_ICON = { goal: '⚽', pen: '⚽', og: '⚽', yellow: '🟨', red: '🟥', sub: '⇄' };
const TC_SECTIONS = [['us', 'Al Gharafa'], ['league', 'League'], ['style', 'Team style'], ['2d', 'Match 2D']];

function renderTactical() {
  const root = document.getElementById('view-tactical');
  root.innerHTML = `${pageHead('Admin', 'Tactical', 'tc-sub', `<span class="tc-lock">🔒 only you can see this tab</span>${segHtml('tc-seg', TC_SECTIONS, TC.s)}`)}<div id="tc-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  root.querySelectorAll('#tc-seg button').forEach((b) => b.addEventListener('click', () => { TC.s = b.dataset.v; root.querySelectorAll('#tc-seg button').forEach((x) => x.classList.toggle('active', x === b)); drawTactical(); }));
  loadData('tactical').then((d) => { TC.data = d; const m = (d.matches || []).find(tcOurs); TC.id = m ? m.id : ((d.matches || [])[0] || {}).id; drawTactical(); })
    .catch((err) => { document.getElementById('tc-body').innerHTML = loadError(err); });
}
function drawTactical() {
  const d = TC.data, box = document.getElementById('tc-body');
  if (!d || !box) return;
  const M = d.matches || [];
  document.getElementById('tc-sub').textContent = `${M.length} matches with an XML · ${M.filter((m) => m.tracking).length} with a tracking`;
  if (TC.s !== '2d') AM2.stop();
  if (TC.s === 'style') { box.innerHTML = d.radar ? tcStyle() : emptyState('No QSL match read yet'); tcStyleBind(); return; }
  if (TC.s === '2d') { tc2d(box); return; }
  if (!M.length) { box.innerHTML = emptyState('No match file yet — drop them on Admin › Match files'); return; }
  const sel = M.find((m) => m.id === TC.id) || M[0];
  box.innerHTML = TC.s === 'league' ? tcLeague(M, sel, TC.team) : tcSeason(M, sel);
  box.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => { TC.id = b.dataset.id; drawTactical(); document.getElementById('tc-match').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  box.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => { TC.team = b.dataset.team; const m = M.find((x) => x.home === TC.team || x.away === TC.team); if (m) TC.id = m.id; drawTactical(); }));
}

// ---------------------------------------------------------------- match sheet (shared)
const tcOurs = (m) => m.home === TC_US || m.away === TC_US;
const tcRes = (m) => { if (!tcOurs(m)) return ''; const us = m.home === TC_US ? m.score[0] : m.score[1], th = m.home === TC_US ? m.score[1] : m.score[0]; return us > th ? 'W' : us < th ? 'L' : 'D'; };
const tcDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
function tcHeader(m) {
  const sc = (side) => m.timeline.filter((x) => ['goal', 'pen', 'og'].includes(x.type) && x.side === side).map((x) => `${escapeHtml(x.player)} ${x.m}${x.type === 'pen' ? ' (p)' : x.type === 'og' ? ' (og)' : ''}${x.assist ? ` <small>· ${escapeHtml(x.assist)}</small>` : ''}`).join('<br>');
  return `<div class="tt-hd"><div class="tt-team">${crestHtml(m.home, 44)}<b>${escapeHtml(m.home)}</b></div>
    <div class="tt-score"><div class="tt-sc"><span>${m.score[0]}</span><i>–</i><span>${m.score[1]}</span></div><small>${escapeHtml(m.competition)}${m.round && m.round !== '0' ? ' · R' + escapeHtml(m.round) : ''} · ${tcDay(m.date)}${m.time ? ' · ' + m.time : ''}</small><small>${escapeHtml(m.stadium || '')}</small></div>
    <div class="tt-team r">${crestHtml(m.away, 44)}<b>${escapeHtml(m.away)}</b></div></div>
    <div class="tt-scorers"><div>${sc('home')}</div><div class="r">${sc('away')}</div></div>`;
}
function tcTimeline(m) {
  const end = m.length.h1 + m.length.h2, x = (c) => (c / end * 100).toFixed(2);
  const ev = m.timeline.map((e) => `<i class="tt-ev ${e.side} ${e.type}" style="left:${x(e.c)}%" title="${escapeHtml(`${e.m} ${e.type === 'sub' ? `${e.in} for ${e.out}` : e.player}`)}">${TC_ICON[e.type] || '•'}</i>`).join('');
  return `<div class="tt-card"><h4>Timeline</h4><div class="tt-tl"><u style="left:${x(m.length.h1)}%"></u>${ev}<span class="a">0'</span><span class="b" style="left:${x(m.length.h1)}%">HT</span><span class="c">FT</span></div></div>`;
}
function tcPitch(list, side) {
  const XI = list.filter((p) => p.starter), line = (p) => (p.pos === 'GK' ? 0 : ['CD', 'WD'].includes(p.pos) ? 1 : ['DM', 'CM', 'AM', 'WM'].includes(p.pos) ? 2 : 3);
  const chip = (p) => `<div class="tt-pl"><b>${p.num}</b><span>${escapeHtml(p.name)}</span>${p.g ? '<em>⚽</em>' : ''}${p.y ? '<em>🟨</em>' : ''}${p.r ? '<em>🟥</em>' : ''}${p.out ? `<small>↓${p.out}'</small>` : ''}</div>`;
  return `<div class="tt-pitch ${side}">${[0, 1, 2, 3].map((l) => `<div class="tt-row">${XI.filter((p) => line(p) === l).map(chip).join('')}</div>`).join('')}</div>`;
}
const tcBench = (list) => `<div class="tt-bench">${list.filter((p) => !p.starter && p.min > 0).map((p) => `<span><b>${p.num}</b> ${escapeHtml(p.name)} <small>↑${p.in}'</small>${p.g ? ' ⚽' : ''}</span>`).join('') || '<span class="muted">no substitution</span>'}</div>`;
function tcLineups(m) {
  return `<div class="tt-card"><h4>Line-ups <small>starting XI by line · ↓ minute off · ↑ minute on</small></h4><div class="tt-two">
    <div><div class="tt-side">${crestHtml(m.home, 20)}${escapeHtml(m.home)}</div>${tcPitch(m.lineups.home, 'h')}${tcBench(m.lineups.home)}</div>
    <div><div class="tt-side">${crestHtml(m.away, 20)}${escapeHtml(m.away)}</div>${tcPitch(m.lineups.away, 'a')}${tcBench(m.lineups.away)}</div></div></div>`;
}
function tcEffective(m) {
  const e = m.effective, bar = (b) => `<div class="tt-blk" title="${b.min.toFixed(1)} of ${b.of.toFixed(1)} min"><i style="height:${Math.min(100, b.min / 10 * 100)}%"></i><span>${b.min.toFixed(1)}</span><small>${b.from}'</small></div>`;
  return `<div class="tt-card"><h4>Effective playing time <small>ball in play, from the phases of play</small></h4>
    <div class="tt-eff"><div class="tt-big"><b>${e.total.toFixed(1)}</b><span>min in play</span><small>1st half ${e.halves['1'].toFixed(1)} · 2nd half ${e.halves['2'].toFixed(1)}</small></div>
    <div class="tt-blks">${e.blocks.filter((b) => b.half === 1).map(bar).join('')}<i class="sep"></i>${e.blocks.filter((b) => b.half === 2).map(bar).join('')}</div></div>
    ${e.poss_pct ? `<div class="tt-poss"><span style="width:${e.poss_pct.home}%">${e.poss_pct.home}%</span><span style="width:${e.poss_pct.away}%">${e.poss_pct.away}%</span></div><p class="tt-note">time on the ball within the play — ${escapeHtml(m.home)} ${e.poss.home.toFixed(1)}' · ${escapeHtml(m.away)} ${e.poss.away.toFixed(1)}'</p>` : ''}</div>`;
}
function tcStats(m) {
  const K = [['shots', 'Shots'], ['on_target', 'On target'], ['passes', 'Passes'], ['crosses', 'Crosses'], ['corners', 'Corners'], ['fouls', 'Fouls'], ['offsides', 'Offsides'], ['yellow', 'Yellow cards']];
  return `<div class="tt-card"><h4>Team numbers</h4>${K.map(([k, l]) => { const a = m.stats.home[k] || 0, b = m.stats.away[k] || 0, t = a + b || 1;
    return `<div class="tt-st"><b>${a}</b><div><i class="h" style="width:${a / t * 100}%"></i><i class="a" style="width:${b / t * 100}%"></i></div><b>${b}</b><span>${l}</span></div>`; }).join('')}</div>`;
}
const tcMatch = (m) => `<div class="tt-match" id="tc-match">${tcHeader(m)}${tcTimeline(m)}<div class="tt-two">${tcEffective(m)}${tcStats(m)}</div>${tcLineups(m)}</div>`;

// ---------------------------------------------------------------- Al Gharafa · League
function tcSeason(M, sel) {
  const ms = M.filter(tcOurs).slice().reverse(), W = 100 / Math.max(1, ms.length);
  const ch = (f, l, u, mx) => `<div class="tt-card"><h4>${l}</h4><div class="tt-trend">${ms.map((m) => { const v = f(m); return `<div style="width:${W}%" title="${escapeHtml(m.home + ' – ' + m.away)}"><i class="r${tcRes(m)}" style="height:${v / mx * 100}%"></i><span>${v}${u}</span><small>${crestHtml(m.home === TC_US ? m.away : m.home, 18)}</small></div>`; }).join('')}</div></div>`;
  const rows = M.filter(tcOurs).map((m) => { const h = m.home === TC_US, op = h ? m.away : m.home, us = h ? 'home' : 'away';
    return `<tr data-id="${m.id}" class="${m.id === sel.id ? 'on' : ''}"><td>${tcDay(m.date)}</td><td>${escapeHtml(m.competition)}</td><td class="l">${crestHtml(op, 18)} ${h ? '' : '@ '}${escapeHtml(op)}</td><td><em class="tc-r r${tcRes(m)}">${tcRes(m)}</em> ${m.score[h ? 0 : 1]}–${m.score[h ? 1 : 0]}</td><td>${m.effective.total.toFixed(0)}'</td><td>${m.effective.poss_pct ? m.effective.poss_pct[us] + '%' : '—'}</td><td>${m.stats[us].shots || 0}</td><td>${m.stats[us].on_target || 0}</td><td>${m.stats[us].passes || 0}</td><td>${m.tracking ? '✓' : ''}</td></tr>`; }).join('');
  return `<div class="tt-b"><div class="tt-two">${ch((m) => Math.round(m.effective.total), 'Effective playing time per match', "'", 80)}${ch((m) => (m.effective.poss_pct || {})[m.home === TC_US ? 'home' : 'away'] || 0, 'Our share of the ball', '%', 100)}</div>
    <div class="tt-card"><h4>Al Gharafa's matches <small>click a match</small></h4><div class="tc-scroll"><table class="tt-tbl"><thead><tr><th>Date</th><th>Comp.</th><th class="l">Opponent</th><th>Result</th><th>In play</th><th>Ball</th><th>Shots</th><th>On target</th><th>Passes</th><th>Tracking</th></tr></thead><tbody>${rows}</tbody></table></div></div>${tcMatch(sel)}</div>`;
}
function tcLeague(M, sel, team) {
  const T = {};
  M.filter((m) => m.competition === 'QSL').forEach((m) => ['home', 'away'].forEach((s) => { const n = m[s], t = T[n] || (T[n] = { n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, eff: 0, ball: 0, sh: 0 });
    const gf = m.score[s === 'home' ? 0 : 1], ga = m.score[s === 'home' ? 1 : 0]; t.p++; t.gf += gf; t.ga += ga; t[gf > ga ? 'w' : gf < ga ? 'l' : 'd']++; t.eff += m.effective.total; t.ball += (m.effective.poss_pct || {})[s] || 0; t.sh += m.stats[s].shots || 0; }));
  const rows = Object.values(T).sort((a, b) => (b.w * 3 + b.d) - (a.w * 3 + a.d) || (b.gf - b.ga) - (a.gf - a.ga)).map((t) => `<tr data-team="${escapeHtml(t.n)}" class="${t.n === team ? 'on' : ''}${t.n === TC_US ? ' us' : ''}"><td class="l">${crestHtml(t.n, 18)} ${escapeHtml(t.n)}</td><td>${t.p}</td><td>${t.w}-${t.d}-${t.l}</td><td>${t.gf}:${t.ga}</td><td><b>${t.w * 3 + t.d}</b></td><td>${(t.eff / t.p).toFixed(0)}'</td><td>${(t.ball / t.p).toFixed(0)}%</td><td>${(t.sh / t.p).toFixed(1)}</td></tr>`).join('');
  const tm = M.filter((m) => m.home === team || m.away === team);
  return `<div class="tt-c"><div class="tt-two w"><div class="tt-card"><h4>League — from the files you have <small>${M.filter((m) => m.competition === 'QSL').length} QSL matches · click a team</small></h4><div class="tc-scroll"><table class="tt-tbl"><thead><tr><th class="l">Team</th><th>P</th><th>W-D-L</th><th>Goals</th><th>Pts</th><th>In play</th><th>Ball</th><th>Shots</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="tt-card tc-list"><h4>${crestHtml(team, 22)} ${escapeHtml(team)} — its matches</h4>${tm.map((m) => `<button class="tt-li${m.id === sel.id ? ' on' : ''}" data-id="${m.id}"><small>${tcDay(m.date)} · ${escapeHtml(m.competition)}</small><span>${escapeHtml(m.home)} <b>${m.score[0]}–${m.score[1]}</b> ${escapeHtml(m.away)}</span></button>`).join('')}</div></div>${tcMatch(sel)}</div>`;
}

// ---------------------------------------------------------------- Team style (radar)
const RD_AX = { G: ['goals_for', 'goals_against', 'sp_goals', 'shots', 'crosses', 'passes', 'tempo', 'recovery_height', 'fouls'],
  C1: ['possession', 'tempo', 'passes', 'final_third', 'shots'], C2: ['block_height', 'block_length', 'line_gap', 'recovery_height', 'high_regains', 'press', 'shots_against', 'xg_against'] };
const RD_GOOD_HIGH = new Set(['goals_for', 'sp_goals', 'shots', 'xg', 'final_third', 'high_regains']), RD_GOOD_LOW = new Set(['goals_against', 'shots_against', 'xg_against']);
const RD_MID = 0.55, RD_LO = 0.12;
function rdFmt(k, v) {
  if (v == null) return '—';
  if (k === 'press') return (1 / v).toFixed(1) + ' PPDA';
  if (['tempo', 'xg', 'xg_against', 'goals_for', 'goals_against', 'sp_goals'].includes(k)) return v.toFixed(2);
  if (k === 'possession') return Math.round(v) + '%';
  if (['recovery_height', 'block_height', 'block_length', 'line_gap'].includes(k)) return v.toFixed(1) + ' m';
  return v.toFixed(1);
}
function rdR(R, k, v) { // centre = the league's lowest team, middle ring = the league average, edge = the highest
  const lo = R.lo[k], hi = R.hi[k], av = R.league[k];
  if (v == null) return RD_LO;
  if (v <= av) return av > lo ? RD_LO + (RD_MID - RD_LO) * (v - lo) / (av - lo) : RD_MID;
  return hi > av ? RD_MID + (1 - RD_MID) * (v - av) / (hi - av) : RD_MID;
}
function rdRadar(R, keys, team, vs, size = 460) {
  keys = keys.filter((k) => R.keys[k]);
  const N = Object.keys(R.teams).length, c = size / 2, rad = size / 2 - 78, n = keys.length, ang = (i) => -Math.PI / 2 + i * 2 * Math.PI / n, P = (i, f) => [c + Math.cos(ang(i)) * rad * f, c + Math.sin(ang(i)) * rad * f];
  const poly = (vals, cls) => `<polygon class="${cls}" points="${vals.map((f, i) => P(i, f).join(',')).join(' ')}"/>`;
  let s = `<svg class="rd-svg" viewBox="-80 0 ${size + 160} ${size}">`;
  [RD_LO, RD_MID, 1].forEach((f) => { s += `<polygon points="${keys.map((_, i) => P(i, f).join(',')).join(' ')}" fill="none" stroke="${f === RD_MID ? 'var(--ink-muted)' : 'var(--hairline)'}" stroke-width="1" ${f === RD_MID ? 'stroke-dasharray="2 3" opacity=".6"' : ''}/>`; });
  s += `<text x="${c + 4}" y="${c - rad * RD_MID - 4}" font-size="10.5" fill="var(--ink-muted)">league avg</text>`;
  keys.forEach((_, i) => { const [x, y] = P(i, 1); s += `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="var(--hairline)"/>`; });
  const other = vs === 'league' ? R.league : R.teams[vs];
  s += poly(keys.map((k) => rdR(R, k, other[k])), 'rd-vs') + poly(keys.map((k) => rdR(R, k, R.teams[team][k])), 'rd-me');
  keys.forEach((k, i) => { const [x, y] = P(i, rdR(R, k, R.teams[team][k])); s += `<circle cx="${x}" cy="${y}" r="4.5" fill="#1f3a9e" stroke="#fff" stroke-width="1.5"/>`; });
  keys.forEach((k, i) => { const [x, y] = P(i, 1.2), a = Math.abs(Math.cos(ang(i))) < 0.2 ? 'middle' : Math.cos(ang(i)) > 0 ? 'start' : 'end', rk = (R.rank[k] || {})[team];
    s += `<text x="${x}" y="${y - 8}" text-anchor="${a}" font-size="15" font-weight="700" fill="currentColor">${R.keys[k][0]}</text>
      <text x="${x}" y="${y + 10}" text-anchor="${a}" font-size="13.5" fill="#1f3a9e" font-weight="700">${rdFmt(k, R.teams[team][k])} <tspan fill="var(--ink-muted)" font-weight="500">· ${rk || '—'}${rk === 1 ? 'st' : rk === 2 ? 'nd' : rk === 3 ? 'rd' : rk ? 'th' : ''}/${N}</tspan></text>`; });
  return s + '</svg>';
}
function rdTable(R, keys, team, vs) {
  keys = keys.filter((k) => R.keys[k]);
  const N = Object.keys(R.teams).length, n = R.teams[team].n, counted = new Set(R.counted), other = vs === 'league' ? R.league : R.teams[vs];
  const tot = (k, v) => (v == null ? '—' : ['xg', 'xg_against'].includes(k) ? v.toFixed(1) : String(Math.round(v)));
  return `<table class="rd-tbl"><thead><tr><th>Metric</th><th>${escapeHtml(team)}<small>season · ${n} matches</small></th><th>${vs === 'league' ? 'League avg' : escapeHtml(vs)}<small>${vs === 'league' ? 'over ' + n + ' matches' : 'season · ' + R.teams[vs].n + ' matches'}</small></th><th>Rank</th></tr></thead><tbody>${keys.map((k) => {
    const rk = (R.rank[k] || {})[team];
    const me = counted.has(k) ? `<b>${tot(k, R.totals[team][k])}</b><small>${rdFmt(k, R.teams[team][k])} / match</small>` : `<b>${rdFmt(k, R.teams[team][k])}</b><small>average</small>`;
    const ot = counted.has(k) ? `${tot(k, vs === 'league' ? other[k] * n : R.totals[vs][k])}<small>${rdFmt(k, other[k])} / match</small>` : `${rdFmt(k, other[k])}<small>average</small>`;
    const col = RD_GOOD_HIGH.has(k) ? (rk <= 3 ? 't' : rk >= N - 2 ? 'b' : 'm') : RD_GOOD_LOW.has(k) ? (rk >= N - 2 ? 't' : rk <= 3 ? 'b' : 'm') : 'm';
    return `<tr><td><b>${R.keys[k][0]}</b><button class="rd-i ${TC.rd.open.has(k) ? 'on' : ''}" data-def="${k}" title="How it is calculated">i</button><small>${R.keys[k][1]}</small></td><td>${me}</td><td>${ot}</td><td><span class="rd-rk ${col}">${rk || '—'}/${N}</span><small>${rk === 1 ? 'the most' : rk === N ? 'the fewest' : ''}</small></td></tr>`
      + (TC.rd.open.has(k) ? `<tr class="rd-def"><td colspan="4"><div>${R.defs[k] || ''}</div></td></tr>` : ''); }).join('')}</tbody></table>`;
}
function tcStyle() {
  const R = TC.data.radar, S = TC.rd, teams = Object.keys(R.teams).sort();
  if (!R.teams[S.team]) S.team = teams[0];
  if (S.vs !== 'league' && !R.teams[S.vs]) S.vs = 'league';
  const opt = (sel, xs) => xs.map((t) => `<option ${t === sel ? 'selected' : ''} value="${escapeHtml(t)}">${t === 'league' ? 'League average' : escapeHtml(t)}</option>`).join('');
  return `<section class="panel rd-top"><select class="select" id="rd-team">${opt(S.team, teams)}</select><span class="muted">vs</span><select class="select" id="rd-vs">${opt(S.vs, ['league', ...teams.filter((t) => t !== S.team)])}</select>
      <span class="rd-lg"><span><i style="background:#1f3a9e"></i>${escapeHtml(S.team)}</span><span><i style="background:#9a9aa5"></i>${S.vs === 'league' ? 'league average' : escapeHtml(S.vs)}</span></span>
      <p class="rd-note">QSL · ${R.n_matches} matches with an XML · every axis the same way: centre = the league's lowest team · dotted ring = league average · edge = the highest · the radar is per match, the tables give the season totals · rank 1 = the most · ⓘ = how it is calculated</p></section>
    <section class="panel"><div class="rd-hd"><span class="rd-k">Overview</span><small>results, set pieces and style · ${R.teams[S.team].n} matches</small></div><div class="rd-row"><div>${rdRadar(R, RD_AX.G, S.team, S.vs)}</div><div>${rdTable(R, RD_AX.G, S.team, S.vs)}</div></div></section>
    <div class="rd-two"><section class="panel"><span class="rd-k">With the ball</span>${rdRadar(R, RD_AX.C1, S.team, S.vs, 420)}${rdTable(R, RD_AX.C1, S.team, S.vs)}</section>
      <section class="panel"><span class="rd-k">Without the ball</span>${rdRadar(R, RD_AX.C2, S.team, S.vs, 440)}${rdTable(R, RD_AX.C2, S.team, S.vs)}</section></div>`;
}
function tcStyleBind() {
  const box = document.getElementById('tc-body');
  box.querySelectorAll('[data-def]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.def; TC.rd.open.has(k) ? TC.rd.open.delete(k) : TC.rd.open.add(k); drawTactical(); }));
  const t = document.getElementById('rd-team'), v = document.getElementById('rd-vs');
  if (t) t.addEventListener('change', () => { TC.rd.team = t.value; if (TC.rd.vs === TC.rd.team) TC.rd.vs = 'league'; drawTactical(); });
  if (v) v.addEventListener('change', () => { TC.rd.vs = v.value; drawTactical(); });
}

// ---------------------------------------------------------------- Match 2D
const AM2_COL = [{ f: '#f5c518', k: '#16269e', gk: '#1f2937', gkk: '#f5c518' }, { f: '#d63b3b', k: '#fff', gk: '#7c3aed', gkk: '#fff' }];
const AM2_FILTERS = [['all', 'All', () => true], ['us', 'Our shots', (c) => c.type === 'shot' && c.t === 0], ['op', 'Shots conceded', (c) => c.type === 'shot' && c.t === 1],
  ['regain', 'High regains', (c) => c.type === 'regain' || c.regain], ['big', 'Chances xG ≥ 0.10', (c) => c.xg >= 0.1]];
const AM2_KIND = { 'With the ball': '#2a78d6', 'Run in behind': '#7c3aed', 'Support run': '#0ca30c', Pressing: '#e5484d', 'Recovery run': '#e09a00', 'Defensive run': '#898781', 'Loose ball': '#b5b4aa' };
const AM2 = { files: {}, match: null, d: null, mode: 'tac', c: 0, t: 0, play: false, sp: 1, f: 'all', pl: null, opt: { trails: true, names: true, line: true, block: false }, last: null, raf: null, cv: null, cx: null,
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.last = null; } };

async function am2Fetch(id) {
  if (AM2.files[id]) return AM2.files[id];
  const local = AUTH.demo && /^(localhost|127\.0\.0\.1)$/.test(location.hostname); // local development: the files the build made on this PC
  const r = local ? await fetch(`../sync/out/t2d/${encodeURIComponent(id)}.json.gz`, { cache: 'no-store' }) : await fetch(`/api/tactical-2d?match=${encodeURIComponent(id)}`, { headers: cfHeaders() });
  if (!r.ok) throw new Error(`2D file ${r.status}`);
  const j = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  AM2.files[id] = j;
  return j;
}
function tc2d(box) {
  const M = TC.data.matches || [], ids = TC.data.t2d || [];
  const list = ids.map((id) => M.find((m) => m.id === id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) { box.innerHTML = emptyState('No match with a tracking file yet — drop the XML and the tracking on Admin › Match files'); return; }
  if (!AM2.match || !ids.includes(AM2.match)) AM2.match = list[0].id;
  box.innerHTML = `<section class="panel am-hd"><select class="select" id="am-match">${list.map((m) => `<option value="${m.id}" ${m.id === AM2.match ? 'selected' : ''}>${tcDay(m.date)} · ${escapeHtml(m.home)} ${m.score[0]}–${m.score[1]} ${escapeHtml(m.away)} · ${escapeHtml(m.competition)}</option>`).join('')}</select>
    ${segHtml('am-mode', [['tac', 'Tactical'], ['phys', 'Physical']], AM2.mode)}<span class="am-cap">tracking 10 fps · ${escapeHtml(TC_US)} always attack →</span></section><div id="am-body"><div class="panel"><div class="empty">Loading the 2D clips…</div></div></div>`;
  document.getElementById('am-match').addEventListener('change', (e) => { AM2.match = e.target.value; AM2.pl = null; am2Load(); });
  box.querySelectorAll('#am-mode button').forEach((b) => b.addEventListener('click', () => { AM2.mode = b.dataset.v; box.querySelectorAll('#am-mode button').forEach((x) => x.classList.toggle('active', x === b)); am2Render(); am2Open(); }));
  am2Load();
}
async function am2Load() {
  const body = document.getElementById('am-body');
  AM2.stop();
  try { AM2.d = await am2Fetch(AM2.match); } catch (err) { body.innerHTML = loadError(err); return; }
  if (!AM2.pl || !AM2.d.phys.players.some((p) => p.n === AM2.pl)) AM2.pl = (AM2.d.phys.players[0] || {}).n;
  am2Render(); am2Open();
}
const am2Arr = () => (AM2.mode === 'phys' ? AM2.d.phys.clips : AM2.d.clips);
const am2List = () => am2Arr().map((c, i) => [c, i]).filter(([c]) => (AM2.mode === 'phys' ? c.who === AM2.pl : AM2_FILTERS.find((f) => f[0] === AM2.f)[2](c)));
const am2Min = (c) => `${Math.floor(c.minute) + 1}'`;
function am2Items() {
  if (AM2.mode === 'phys') return am2List().map(([c, i]) => `<button class="am-li" data-i="${i}"><span class="t">${am2Min(c)}</span><span class="am-kd" style="background:${AM2_KIND[c.kind]}"></span><span><b>${c.kind}</b><small>${c.dist} m · ${c.dur} s</small></span><span class="am-xg">${c.top ? '⚡ ' : ''}${c.vmax}</span></button>`).join('') || emptyState('No sprint');
  return am2List().map(([c, i]) => `<button class="am-li" data-i="${i}"><span class="t">${am2Min(c)}</span><span class="am-ic ${c.t ? 'op' : 'us'}">${c.kind === 'goal' ? '⚽' : c.type === 'regain' ? '↺' : c.kind === 'on' ? '◎' : '○'}</span><span><b>${c.label}</b><small>${escapeHtml(c.who)}</small></span><span class="am-xg">${c.xg != null ? c.xg.toFixed(2) : ''}</span></button>`).join('') || emptyState('No moment');
}
function am2Render() {
  const d = AM2.d, phys = AM2.mode === 'phys', body = document.getElementById('am-body');
  if (!d || !body) return;
  let aside;
  if (phys) {
    const P = d.phys.players, me = P.find((p) => p.n === AM2.pl) || { n: '', sprints: 0 };
    const kinds = Object.keys(AM2_KIND).map((k) => [k, am2List().filter(([c]) => c.kind === k).length]).filter((q) => q[1]);
    aside = `<div class="am-side"><section class="panel am-pls"><span class="am-k" title="${escapeHtml(d.phys.rule)}">Players · sprints ≥ 25 km/h</span><div class="am-pl h"><span></span><span></span><span>Spr.</span><span>Top · GPS</span></div>
      ${P.map((p) => `<button class="am-pl ${p.n === AM2.pl ? 'on' : ''}" data-pl="${escapeHtml(p.n)}"><span class="nm">${p.num}</span><span><b>${escapeHtml(p.n)}</b><small>${p.min} min · ${p.dist} m</small></span><span>${p.sprints}</span><span>${p.top}<small>${p.gps_top != null ? p.gps_top : '—'}</small></span></button>`).join('')}</section>
      <section class="panel am-list"><span class="am-k">${escapeHtml(me.n)} · ${me.sprints} sprints</span><div class="am-kinds">${kinds.map(([k, n]) => `<span><i style="background:${AM2_KIND[k]}"></i>${k} ${n}</span>`).join('')}</div>${am2Items()}</section></div>`;
  } else {
    aside = `<div class="am-side"><section class="panel am-list"><div class="am-chips">${AM2_FILTERS.map(([k, l, fn]) => `<button class="am-chip ${k === AM2.f ? 'on' : ''}" data-f="${k}">${l}<small>${d.clips.filter(fn).length}</small></button>`).join('')}</div><span class="am-k">${am2List().length} moments</span>${am2Items()}</section></div>`;
  }
  body.innerHTML = `<div class="am-a">${aside}<section class="panel am-stage"><div class="am-sb"><span class="ttl" id="am-ttl"></span><span class="am-sbr">${phys ? '<span class="am-now" id="am-now"></span>' : ''}<span class="am-clk" id="am-clk"></span></span></div>
    <canvas id="am-cv" width="1100" height="740"></canvas>${phys ? '<svg class="am-spd" id="am-spd" viewBox="0 0 1000 110"></svg>' : ''}
    <div class="am-ctrl"><button class="am-btn" id="am-play">▶</button><button class="am-btn g" id="am-back">−5 s</button><div class="am-bar"><input type="range" id="am-seek" min="0" max="16000" step="10" value="0"><i id="am-mk">▼</i></div>
      <button class="am-btn g" data-sp="0.5">×0.5</button><button class="am-btn g on" data-sp="1">×1</button><button class="am-btn g" data-sp="2">×2</button></div>
    <div class="am-ctrl">${['trails', 'names', 'line', 'block'].map((k) => `<button class="am-btn g ${AM2.opt[k] ? 'on' : ''}" data-opt="${k}">${{ trails: 'Trails', names: 'Names', line: 'Defensive line', block: 'Team block' }[k]}</button>`).join('')}
      <span class="am-cap">${phys ? 'his run: bright = the sprint itself · dashed line = their last line' : 'ring = player on the ball · dashed line = the defending team\'s last line'}</span></div></section></div>`;
  AM2.cv = document.getElementById('am-cv'); AM2.cx = AM2.cv.getContext('2d');
  body.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => { am2Clip(+el.dataset.i); am2Play(true); }));
  body.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('click', () => { AM2.f = el.dataset.f; am2Render(); am2Open(); }));
  body.querySelectorAll('[data-pl]').forEach((el) => el.addEventListener('click', () => { AM2.pl = el.dataset.pl; am2Render(); am2Open(); }));
  document.getElementById('am-play').onclick = () => am2Play(!AM2.play);
  document.getElementById('am-back').onclick = () => { AM2.t = Math.max(0, AM2.t - 5000); am2Draw(); };
  document.getElementById('am-seek').oninput = (e) => { AM2.t = +e.target.value; am2Draw(); };
  body.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => { AM2.sp = +b.dataset.sp; body.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', x === b)); }));
  body.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => { AM2.opt[b.dataset.opt] = !AM2.opt[b.dataset.opt]; b.classList.toggle('on', AM2.opt[b.dataset.opt]); am2Draw(); }));
}
function am2Open() { // the first clip: our best chance · the player's top-speed sprint
  const l = am2List();
  if (!l.length) return;
  const pick = AM2.mode === 'phys' ? (l.find(([c]) => c.top) || l[0]) : l.reduce((b, q) => ((q[0].t === 0 && (q[0].xg || 0) > (b[0].t === 0 ? b[0].xg || 0 : -1)) ? q : b), l[0]);
  am2Clip(pick[1]);
}
function am2Clip(i) {
  AM2.c = i; AM2.t = 0;
  const c = am2Arr()[i], dur = c.frames[c.frames.length - 1][0];
  document.getElementById('am-seek').max = dur;
  const mk = document.getElementById('am-mk'); mk.style.left = (c.at / dur * 100) + '%'; mk.textContent = c.kind === 'goal' ? '⚽' : c.type === 'regain' ? '↺' : '▼';
  document.getElementById('am-ttl').innerHTML = AM2.mode === 'phys'
    ? `${escapeHtml(c.who)} · ${am2Min(c)} · <span style="color:${AM2_KIND[c.kind]}">${c.kind}</span><small>${c.vmax} km/h · ${c.dist} m · ${c.dur} s${c.top ? ' · ⚡ his top speed' : ''}</small>`
    : `${am2Min(c)} · ${c.label}<small>${escapeHtml(c.who)}${c.xg != null ? ' · xG ' + c.xg.toFixed(2) : ''} · ${escapeHtml(c.t ? AM2.d.them : AM2.d.us)}</small>`;
  document.querySelectorAll('#am-body [data-i]').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
  am2Draw();
}
function am2Play(on) {
  AM2.play = on;
  const b = document.getElementById('am-play'); if (b) b.textContent = on ? '❚❚' : '▶';
  if (on && !AM2.raf) { AM2.last = null; AM2.raf = requestAnimationFrame(am2Loop); }
}
function am2Loop(now) {
  AM2.raf = null;
  if (CURRENT_VIEW !== 'tactical' || TC.s !== '2d' || !document.getElementById('am-cv')) { AM2.play = false; return; }
  if (AM2.play) {
    const c = am2Arr()[AM2.c], dur = c.frames[c.frames.length - 1][0];
    if (AM2.last != null) AM2.t += (now - AM2.last) * AM2.sp;
    if (AM2.t >= dur) { AM2.t = dur; am2Play(false); }
    am2Draw();
  }
  AM2.last = now;
  if (AM2.play) AM2.raf = requestAnimationFrame(am2Loop);
}
function am2At(c, t) {
  const F = c.frames; let i = 0;
  while (i < F.length - 2 && F[i + 1][0] <= t) i++;
  const a = F[i], b = F[Math.min(i + 1, F.length - 1)], u = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
  const pb = new Map(b[1].map((p) => [p[0], p]));
  const pl = a[1].map((p) => { const q = pb.get(p[0]) || p; return [p[0], p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; });
  const ball = a[2] && b[2] ? [a[2][0] + (b[2][0] - a[2][0]) * u, a[2][1] + (b[2][1] - a[2][1]) * u] : a[2];
  return { pl, ball, i, u };
}
function am2Draw() {
  const cv = AM2.cv, cx = AM2.cx;
  if (!cv || !AM2.d) return;
  const c = am2Arr()[AM2.c], t = AM2.t, s = am2At(c, t), P = c.players, phys = AM2.mode === 'phys';
  const W = cv.width, H = cv.height, PAD = 30, S = (W - 2 * PAD) / 105, X = (x) => PAD + x * S, Y = (y) => PAD + y * S, short = (n) => (n.length > 11 ? n.slice(0, 10) + '.' : n);
  // the pitch
  cx.fillStyle = '#2f8a4c'; cx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) if (i % 2) { cx.fillStyle = 'rgba(255,255,255,.035)'; cx.fillRect(X(i * 7.5), 0, 7.5 * S, H); }
  cx.strokeStyle = 'rgba(255,255,255,.85)'; cx.lineWidth = 2; cx.strokeRect(X(0), Y(0), 105 * S, 68 * S);
  cx.beginPath(); cx.moveTo(X(52.5), Y(0)); cx.lineTo(X(52.5), Y(68)); cx.stroke();
  cx.beginPath(); cx.arc(X(52.5), Y(34), 9.15 * S, 0, 7); cx.stroke();
  [[0, 1], [105, -1]].forEach(([x0, d]) => {
    cx.strokeRect(Math.min(X(x0), X(x0 + d * 16.5)), Y(13.84), 16.5 * S, 40.32 * S);
    cx.strokeRect(Math.min(X(x0), X(x0 + d * 5.5)), Y(24.84), 5.5 * S, 18.32 * S);
    cx.beginPath(); cx.arc(X(x0 + d * 11), Y(34), 9.15 * S, d > 0 ? -0.93 : Math.PI - 0.93, d > 0 ? 0.93 : Math.PI + 0.93); cx.stroke();
    cx.fillStyle = 'rgba(255,255,255,.9)'; cx.fillRect(Math.min(X(x0), X(x0 + d * 1.2)), Y(30.34), 1.2 * S, 7.32 * S);
  });
  cx.fillStyle = 'rgba(255,255,255,.75)'; cx.font = '700 12px system-ui'; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText(`${AM2.d.us} attack  →`, X(1), PAD / 2);
  // shape: block, last line
  const shape = (tm) => { const o = s.pl.filter((p) => P[p[0]].t === tm && !P[p[0]].gk); if (o.length < 5) return null; const xs = o.map((p) => p[1]), ys = o.map((p) => p[2]);
    return { lineX: tm ? Math.max(...xs) : Math.min(...xs), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; };
  const sh = [shape(0), shape(1)];
  if (AM2.opt.block) sh.forEach((q, tm) => { if (!q) return; const [x0, y0, x1, y1] = q.box;
    cx.fillStyle = tm ? 'rgba(214,59,59,.12)' : 'rgba(245,197,24,.15)'; cx.strokeStyle = tm ? 'rgba(214,59,59,.6)' : 'rgba(245,197,24,.85)'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.rect(X(x0), Y(y0), (x1 - x0) * S, (y1 - y0) * S); cx.fill(); cx.stroke(); });
  if (AM2.opt.line) { const tm = phys ? 1 : (c.t ? 0 : 1), q = sh[tm];
    if (q) { cx.setLineDash([8, 6]); cx.strokeStyle = tm ? 'rgba(255,190,190,.95)' : 'rgba(255,240,170,.95)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(X(q.lineX), Y(0)); cx.lineTo(X(q.lineX), Y(68)); cx.stroke(); cx.setLineDash([]); } }
  const F = c.frames, from = Math.max(0, s.i - 30);
  if (AM2.opt.trails && !phys) {
    const tr = new Map();
    for (let k = from; k <= s.i; k++) F[k][1].forEach((p) => { if (!tr.has(p[0])) tr.set(p[0], []); tr.get(p[0]).push(p); });
    tr.forEach((pts, id) => { if (pts.length < 2) return; cx.strokeStyle = P[id].t ? 'rgba(255,170,170,.5)' : 'rgba(253,230,138,.6)'; cx.lineWidth = 2.5; cx.beginPath(); pts.forEach((p, k) => (k ? cx.lineTo(X(p[1]), Y(p[2])) : cx.moveTo(X(p[1]), Y(p[2])))); cx.stroke(); });
  }
  if (AM2.opt.trails) { const bp = F.slice(from, s.i + 1).map((f) => f[2]).filter(Boolean);
    if (bp.length > 1) { cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 2; cx.setLineDash([3, 4]); cx.beginPath(); bp.forEach((p, k) => (k ? cx.lineTo(X(p[0]), Y(p[1])) : cx.moveTo(X(p[0]), Y(p[1])))); cx.stroke(); cx.setLineDash([]); } }
  const col = AM2_KIND[c.kind] || '#fff';
  if (phys) { // his run: the sprint bright, an arrowhead at its end
    const pts = F.map((f) => [f[0], f[1].find((p) => p[0] === c.focus)]).filter((q) => q[1]);
    const seg = (cond, colr, w) => { cx.strokeStyle = colr; cx.lineWidth = w; cx.beginPath(); let on = false; pts.forEach(([ms, p]) => { if (cond(ms)) { on ? cx.lineTo(X(p[1]), Y(p[2])) : cx.moveTo(X(p[1]), Y(p[2])); on = true; } else on = false; }); cx.stroke(); };
    seg(() => true, 'rgba(255,255,255,.35)', 3); seg((ms) => ms >= c.sa && ms <= c.sb, col, 5);
    const run = pts.filter(([ms]) => ms >= c.sa && ms <= c.sb);
    if (run.length > 3) { const [, a] = run[run.length - 4], [, b] = run[run.length - 1], an = Math.atan2(Y(b[2]) - Y(a[2]), X(b[1]) - X(a[1]));
      cx.fillStyle = col; cx.beginPath(); cx.moveTo(X(b[1]) + Math.cos(an) * 10, Y(b[2]) + Math.sin(an) * 10); cx.lineTo(X(b[1]) + Math.cos(an + 2.5) * 10, Y(b[2]) + Math.sin(an + 2.5) * 10); cx.lineTo(X(b[1]) + Math.cos(an - 2.5) * 10, Y(b[2]) + Math.sin(an - 2.5) * 10); cx.fill(); }
  }
  let onBall = null, best = 2;
  if (s.ball) s.pl.forEach(([k, x, y]) => { const dd = Math.hypot(x - s.ball[0], y - s.ball[1]); if (dd < best) { best = dd; onBall = k; } });
  const R = 11;
  s.pl.forEach(([id, x, y]) => {
    const p = P[id], k = AM2_COL[p.t], me = phys && id === c.focus;
    cx.globalAlpha = phys && !me ? 0.55 : 1;
    if (me) { cx.beginPath(); cx.arc(X(x), Y(y), R + 9, 0, 7); cx.fillStyle = 'rgba(255,255,255,.28)'; cx.fill(); cx.strokeStyle = col; cx.lineWidth = 3; cx.stroke(); }
    if (id === onBall && !me) { cx.beginPath(); cx.arc(X(x), Y(y), R + 6, 0, 7); cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.stroke(); }
    cx.beginPath(); cx.arc(X(x), Y(y) + 2, R, 0, 7); cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fill();
    cx.beginPath(); cx.arc(X(x), Y(y), R, 0, 7); cx.fillStyle = p.gk ? k.gk : k.f; cx.fill(); cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 1; cx.stroke();
    cx.fillStyle = p.gk ? k.gkk : k.k; cx.font = '800 11px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(p.num, X(x), Y(y) + 0.5);
    if (AM2.opt.names && (!phys || me)) { cx.font = `700 ${me ? 13 : 10.5}px system-ui`; cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillText(short(p.n), X(x) + 1, Y(y) + R + (me ? 14 : 10)); cx.fillStyle = '#fff'; cx.fillText(short(p.n), X(x), Y(y) + R + (me ? 13 : 9)); }
    cx.globalAlpha = 1;
  });
  if (s.ball) { cx.beginPath(); cx.arc(X(s.ball[0]), Y(s.ball[1]), 6, 0, 7); cx.fillStyle = '#fff'; cx.fill(); cx.strokeStyle = '#111'; cx.lineWidth = 1.5; cx.stroke(); }
  const lastEv = c.events.filter((e) => e.ms <= t).pop();
  if (lastEv && t - lastEv.ms < 1800 && lastEv.who != null && P[lastEv.who]) {
    const txt = `${lastEv.name} · ${P[lastEv.who].n}`; cx.font = '800 15px system-ui';
    const w = cx.measureText(txt).width + 26; cx.fillStyle = 'rgba(17,24,39,.82)'; cx.beginPath(); cx.roundRect(W / 2 - w / 2, H - PAD - 44, w, 32, 16); cx.fill();
    cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.fillText(txt, W / 2, H - PAD - 27);
  }
  const min = (c.half === 2 ? 45 : 0) + (c.start + t) / 60000;
  document.getElementById('am-clk').textContent = `${Math.floor(min)}:${String(Math.floor((min % 1) * 60)).padStart(2, '0')}`;
  document.getElementById('am-seek').value = t;
  if (phys) am2Speed(c, t, s, col);
}
function am2Speed(c, t, s, col) { // his speed over the clip (km/h): the 25 km/h line, the sprint shaded, the cursor
  const F = c.frames, dur = F[F.length - 1][0], w = 1000, h = 110, top = 36, xs = (ms) => ms / dur * w, ys = (v) => h - 14 - Math.min(top, v) / top * (h - 24);
  const now = c.speed[s.i] + ((c.speed[Math.min(s.i + 1, c.speed.length - 1)] - c.speed[s.i]) * s.u);
  const d = c.speed.map((v, k) => `${k ? 'L' : 'M'}${xs(F[k][0]).toFixed(1)},${ys(v).toFixed(1)}`).join('');
  document.getElementById('am-spd').innerHTML = `<rect x="${xs(c.sa)}" y="4" width="${xs(c.sb) - xs(c.sa)}" height="${h - 18}" fill="${col}" opacity=".12" rx="4"/>
    ${[10, 20, 30].map((v) => `<line x1="0" x2="${w}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--hairline)"/><text x="4" y="${ys(v) - 3}" font-size="10" fill="var(--ink-muted)">${v}</text>`).join('')}
    <line x1="0" x2="${w}" y1="${ys(25)}" y2="${ys(25)}" stroke="#e5484d" stroke-dasharray="5 4"/><text x="${w - 4}" y="${ys(25) - 4}" font-size="10" text-anchor="end" fill="#e5484d">25 km/h</text>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2.5"/><line x1="${xs(t)}" x2="${xs(t)}" y1="0" y2="${h - 12}" stroke="var(--ink)" stroke-width="1.5"/><circle cx="${xs(t)}" cy="${ys(now)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>
    <text x="${w / 2}" y="${h - 1}" font-size="10" text-anchor="middle" fill="var(--ink-muted)">speed of ${escapeHtml(c.who)} (km/h) · tracking</text>`;
  document.getElementById('am-now').innerHTML = `<b>${now.toFixed(1)}</b> km/h`;
}

/** The Tactical link: the admin only (shown by mfShowLink with the Match files link). */
function tcShowLink() { const b = document.getElementById('nav-tactical'); if (b) b.hidden = false; }
