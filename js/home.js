/* Home (his choice, mockup home2.html v1, 2026-10-20): the club logo opens the day's essentials, in his order —
 * yesterday's training against its objectives, today's training, the players available for the session (outfield
 * players only: the GPS to hand out), the wellness alerts, the next 5 matches — and the players to look at (the same
 * alerts as Sessions › Attention today: four tiles, a click opens the list). */
const HO = { P: {}, open: null };
const HO_K = [['td', 'Distance', 'm'], ['d15', '> 15 km/h', 'm'], ['hit', '> 20 km/h', 'm'], ['spr', '> 25 km/h', 'm'], ['acc_dec', 'Acc + Dec', ''], ['srpe', 'sRPE', 'AU'], ['minutes', 'Duration', 'min']];
const hoZc = (z) => (z == null ? '#aeaeb2' : z >= 2 ? '#e5484d' : z >= 1 ? '#ff9f0a' : z <= -1 ? '#2a78d6' : '#34c759');
const hoDay = (d, o) => fmtDay(d, o || { weekday: 'short', day: 'numeric', month: 'short' });
const hoCount = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

function renderHome() {
  const root = document.getElementById('view-home');
  root.innerHTML = '<div class="ho"><p class="muted">Loading…</p></div>';
  ['sessions', 'objectives', 'workload', 'staff_report', 'wellness', 'wellness_history', 'calendar'].forEach((k) => {
    withData(k, (d) => { HO.P[k] = d; drawHome(); }, () => {});
  });
}
function drawHome() {
  const P = HO.P, root = document.getElementById('view-home');
  if (!root || !P.sessions || !P.objectives || !P.workload || !P.calendar) return;
  const D = hoData();
  const next = D.matches[0], dleft = next ? hoCount(D.today, next.start) : null;
  const header = `<div class="ho-hd"><div class="ho-date">${fmtDay(D.today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <div class="ho-chips">${D.matchToday ? '<span class="ho-md">MD</span>' : D.tag ? `<span class="ho-md">${D.tag}</span>` : ''}${D.plan.type ? `<span>${D.plan.type[0].toUpperCase() + D.plan.type.slice(1)} microcycle · ${D.plan.length} days</span>` : ''}${next ? `<button type="button" class="ho-chip-m" data-go="calendar">${crestHtml(next.opponent, 16)} ${escapeHtml(next.opponent)} · ${hoDay(next.start, { weekday: 'short', day: 'numeric' })}${next.time ? ' · ' + next.time : ''} · ${dleft === 0 ? 'today' : dleft === 1 ? 'tomorrow' : 'in ' + dleft + ' days'}</button>` : ''}</div></div>`;
  root.innerHTML = `<div class="ho">${header}<div class="ho-g2">${hoYest(D)}${hoToday(D)}</div><div class="ho-g3">${hoAvail(D)}${hoWell(D)}${hoMatches(D)}</div>${hoAttn(D)}</div>`;
  hoBind(D);
}

function hoData() {
  const P = HO.P, today = todayIso(), plan = P.objectives.plan || {};
  TR.sessions = P.sessions; // playerName() reads its roster
  const tag = ((plan.days || []).find((d) => d.date === today) || {}).tag || null;
  const yest = P.sessions.sessions.filter((x) => x.date < today && x.team_ref && x.team_ref.td).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const done = P.sessions.sessions.find((x) => x.date === today && x.team_ref && x.team_ref.td);
  const T = (P.objectives.table || {})[plan.type] || {}, row = tag ? T[tag] : null;
  const pl = P.workload.players.filter((p) => p.pos !== 'GK'), out = pl.filter((p) => p.status !== 'available'); // outfield players: the GPS to hand out
  const w = P.wellness || {}, by = Object.fromEntries(Object.entries(w.byId || {}).filter(([, v]) => v && v.score != null).map(([k, v]) => [k, v.score]));
  const drops = P.wellness_history && w.date ? svWellDrops(P.wellness_history, w.date) : {};
  const red = Object.entries(by).filter(([, v]) => v < 50).sort((a, b) => a[1] - b[1]).map(([id, v]) => ({ id, v, t: 'red' }));
  const dr = Object.entries(drops).filter(([id]) => !(by[id] < 50)).map(([id, d]) => ({ id, v: d.now, t: 'drop', d }));
  const low = Object.entries(by).filter(([id, v]) => v >= 50 && v < 60 && !drops[id]).sort((a, b) => a[1] - b[1]).map(([id, v]) => ({ id, v }));
  const matches = (P.calendar.events || []).filter((e) => e.kind === 'match' && e.start >= today).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 5);
  return { P, today, tag, plan, yest, done, row, out, avail: pl.length - out.length, total: pl.length, w, by, red, dr, low, matches, matchToday: matches[0] && matches[0].start === today ? matches[0] : null };
}

/* yesterday (the last session with a team average): each metric against the usual of that session (its objective) */
function hoYest(D, done) {
  const s = done || D.yest;
  if (!s) return '<section class="ho-card"><div class="ho-k">Yesterday\'s training</div><p class="ho-none">No session yet.</p></section>';
  const R = s.team_ref, ks = HO_K.filter(([k]) => R[k] && R[k].mean), on = ks.filter(([k]) => Math.abs(R[k].z) < 1).length;
  const rows = ks.map(([k, l, u]) => { const r = R[k], pc = r.v / r.mean;
    return `<div class="ho-y"><span class="ho-l">${l}</span><span class="ho-bar"><i class="ho-fill" style="width:${Math.min(100, pc / 1.6 * 100)}%;background:${hoZc(r.z)}"></i><i class="ho-tgt" style="left:${100 / 1.6}%"></i></span>
      <span class="ho-v"><b>${fmtN(r.v)}</b><small>${u}</small></span><span class="ho-u">obj. ${fmtN(r.mean)}</span><span class="ho-pc" style="color:${hoZc(r.z)}">${Math.round(pc * 100)} %</span></div>`; }).join('');
  const when = done ? 'Today\'s training · done' : hoCount(s.date, D.today) === 1 ? 'Yesterday\'s training' : `Last training · ${hoDay(s.date, { weekday: 'short', day: 'numeric' })}`;
  const what = s.kind === 'match' ? `match vs ${escapeHtml(s.cycle.opponent || '')} · per 90 min` : s.group === 'compensatory' ? `${s.md || ''} · compensatory session` : s.md || 'training';
  return `<section class="ho-card ho-link" data-go="sessions" data-date="${s.date}"><div class="ho-k">${s.kind === 'match' ? (hoCount(s.date, D.today) === 1 ? 'Yesterday\'s match' : 'Last match') : when} · ${what}<i class="ho-go">›</i></div>
    <div class="ho-sub">${hoDay(s.date)} · ${s.minutes}' · ${s.n_core} players in the average · vs the last ${R.last || 15} ${s.kind === 'match' ? 'games' : 'sessions of its kind'}</div>
    <div class="ho-yh"><span class="ho-big" style="color:${on >= ks.length - 1 ? '#34c759' : '#ff9f0a'}">${on}/${ks.length}</span><span>metrics on target (green = within ±1 SD of the usual) · bar = value, line = objective</span></div>
    <div class="ho-rows">${rows}</div></section>`;
}
/* today: the objectives of the day — the usual of that MD in this microcycle type (team average), band = p25–p75 */
function hoToday(D) {
  const next = D.matches[0], dleft = next ? hoCount(D.today, next.start) : null;
  if (D.matchToday) {
    const m = D.matchToday;
    return `<section class="ho-card"><div class="ho-k">Today · match day</div><div class="ho-mday">${crestHtml(m.opponent, 56)}<div><b>${escapeHtml(m.opponent)}</b><span>${escapeHtml(m.competition)}${m.round ? ' · ' + escapeHtml(m.round) : ''} · ${/away/i.test(m.venue || '') || m.ha === 'A' ? 'Away' : 'Home'}${m.time ? ' · ' + m.time : ''}</span></div></div></section>`;
  }
  const r = D.row;
  if (!r && D.done) return hoYest(D, D.done); // a day with no objective (MD+1, MD+2): the session done, against its usual
  const rows = r ? HO_K.filter(([k]) => r[k]).map(([k, l, u]) => { const x = r[k], lo = x.p25, hi = x.p75, mx = (x.p90 || hi) * 1.15 || 1;
    return `<div class="ho-t"><span class="ho-l">${l}</span><span class="ho-bar"><i class="ho-rg" style="left:${lo / mx * 100}%;width:${Math.max(1, (hi - lo) / mx * 100)}%"></i><i class="ho-med" style="left:${x.med / mx * 100}%"></i></span>
      <span class="ho-v"><b>${fmtN(x.med)}</b><small>${u}</small></span><span class="ho-u">${fmtN(lo)}–${fmtN(hi)}</span></div>`; }).join('') : `<p class="ho-none">No training planned today${next ? ` · next: ${escapeHtml(next.opponent)} ${hoDay(next.start, { weekday: 'short', day: 'numeric' })}` : ''}.</p>`;
  const done = D.done ? `<button type="button" class="ho-done" data-go="sessions" data-date="${D.today}">✓ Session done · ${D.done.n} players — see it ›</button>` : '';
  return `<section class="ho-card"><div class="ho-k">Today's training${D.tag ? ` · ${D.tag}` : ''}${D.plan.type ? ` · ${D.plan.type} microcycle` : ''}</div>
    <div class="ho-sub">${fmtDay(D.today, { weekday: 'long', day: 'numeric', month: 'short' })}${next ? ` · ${dleft === 1 ? 'the day before' : dleft + ' days before'} ${escapeHtml(next.opponent)}` : ''}${r ? ` · objectives = the usual of a ${D.tag} (team average) · band = usual range` : ''}</div>
    ${done}<div class="ho-rows">${rows}</div></section>`;
}
function hoAvail(D) {
  const lab = { injured: 'Injury', rehab: 'Rehab', sick: 'Sick', national: 'National team', absent: 'Absent' }, col = { injured: '#e5484d', rehab: '#ff9f0a' };
  return `<section class="ho-card"><div class="ho-k">Available for the session</div>
    <div class="ho-ab"><b>${D.avail}</b><span>/ ${D.total}</span></div>
    <div class="ho-out">${D.out.map((p) => `<button type="button" class="ho-op" data-player="${p.id}">${avatarHtml(p.id, p.name, 26)}<b>${escapeHtml(p.name)}</b><i style="background:${col[p.status] || '#8e8e93'}">${lab[p.status] || p.today || p.status}</i></button>`).join('') || '<span class="ho-none">Everyone available</span>'}</div>
    <div class="ho-sub">out = injured, in rehab, sick, national team or absent today</div></section>`;
}
function hoWell(D) {
  const W = D.w;
  if (!W.date) return '<section class="ho-card"><div class="ho-k">Wellness alerts</div><p class="ho-none">No check-ins yet.</p></section>';
  const when = W.date === D.today ? 'this morning' : hoDay(W.date, { weekday: 'short', day: 'numeric' }) + ' morning';
  const item = (x) => `<button type="button" class="ho-wp ${x.t}" data-well="${x.id}">${avatarHtml(x.id, playerName(x.id), 26)}<b>${escapeHtml(playerName(x.id))}</b><em>${x.t === 'drop' ? `${x.d.prev} → ${x.v} %` : x.v + ' %'}</em><small>${x.t === 'red' ? 'in the red' : `2 mornings below his ${x.d.avg} %`}</small></button>`;
  const all = [...D.red, ...D.dr];
  return `<section class="ho-card"><div class="ho-k">Wellness alerts · ${when}</div>
    <div class="ho-wh"><span class="ho-ws" style="color:${W.teamScore >= 70 ? '#34c759' : '#ff9f0a'}">${W.teamScore != null ? Math.round(W.teamScore) + ' %' : '—'}</span><span>team · ${Object.keys(D.by).length} check-ins</span><span class="ho-wn"><b style="color:#e5484d">${D.red.length}</b> in the red · <b style="color:#ff9f0a">${D.dr.length}</b> dropping</span></div>
    <div class="ho-wl">${all.map(item).join('') || '<span class="ho-none">No alert</span>'}</div>
    ${D.low.length ? `<div class="ho-sub">also low (50–60 %): ${D.low.map((x) => escapeHtml(playerName(x.id)) + ' ' + x.v + ' %').join(' · ')}</div>` : ''}</section>`;
}
function hoMatches(D) {
  const m = D.matches.map((e, i) => { const n = hoCount(D.today, e.start), away = /away/i.test(e.venue || '') || e.ha === 'A';
    return `<div class="ho-m${i === 0 ? ' first' : ''}">${crestHtml(e.opponent, 30)}<span class="ho-mt"><b>${escapeHtml(e.opponent)}</b><small>${escapeHtml(e.competition || '')}${e.round ? ' · ' + escapeHtml(e.round) : ''} · ${away ? 'Away' : 'Home'}</small></span>
      <span class="ho-md2"><b>${hoDay(e.start)}</b><small>${e.time || ''}</small></span><span class="ho-mn">${n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' d'}</span></div>`; }).join('');
  return `<section class="ho-card ho-link" data-go="calendar"><div class="ho-k">Next ${D.matches.length} matches<i class="ho-go">›</i></div><div class="ho-ml">${m || '<span class="ho-none">No match in the calendar</span>'}</div></section>`;
}

/* the players to look at: Sessions › Attention today's alerts for the last session up to today, as four tiles */
function hoAttnData(D) {
  const P = D.P;
  if (!P.staff_report || !P.wellness_history) return null;
  TR.sessions = P.sessions; TR.workload = P.workload; TR.staff = P.staff_report; TR.whist = P.wellness_history;
  const s = P.sessions.sessions.filter((x) => x.date <= D.today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!s) return null;
  const at = svAttention(s);
  const ovV = (a) => (a.ov.length === 4 ? `all 4 · ${SV_ACS[a.ov[0].k]} ${a.ov[0].a.toFixed(2)}` : a.ov.slice(0, 2).map((o) => `${SV_ACS[o.k]} ${o.a.toFixed(2)}`).join(' · '));
  const over = at.filter((a) => a.over).sort((a, b) => b.ov.length - a.ov.length || b.ov[0].a - a.ov[0].a).map((a) => ({ p: a.p, v: ovV(a), t: a.over }));
  const well = at.filter((a) => a.well || a.wdrop).sort((a, b) => !!b.well - !!a.well).map((a) => ({ p: a.p, v: a.well ? `${a.w} %` : `${a.dr.prev} → ${a.dr.now} %`, t: a.well || a.wdrop }));
  const big = at.filter((a) => a.big || a.week).map((a) => { const x = a.bigs.length ? a.bigs[0] : a.wk[0]; return { p: a.p, v: `${a.bigs.length ? 'today' : 'week'} ${SV_BIGS[x.k] || x.k} z ${fmtSigned(x.z)}`, t: [a.big, a.week].filter(Boolean).join(' ') }; });
  const speed = [...svFlat(s), ...svOffGps(s)].filter((p) => p.days_hsv >= 10).sort((a, b) => b.days_hsv - a.days_hsv).map((p) => ({ p, v: `${p.days_hsv} days`, t: `No run at 90 % of his max speed for ${p.days_hsv} days.` }));
  return { s, n: svFlat(s).length + svOffGps(s).length + svKeepers(s).length, flagged: new Set([...over, ...well, ...big].map((x) => x.p.id)).size, G: [
    { k: 'over', c: 'red', t: '2 weeks overload', note: `A:C > ${SV_OVER} this week and last`, xs: over },
    { k: 'well', c: 'red', t: 'Wellness', note: '< 50 %, or −10 % two mornings', xs: well },
    { k: 'big', c: 'orange', t: 'Big change', note: 'today or week so far, |z| ≥ 2', xs: big },
    { k: 'speed', c: 'blue', t: 'Speed top-up', note: 'no run at 90 % of max speed ≥ 10 days', xs: speed }] };
}
function hoAttn(D) {
  const A = hoAttnData(D);
  if (!A) return '<section class="ho-card" id="ho-attn"><div class="ho-k">Players to look at</div><p class="ho-none">Loading…</p></section>';
  const s = A.s, open = A.G.find((g) => g.k === HO.open);
  const tile = (g) => `<button type="button" class="ho-tile ${g.c}${HO.open === g.k ? ' open' : ''}" data-k="${g.k}"><div class="ho-tt"><span class="ho-tn">${g.xs.length}</span><span class="ho-tl"><b>${g.t}</b><small>${g.note}</small></span></div>
    <div class="ho-faces">${g.xs.length ? g.xs.slice(0, 8).map((x) => avatarHtml(x.p.id, playerName(x.p.id), 28)).join('') + (g.xs.length > 8 ? `<span class="ho-more">+${g.xs.length - 8}</span>` : '') : '<span class="ho-ok">✓ none</span>'}</div></button>`;
  const list = open && open.xs.length ? `<div class="ho-list ${open.c}">${open.xs.map((x) => `<button type="button" class="ho-row" data-id="${x.p.id}"${x.p.gk ? ' data-gk="1"' : ''}>${avatarHtml(x.p.id, playerName(x.p.id), 26)}<b>${escapeHtml(playerName(x.p.id))}<small>${escapeHtml(svSub(x.p) || '')}</small></b><span class="ho-rv">${escapeHtml(x.v)}</span><span class="ho-rt">${escapeHtml(x.t)}</span><i>›</i></button>`).join('')}</div>` : '';
  return `<section class="ho-card" id="ho-attn"><div class="ho-ah"><div class="ho-k">Players to look at · ${s.date === D.today ? 'today' : hoDay(s.date, { weekday: 'short', day: 'numeric' })} · ${s.kind === 'match' ? 'match' : s.md || 'training'}</div>
    <span class="ho-as"><b>${A.flagged}</b> of ${A.n} players · click a tile for the list</span></div>
    <div class="ho-tiles">${A.G.map(tile).join('')}</div>${list}</section>`;
}
function hoBind(D) {
  const root = document.getElementById('view-home');
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => {
    if (el.dataset.go === 'sessions') switchView('sessions', { date: el.dataset.date }); else switchView(el.dataset.go);
  }));
  root.querySelectorAll('[data-player]').forEach((b) => b.addEventListener('click', () => switchView('player', { player: b.dataset.player })));
  root.querySelectorAll('[data-well]').forEach((b) => b.addEventListener('click', () => { LG.player = b.dataset.well; switchView('longitudinal'); }));
  hoBindAttn(D);
}
function hoBindAttn(D) {
  const att = document.getElementById('ho-attn'), s = (hoAttnData(D) || {}).s;
  if (!att || !s) return;
  att.querySelectorAll('.ho-tile').forEach((b) => b.addEventListener('click', () => { HO.open = HO.open === b.dataset.k ? null : b.dataset.k; att.outerHTML = hoAttn(D); hoBindAttn(D); }));
  att.querySelectorAll('.ho-row').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.gk) { LG.player = b.dataset.id; switchView('longitudinal'); } // a goalkeeper: his wellness trends
    else if (svFlat(s).some((x) => x.id === b.dataset.id)) { TR.openPlayer = b.dataset.id; switchView('sessions', { date: s.date, player: b.dataset.id }); } // his sheet of that session
    else switchView('player', { player: b.dataset.id });
  }));
}
