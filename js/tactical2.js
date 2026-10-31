/* The new Tactical tab (2026-10-30, admin only: Tactical › New version; the old one stays under Old version until he
 * decides). Payload tactical.v2 (sync/tactical_v2.py) + per match in R2 (/api/tactical-2d?kind=ev = moments + his Tableau
 * report data, kind=full = the whole match at 5 fps for the 2D).
 *   Teams    a strip of the QSL teams (us first, then the next league opponent): the team's sentence for the video analyst,
 *            its numbers with the league rank, four blocks (attack, build-up, pressing, set pieces), with / without the ball,
 *            the video room (every moment of a category, its 2D, Play all, the XML for Sportscode / Hudl / Nacsport), its matches
 *   League   the season table (totals or per match, the 3 best green / 3 worst red) and the players (top 10 cards, full table)
 *   Matches  every match: its Game report (his Tableau report, 12 or 10 pages, PDF), both sentences, the timeline, the 2D */
const T2 = { s: 'teams', team: null, seg: 'over', cat: 'goal_kick', f: {}, match: 'all', ev: null, mid: null, tlc: null, open: null,
  lg: { view: 'teams', mode: 'total', sort: 'pts', asc: false, pv: 'A', ft: 'all', fg: 'all', minm: 270, psort: 'goals', pasc: false },
  data: null, packs: {}, full: {}, next: null };
const T2_US = 'Al Gharafa';
const T2_PRE = { goal_kick: 3000, build_up: 2000, press: 2000, regain_high: 6000, prog: 3000, shot: 10000, cross: 4000, corner: 2000, free_kick: 2000, entry: 4000, loss: 5000, counter: 3000 };
const T2_CATS = [
  ['goal_kick', 'Goal kicks (6 m)', [['kind', 'short', 'Short'], ['kind', 'long', 'Long'], ['pressed', true, 'Pressed'], ['tag', 'progressed', 'Played out'], ['tag', 'lost in own third', 'Lost in own third'], ['tag', 'first ball won', 'First ball won'], ['tag', 'first ball lost', 'First ball lost']]],
  ['build_up', 'Build-ups', [['start', 'settled', 'Settled'], ['start', 'open play', 'After a regain'], ['pressed', true, 'Pressed'], ['tag', 'middle third', 'Middle third'], ['tag', 'final third', 'Last third'], ['tag', 'lost in own third', 'Lost in own third'], ['kind', 'direct', 'Long ball']]],
  ['press', 'Pressing', [['kind', 'organised', 'Organised'], ['kind', 'counter-press', 'Counter-press'], ['height', 'high', 'High (their third)'], ['tag', 'won back ≤ 5 s', 'Won back ≤ 5 s'], ['tag', 'won back ≤ 10 s', '≤ 10 s'], ['tag', 'forced long', 'Forced long'], ['tag', 'foul', 'Foul'], ['tag', 'beaten', 'Beaten']]],
  ['regain_high', 'High regains', [['tag', 'shot', 'Led to a shot']]],
  ['counter', 'Counter-attacks', [['tag', 'shot', 'Shot'], ['tag', 'box entry', 'Box entry']]],
  ['entry', 'Final-third entries', [['kind', 'pass', 'Pass'], ['kind', 'carry', 'Carry'], ['lane', 'left', 'Left'], ['lane', 'centre', 'Centre'], ['lane', 'right', 'Right']]],
  ['prog', 'Progressive passes', []],
  ['cross', 'Crosses', [['tag', 'completed', 'Completed'], ['side', 'left', 'From the left'], ['side', 'right', 'From the right']]],
  ['shot', 'Shots', [['tag', 'goal', 'Goals'], ['tag', 'on target', 'On target'], ['tag', 'off target', 'Off target']]],
  ['corner', 'Corners', [['tag', 'shot', 'Shot'], ['tag', 'goal', 'Goal']]],
  ['free_kick', 'Free kicks', [['tag', 'shot', 'Shot']]],
  ['loss', 'Balls lost', [['tag', 'own third', 'In own third'], ['tag', 'shot conceded', 'Shot conceded']]],
];
const T2_CAT = Object.fromEntries(T2_CATS.map((c) => [c[0], c]));
const T2_OK = new Set(['won back ≤ 5 s', 'won back ≤ 10 s', 'progressed', 'first ball won', 'middle third', 'final third', 'completed', 'goal', 'shot', 'on target', 'box entry']);
const T2_KO = new Set(['lost in own third', 'first ball lost', 'beaten', 'missed', 'shot conceded', 'own third', 'off target']);
const t2ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
const t2day = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const t2M = () => Object.fromEntries((T2.data.matches || []).map((m) => [m.id, m]));

// ------------------------------------------------------------------ loading
function renderTactical2() {
  const root = document.getElementById('view-tactical2');
  root.innerHTML = `${pageHead('Admin · new version', 'Tactical', 't2-sub', `<span class="tc-lock">🔒 only you can see this tab</span><button class="btn-light" onclick="switchView('tactical')">Old version</button>${segHtml('t2-seg', [['teams', 'Teams'], ['league', 'League'], ['matches', 'Matches']], T2.s)}`)}<div id="t2-body"><div class="panel"><div class="empty">Loading…</div></div></div><div class="t3-modal" id="t2-modal" hidden></div>`;
  bindSeg('t2-seg', (v) => { T2.s = v; T2.ev = null; drawTactical2(); });
  Promise.all([loadData('tactical'), loadData('calendar').catch(() => null)]).then(([d, cal]) => {
    T2.data = d.v2 || null;
    if (T2.data && cal) T2.next = t2NextOpponent(cal);
    if (T2.data && !T2.team) T2.team = T2.next && T2.data.teams[T2.next.team] ? T2.next.team : Object.keys(T2.data.teams || {})[0];
    drawTactical2();
  }).catch((err) => { document.getElementById('t2-body').innerHTML = loadError(err); });
}
function t2NextOpponent(cal) { // the next league match in the calendar whose opponent has a file
  const today = new Date().toISOString().slice(0, 10), teams = Object.keys(T2.data.teams || {});
  const ev = (cal.events || []).filter((e) => e.kind === 'match' && e.gharafa === 'yes' && !e.played_date && (e.confirmed_date || e.start) >= today).sort((a, b) => (a.confirmed_date || a.start).localeCompare(b.confirmed_date || b.start));
  for (const e of ev) { const t = teams.find((x) => clubSlug(x) === clubSlug(e.opponent)); if (t) return { team: t, when: t2day(e.confirmed_date || e.start) }; }
  return null;
}
async function t2Fetch(mid, kind) {
  const store = kind === 'full' ? T2.full : T2.packs;
  if (store[mid]) return store[mid];
  const local = AUTH.demo && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const r = local ? await fetch(`../sync/out/t2d/${encodeURIComponent(mid)}.${kind}.json.gz`, { cache: 'no-store' }) : await fetch(`/api/tactical-2d?match=${encodeURIComponent(mid)}&kind=${kind}`, { headers: cfHeaders() });
  if (!r.ok) throw new Error(`${kind === 'full' ? '2D' : 'match'} file ${r.status}`);
  const j = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  store[mid] = j;
  return j;
}
/** Every moment of a team (its matches' files), with the match and the opponent. */
function t2Moments(team) {
  const out = [], M = t2M(), sel = t2Sel(team);
  (T2.data.matches || []).filter((m) => (m.home === team || m.away === team) && (!sel || sel.has(m.id))).forEach((m) => {
    const pk = T2.packs[m.id]; if (!pk) return;
    pk.moments.forEach((x) => { if (x.t === team) out.push({ ...x, m: m.id, opp: m.home === team ? m.away : m.home }); });
  });
  return out.sort((a, b) => (M[b.m].date || '').localeCompare(M[a.m].date || '') || a.h - b.h || a.a - b.a);
}
async function t2LoadTeam(team) {
  const ms = (T2.data.matches || []).filter((m) => m.home === team || m.away === team);
  await Promise.all(ms.map((m) => t2Fetch(m.id, 'ev').catch(() => null)));
}
const t2Name = (pid) => { for (const k in T2.packs) { const p = T2.packs[k].players[pid]; if (p) return p[0]; } return ''; };

function drawTactical2() {
  const box = document.getElementById('t2-body'), root = document.getElementById('view-tactical2');
  if (!box || !T2.data) { if (box && T2.data === null) box.innerHTML = emptyState('The new numbers are made by the next update (Update dashboard)'); return; }
  t2Stop();
  root.classList.toggle('t2-wide', T2.s === 'league');
  const V = T2.data;
  document.getElementById('t2-sub').textContent = `${V.matches.length} matches with an XML · ${V.matches.filter((m) => m.tracking).length} with a tracking · ${V.n_qsl} QSL matches in the league numbers`;
  if (T2.s === 'league') { box.innerHTML = t2League(); t2LeagueBind(); return; }
  if (T2.s === 'matches') { t2MatchCentre(box); return; }
  box.innerHTML = '<div class="panel"><div class="empty">Loading the team…</div></div>';
  t2LoadTeam(T2.team).then(() => { if (T2.s === 'teams') { box.innerHTML = t2TeamPage(); t2Bind(); } });
}

// ------------------------------------------------------------------ team page pieces
function t2Strip() {
  const V = T2.data, pts = (t) => V.teams[t].rec[0] * 3 + V.teams[t].rec[1], nx = T2.next && T2.next.team;
  const ord = Object.keys(V.teams).sort((a, b) => (a === T2_US ? -1 : b === T2_US ? 1 : a === nx ? -1 : b === nx ? 1 : pts(b) - pts(a) || a.localeCompare(b)));
  return `<div class="strip">${ord.map((t) => `<button class="${t === T2.team ? 'on' : ''} ${t === T2_US ? 'us' : ''}" data-team="${escapeHtml(t)}">${t === nx ? `<em>next · ${escapeHtml(T2.next.when)}</em>` : t === T2_US ? '<em>us</em>' : ''}${crestHtml(t, 30)}<span>${escapeHtml(t)}</span></button>`).join('')}</div>`;
}
function t2Header(team, extra = '') {
  const T = t2T(team), [w, d, l, gf, ga] = T.rec;
  return `<div class="th">${crestHtml(team, 64)}<div><h2>${escapeHtml(team)}</h2><div class="rec">${T.n} QSL match${T.n > 1 ? 'es' : ''} ${t2Sel(team) ? 'picked' : 'with a file'} · <b>${w}W ${d}D ${l}L</b> · goals <b>${gf}–${ga}</b>${T2.next && team === T2.next.team ? ` · <b style="color:#e5484d">our next league opponent (${escapeHtml(T2.next.when)})</b>` : ''}</div></div><div>${extra}</div></div>`;
}
function t2List(team, cat, f, mid) {
  return t2Moments(team).filter((x) => x.c === cat && (mid === 'all' || x.m === mid) && Object.entries(f).every(([k, v]) => (k === 'start' && v === 'settled' ? x.start && x.start !== 'open play' : x[k] === v)));
}
function t2Say(team, chips = true) {
  const s = t2T(team).say, it = (i) => `${escapeHtml(i.txt)} <i>(${escapeHtml(i.val)}${i.rank ? ' · ' + escapeHtml(i.rank) : ''})</i>`;
  const watch = s.watch.map((w) => `<button class="chip" data-watch='${escapeHtml(JSON.stringify(w))}'>▶ ${escapeHtml(T2_CAT[w.cat][1])}${Object.values(w.f || {}).length ? ' · ' + escapeHtml(Object.values(w.f).map((v) => (v === true ? 'pressed' : v)).join(', ')) : ''}<b>${t2List(team, w.cat, w.f || {}, 'all').length}</b></button>`).join('');
  return `<dl class="say">${s.strong.length ? `<dt class="s">Strong</dt><dd>${s.strong.map(it).join(' · ')}</dd>` : ''}${s.weak.length ? `<dt class="w">Weak</dt><dd>${s.weak.map(it).join(' · ')}</dd>` : ''}
    ${s.style.length ? `<dt class="y">Style</dt><dd>${s.style.map((i) => escapeHtml(i.txt)).join(' · ')}</dd>` : ''}${chips && s.watch.length ? `<dt class="v">Watch</dt><dd>${watch}</dd>` : ''}</dl>`;
}
function t2Fmt(k, v) {
  const D = T2.data.defs;
  if (v == null) return '—';
  if (k === 'press') return (1 / v).toFixed(1);
  if ((D[k] && D[k][1] === '%') || k === 'possession') return Math.round(v) + '<small>%</small>';
  if (k === 'rec_h') return v.toFixed(1) + '<small>m</small>';
  if (['goals_for', 'goals_against', 'xg', 'xg_against', 'sp_goals', 'sp_against'].includes(k)) return v.toFixed(2);
  return v.toFixed(1);
}
function t2Tile(team, k) {
  const V = T2.data, [label, unit, good, def] = V.defs[k], T = t2T(team), v = T.m[k], r = T.rank[k], N = V.N, TM = { ...V.teams, [team]: T };
  const vals = Object.values(TM).map((t) => t.m[k]).filter((x) => x != null), lo = Math.min(...vals), hi = Math.max(...vals), X = (x) => (hi > lo ? 4 + 92 * (x - lo) / (hi - lo) : 50);
  const best = r == null ? null : good === 'high' ? r : good === 'low' ? N + 1 - r : null, cls = best == null ? '' : best <= 3 ? 'g' : best >= N - 2 ? 'b' : '';
  const lr = r == null ? null : N + 1 - r, rk = r == null ? '' : good === 'low' ? (lr === 1 ? 'the fewest' : r === 1 ? 'the most' : `${t2ord(lr)} fewest`) : r === 1 ? 'the most' : t2ord(r);
  const strip = `<div class="lstrip" title="the ${N} teams · dashed = league average">${Object.entries(TM).map(([t, o]) => (o.m[k] == null ? '' : `<i class="${t === team ? 'me' : ''}" style="left:${X(o.m[k])}%" title="${escapeHtml(t)}"></i>`)).join('')}${V.league[k] != null ? `<u style="left:${X(V.league[k])}%"></u>` : ''}</div>`;
  return `<div class="tile"><span class="l">${escapeHtml(label)}<button data-def="${k}" title="How it is calculated">i</button></span><span class="v">${t2Fmt(k, v)}${unit && unit !== '%' && unit !== 'm' ? `<small>${escapeHtml(unit)}</small>` : ''}</span><span class="rk ${cls}">${rk}</span>${strip}
    <span class="lg">league ${k === 'press' ? (V.league[k] ? (1 / V.league[k]).toFixed(1) : '—') : t2Fmt(k, V.league[k]).replace(/<small>(.*?)<\/small>/g, ' $1')}</span>${T2.open === k ? `<div class="def">${escapeHtml(def)}</div>` : ''}</div>`;
}
const t2Tiles = (team, keys, cls = '') => `<div class="tiles ${cls}">${keys.map((k) => t2Tile(team, k)).join('')}</div>`;
function t2Flow(parts) {
  const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
  return `<div class="flow">${parts.filter((p) => p[1]).map(([l, n, c]) => `<span style="width:${n / tot * 100}%;background:${c}" title="${escapeHtml(l)} ${n}">${n / tot > 0.07 ? Math.round(n / tot * 100) + '%' : ''}</span>`).join('')}</div>
    <div class="flowleg">${parts.map(([l, n, c]) => `<span><i style="background:${c}"></i>${escapeHtml(l)} <b>${n}</b></span>`).join('')}</div>`;
}
const t2See = (cat, f, label) => `<button class="chip g" data-watch='${escapeHtml(JSON.stringify({ cat, f }))}'>▶ ${escapeHtml(label)}<b>${t2List(T2.team, cat, f, 'all').length}</b></button>`;
function t2Pitch(w, inner, half = false) {
  const x0 = half ? 52.5 : 0, W = half ? 52.5 : 105, sc = w / W, h = 68 * sc, X = (x) => (x - x0) * sc, Y = (y) => y * sc, L = 'stroke="rgba(255,255,255,.85)" stroke-width="1.3" fill="none"';
  let s = `<svg class="pitch" viewBox="-3 -3 ${w + 6} ${h + 6}"><rect width="${w}" height="${h}" rx="8" fill="#2f8a4c"/><rect width="${w}" height="${h}" rx="8" ${L}/>`;
  if (!half) s += `<line x1="${X(52.5)}" y1="0" x2="${X(52.5)}" y2="${h}" ${L}/><circle cx="${X(52.5)}" cy="${Y(34)}" r="${9.15 * sc}" ${L}/><rect x="0" y="${Y(13.84)}" width="${16.5 * sc}" height="${40.32 * sc}" ${L}/><rect x="0" y="${Y(24.84)}" width="${5.5 * sc}" height="${18.32 * sc}" ${L}/>`;
  s += `<rect x="${X(88.5)}" y="${Y(13.84)}" width="${16.5 * sc}" height="${40.32 * sc}" ${L}/><rect x="${X(99.5)}" y="${Y(24.84)}" width="${5.5 * sc}" height="${18.32 * sc}" ${L}/>`;
  s += `<line x1="${X(35)}" y1="0" x2="${X(35)}" y2="${h}" stroke="rgba(255,255,255,.3)" stroke-dasharray="4 4"/><line x1="${X(70)}" y1="0" x2="${X(70)}" y2="${h}" stroke="rgba(255,255,255,.3)" stroke-dasharray="4 4"/>`;
  return s + inner(X, Y, sc) + `<text x="${w - 6}" y="${h - 6}" font-size="11" fill="rgba(255,255,255,.8)" text-anchor="end">attack →</text></svg>`;
}
const t2Min = (x) => `${Math.floor((x.a + (T2_PRE[x.c] || 0)) / 60000) + (x.h === 2 ? 45 : 0) + 1}'`;

function t2AttackBlock(team) {
  return `<div class="card blk"><h3>Attack <small>chances and progression</small><span class="sp"></span>${t2See('shot', {}, 'shots')}${t2See('entry', {}, 'entries')}</h3>${t2Tiles(team, ['xg', 'shots', 'final_third', 'prog_ok', 'crosses', 'counter'], 't3c')}</div>`;
}
function t2BuBlock(team, mini = false) {
  const xs = t2Moments(team).filter((x) => x.c === 'build_up'), set = xs.filter((x) => x.start !== 'open play'), cnt = (arr, t) => arr.filter((x) => x.tag === t).length;
  const parts = (arr) => [['last third', cnt(arr, 'final third'), '#0a8a3a'], ['middle third', cnt(arr, 'middle third'), '#5cc27a'], ['lost in own third', cnt(arr, 'lost in own third'), '#e5484d'], ['other (out, foul)', cnt(arr, 'other'), '#c9c8c0']];
  const pr = set.filter((x) => x.pressed);
  return `<div class="card blk"><h3>Build-up <small>possessions from the own third · ${xs.length} in ${t2T(team).n} matches</small><span class="sp"></span>${t2See('build_up', {}, 'all build-ups')}</h3>
    ${t2Tiles(team, mini ? ['bu_mid_pct', 'bu_lost3_pct', 'bu_pressed_mid_pct'] : ['bu', 'bu_mid_pct', 'bu_lost3_pct', 'bu_pressed_pct', 'bu_pressed_mid_pct', 'bu_pressed_lost3_pct'], 't3c')}
    <div><b style="font-size:12.5px">Settled (goal kick, free kick, throw-in, goalkeeper) · ${set.length}</b>${t2Flow(parts(set))}</div>
    ${mini ? '' : `<div><b style="font-size:12.5px">…when pressed (an opponent within 5 m in the first 8 s) · ${pr.length}</b>${t2Flow(parts(pr))}</div><div><b style="font-size:12.5px">After a ball won back in the own third · ${xs.length - set.length}</b>${t2Flow(parts(xs.filter((x) => x.start === 'open play')))}</div>`}</div>`;
}
function t2PressBlock(team, mini = false) {
  const T = t2T(team), [w5, w10, lg, fo, bt, ot] = T.m.pr_split || [0, 0, 0, 0, 0, 0], [org, cp, hi] = T.m.pr_kinds || [0, 0, 0, 0];
  return `<div class="card blk"><h3>Pressing <small>${w5 + w10 + lg + fo + bt + ot} pressings · ${org} organised, ${cp} counter-presses · ${hi} high</small><span class="sp"></span>${t2See('press', {}, 'all pressings')}</h3>
    ${t2Tiles(team, mini ? ['pr', 'pr_won5_pct', 'press'] : ['pr', 'pr_high_pct', 'pr_counter', 'pr_won5_pct', 'pr_beaten_pct', 'press'], 't3c')}
    <div><b style="font-size:12.5px">What happens when they press</b>${t2Flow([['won back ≤ 5 s', w5, '#0a8a3a'], ['won back ≤ 10 s', w10, '#5cc27a'], ['forced a long ball', lg, '#f5a524'], ['foul', fo, '#9aa5c7'], ['beaten (they reach our half)', bt, '#e5484d'], ['other', ot, '#c9c8c0']])}</div>
    ${mini ? '' : '<p>A pressing = an opponent possession where one of the team\'s players gets within 5 m of the player on the ball in the opponent\'s half, in its first 8 s (tracking). Counter-press = within 3 s of losing the ball. High = the first pressure in the opponent\'s third.</p>'}</div>`;
}
function t2SetBlock(team) {
  const c = t2Moments(team).filter((x) => x.c === 'corner');
  return `<div class="card blk"><h3>Set pieces <small>corners and free kicks in the opponent's half</small><span class="sp"></span>${t2See('corner', {}, 'corners')}${t2See('free_kick', {}, 'free kicks')}</h3>
    ${t2Tiles(team, ['sp_goals', 'sp_against', 'corners', 'corner_shot_pct', 'fk_shot_pct'], 't3c')}
    <div><b style="font-size:12.5px">Corners · ${c.length}</b>${t2Flow([['goal', c.filter((x) => x.tag === 'goal').length, '#0a8a3a'], ['shot', c.filter((x) => x.tag === 'shot').length, '#5cc27a'], ['no shot', c.filter((x) => x.tag === 'no shot').length, '#c9c8c0']])}</div></div>`;
}
function t2GkBlock(team) {
  const g = t2Moments(team).filter((x) => x.c === 'goal_kick');
  const svg = t2Pitch(520, (X, Y) => g.filter((x) => x.ex != null).map((x) => { const ok = T2_OK.has(x.tag), col = x.kind === 'short' ? '#5aa7ff' : '#f5a524';
    return `<line x1="${X(x.x)}" y1="${Y(x.y)}" x2="${X(x.ex)}" y2="${Y(x.ey)}" stroke="${col}" stroke-width="1.2" opacity=".55"/><circle cx="${X(x.ex)}" cy="${Y(x.ey)}" r="5" fill="${ok ? col : 'none'}" stroke="${col}" stroke-width="1.8"><title>${escapeHtml(t2Min(x) + ' v ' + x.opp + ' · ' + x.tag)}</title></circle>`; }).join(''));
  return `<div class="card blk"><h3>Goal kicks (6 m) <small>${g.length} · short = ends in the own third (35 m)</small><span class="sp"></span>${t2See('goal_kick', { kind: 'short' }, 'short')}${t2See('goal_kick', { kind: 'long' }, 'long')}</h3>
    ${t2Tiles(team, ['gk_short_pct', 'gk_short_prog', 'gk_long_won', 'gk_press'])}${svg}<div class="flowleg"><span><i style="background:#5aa7ff"></i>short</span><span><i style="background:#f5a524"></i>long</span><span>● filled = played out / first ball won · ○ = lost</span></div></div>`;
}
function t2ProgBlock(team) {
  const e = t2Moments(team).filter((x) => x.c === 'entry'), lane = (l) => e.filter((x) => x.lane === l).length, tot = e.length || 1;
  return `<div class="card blk"><h3>Progression <small>forward and progressive passes, entries into the last third</small><span class="sp"></span>${t2See('prog', {}, 'progressive passes')}${t2See('entry', {}, 'entries')}</h3>
    ${t2Tiles(team, ['fwd', 'prog_ok', 'final_third', 'crosses'])}
    ${t2Pitch(520, (X, Y, sc) => [['left', 11.3], ['centre', 34], ['right', 56.7]].map(([l, y]) => `<rect x="${X(70)}" y="${Y(y - 10.5)}" width="${35 * sc}" height="${21 * sc}" fill="rgba(255,255,255,${0.08 + 0.5 * lane(l) / tot})" rx="6"/><text x="${X(87.5)}" y="${Y(y) + 6}" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">${Math.round(lane(l) / tot * 100)}%</text>`).join('')
      + e.slice(0, 400).map((x) => `<circle cx="${X(x.ex)}" cy="${Y(x.ey)}" r="2.2" fill="${x.kind === 'carry' ? '#f5c518' : '#fff'}" opacity=".75"/>`).join(''))}
    <p>Where the team gets into the last third (${e.length} entries · white = pass, yellow = carry · lanes from the attacking team's left).</p></div>`;
}
function t2RecBlock(team) {
  const T = t2T(team), r = t2Moments(team).filter((x) => x.c === 'regain_high');
  return `<div class="card blk"><h3>Where they win the ball back <small>open play · kick-offs left out</small><span class="sp"></span>${t2See('regain_high', {}, 'high regains')}${t2See('counter', {}, 'counter-attacks')}</h3>
    ${t2Tiles(team, ['rec_h', 'high_reg', 'counter', 'counter_against'])}
    <div><b style="font-size:12.5px">Balls won back by third</b>${t2Flow([['own third', Math.round(T.m.reg_low_pct || 0), '#9aa5c7'], ['middle third', Math.round(T.m.reg_mid_pct || 0), '#5a6fd1'], ['last third', Math.round(T.m.reg_high_pct || 0), '#1f3a9e']]).replace(/<b>(\d+)<\/b>/g, '<b>$1 %</b>')}</div>
    ${t2Pitch(380, (X, Y) => r.map((x) => `<circle cx="${X(x.x)}" cy="${Y(x.y)}" r="4.5" fill="${x.tag === 'shot' ? '#f5c518' : '#fff'}" stroke="#0b0b0b" stroke-width=".6"><title>${escapeHtml(t2Min(x) + ' v ' + x.opp)}</title></circle>`).join(''), true)}
    <p>The balls won in the last third (${r.length}) · yellow = a shot followed.</p></div>`;
}
function t2TeamMatches(team) {
  const ms = T2.data.matches.filter((m) => m.home === team || m.away === team).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="card"><h3>Matches <small>Game report = your Tableau report, made from the XML</small></h3><table class="tt-tbl"><thead><tr><th class="l">Date</th><th class="l">Match</th><th>Comp.</th><th>2D</th><th>Moments</th><th></th></tr></thead><tbody>
    ${ms.map((m) => `<tr><td class="l">${t2day(m.date)}</td><td class="l">${crestHtml(m.home, 18)} ${escapeHtml(m.home)} <b>${m.score[0]}–${m.score[1]}</b> ${escapeHtml(m.away)} ${crestHtml(m.away, 18)}</td><td>${m.comp === 'Qatar Stars League' ? 'QSL' : escapeHtml(m.comp || '')}</td><td>${m.tracking ? '✓' : '—'}</td>
      <td><button class="chip g" data-vmatch="${m.id}">▶ ${t2Moments(team).filter((x) => x.m === m.id).length}</button></td><td style="text-align:right;white-space:nowrap"><button class="btn" data-pdf="${m.id}">⬇ Game report</button> <button class="btn" data-export="${m.id}">XML</button></td></tr>`).join('')}</tbody></table></div>`;
}
function t2TeamPage() {
  const team = T2.team, SEG = [['over', 'Overview'], ['with', 'With the ball'], ['without', 'Without the ball'], ['video', 'Video room'], ['matches', 'Matches']];
  const head = T2.seg === 'matches' ? `<div class="card">${t2Header(team)}</div>`
    : `<div class="card">${t2Header(team, T2.seg === 'over' ? '<button class="btn" data-seg="video">▶ Video room</button>' : '')}${t2Say(team)}</div>` + t2Picker(team);
  const seg = `<div class="seg" style="align-self:flex-start">${SEG.map(([k, l]) => `<button class="${T2.seg === k ? 'active' : ''}" data-seg="${k}">${l}</button>`).join('')}</div>`; // just above what it changes (his ask)
  let body;
  if (T2.seg === 'with') body = t2BuBlock(team) + `<div class="grid2">${t2GkBlock(team)}${t2ProgBlock(team)}</div>`;
  else if (T2.seg === 'without') body = `<div class="grid2"><div style="display:flex;flex-direction:column;gap:14px">${t2PressBlock(team)}<div class="card blk"><h3>Defending</h3>${t2Tiles(team, ['goals_against', 'xg_against', 'shots_against', 'loss3'], 'two')}</div></div>${t2RecBlock(team)}</div>`;
  else if (T2.seg === 'video') body = t2VideoRoom(team);
  else if (T2.seg === 'matches') body = t2TeamMatches(team);
  else body = `<div class="card"><h3>Headline numbers <small>per match · rank among the ${T2.data.N} QSL teams · the dots = every team, dashed = league average · (i) = how it is calculated</small></h3>${t2Tiles(team, ['goals_for', 'goals_against', 'xg', 'xg_against', 'possession', 'press', 'rec_h', 'prog_ok'])}</div>
      <div class="grid2">${t2AttackBlock(team)}${t2BuBlock(team, true)}</div><div class="grid2">${t2PressBlock(team, true)}${t2SetBlock(team)}</div>`;
  return `<div class="t3">${t2Strip()}${head}${seg}${body}</div>`;
}

// ------------------------------------------------------------------ the video room (B layout)
function t2VideoRoom(team) {
  if (!T2_CAT[T2.cat]) T2.cat = 'goal_kick';
  const M = t2M(), ms = T2.data.matches.filter((m) => m.home === team || m.away === team).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const L = t2List(team, T2.cat, T2.f, T2.match), [, label, subs] = T2_CAT[T2.cat], all = t2Moments(team);
  if (!T2.ev || !L.includes(T2.ev)) T2.ev = L.find((x) => M[x.m].tracking) || L[0] || null;
  const cats = T2_CATS.map(([c, l]) => `<button class="vr-cat ${c === T2.cat ? 'on' : ''}" data-cat="${c}"><span>${escapeHtml(l)}</span><b>${all.filter((x) => x.c === c && (T2.match === 'all' || x.m === T2.match)).length}</b></button>`).join('');
  const chips = subs.map(([k, v, l]) => `<button class="chip g ${T2.f[k] === v ? 'on' : ''}" data-f='${escapeHtml(JSON.stringify([k, v]))}'>${escapeHtml(l)}<b>${t2List(team, T2.cat, { ...T2.f, [k]: v }, T2.match).length}</b></button>`).join('');
  const tagCls = (t) => (T2_OK.has(t) ? 'ok' : T2_KO.has(t) ? 'ko' : 'mid');
  const rows = L.map((x, i) => `<button class="vr-ev ${x === T2.ev ? 'on' : ''}" data-ev="${i}"><span class="t">${t2Min(x)}</span><span class="w">${escapeHtml(t2Name(x.p) || (x.c === 'press' ? 'press on ' + x.opp : x.c === 'loss' ? 'ball lost' : '—'))}<small>${t2day(M[x.m].date)} · ${crestHtml(x.opp, 13)} v ${escapeHtml(x.opp)}${M[x.m].tracking ? '<span class="d2">2D</span>' : ''}</small></span>${x.tag || x.kind ? `<span class="tg ${tagCls(x.tag)}">${escapeHtml(x.tag || x.kind)}</span>` : ''}</button>`).join('') || '<p class="muted" style="padding:10px">No moment.</p>';
  return `<div class="vr2"><div class="vr2-side"><div class="card"><h3>Categories</h3><div class="vr-cats two">${cats}</div></div>
    <div class="card"><div class="vr-tools"><select class="select" id="vr-match"><option value="all">All ${ms.length} matches</option>${ms.map((m) => `<option value="${m.id}" ${T2.match === m.id ? 'selected' : ''}>${t2day(m.date)} · ${m.home === team ? 'v ' + escapeHtml(m.away) : '@ ' + escapeHtml(m.home)}</option>`).join('')}</select>
      <button class="btn" id="vr-all">▶ Play all</button><button class="btn p" data-export="${T2.match === 'all' ? (ms[0] || {}).id : T2.match}">⬇ XML</button></div>
      ${chips ? `<div style="margin-bottom:6px">${chips}</div>` : ''}<h3>${escapeHtml(label)} <small>${L.length} moments</small></h3><div class="vr-list">${rows}</div></div></div>
    <div class="card pl2" id="pl2">${t2PlayerHead(T2.ev)}</div></div>`;
}

// ------------------------------------------------------------------ the 2D player (the whole match file)
const T2_OPT = { trails: true, names: true, line: true, block: false }; // the old Match 2D's options
const P2X = { x: null, file: null, team: null, t: 0, dur: 0, play: false, sp: 1, raf: null, last: null, all: false, list: null };
function t2PlayerHead(x) {
  if (!x) return '<div class="pl2-none">Pick a moment</div>';
  const m = t2M()[x.m];
  return `<div class="pl2-top"><div><b>${t2Min(x)} · ${escapeHtml(T2_CAT[x.c][1])}${x.tag ? ' · ' + escapeHtml(x.tag) : ''}</b><small>${escapeHtml(m.home)} ${m.score[0]}–${m.score[1]} ${escapeHtml(m.away)} · ${t2day(m.date)}${t2Name(x.p) ? ' · ' + escapeHtml(t2Name(x.p)) : ''}${x.pressures ? ` · ${x.pressures} pressure${x.pressures > 1 ? 's' : ''}` : ''}${x.up != null ? ` · ${x.up} opponents in their third` : ''}</small></div><span class="clk" id="pl2-clk"></span></div>
    ${m.tracking ? `<div id="pl2-stage"><div class="pl2-none">Loading the 2D…</div></div>` : '<div class="pl2-none">No tracking file for this match: the list and the XML export only.</div>'}`;
}
async function t2PlayerOpen(x, autoplay) {
  t2Stop();
  P2X.x = x; P2X.t = 0;
  const box = document.getElementById('pl2'); if (!box) return;
  box.innerHTML = t2PlayerHead(x);
  if (!x || !t2M()[x.m].tracking) return;
  try { P2X.file = await t2Fetch(x.m, 'full'); } catch (e) { document.getElementById('pl2-stage').innerHTML = `<div class="pl2-none">${escapeHtml(e.message)}</div>`; return; }
  if (P2X.x !== x) return;
  P2X.team = x.t; P2X.dur = Math.max(2000, Math.min(x.b, x.a + 20000) - x.a);
  document.getElementById('pl2-stage').innerHTML = `<canvas id="pl2-cv" width="1100" height="740"></canvas>
    <div class="pl2-ctrl"><button class="btn" id="pl2-play">▶</button><button class="btn" id="pl2-back">−5 s</button><input type="range" id="pl2-seek" min="0" max="${P2X.dur}" step="20" value="0">
      <button class="btn" data-sp="0.5">×0.5</button><button class="btn" data-sp="1">×1</button><button class="btn" data-sp="2">×2</button><button class="btn" id="pl2-next">Next ▸</button></div>
    <div class="pl2-ctrl">${[['trails', 'Trails'], ['names', 'Names'], ['line', 'Defensive line'], ['block', 'Team block']].map(([k, l]) => `<button class="btn${T2_OPT[k] ? ' p' : ''}" data-opt2="${k}">${l}</button>`).join('')}</div>
    <span class="muted" style="font-size:11.5px">${escapeHtml(x.t)} attack → · ${x.t === T2_US || x.opp === T2_US ? 'yellow = Al Gharafa · ' : ''}blue = ${escapeHtml(x.t === T2_US ? x.opp : x.t)}${x.t === T2_US || x.opp === T2_US ? '' : ', red = ' + escapeHtml(x.opp)} · white ring = player on the ball · dashed = the defending team's last line · the clip starts ${T2_PRE[x.c] / 1000} s before</span>`;
  document.getElementById('pl2-play').onclick = () => t2Play(!P2X.play);
  document.getElementById('pl2-back').onclick = () => { P2X.t = Math.max(0, P2X.t - 5000); t2Draw2(); };
  document.getElementById('pl2-seek').oninput = (e) => { P2X.t = +e.target.value; t2Draw2(); };
  document.querySelectorAll('#pl2 [data-sp]').forEach((b) => (b.onclick = () => { P2X.sp = +b.dataset.sp; }));
  document.getElementById('pl2-next').onclick = () => t2Next(false);
  document.querySelectorAll('#pl2 [data-opt2]').forEach((b) => (b.onclick = () => { const k = b.dataset.opt2; T2_OPT[k] = !T2_OPT[k]; b.classList.toggle('p', T2_OPT[k]); t2Draw2(); }));
  t2Draw2();
  if (autoplay) t2Play(true);
}
function t2Stop() { if (P2X.raf) cancelAnimationFrame(P2X.raf); P2X.raf = null; P2X.play = false; }
function t2Play(on) { P2X.play = on; const b = document.getElementById('pl2-play'); if (b) b.textContent = on ? '❚❚' : '▶'; if (on && !P2X.raf) { P2X.last = null; P2X.raf = requestAnimationFrame(t2Loop); } }
function t2Loop(now) {
  P2X.raf = null;
  if (CURRENT_VIEW !== 'tactical2' || !document.getElementById('pl2-cv')) { P2X.play = false; return; }
  if (P2X.play) { if (P2X.last != null) P2X.t += (now - P2X.last) * P2X.sp; if (P2X.t >= P2X.dur) { P2X.t = P2X.dur; t2Draw2(); if (P2X.all) { t2Next(true); return; } t2Play(false); return; } t2Draw2(); }
  P2X.last = now;
  if (P2X.play) P2X.raf = requestAnimationFrame(t2Loop);
}
function t2Next(auto) {
  const L = P2X.list || [], M = t2M(), i = L.indexOf(T2.ev), nx = L.slice(i + 1).find((x) => M[x.m].tracking);
  if (!nx) { P2X.all = false; t2Play(false); return; }
  T2.ev = nx;
  document.querySelectorAll('#t2-body .vr-ev').forEach((b) => b.classList.toggle('on', L[+b.dataset.ev] === nx));
  if (!auto) P2X.all = false;
  t2PlayerOpen(nx, true);
}
function t2Draw2() {
  const cv = document.getElementById('pl2-cv'), F = P2X.file, x = P2X.x;
  if (!cv || !F || !x) return;
  const H = F.halves[String(x.h)]; if (!H) return;
  const flip = (F.dir[`${x.h}|${x.t}`] || 1) === -1, ms = x.a + P2X.t, fi = (ms - H.t0) / H.dt, i = Math.max(0, Math.min(H.f.length - 1, Math.floor(fi))), j = Math.min(H.f.length - 1, i + 1), u = Math.max(0, Math.min(1, fi - i));
  const A = H.f[i], B = H.f[j], lerp = (k) => (A[k] == null ? null : B[k] == null ? A[k] : A[k] + (B[k] - A[k]) * u);
  const fx = (v) => (v == null ? null : flip ? 1050 - v : v), fy = (v) => (v == null ? null : flip ? 680 - v : v);
  const cx = cv.getContext('2d'), W = cv.width, Hh = cv.height, PAD = 30, S2 = (W - 2 * PAD) / 105, X = (v) => PAD + v / 10 * S2, Y = (v) => PAD + v / 10 * S2;
  cx.fillStyle = '#2f8a4c'; cx.fillRect(0, 0, W, Hh);
  for (let s = 0; s < 14; s++) if (s % 2) { cx.fillStyle = 'rgba(255,255,255,.035)'; cx.fillRect(X(s * 75), 0, 7.5 * S2, Hh); }
  cx.strokeStyle = 'rgba(255,255,255,.85)'; cx.lineWidth = 2; cx.strokeRect(X(0), Y(0), 105 * S2, 68 * S2);
  cx.beginPath(); cx.moveTo(X(525), Y(0)); cx.lineTo(X(525), Y(680)); cx.stroke(); cx.beginPath(); cx.arc(X(525), Y(340), 9.15 * S2, 0, 7); cx.stroke();
  [[0, 1], [1050, -1]].forEach(([x0, d]) => { cx.strokeRect(Math.min(X(x0), X(x0 + d * 165)), Y(138.4), 16.5 * S2, 40.32 * S2); cx.strokeRect(Math.min(X(x0), X(x0 + d * 55)), Y(248.4), 5.5 * S2, 18.32 * S2); });
  cx.fillStyle = 'rgba(255,255,255,.78)'; cx.font = '700 13px system-ui'; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText(`${x.t} attack  →`, X(10), PAD / 2);
  const side = (pl) => { const team = pl[2] === 0 ? F.home : F.away; return team; };
  const pos = F.players.map((pl, k) => [k, fx(lerp(2 + 2 * k)), fy(lerp(3 + 2 * k))]).filter((q) => q[1] != null);
  const ball = A[0] != null ? [fx(lerp(0)), fy(lerp(1))] : null;
  const opp = pos.filter(([k]) => side(F.players[k]) !== x.t && !F.players[k][3]);
  if (T2_OPT.block) [true, false].forEach((foc) => { // each team's block: the box around its outfield players
    const o = pos.filter(([k]) => (side(F.players[k]) === x.t) === foc && !F.players[k][3]); if (o.length < 5) return;
    const xs = o.map((q) => q[1]), ys = o.map((q) => q[2]), team = foc ? x.t : (x.t === F.home ? F.away : F.home), us = team === T2_US;
    cx.fillStyle = us ? 'rgba(245,197,24,.15)' : foc ? 'rgba(31,58,158,.15)' : 'rgba(229,72,77,.12)'; cx.strokeStyle = us ? 'rgba(245,197,24,.85)' : foc ? 'rgba(120,150,255,.8)' : 'rgba(229,72,77,.6)'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.rect(X(Math.min(...xs)), Y(Math.min(...ys)), (Math.max(...xs) - Math.min(...xs)) / 10 * S2, (Math.max(...ys) - Math.min(...ys)) / 10 * S2); cx.fill(); cx.stroke(); });
  if (T2_OPT.trails) { // the last 3 s: each player's path and the ball's
    const i0 = Math.max(0, i - 15);
    F.players.forEach((pl, k) => { cx.beginPath(); let on = false; for (let q = i0; q <= i; q++) { const r = H.f[q], px = fx(r[2 + 2 * k]), py = fy(r[3 + 2 * k]); if (px == null) { on = false; continue; } if (on) cx.lineTo(X(px), Y(py)); else cx.moveTo(X(px), Y(py)); on = true; }
      const team = side(pl); cx.strokeStyle = team === T2_US ? 'rgba(253,230,138,.6)' : team === x.t ? 'rgba(170,190,255,.55)' : 'rgba(255,170,170,.5)'; cx.lineWidth = 2.5; cx.stroke(); });
    cx.beginPath(); let on = false; for (let q = i0; q <= i; q++) { const r = H.f[q]; if (r[0] == null) { on = false; continue; } if (on) cx.lineTo(X(fx(r[0])), Y(fy(r[1]))); else cx.moveTo(X(fx(r[0])), Y(fy(r[1]))); on = true; }
    cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 2; cx.setLineDash([3, 4]); cx.stroke(); cx.setLineDash([]);
  }
  if (T2_OPT.line && opp.length > 4) { const lx = Math.max(...opp.map((q) => q[1])); cx.setLineDash([8, 6]); cx.strokeStyle = 'rgba(255,200,200,.9)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(X(lx), Y(0)); cx.lineTo(X(lx), Y(680)); cx.stroke(); cx.setLineDash([]); }
  let onBall = null, best = 25; if (ball) pos.forEach(([k, px, py]) => { const d = Math.hypot(px - ball[0], py - ball[1]); if (d < best) { best = d; onBall = k; } });
  pos.forEach(([k, px, py]) => { const pl = F.players[k], team = side(pl), gk = pl[3], R = 12, us = team === T2_US, focus = team === x.t;
    const fill = us ? (gk ? '#7a5c00' : '#f5c518') : focus ? (gk ? '#0f1d5a' : '#1f3a9e') : (gk ? '#7c3aed' : '#e5484d'), ink = us && !gk ? '#16269e' : '#fff';
    if (k === onBall) { cx.beginPath(); cx.arc(X(px), Y(py), R + 6, 0, 7); cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.stroke(); }
    cx.beginPath(); cx.arc(X(px), Y(py) + 2, R, 0, 7); cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fill();
    cx.beginPath(); cx.arc(X(px), Y(py), R, 0, 7); cx.fillStyle = fill; cx.fill();
    cx.fillStyle = ink; cx.font = '800 11.5px system-ui'; cx.textAlign = 'center'; cx.fillText(pl[1], X(px), Y(py) + 0.5);
    if (T2_OPT.names) { const n = pl[4] || ''; const sn = n.length > 12 ? n.slice(0, 11) + '.' : n; cx.font = '700 10.5px system-ui'; cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillText(sn, X(px) + 1, Y(py) + R + 10); cx.fillStyle = '#fff'; cx.fillText(sn, X(px), Y(py) + R + 9); } });
  if (ball) { cx.beginPath(); cx.arc(X(ball[0]), Y(ball[1]), 6.5, 0, 7); cx.fillStyle = '#fff'; cx.fill(); cx.strokeStyle = '#111'; cx.lineWidth = 1.5; cx.stroke(); }
  const mm = (x.h === 2 ? 45 : 0) + ms / 60000, clk = document.getElementById('pl2-clk');
  if (clk) clk.textContent = `${Math.floor(mm)}:${String(Math.floor((mm % 1) * 60)).padStart(2, '0')}`;
  const sk = document.getElementById('pl2-seek'); if (sk) sk.value = P2X.t;
}

// ------------------------------------------------------------------ the XML export for the video
const T2_COL = { goal_kick: [65535, 42405, 0], build_up: [13107, 39321, 65535], press: [65535, 13107, 13107], regain_high: [0, 39321, 13107], counter: [39321, 0, 65535], entry: [0, 52428, 52428],
  prog: [26214, 26214, 65535], cross: [65535, 52428, 0], shot: [65535, 0, 32767], corner: [52428, 52428, 52428], free_kick: [39321, 39321, 39321], loss: [39321, 13107, 0] };
function t2Code(x) {
  if (x.c === 'goal_kick') return `Goal kick · ${x.kind}`;
  if (x.c === 'build_up') return `Build-up · ${x.start === 'open play' ? 'after a regain' : 'settled'}${x.pressed ? ' · pressed' : ''}`;
  if (x.c === 'press') return `Pressing · ${x.kind}`;
  if (x.c === 'entry') return `Final-third entry · ${x.kind}`;
  return T2_CAT[x.c][1];
}
const t2Clock = (s) => { const p = String(s || '0').trim().split(':').map(Number); return p.some(isNaN) ? 0 : p.reduce((a, v) => a * 60 + v, 0); };
async function t2Export(mid) {
  const md = document.getElementById('t2-modal'), M = t2M();
  if (!mid || !M[mid]) return;
  await t2Fetch(mid, 'ev').catch(() => null);
  const E = { mid, both: T2.s === 'matches', team: T2.s === 'teams' ? T2.team : M[mid].home, cats: new Set(['goal_kick', 'build_up', 'press']), ko1: '0:00', ko2: '0:00', pre: 2, post: 2 };
  const draw = async () => {
    await t2Fetch(E.mid, 'ev').catch(() => null);
    const m = M[E.mid], tms = [m.home, m.away], pk = T2.packs[E.mid] || { moments: [], players: {} };
    if (!tms.includes(E.team)) E.team = m.home;
    const mine = pk.moments.filter((x) => (E.both || x.t === E.team));
    const X = mine.filter((x) => E.cats.has(x.c)).sort((a, b) => a.h - b.h || a.a - b.a);
    const ko1 = t2Clock(E.ko1), ko2 = t2Clock(E.ko2), e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lab = (g, t) => (t == null || t === '' ? '' : `\n      <label><group>${e(g)}</group><text>${e(t)}</text></label>`);
    const inst = X.map((x, k) => { const off = x.h === 1 ? ko1 : ko2, s = Math.max(0, off + x.a / 1000 - E.pre), en = off + x.b / 1000 + +E.post;
      return `    <instance>\n      <ID>${k + 1}</ID>\n      <start>${s.toFixed(2)}</start>\n      <end>${en.toFixed(2)}</end>\n      <code>${e(t2Code(x))}</code>${lab('Team', x.t)}${lab('Outcome', x.tag)}${lab('Player', (pk.players[x.p] || [])[0])}${lab('Half', x.h)}${lab('Minute', t2Min(x))}\n    </instance>`; });
    const rows = [...new Set(X.map((x) => t2Code(x) + '|' + x.c))].map((s) => { const [code, c] = s.split('|'), [r, g, b] = T2_COL[c] || [30000, 30000, 30000]; return `    <row><code>${e(code)}</code><R>${r}</R><G>${g}</G><B>${b}</B></row>`; });
    const txt = `<?xml version="1.0" encoding="utf-8"?>\n<file>\n  <SESSION_INFO><start_time>${m.date} 00:00:00</start_time></SESSION_INFO>\n  <ALL_INSTANCES>\n${inst.join('\n')}\n  </ALL_INSTANCES>\n  <ROWS>\n${rows.join('\n')}\n  </ROWS>\n</file>\n`;
    const ms = T2.data.matches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    md.innerHTML = `<div class="dlg"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Export for the video · XML</h2><button class="btn" id="x-close">✕</button></div>
      <p>One file per match video, in the Sportscode XML format that Hudl Sportscode, Nacsport, Metrica Play, LongoMatch and Angles import: each moment becomes a clip on the video's timeline with its labels (team, outcome, player, minute). Type where each half kicks off in the video so that the clips land on the right images.</p>
      <div class="row"><label>Match <select class="select" id="x-mid">${ms.map((z) => `<option value="${z.id}" ${z.id === E.mid ? 'selected' : ''}>${t2day(z.date)} · ${escapeHtml(z.home)} ${z.score[0]}–${z.score[1]} ${escapeHtml(z.away)}</option>`).join('')}</select></label>
        <label><select class="select" id="x-team"><option value="1" ${E.both ? 'selected' : ''}>Both teams</option>${tms.map((t) => `<option value="t:${escapeHtml(t)}" ${!E.both && E.team === t ? 'selected' : ''}>${escapeHtml(t)} only</option>`).join('')}</select></label></div>
      <div class="cats">${T2_CATS.map(([c, l]) => `<label><input type="checkbox" data-xc="${c}" ${E.cats.has(c) ? 'checked' : ''}> ${escapeHtml(l)} <span class="muted">${mine.filter((x) => x.c === c).length}</span></label>`).join('')}</div>
      <div class="row"><label>1st half kick-off in the video <input type="text" id="x-ko1" value="${escapeHtml(E.ko1)}" placeholder="mm:ss"></label><label>2nd half kick-off <input type="text" id="x-ko2" value="${escapeHtml(E.ko2)}" placeholder="h:mm:ss"></label>
        <label>extra before (s) <input type="number" id="x-pre" value="${E.pre}" min="0" max="20"></label><label>after (s) <input type="number" id="x-post" value="${E.post}" min="0" max="20"></label></div>
      <pre>${escapeHtml(txt.split('\n').slice(0, 20).join('\n'))}${txt.split('\n').length > 20 ? '\n…' : ''}</pre>
      <div class="foot"><span class="muted" style="font-size:12.5px"><b>${X.length}</b> clips</span><button class="btn blue" id="x-dl" ${X.length ? '' : 'disabled'}>⬇ Download .xml</button></div></div>`;
    md.hidden = false;
    md.querySelector('#x-close').onclick = () => { md.hidden = true; };
    md.querySelector('#x-mid').onchange = (ev) => { E.mid = ev.target.value; draw(); };
    md.querySelector('#x-team').onchange = (ev) => { const v = ev.target.value; E.both = v === '1'; if (!E.both) E.team = v.slice(2); draw(); };
    md.querySelectorAll('[data-xc]').forEach((b) => (b.onchange = () => { b.checked ? E.cats.add(b.dataset.xc) : E.cats.delete(b.dataset.xc); draw(); }));
    [['x-ko1', 'ko1'], ['x-ko2', 'ko2'], ['x-pre', 'pre'], ['x-post', 'post']].forEach(([id, k]) => (md.querySelector('#' + id).onchange = (ev) => { E[k] = ev.target.value; draw(); }));
    md.querySelector('#x-dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/xml' }));
      a.download = `${m.date}_${m.home}_v_${m.away}_${E.both ? 'both' : E.team}.xml`.replace(/\s+/g, '_'); document.body.appendChild(a); a.click(); a.remove(); };
  };
  draw();
}

// ------------------------------------------------------------------ binding (team page)
function t2Bind() {
  const box = document.getElementById('t2-body');
  box.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => { T2.team = b.dataset.team; T2.ev = null; T2.match = 'all'; T2.f = {}; drawTactical2(); }));
  box.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { T2.seg = b.dataset.seg; drawTactical2(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  box.querySelectorAll('[data-def]').forEach((b) => (b.onclick = () => { T2.open = T2.open === b.dataset.def ? null : b.dataset.def; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-watch]').forEach((b) => (b.onclick = () => { const w = JSON.parse(b.dataset.watch); T2.cat = w.cat; T2.f = w.f || {}; T2.match = 'all'; T2.ev = null; T2.seg = 'video'; T2.s = 'teams'; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { T2.cat = b.dataset.cat; T2.f = {}; T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { const [k, v] = JSON.parse(b.dataset.f); if (T2.f[k] === v) delete T2.f[k]; else T2.f[k] = v; T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-vmatch]').forEach((b) => (b.onclick = () => { T2.match = b.dataset.vmatch; T2.seg = 'video'; T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-export]').forEach((b) => (b.onclick = () => t2Export(b.dataset.export)));
  box.querySelectorAll('[data-pdf]').forEach((b) => (b.onclick = () => t2ReportPdf(b.dataset.pdf, b)));
  box.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { const prev = T2.pick && T2.pick.team === T2.team ? T2.pick : null; T2.pick = { team: T2.team, mode: b.dataset.pick, set: prev && prev.set ? prev.set : new Set() }; T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); }));
  box.querySelectorAll('[data-pm]').forEach((b) => (b.onchange = () => { const P = T2.pick; b.checked ? P.set.add(b.dataset.pm) : P.set.delete(b.dataset.pm); T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); }));
  const vm = document.getElementById('vr-match'); if (vm) vm.onchange = () => { T2.match = vm.value; T2.ev = null; box.innerHTML = t2TeamPage(); t2Bind(); };
  const L = T2.seg === 'video' ? t2List(T2.team, T2.cat, T2.f, T2.match) : [];
  P2X.list = L;
  box.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => { T2.ev = L[+b.dataset.ev]; box.querySelectorAll('.vr-ev').forEach((z) => z.classList.toggle('on', z === b)); P2X.all = false; t2PlayerOpen(T2.ev, true); }));
  const all = document.getElementById('vr-all'); if (all) all.onclick = () => { const M = t2M(), first = L.find((x) => M[x.m].tracking); if (!first) return; T2.ev = first; P2X.all = true; t2PlayerOpen(first, true); };
  if (T2.seg === 'video' && T2.ev) t2PlayerOpen(T2.ev, false);
}

// ------------------------------------------------------------------ League: the season table and the players
const T2_C = [
  ['p', 'Played', 'Results', '', 'sum', 0], ['wdl', 'W-D-L', 'Results', '', 'txt', 0], ['pts', 'Points', 'Results', 'h', 'sum', 0], ['gf', 'Goals', 'Results', 'h', 'sum', 0], ['ga', 'Conceded', 'Results', 'l', 'sum', 0],
  ['xg', 'xG', 'Attack', 'h', 'sum', 1], ['shots', 'Shots', 'Attack', 'h', 'sum', 0], ['sot', 'On target', 'Attack', 'h', 'sum', 0], ['head_goals', 'Headed goals', 'Attack', 'h', 'sum', 0],
  ['sp_goals', 'Set-piece goals', 'Attack', 'h', 'sum', 0], ['pen_goals', 'Penalty goals', 'Attack', 'h', 'sum', 0], ['crosses', 'Crosses', 'Attack', '', 'sum', 0], ['crosses_ok', 'Crosses completed', 'Attack', 'h', 'sum', 0],
  ['corners', 'Corners', 'Attack', 'h', 'sum', 0], ['offsides', 'Offsides', 'Attack', '', 'sum', 0], ['xga', 'xG conceded', 'Defence', 'l', 'sum', 1], ['shots_a', 'Shots conceded', 'Defence', 'l', 'sum', 0],
  ['fouls', 'Fouls committed', 'Discipline', 'l', 'sum', 0], ['fouls_won', 'Fouls suffered', 'Discipline', '', 'sum', 0], ['yellow', 'Yellow cards', 'Discipline', 'l', 'sum', 0], ['red', 'Red cards', 'Discipline', 'l', 'sum', 0],
  ['poss', 'Possession %', 'With the ball', '', 'avg', 0], ['passes', 'Passes', 'With the ball', '', 'sum', 0], ['pass_ok', 'Pass %', 'With the ball', 'h', 'avg', 0], ['duels_won', 'Duels won %', 'With the ball', 'h', 'avg', 0], ['aerials_won', 'Aerial duels won %', 'With the ball', 'h', 'avg', 0],
  ['dist', 'Distance (km)', 'Physical · tracking', 'h', 'sum', 1], ['hsr', '> 20 km/h (km)', 'Physical · tracking', 'h', 'sum', 1], ['sprints', 'Sprints', 'Physical · tracking', 'h', 'sum', 0], ['vmax', 'Top speed (km/h)', 'Physical · tracking', 'h', 'max', 1],
];
const T2_PM = [
  ['goals', 'Goals', 'Attack', 'min', 0], ['xg', 'xG', 'Attack', 'min', 1], ['shots', 'Shots', 'Attack', 'min', 0], ['sot', 'Shots on target', 'Attack', 'min', 0], ['head_goals', 'Headed goals', 'Attack', 'min', 0],
  ['assists', 'Assists', 'Creation', 'min', 0], ['key_passes', 'Key passes', 'Creation', 'min', 0], ['crosses_ok', 'Crosses completed', 'Creation', 'min', 0], ['prog', 'Progressive passes', 'Creation', 'min', 0], ['entries', 'Final-third entries', 'Creation', 'min', 0],
  ['recoveries', 'Ball recoveries', 'Duels', 'min', 0], ['duels_won', 'Duels won', 'Duels', 'min', 0], ['aerials_won', 'Aerial duels won', 'Duels', 'min', 0], ['fouls_won', 'Fouls suffered', 'Duels', 'min', 0],
  ['fouls', 'Fouls committed', 'Discipline', 'min', 0], ['yellow', 'Yellow cards', 'Discipline', 'min', 0],
  ['dist', 'Distance (km)', 'Physical', 'tmin', 1], ['hsr', '> 20 km/h (km)', 'Physical', 'tmin', 2], ['sprints', 'Sprints', 'Physical', 'tmin', 0], ['vmax', 'Top speed (km/h)', 'Physical', '', 1],
];
function t2League() {
  const G = T2.lg, players = G.view === 'players';
  const tog = (id, items, cur) => `<div class="mode" id="${id}">${items.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`;
  const top = `<div class="sx-top"><h1 style="font-size:24px">League numbers<small>${players ? 'every QSL player' : 'every QSL team'} · season</small></h1><div style="display:flex;gap:10px;flex-wrap:wrap">${tog('lg-view', [['teams', 'Teams'], ['players', 'Players']], G.view)}${tog('lg-mode', [['total', 'Season total'], ['match', players ? 'Per 90 min' : 'Per match']], G.mode)}${players ? tog('lg-pv', [['A', 'Top 10 cards'], ['B', 'Full table']], G.pv) : ''}</div></div>`;
  return `<div class="sx" style="padding:0">${top}${players ? (G.pv === 'B' ? t2PTable() : t2PCards()) : t2Season()}</div>`;
}
function t2Season() {
  const G = T2.lg, S0 = T2.data.season || {}, teams = Object.keys(S0), US = T2_US;
  const val = (t, c) => { const o = S0[t]; if (c[0] === 'wdl') return `${o.w}-${o.d}-${o.l}`; const v = o[c[0]]; return G.mode === 'match' && c[4] === 'sum' && c[0] !== 'p' ? v / o.p : v; };
  const fmt = (c, v) => (typeof v === 'string' ? v : v == null ? '—' : (G.mode === 'match' && c[4] === 'sum' && c[0] !== 'p' ? v.toFixed(['pts', 'gf', 'ga'].includes(c[0]) ? 2 : Math.max(1, c[5])) : v.toFixed(c[5])));
  const heat = (c, t) => { if (!c[3]) return ''; const xs = teams.map((x) => val(x, c)), v = val(t, c); if (xs.filter((x) => x === v).length > 3) return '';
    const rb = 1 + xs.filter((x) => (c[3] === 'h' ? x > v : x < v)).length, rw = 1 + xs.filter((x) => (c[3] === 'h' ? x < v : x > v)).length; return rb <= 3 ? `g${4 - rb}` : rw <= 3 ? `b${4 - rw}` : ''; };
  const sc = T2_C.find((x) => x[0] === G.sort) || T2_C[2], rows = teams.slice().sort((a, b) => (G.asc ? val(a, sc) - val(b, sc) : val(b, sc) - val(a, sc)) || val(b, T2_C[2]) - val(a, T2_C[2]));
  const groups = []; T2_C.forEach((c) => { const g = groups[groups.length - 1]; if (g && g[0] === c[2]) g[1]++; else groups.push([c[2], 1]); });
  const first = new Set(); let prev = ''; T2_C.forEach((c) => { if (c[2] !== prev) first.add(c[0]); prev = c[2]; });
  const avg = (c) => { if (c[4] === 'txt') return ''; const xs = teams.map((t) => val(t, c)); return fmt(c, xs.reduce((a, b) => a + b, 0) / xs.length); };
  return `<div class="card"><div class="scroll"><table class="st"><thead><tr><th class="tm grp"></th>${groups.map(([g, n]) => `<th class="grp sep" colspan="${n}">${escapeHtml(g)}</th>`).join('')}</tr>
    <tr><th class="tm">Team <small style="font-weight:500;color:var(--ink-muted)">· click a column to sort</small></th>${T2_C.map((c) => `<th class="${G.sort === c[0] ? 'on' : ''} ${first.has(c[0]) ? 'sep' : ''}" data-sort="${c[0]}">${escapeHtml(c[1])}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((t, i) => `<tr class="${t === US ? 'us' : ''}"><td class="tm"><span class="rk">${i + 1}</span>${crestHtml(t, 20)} ${escapeHtml(t)}</td>${T2_C.map((c) => `<td class="${heat(c, t)} ${first.has(c[0]) ? 'sep' : ''}">${fmt(c, val(t, c))}</td>`).join('')}</tr>`).join('')}
    <tr class="avg"><td class="tm">League average</td>${T2_C.map((c) => `<td class="${first.has(c[0]) ? 'sep' : ''}">${avg(c)}</td>`).join('')}</tr></tbody></table></div>
    <div class="leg" style="margin-top:10px"><span><i style="background:#c7efd3"></i>best · <i style="background:#dcf5e4"></i>2nd · <i style="background:#ecf9f0"></i>3rd</span><span><i style="background:#f9c9c9"></i>worst · <i style="background:#fbdcdc"></i>2nd worst · <i style="background:#fdeded"></i>3rd worst</span><span>no colour = a style number</span></div></div>
    <p class="note">Qatar Stars League · ${T2.data.n_qsl} matches with a file · xG = our model (distance and angle of each shot, a penalty 0.76) · set-piece goal = the possession started with a corner, a free kick, a throw-in or a penalty · distance, > 20 km/h and sprints (25 km/h for 0.5 s or more) = every player of the team, from the tracking · per match = the total ÷ the matches; the % columns are averages.</p>`;
}
function t2PList() { const G = T2.lg, grp = t2Grp; return (T2.data.players || []).filter((p) => p.min >= G.minm && (G.ft === 'all' || p.team === G.ft) && (G.fg === 'all' ? !p.gk : grp(p) === G.fg)); }
const t2Grp = (p) => (p.gk ? 'GK' : /Defender|Sweeper|WingBack/.test(p.pos) ? 'DEF' : /Midfielder/.test(p.pos) ? 'MID' : /Forward/.test(p.pos) ? 'FWD' : 'MID');
const t2Pv = (p, m) => { const v = p[m[0]] || 0; if (T2.lg.mode !== 'match' || !m[3]) return v; const base = p[m[3]]; return base ? v / base * 90 : 0; };
const t2Pf = (m, v) => (v == null ? '—' : T2.lg.mode === 'match' && m[3] ? v.toFixed(m[0] === 'dist' ? 1 : 2) : v.toFixed(m[4]));
function t2PFilters() {
  const G = T2.lg, opt = (cur, xs) => xs.map(([v, l]) => `<option value="${escapeHtml(String(v))}" ${String(v) === String(cur) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
  return `<div class="card" style="padding:12px 16px"><div class="pf"><select class="select" id="pf-t">${opt(G.ft, [['all', 'All teams'], ...Object.keys(T2.data.teams).sort().map((t) => [t, t])])}</select><select class="select" id="pf-g">${opt(G.fg, [['all', 'All outfield players'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards'], ['GK', 'Goalkeepers']])}</select>
    <select class="select" id="pf-m">${opt(G.minm, [[0, 'Any minutes'], [180, '180 min or more'], [270, '270 min or more'], [400, '400 min or more']])}</select><span class="muted" style="font-size:12.5px">${t2PList().length} players</span></div></div>`;
}
function t2PCards() {
  const L = t2PList(), card = (m) => { const all = L.slice().sort((a, b) => t2Pv(b, m) - t2Pv(a, m)), bi = all.findIndex((p) => p.team === T2_US), best = bi >= 10 ? all[bi] : null;
    return `<div class="pc"><h4 data-psort="${m[0]}" title="Open the full table sorted by it"><span>${escapeHtml(m[1])} <small style="text-transform:uppercase;letter-spacing:.05em;margin-left:4px">${escapeHtml(m[2])}</small></span><small>${T2.lg.mode === 'match' && m[3] ? 'per 90' : 'season'} ›</small></h4><ol>
      ${all.slice(0, 10).map((p, i) => `<li class="${p.team === T2_US ? 'us' : ''}"><span class="rk2">${i + 1}</span>${crestHtml(p.team, 16)}<span class="nm">${escapeHtml(p.n)}<small>${p.min}'</small></span><b>${t2Pf(m, t2Pv(p, m))}</b></li>`).join('')}</ol>
      ${best ? `<div class="best">Al Gharafa's best: ${escapeHtml(best.n)} · ${t2ord(bi + 1)} · ${t2Pf(m, t2Pv(best, m))}</div>` : ''}</div>`; };
  return t2PFilters() + `<div class="pc-grid">${T2_PM.map(card).join('')}</div><p class="note">Minutes from the match sheets · key pass = the pass before a shot (the provider's "assist to shot / goal") · progressive pass = completed, 30 / 15 / 10 m closer to goal · ball recovery = the first action of a possession won back in open play · per 90 = the total ÷ minutes × 90 (physical numbers over the minutes tracked) · top speed = the best of the season, from the tracking.</p>`;
}
function t2PTable() {
  const G = T2.lg, m0 = T2_PM.find((m) => m[0] === G.psort) || T2_PM[0], L = t2PList().sort((a, b) => (G.pasc ? t2Pv(a, m0) - t2Pv(b, m0) : t2Pv(b, m0) - t2Pv(a, m0)));
  const top3 = Object.fromEntries(T2_PM.map((m) => [m[0], new Set(t2PList().sort((a, b) => t2Pv(b, m) - t2Pv(a, m)).slice(0, 3).map((p) => p.pid))]));
  return t2PFilters() + `<div class="card"><div class="scroll"><table class="st pt"><thead><tr><th class="nm">Player</th><th>Team</th><th>Pos.</th><th>Matches</th><th>Minutes</th>${T2_PM.map((m) => `<th class="${G.psort === m[0] ? 'on' : ''}" data-psort="${m[0]}">${escapeHtml(m[1])}</th>`).join('')}</tr></thead><tbody>
    ${L.slice(0, 150).map((p, i) => `<tr class="${p.team === T2_US ? 'us' : ''}"><td class="nm"><span class="rk">${i + 1}</span>${escapeHtml(p.n)}</td><td>${crestHtml(p.team, 16)}</td><td>${t2Grp(p)}</td><td>${p.matches}</td><td>${p.min}</td>${T2_PM.map((m) => `<td class="${top3[m[0]].has(p.pid) ? 't3' : ''}">${t2Pf(m, t2Pv(p, m))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function t2LeagueBind() {
  const box = document.getElementById('t2-body'), G = T2.lg, re = () => { box.innerHTML = t2League(); t2LeagueBind(); };
  [['lg-view', 'view'], ['lg-mode', 'mode'], ['lg-pv', 'pv']].forEach(([id, k]) => box.querySelectorAll(`#${id} [data-v]`).forEach((b) => (b.onclick = () => { G[k] = b.dataset.v; re(); })));
  box.querySelectorAll('[data-sort]').forEach((th) => (th.onclick = () => { if (G.sort === th.dataset.sort) G.asc = !G.asc; else { G.sort = th.dataset.sort; G.asc = false; } re(); }));
  box.querySelectorAll('[data-psort]').forEach((th) => (th.onclick = () => { if (G.pv === 'B' && G.psort === th.dataset.psort) G.pasc = !G.pasc; else { G.psort = th.dataset.psort; G.pasc = false; } G.pv = 'B'; re(); }));
  [['pf-t', 'ft'], ['pf-g', 'fg'], ['pf-m', 'minm']].forEach(([id, k]) => { const el = document.getElementById(id); if (el) el.onchange = () => { G[k] = k === 'minm' ? +el.value : el.value; re(); }; });
}

// ------------------------------------------------------------------ Matches: the match centre
const T2_TL = ['goal_kick', 'build_up', 'press', 'regain_high', 'counter', 'entry', 'shot', 'corner', 'loss'];
async function t2MatchCentre(box) {
  const ms = T2.data.matches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).filter((m) => !T2.fteam || m.home === T2.fteam || m.away === T2.fteam);
  if (!T2.mid || !ms.some((m) => m.id === T2.mid)) T2.mid = (ms.find((m) => m.home === T2_US || m.away === T2_US) || ms[0] || {}).id;
  if (!T2.mid) { box.innerHTML = emptyState('No match file yet'); return; }
  box.innerHTML = '<div class="panel"><div class="empty">Loading the match…</div></div>';
  const pk = await t2Fetch(T2.mid, 'ev').catch(() => null);
  if (T2.s !== 'matches') return;
  const m = t2M()[T2.mid], H = m.home, A = m.away, len = 97;
  const mom = (pk ? pk.moments : []).map((x) => ({ ...x, m: T2.mid, opp: x.t === H ? A : H }));
  const tl = mom.filter((x) => T2_TL.includes(x.c) && !(x.c === 'build_up' && x.start === 'open play') && !(x.c === 'press' && x.kind !== 'organised')).sort((a, b) => a.h - b.h || a.a - b.a);
  if (!T2.ev || !tl.includes(T2.ev)) T2.ev = tl.find((x) => x.c === 'shot') || tl[0] || null;
  const xp = (x) => Math.min(99.4, ((x.h === 2 ? 47 : 0) + Math.min((x.a + (T2_PRE[x.c] || 0)) / 60000, x.h === 1 ? 47 : 50)) / len * 100);
  const rows = T2_TL.map((c) => { const xs = tl.filter((x) => x.c === c);
    return `<div class="tl-row"><span>${escapeHtml(T2_CAT[c][1])}${c === 'press' ? ' (organised)' : ''} <b class="muted">${xs.length}</b></span><div class="tl-lane">${xs.map((x) => `<i class="${x.t === H ? 'h' : 'a'} ${x === T2.ev ? 'on' : ''}" style="left:${xp(x)}%" data-tl="${tl.indexOf(x)}" title="${escapeHtml(t2Min(x) + ' ' + x.t + (x.tag ? ' · ' + x.tag : ''))}"></i>`).join('')}</div></div>`; }).join('');
  const say = (t) => (T2.data.teams[t] ? `<div class="card"><h3>${crestHtml(t, 18)} ${escapeHtml(t)} <small>season · ${T2.data.teams[t].n} matches</small></h3>${t2Say(t, false)}</div>` : `<div class="card"><h3>${crestHtml(t, 18)} ${escapeHtml(t)}</h3><p class="muted">Not a QSL team: no season profile.</p></div>`);
  box.innerHTML = `<div class="mc"><div class="card"><h3>Matches <small>${T2.data.matches.length} with an XML</small></h3><select class="select" id="mc-team" style="margin-bottom:8px;width:100%"><option value="">All teams</option>${Object.keys(T2.data.teams).sort().map((t) => `<option ${T2.fteam === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
      <div class="mc-list">${ms.map((z) => `<button class="mc-li ${z.id === T2.mid ? 'on' : ''}" data-mid="${z.id}"><small>${t2day(z.date)} · ${z.comp === 'Qatar Stars League' ? 'QSL' : escapeHtml(z.comp || '')}${z.tracking ? ' · 2D' : ''}</small><span>${crestHtml(z.home, 15)} ${escapeHtml(z.home)} <b>${z.score[0]}–${z.score[1]}</b> ${escapeHtml(z.away)} ${crestHtml(z.away, 15)}</span></button>`).join('')}</div></div>
    <div style="display:flex;flex-direction:column;gap:14px;min-width:0"><div class="mhd"><div class="tm">${crestHtml(H, 44)}${escapeHtml(H)}</div><div class="sc">${m.score[0]} – ${m.score[1]}<small>${escapeHtml(m.comp || '')} · ${t2day(m.date)}</small></div><div class="tm r">${crestHtml(A, 44)}${escapeHtml(A)}</div></div>
      <div class="card rep"><div class="thumbs"><i></i><i></i><i></i><i></i><i></i></div><div style="flex:1;min-width:180px"><b>Game report</b><div class="muted" style="font-size:12px">your Tableau report, ${H === T2_US || A === T2_US ? 12 : 10} pages, made from the XML</div></div>
        <button class="btn p" data-pdf="${T2.mid}">⬇ PDF</button><button class="btn" data-export="${T2.mid}">⬇ XML for the video</button></div>
      <div class="grid2">${say(H)}${say(A)}</div>
      <div class="card"><h3>Match timeline <small>● ${escapeHtml(H)} (top) · ● ${escapeHtml(A)} (bottom) · click a dot</small></h3>${rows}
        <div class="tl-ax"><span></span><div>${[0, 15, 30, 45, 60, 75, 90].map((v) => `<span style="left:${(v + (v > 45 ? 2 : 0)) / len * 100}%">${v}'</span>`).join('')}</div></div></div>
      <div class="card pl2" id="pl2">${t2PlayerHead(T2.ev)}</div></div></div>`;
  box.querySelectorAll('[data-mid]').forEach((b) => (b.onclick = () => { T2.mid = b.dataset.mid; T2.ev = null; t2MatchCentre(box); }));
  const mt = document.getElementById('mc-team'); if (mt) mt.onchange = () => { T2.fteam = mt.value || null; T2.mid = null; T2.ev = null; t2MatchCentre(box); };
  P2X.list = tl;
  box.querySelectorAll('[data-tl]').forEach((b) => (b.onclick = () => { T2.ev = tl[+b.dataset.tl]; box.querySelectorAll('.tl-lane i').forEach((z) => z.classList.toggle('on', z === b)); t2PlayerOpen(T2.ev, true); }));
  box.querySelectorAll('[data-export]').forEach((b) => (b.onclick = () => t2Export(b.dataset.export)));
  box.querySelectorAll('[data-pdf]').forEach((b) => (b.onclick = () => t2ReportPdf(b.dataset.pdf, b)));
  if (T2.ev) t2PlayerOpen(T2.ev, false);
}

// ------------------------------------------------------------------ his Tableau Game report (PDF)
async function t2ReportPdf(mid, btn) {
  const label = btn ? btn.textContent : '';
  let host = null;
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    const pk = await t2Fetch(mid, 'ev'), D = pk.report, m = t2M()[mid];
    if (!D) throw new Error('no report for this match yet');
    const ours = m.home === T2_US || m.away === T2_US;
    D.trends = ours ? (T2.data.trends || []).filter((r) => (r.date || '') <= (m.date || '')).slice(-7) : [];
    await Promise.all(RP_JS.map(rpScript));
    host = document.createElement('div');
    host.className = 'tbx';
    host.style.cssText = 'position:absolute;left:-20000px;top:0';
    host.innerHTML = tbxPages(D);
    document.body.appendChild(host);
    await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; }))));
    if (document.fonts) await document.fonts.ready;
    const pages = [...host.querySelectorAll('.pg')], W = 841.89, H = 595.28;
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      if (btn) btn.textContent = `Preparing… ${i + 1}/${pages.length}`;
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, ignoreElements: (el) => el.parentElement === document.body && el !== host });
      if (i) pdf.addPage('a4', 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST');
    }
    pdf.save(`Game_Report_${(m.home + '-' + m.away).replace(/\s+/g, '')}_${m.date}.pdf`);
  } catch (err) {
    alert('Could not create the PDF: ' + (err.message || err));
  } finally {
    if (host) host.remove();
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

// ------------------------------------------------------------------ his Tableau Game report pages (mockups/tableau.js, page for page)
/** D = the report data of a match (sync/tactical_tableau.py) → the 12 pages (10 for a match without Al Gharafa) as HTML, inside .tbx. */
function tbxPages(D) {
  const H = D.home, A = D.away, TH = D.teams[H], TA = D.teams[A];
  const RED = '#e15759', BLUE = '#4e79a7', YEL = '#edc948', GREY = '#bab0ac', ORANGE = '#f28e2b', GREEN = '#59a14f', NAVY = '#000080', LINE = '#3d3d3d';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SLUG = { 'Al Gharafa': 'al-gharafa', Esteghlal: 'esteghlal', 'Al Shahaniya': 'al-shahania', 'Al Shamal': 'al-shamal', 'Al Sadd': 'al-sadd', 'Lusail City': 'lusail', 'Al Wakrah': 'al-wakrah', 'Qatar SC': 'qatar-sc', 'Al Rayyan': 'al-rayyan', 'Al Ahli': 'al-ahli', 'Al Duhail': 'al-duhail', 'Al Arabi': 'al-arabi', 'Al Sailiya': 'al-sailiya', 'Umm Salal': 'umm-salal', 'Al Khor': 'al-khor', 'Qatar': 'qatar-sc', 'Al Hilal': 'al-hilal', 'Al Ahli Saudi': 'al-ahli-saudi', 'Al Qadsiah': 'al-qadsiah', 'Al Ittihad': 'al-ittihad', 'Al Nassr': 'al-nassr', 'Sharjah': 'sharjah', 'Tractor': 'tractor' };
  const crest = (t, h) => (SLUG[t] ? `<img src="img/clubs/${SLUG[t]}.png" style="height:${h}px;width:auto" alt="">` : `<b style="font-size:${h / 3}px">${esc(t)}</b>`);
  const crestSvg = (t, x, y, h) => (SLUG[t] ? `<image href="img/clubs/${SLUG[t]}.png" x="${x - h / 2}" y="${y - h / 2}" width="${h}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : '');
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const [dd, mm, yy] = D.date.split('/').map(Number), DATE = `${dd} ${MOIS[mm - 1]} ${yy}`;
  const page = (inner, cls = '') => `<section class="pg ${cls}">${inner}</section>`;
  const OURS = H === 'Al Gharafa' || A === 'Al Gharafa', COL = { [H]: OURS && A === 'Al Gharafa' ? GREY : YEL, [A]: OURS ? (A === 'Al Gharafa' ? YEL : GREY) : RED };
  const short = (n, k = 22) => (n.length > k ? n.slice(0, k - 1) + '..' : n);

  /** A vertical pitch (attack up): xc 0 → 68 across, yc 0 → 105 up. full or the attacking half. */
  function vp(w, h, half = false) {
    const L = 105, top = half ? 52.5 : 0, len = L - top, s = Math.min(w / 68, h / len), ox = (w - 68 * s) / 2, oy = (h - len * s) / 2;
    const X = (x) => ox + x * s, Y = (y) => oy + (L - y) * s, st = `stroke="${LINE}" stroke-width="1.6" fill="none"`;
    let g = `<rect x="${X(0)}" y="${Y(L)}" width="${68 * s}" height="${len * s}" fill="#fff" ${st}/>`;
    const box = (y0, dir) => `<rect x="${X(13.84)}" y="${Math.min(Y(y0), Y(y0 + dir * 16.5))}" width="${40.32 * s}" height="${16.5 * s}" ${st}/><rect x="${X(24.84)}" y="${Math.min(Y(y0), Y(y0 + dir * 5.5))}" width="${18.32 * s}" height="${5.5 * s}" ${st}/><circle cx="${X(34)}" cy="${Y(y0 + dir * 11)}" r="2.2" fill="${LINE}"/>`
      + `<path d="M ${X(26.7)} ${Y(y0 + dir * 16.5)} A ${9.15 * s} ${9.15 * s} 0 0 ${dir > 0 ? 1 : 0} ${X(41.3)} ${Y(y0 + dir * 16.5)}" ${st}/>`;
    g += box(L, -1);
    if (!half) g += box(0, 1);
    g += `<line x1="${X(0)}" x2="${X(68)}" y1="${Y(52.5)}" y2="${Y(52.5)}" ${st}/>` + (half ? `<path d="M ${X(24.85)} ${Y(52.5)} A ${9.15 * s} ${9.15 * s} 0 0 1 ${X(43.15)} ${Y(52.5)}" ${st}/>` : `<circle cx="${X(34)}" cy="${Y(52.5)}" r="${9.15 * s}" ${st}/>`);
    return { g, X, Y, s };
  }
  const svg = (w, h, inner) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  const dot = (x, y, r, fill, label, fs = 9, col = '#1d1d1f') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>${label != null ? `<text x="${x}" y="${y + fs * 0.36}" font-size="${fs}" font-weight="700" fill="${col}" text-anchor="middle">${label}</text>` : ''}`;

  // ------------------------------------------------------------------ 1. GAME REPORT
  function p1() {
    const X = D.xml || {}, xg = X.xg || {}, po = X.poss || {};
    // goal (ball), assist (A), yellow / red card beside the player, with the minute (his ask, 2026-10-20)
    const ICON = { g: '<svg width="13" height="13" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#fff" stroke="#1d1d1f" stroke-width="1.6"/><path d="M10 5.2 14.3 8.3 12.7 13.3H7.3L5.7 8.3Z" fill="#1d1d1f"/></svg>',
      a: '<svg width="13" height="13" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9.5" fill="#000080"/><text x="10" y="14.2" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">A</text></svg>',
      y: '<svg width="10" height="13" viewBox="0 0 10 13"><rect x="1" y="0.5" width="8" height="12" rx="1.5" fill="#ffd400" transform="rotate(8 5 6.5)"/></svg>', r: '<svg width="10" height="13" viewBox="0 0 10 13"><rect x="1" y="0.5" width="8" height="12" rx="1.5" fill="#e3001b" transform="rotate(8 5 6.5)"/></svg>' };
    const icons = (p) => ((D.icons || {})[p] || []).map(([k, mn]) => `<i class="ic">${ICON[k]}<small>${mn}'</small></i>`).join('');
    const list = (T, col) => `<div class="list"><h4>PLAYERS</h4>${T.starters.map(([n, p]) => `<div><b>${n}</b><span>${esc(short(p, 26))}</span>${icons(p)}</div>`).join('')}<h4 class="red" style="margin-top:28px">SUBSTITUTE</h4>${T.subs.map(([n, p]) => `<div style="padding:8px 0"><b>${n}</b><span>${esc(short(p, 26))}</span>${icons(p)}</div>`).join('')}</div>`;
    // back to back from the centre (his Tableau): in each row the larger value takes the whole half width
    const bar = (l, a, b) => { const m = Math.max(a, b, 1), W = 314;
      return `<div class="bt">${l}</div><div class="bars"><span><i style="width:${(a / m) * W}px;background:${RED}">${a}</i></span><span><i style="width:${(b / m) * W}px;background:${BLUE}">${b}</i></span></div>`; };
    const pc = (o) => (o ? `${o[H]}% - ${o[A]}%` : '–');
    return page(`<div class="bar">GAME REPORT</div><div style="text-align:center;font-size:10px;font-weight:700;margin:5px 0">${DATE}</div>
      <div class="p1"><div><div style="text-align:center;height:150px">${crest(H, 150)}</div>${list(TH)}</div>
        <div class="mid"><div style="font-size:10px;font-weight:700;margin-bottom:8px">ROUND ${D.round}</div><div class="score">${esc(H)} <span>${TH.goals} - ${TA.goals}</span> ${esc(A)}</div>
          <div class="xg">${xg[H] != null ? xg[H].toFixed(2) : '–'} xG <b>- ${xg[A] != null ? xg[A].toFixed(2) : '–'} xG</b></div>
          <div class="poss">POSSESSION<em>${pc(po.all)}</em></div><div class="half">1st Half<em>${pc(po['1'])}</em>2nd Half<em>${pc(po['2'])}</em></div>
          ${bar('PASSES', TH.passes, TA.passes)}${bar('PASSES IN FINAL THIRD', TH.final_third, TA.final_third)}${bar('SHOTS', TH.shots, TA.shots)}${bar('SHOTS ON TARGET', TH.on_target, TA.on_target)}${bar('CROSSES', TH.crosses, TA.crosses)}</div>
        <div><div style="text-align:center;height:150px">${crest(A, 150)}</div>${list(TA)}</div></div>`);
  }

  // ------------------------------------------------------------------ 2-3. PASS MATRIX + PASSMAP
  function pPass(T) {
    const N = T.num, rows = T.matrix.players.slice().sort((a, b) => (N[a] || 99) - (N[b] || 99));
    const cell = {}, tot = {}, rec = {};
    T.matrix.cells.forEach(([a, b, c]) => { cell[a + '|' + b] = c; tot[a] = (tot[a] || 0) + c; rec[b] = (rec[b] || 0) + c; });
    const cols = rows.slice().sort((a, b) => (rec[a] || 0) - (rec[b] || 0));
    const mx = Math.max(1, ...Object.values(cell)), shade = (c) => { const t = Math.min(1, c / mx); const r = Math.round(200 - 160 * t), g = Math.round(232 - 120 * t), b = Math.round(222 - 60 * t); return `rgb(${r},${g},${b})`; };
    const kv = (l, p, v) => `<div class="kv"><div class="navy">${l}</div><div><b>${p ? N[p] : ''}</b><span class="red">${esc(p || '')}</span><span class="v" style="margin-left:auto;margin-right:150px">${v ?? ''}</span></div></div>`;
    const mxt = `<table class="mx"><tr><th></th><th></th>${cols.map((c) => `<th><div>${esc(short(c, 14))}</div></th>`).join('')}<th><div>Total Passes</div></th></tr>
      <tr><td></td><td></td>${cols.map((c) => `<td style="font-weight:700">${N[c] || ''}</td>`).join('')}<td></td></tr>
      ${rows.map((r) => `<tr><td class="j">${N[r] || ''}</td><td class="n">${esc(short(r, 24))}</td>${cols.map((c) => { const v = cell[r + '|' + c]; return `<td style="background:${v ? shade(v) : '#fff'};color:${v && v / mx > 0.55 ? '#fff' : '#1d1d1f'}">${v || ''}</td>`; }).join('')}<td><b>${tot[r] || ''}</b></td></tr>`).join('')}
      <tr><td></td><td class="n" style="text-align:right"><b>Total Receptions</b></td>${cols.map((c) => `<td><b>${rec[c] || ''}</b></td>`).join('')}<td><b>${Object.values(tot).reduce((a, b) => a + b, 0)}</b></td></tr></table>`;
    // the pass map: average positions, links by number of passes
    const W = 380, Hh = 640, P = vp(W, Hh), pos = T.network.pos, st = new Set(T.network.starters), mxl = Math.max(1, ...T.network.links.map((l) => l[2]));
    let g = P.g;
    T.network.links.forEach(([a, b, c]) => { if (!pos[a] || !pos[b]) return; /* 5 passes or more between starters, as his Tableau */ g += `<line x1="${P.X(pos[a][0])}" y1="${P.Y(pos[a][1])}" x2="${P.X(pos[b][0])}" y2="${P.Y(pos[b][1])}" stroke="${BLUE}" stroke-width="${0.8 + 3.4 * (c / mxl)}" stroke-linecap="round"/>`; });
    Object.entries(pos).forEach(([p, [x, y]]) => { g += st.has(p) ? dot(P.X(x), P.Y(y), 11, ORANGE, N[p], 9.5) : dot(P.X(x), P.Y(y), 6, YEL, N[p], 8); });
    return page(`<div class="pp"><div><div style="text-align:center">${crest(T.team, 74)}<div style="font-size:11px;margin-top:6px">${esc(H)} v ${esc(A)}<br>${DATE}</div></div>
        ${kv('MOST PASSES', T.most_passes[0], T.most_passes[1])}${kv('MOST PASSES RECEIVED', T.most_received[0], T.most_received[1])}${kv('MOST PROGRESSIVE PASSING DISTANCE', T.most_prog[0], '')}${kv('MOST PROGRESSIVE PASSES RECEIVED', T.most_prog_received[0], '')}${mxt}</div>
      <div style="text-align:center"><div style="color:${RED};font-weight:700;font-size:14px;margin:0 0 6px">PassMap</div>${svg(W, Hh, g)}</div></div>`);
  }

  // ------------------------------------------------------------------ 4. SHOTS MAP
  function p4() {
    const half = (T, h) => { const P = vp(370, 300, true); let g = P.g; T.shots_pts.filter((s) => s.h === h).forEach((s) => { g += dot(P.X(s.x), P.Y(s.y), 8, s.on ? GREEN : RED, s.n, 8); }); return `<div><div style="text-align:center;font-size:10px;font-weight:700">${h === 1 ? '1st' : '2nd'} Half</div>${svg(370, 300, g)}</div>`; };
    const ast = (team) => { const rows = D.assists.filter((r) => r[1] === team); const by = (t) => rows.filter((r) => r[2] === t);
      return `<table class="ast">${['Assist to goal', 'Assist to shot'].map((t) => by(t).map((r, i) => `<tr>${i === 0 ? `<td class="k" rowspan="${by(t).length}">${t}</td>` : ''}<td class="p">${esc(r[0])}</td><td>${r[3]}</td></tr>`).join('')).join('')}</table>`; };
    const block = (T) => `<div style="display:grid;grid-template-columns:370px 370px 1fr;gap:6px;align-items:start;position:relative"><div class="rt" style="grid-column:1/3;margin:2px 0 0">${esc(T.team)}</div><div></div>${half(T, 1)}${half(T, 2)}<div style="margin-top:-10px">${ast(T.team)}</div>
      <div style="position:absolute;left:336px;top:250px">${crest(T.team, 66)}</div></div>`;
    return page(`<div class="bar">SHOTS MAP</div>${block(TH)}${block(TA)}`);
  }

  // ------------------------------------------------------------------ 5. PROGRESSIVE DISTANCE
  function p5() {
    const tbl = (key, title) => { const rows = [...TH[key].map((r) => [...r, H]), ...TA[key].map((r) => [...r, A])].sort((a, b) => b[3] - a[3]);
      const mx = Math.max(1, ...rows.map((r) => Math.abs(r[3]))), mn = Math.min(0, ...rows.map((r) => r[3])), W = 210, z = (-mn / (mx - mn)) * W;
      return `<div><div class="rt" style="font-weight:700;font-size:13px;margin:10px 0 6px">${title}</div><table class="tbl">${rows.map(([p, n, grp, v, t]) => { const w = (Math.abs(v) / (mx - mn)) * W;
        return `<tr><td style="width:120px;white-space:nowrap">${esc(short(p, 20))}</td><td class="red" style="width:22px">${n}</td><td style="width:34px">${grp}</td><td><svg width="${W + 40}" height="13"><rect x="${v >= 0 ? z + 20 : z + 20 - w}" y="1" width="${Math.max(1, w)}" height="11" fill="${COL[t]}"/><text x="${v >= 0 ? z + 24 + w : z + 16 - w}" y="10" font-size="9" text-anchor="${v >= 0 ? 'start' : 'end'}" fill="#333">${v}</text></svg></td></tr>`; }).join('')}</table></div>`; };
    return page(`<div class="bar">PROGRESSIVE DISTANCE WITH PASSES AND BALL</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">${tbl('prog_pass', 'DISTANCE WON WITH PASSES')}${tbl('prog_carry', 'DISTANCE WON WITH BALL')}</div>`);
  }

  // ------------------------------------------------------------------ 6. ZONES OF FAULTS
  function p6() {
    const side = (T, col) => { const W = 520, Hh = 690, P = vp(W, Hh); let g = P.g, n = T.fouls.length;
      const my = n ? T.fouls.reduce((a, f) => a + f.y, 0) / n : null, mx = n ? T.fouls.reduce((a, f) => a + f.x, 0) / n : null; // his two reference lines: the average height and the average side
      if (my != null) g += `<line x1="0" x2="${W}" y1="${P.Y(my)}" y2="${P.Y(my)}" stroke="#9a9a9a" stroke-width="1"/><text x="2" y="${P.Y(my) - 3}" font-size="9" fill="#777">Moyenne</text>`
        + `<line x1="${P.X(mx)}" x2="${P.X(mx)}" y1="0" y2="${Hh}" stroke="#9a9a9a" stroke-width="1"/><text x="${P.X(mx) + 3}" y="${Hh - 3}" font-size="9" fill="#777">Moyenne</text>`;
      T.fouls.forEach((f) => { g += dot(P.X(f.x), P.Y(f.y), 9.5, col, f.n, 8.5); });
      return `<div style="text-align:center;border:1px solid #e3e3e3"><div style="font-size:12px;border-bottom:1px solid #e3e3e3">${esc(T.team)}</div>${svg(W, Hh, g)}</div>`; };
    return page(`<div class="bar">ZONES OF FAULTS</div><div style="display:grid;grid-template-columns:1fr 1fr">${side(TH, COL[H])}${side(TA, COL[A])}</div>`);
  }

  // ------------------------------------------------------------------ 7-8. ENTRIES INTO THE FINAL THIRD
  function pEntry(key, title) {
    const side = (T, col) => { const W = 360, Hh = 470, P = vp(W, Hh), E = T[key]; let g = P.g;
      [23, 47].forEach((x) => { g += `<line x1="${P.X(x)}" x2="${P.X(x)}" y1="${P.Y(105)}" y2="${P.Y(0)}" stroke="#f4a6a8" stroke-width="2.4" stroke-dasharray="9 6"/><text x="${P.X(x) + 2}" y="${P.Y(0) - 3}" font-size="8.5" fill="#999">${x}</text>`; });
      [['L', 11.5], ['M', 35], ['R', 57.5]].forEach(([k, x]) => { g += `<line x1="${P.X(x) - 18}" x2="${P.X(x) + 18}" y1="${P.Y(31)}" y2="${P.Y(31)}" stroke="#ddd"/><text x="${P.X(x)}" y="${P.Y(28)}" font-size="10" fill="#c00000" text-anchor="middle">${E.lanes[k] || 0}</text><line x1="${P.X(x) - 18}" x2="${P.X(x) + 18}" y1="${P.Y(25)}" y2="${P.Y(25)}" stroke="#ddd"/>`; });
      E.pts.forEach((p) => { g += dot(P.X(p.x), P.Y(p.y), 8.5, col, p.n, 8); });
      return `<div style="text-align:center;border:1px solid #eee"><div style="font-size:12px" class="navy">${esc(T.team)}</div>${svg(W, Hh, g)}</div>`; };
    const top = (T) => `<table class="tbl" style="font-size:9.5px">${T[key].top.map(([p, n, c]) => `<tr><td class="navy" style="text-align:center">${esc(short(p, 26))}</td><td class="red" style="width:30px">${n}</td><td class="navy" style="text-align:center">${c}</td></tr>`).join('')}</table>`;
    return page(`<div class="rt" style="font-size:12px">${title}</div><div style="display:grid;grid-template-columns:1fr 1fr">${side(TH, COL[H])}${side(TA, COL[A])}${top(TH)}${top(TA)}</div>`);
  }

  // ------------------------------------------------------------------ 9-10. HEAT MAPS
  function pHeat(T) {
    const grp = (p) => (/Defender|Sweeper|WingBack/.test(p) ? 0 : /Midfielder/.test(p) ? 1 : 2), rows = [[], [], []];
    T.heat.slice().sort((a, b) => (a.pos < b.pos ? -1 : 1)).forEach((h) => rows[grp(h.pos)].push(h)); // his order: the positions alphabetically
    const ord = (p) => ['Left', 'Sweeper', '', 'Right'].findIndex((k) => k && p.includes(k));
    const mini = (h, w, hh) => { const P = vp(w, hh); let g = P.g; h.pts.forEach(([x, y]) => { g += `<circle cx="${P.X(x)}" cy="${P.Y(y)}" r="1.9" fill="${RED}"/>`; });
      return `<div style="text-align:center"><div style="font-size:9.5px;font-weight:700" class="navy">${h.pos}</div><div style="font-size:9.5px;font-weight:700" class="navy">${esc(h.name)}</div>${svg(w, hh, g)}</div>`; };
    const sizes = [[90, 122], [114, 176], [114, 176]];
    return page(`<div class="bar">HEAT MAP</div>${rows.map((r, i) => `<div style="display:flex;justify-content:space-around;align-items:flex-start;border-bottom:1px dotted #ccc;padding:4px 0">${r.map((h) => mini(h, ...sizes[i])).join('')}${i === 2 ? `<div style="align-self:center">${crest(T.team, 76)}</div>` : ''}</div>`).join('')}`);
  }

  // ------------------------------------------------------------------ 11-12. GHARAFA PASSING / SHOTS (the last matches)
  function pTrend(title, lines, sub, keys) {
    const P = vp(230, 400); let g = P.g;
    lines.forEach(([x1, y1, x2, y2]) => { g += `<line x1="${P.X(x1)}" y1="${P.Y(y1)}" x2="${P.X(x2)}" y2="${P.Y(y2)}" stroke="#00a000" stroke-width="2.2" stroke-linecap="round"/><circle cx="${P.X(x2)}" cy="${P.Y(y2)}" r="2.6" fill="#00a000"/>`; });
    const T = D.trends, W = 470, n = T.length, Xi = (i) => 30 + i * (W - 60) / Math.max(1, n - 1);
    const chart = (k) => { const v = T.map((r) => r[k]), mx = Math.max(...v), mn = Math.min(...v), hh = 62, Y = (x) => 16 + (mx === mn ? hh / 2 : (mx - x) / (mx - mn) * hh), avg = v.reduce((a, b) => a + b, 0) / n;
      let s = `<line x1="0" x2="${W}" y1="0.5" y2="0.5" stroke="#444" stroke-width="1.4"/><line x1="0" x2="${W}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#bbb" stroke-dasharray="5 4"/><text x="2" y="${Y(avg) - 3}" font-size="8.5" fill="#888">Moyenne</text>`;
      s += `<polyline points="${v.map((x, i) => `${Xi(i)},${Y(x)}`).join(' ')}" fill="none" stroke="${BLUE}" stroke-width="2"/>` + v.map((x, i) => `<circle cx="${Xi(i)}" cy="${Y(x)}" r="2.6" fill="${BLUE}"/><text x="${Xi(i)}" y="${Y(x) + (i % 2 ? 13 : -5)}" font-size="9" fill="#444" text-anchor="middle">${x}</text>`).join('');
      return svg(W, 92, s); };
    return page(`<div class="bar teal">${title}</div><div style="display:grid;grid-template-columns:240px 110px 1fr;gap:6px;margin-top:14px">
      <div><div style="color:#1515e0;font-weight:700;font-size:9.5px;text-align:center;margin:8px 0 10px">${sub}</div><div style="border:1px solid #ddd">${svg(230, 400, g)}</div></div>
      <div style="font-size:9.5px;font-weight:700">${['OPPONENT', ...keys.map((k) => k[1])].map((l, i) => `<div style="height:${i ? 92 : 52}px;display:flex;align-items:center;justify-content:center;text-align:center">${l}</div>`).join('')}</div>
      <div><div style="height:52px;position:relative">${svg(470, 52, T.map((r, i) => crestSvg(r.opp, Xi(i), 26, 30)).join(''))}</div>${keys.map((k) => chart(k[0])).join('')}</div></div>`);
  }

  return p1() + pPass(TH) + pPass(TA) + p4() + p5() + p6()
    + pEntry('entry_pass', 'ENTRY INTO FINAL THIRD BY PASSES (start of the pass)') + pEntry('entry_carry', 'ENTRY INTO FINAL THIRD WITH BALL') + pHeat(TH) + pHeat(TA)
    + (!OURS || !(D.trends || []).length ? '' : pTrend('GHARAFA PASSING', D.ft_passes, 'SUCCESSFUL PASSES INTO FINAL THIRD', [['passes', 'PASSES'], ['pass_ok', '% of passes Successful'], ['forward', 'PASSES FORWARD'], ['final_third', 'PASSES INTO FINAL THIRD'], ['crosses', 'CROSSES']])
    + pTrend('GHARAFA SHOTS', D.box_passes, 'SUCCESSFUL PASSES INTO PENALTY BOX', [['shots', 'TOTAL SHOTS'], ['on_target', 'SHOTS ON TARGET'], ['inside', 'SHOTS INSIDE BOX'], ['outside', 'SHOTS FROM OUTSIDE BOX'], ['crosses_ok', 'SUCCESSFUL CROSSES']]));
}

// ------------------------------------------------------------------ the matches analysed (all · since a new coach · picked) — 2026-10-30
/** The team's latest coach and his matches when he is not the coach of its first match (the XML names each team's coach). */
function t2CoachSpan(team) {
  const ms = (T2.data.matches || []).filter((m) => (m.home === team || m.away === team) && m.coach && m.coach[team]).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (ms.length < 2) return null;
  const last = ms[ms.length - 1].coach[team];
  let i = ms.length - 1; while (i >= 0 && ms[i].coach[team] === last) i--;
  if (i < 0) return null;
  const now = ms.slice(i + 1), before = ms.slice(0, i + 1);
  return { coach: last, prev: before[before.length - 1].coach[team], since: now[0].date, mids: now.map((m) => m.id), prevMids: before.map((m) => m.id) };
}
function t2Sel(team) {
  const P = T2.pick;
  if (!P || P.team !== team || P.mode === 'all') return null;
  if (P.mode === 'coach') { const c = t2CoachSpan(team); return c ? new Set(c.mids) : null; }
  return P.set && P.set.size ? P.set : null;
}
function t2TeamNumbers(list) {
  const s = {}; list.forEach((r) => { for (const k in r) s[k] = (s[k] || 0) + r[k]; });
  const g = (k) => s[k] || 0, n = list.length || 1, r1 = (x) => Math.round(x * 10) / 10;
  const rate = (a, b) => (g(b) ? r1(100 * g(a) / g(b)) : null), per = (a) => r1(g(a) / n), lg = g('gk') - g('gk_short');
  return { fwd: per('fwd'), prog_ok: per('prog_ok'), rec_h: g('regains') ? r1(g('regain_x') / g('regains')) : null, high_reg: per('reg_high'), gk_short_pct: rate('gk_short', 'gk'), gk_short_prog: rate('gk_short_prog', 'gk_short'),
    gk_long_won: lg ? r1(100 * g('gk_long_won') / lg) : null, gk_press: g('gk_press_n') ? r1(g('gk_press') / g('gk_press_n')) : null, bu: per('bu'), bu_mid_pct: rate('bu_mid', 'bu'), bu_lost3_pct: rate('bu_lost3', 'bu'),
    bu_pressed_pct: rate('bu_pressed', 'bu_set_2d'), bu_pressed_mid_pct: rate('bu_pressed_mid', 'bu_pressed'), bu_pressed_lost3_pct: rate('bu_pressed_lost3', 'bu_pressed'), pr: per('pr'), pr_high_pct: rate('pr_high', 'pr'),
    pr_counter: per('pr_counter'), pr_won5_pct: rate('pr_won5', 'pr'), pr_beaten_pct: rate('pr_beaten', 'pr'), _s: s };
}
/** A team's numbers, ranks and sentence over some of its matches (the other teams keep their whole season). */
function t2Agg(team, mids) {
  const V = T2.data, per = (V.per || []).filter((p) => mids.has(p.id) && p.rows && p.rows[team]);
  if (!per.length) return null;
  const K1 = ['goals_for', 'goals_against', 'xg', 'xg_against', 'shots', 'shots_against', 'possession', 'passes', 'final_third', 'crosses', 'sp_goals', 'sp_against', 'press', 'fouls', 'counter', 'counter_against', 'loss3', 'corners'];
  const m = {};
  K1.forEach((k) => { const xs = per.map((p) => p.rows[team][k]).filter((x) => x != null); m[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
  const tn = t2TeamNumbers(per.map((p) => p.nums[team] || {})), s = tn._s; delete tn._s; Object.assign(m, tn);
  const sp = { corners: 0, corner_shots: 0, fks: 0, fk_shots: 0 }; per.forEach((p) => { const q = p.sp[team] || {}; for (const k in sp) sp[k] += q[k] || 0; });
  m.corner_shot_pct = sp.corners ? Math.round(1000 * sp.corner_shots / sp.corners) / 10 : null;
  m.fk_shot_pct = sp.fks ? Math.round(1000 * sp.fk_shots / sp.fks) / 10 : null;
  const rg = ['low', 'mid', 'high'].map((z) => s['reg_' + z] || 0), rt = rg.reduce((a, b) => a + b, 0) || 1;
  [m.reg_low_pct, m.reg_mid_pct, m.reg_high_pct] = rg.map((v) => Math.round(1000 * v / rt) / 10);
  const g = (k) => s[k] || 0;
  m.pr_split = [g('pr_won5'), g('pr_won10') - g('pr_won5'), g('pr_long'), g('pr_foul'), g('pr_beaten'), g('pr') - g('pr_won10') - g('pr_long') - g('pr_foul') - g('pr_beaten')];
  m.pr_kinds = [g('pr') - g('pr_counter'), g('pr_counter'), g('pr_high'), g('pr') - g('pr_high')];
  let w = 0, d = 0, gf = 0, ga = 0;
  per.forEach((p) => { const h = p.home === team, a = p.score[h ? 0 : 1], b = p.score[h ? 1 : 0]; gf += a; ga += b; w += a > b; d += a === b; });
  const N = V.N, rank = {};
  Object.keys(V.defs).forEach((k) => { const v = m[k]; if (v == null) { rank[k] = null; return; }
    const others = Object.entries(V.teams).filter(([t]) => t !== team).map(([, o]) => o.m[k]).filter((x) => x != null); rank[k] = 1 + others.filter((x) => x > v).length; });
  const T = { n: per.length, rec: [w, d, per.length - w - d, gf, ga], m, rank };
  T.say = t2SayFor(T);
  return T;
}
function t2SayFor(T) {
  const V = T2.data, N = V.N, good = [], bad = [], style = [], txt = (k, v) => t2Fmt(k, v).replace(/<small>(.*?)<\/small>/g, ' $1');
  Object.entries(V.defs).forEach(([k, [, , side]]) => { if (!side || !V.phrase[k] || T.rank[k] == null) return; const best = side === 'high' ? T.rank[k] : N + 1 - T.rank[k];
    if (best <= 3) good.push([best, k]); else if (best >= N - 2) bad.push([N + 1 - best, k]); });
  Object.keys(V.style).forEach((k) => { const r = T.rank[k]; if (r != null && T.m[k] != null && (r <= 2 || r >= N - 1)) style.push([Math.min(r, N + 1 - r), k, r <= 2]); });
  const sort = (a, b) => a[0] - b[0];
  const item = (k, phrase, rk) => { const p = V.phrase[k] || [], sw = V.style_watch[k], cat = p[2] || (sw && sw[0]) || null, f = p[2] ? p[3] : (sw && sw[1]) || null;
    return { k, txt: phrase, val: txt(k, T.m[k]), rank: rk, cat, f }; };
  const strong = good.sort(sort).slice(0, 3).map(([b, k]) => item(k, V.phrase[k][0], b === 1 ? 'best in the league' : `${t2ord(b)} best`));
  const weak = bad.sort(sort).slice(0, 3).map(([b, k]) => item(k, V.phrase[k][1], b === 1 ? 'worst in the league' : `${t2ord(b)} worst`));
  const sty = style.sort(sort).slice(0, 2).map(([, k, hi]) => { const v = T.m[k], tpl = V.style[k][hi ? 0 : 1];
    return item(k, tpl.replace('{v}', Math.round(v)).replace('{w}', Math.round(100 - v)).replace('{f}', v.toFixed(1)), ''); });
  const watch = [];
  [...weak, ...sty, ...strong].forEach((it) => { if (it.cat && watch.every((w) => w.cat !== it.cat || JSON.stringify(w.f) !== JSON.stringify(it.f))) watch.push({ cat: it.cat, f: it.f || {}, why: it.txt }); });
  return { strong, weak, style: sty, watch: watch.slice(0, 3) };
}
const T2_AGG = {};
/** The team as analysed now: its whole season, or the matches picked. */
function t2T(team) {
  const sel = t2Sel(team);
  if (!sel) return T2.data.teams[team];
  const key = team + '|' + [...sel].sort().join(',');
  if (!(key in T2_AGG)) T2_AGG[key] = t2Agg(team, sel) || T2.data.teams[team];
  return T2_AGG[key];
}

/** The matches chooser and, when the coach changed, what changed (the biggest moves, in league spreads). */
function t2Picker(team) {
  const V = T2.data, P = T2.pick && T2.pick.team === team ? T2.pick : { mode: 'all' }, c = t2CoachSpan(team);
  const ms = V.matches.filter((m) => m.home === team || m.away === team).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const btn = (mode, label) => `<button class="chip ${P.mode === mode ? 'on' : 'g'}" data-pick="${mode}">${label}</button>`;
  let html = `<div class="card" style="padding:12px 16px"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px"><b style="font-size:12.5px;margin-right:6px">Matches analysed</b>${btn('all', `All ${ms.length}`)}${c ? btn('coach', `Since the new coach · ${escapeHtml(c.coach)} · ${c.mids.length}`) : ''}${btn('pick', 'Choose…')}</div>`;
  if (P.mode === 'pick') {
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px">${ms.map((m) => `<label style="font-size:12.5px;display:flex;gap:5px;align-items:center"><input type="checkbox" data-pm="${m.id}" ${P.set && P.set.has(m.id) ? 'checked' : ''}>${t2day(m.date)} · ${m.home === team ? 'v ' + escapeHtml(m.away) : '@ ' + escapeHtml(m.home)} ${m.score[0]}–${m.score[1]}${m.coach && m.coach[team] ? ` <small class="muted">${escapeHtml(m.coach[team])}</small>` : ''}</label>`).join('')}</div>`;
  }
  if (t2Sel(team)) html += '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Every number, rank, sentence and the video room on these matches only (the numbers from their QSL matches) · the other teams keep their whole season.</p>';
  html += '</div>';
  if (!c) return html;
  const before = t2Agg(team, new Set(c.prevMids)), after = t2Agg(team, new Set(c.mids));
  if (!before || !after) return html;
  const sd = (k) => { const xs = Object.values(V.teams).map((t) => t.m[k]).filter((x) => x != null), mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - mu) ** 2, 0) / xs.length) || 1; };
  const ch = Object.keys(V.defs).filter((k) => before.m[k] != null && after.m[k] != null).map((k) => [k, (after.m[k] - before.m[k]) / sd(k)])
    .filter(([, z]) => Math.abs(z) >= 0.5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  const txt = (k, v) => t2Fmt(k, v).replace(/<small>(.*?)<\/small>/g, ' $1');
  const rows = ch.map(([k, z]) => `<tr><td class="l">${escapeHtml(V.defs[k][0])}</td><td>${txt(k, before.m[k])}</td><td><b>${txt(k, after.m[k])}</b></td><td style="color:${V.defs[k][2] === 'high' ? (z > 0 ? '#0a7a32' : '#b42318') : V.defs[k][2] === 'low' ? (z < 0 ? '#0a7a32' : '#b42318') : '#6a6f80'}" title="green = better, red = worse, grey = a style number">${z > 0 ? '▲' : '▼'}</td></tr>`).join('');
  const few = after.n < 3 ? ' · few matches: to confirm' : '';
  const go = P.mode === 'coach' ? '' : '<button class="btn" data-pick="coach">Analyse his matches only</button>';
  html += `<div class="card" style="border-color:#f5a524;background:color-mix(in srgb,#f5a524 7%,var(--surface))"><h3 style="color:#8a5a00">⚠ New coach since ${t2day(c.since)} · ${escapeHtml(c.coach)} <small>${after.n} QSL match${after.n > 1 ? 'es' : ''} with a file · before: ${escapeHtml(c.prev)}, ${before.n}${few}</small><span class="sp"></span>${go}</h3>`
    + (ch.length ? `<table class="tt-tbl" style="max-width:720px"><thead><tr><th class="l">What changed most</th><th>${escapeHtml(c.prev)}</th><th>${escapeHtml(c.coach)}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No big change in the numbers yet.</p>')
    + '</div>';
  return html;
}
