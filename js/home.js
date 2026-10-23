/* Home (his choice, mockup home2.html v1, 2026-10-20): the club logo opens the day's essentials, in his order —
 * yesterday's training against its objectives, today's training, the players available for the session (outfield
 * players only: the GPS to hand out), the wellness alerts, the next 5 matches — and the players to look at (the same
 * alerts as Sessions › Attention today: four tiles, a click opens the list).
 * Today's Session Plan (2026-10-23, his ask): once the staff saved today's plan, the players available and the groups
 * (team session, compensatory, recovery) come from it, and a compensatory group gets its objectives (the last 15
 * compensatory sessions). The day after a match with no plan yet and no day off: the compensatory group is proposed
 * (yesterday's unused substitutes, players not in the squad and players under 45 minutes). */
const HO = { P: {}, open: null };
const HO_K = [['td', 'Distance', 'm'], ['d15', '> 15 km/h', 'm'], ['hit', '> 20 km/h', 'm'], ['spr', '> 25 km/h', 'm'], ['acc_dec', 'Acc + Dec', ''], ['srpe', 'sRPE', 'AU'], ['minutes', 'Duration', 'min']];
const hoZc = (z) => (z == null ? '#aeaeb2' : z >= 2 ? '#e5484d' : z >= 1 ? '#ff9f0a' : z <= -1 ? '#2a78d6' : '#34c759');
const hoDay = (d, o) => fmtDay(d, o || { weekday: 'short', day: 'numeric', month: 'short' });
const hoVenue = (e) => String(e.venue || '').replace(/\s*\((away|home)\)\s*$/i, '').trim(); // the stadium, without the "(away)" of the fixture list
const hoCount = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

function renderHome() {
  const root = document.getElementById('view-home');
  root.innerHTML = '<div class="ho"><p class="muted">Loading…</p></div>';
  ['sessions', 'objectives', 'workload', 'staff_report', 'wellness', 'wellness_history', 'calendar'].forEach((k) => {
    withData(k, (d) => { HO.P[k] = d; drawHome(); }, () => {});
  });
  hoLoadPlans();
}
/** The plans saved on Session Plan (the Google script, slow): read again when the home page opens, at most once a minute
 * (a plan saved in this browser is already in SPL.saved). */
function hoLoadPlans() {
  if (AUTH.demo || typeof splFetchSaved !== 'function' || (SPL.fetchedAt && Date.now() - SPL.fetchedAt < 60000)) return;
  splFetchSaved().then((d) => { if (!SPL.saved || !SPL.edited) SPL.saved = d; if (CURRENT_VIEW === 'home') drawHome(); }).catch(() => {});
}
function hoTodayPlan(today) {
  const S = (typeof SPL !== 'undefined' && SPL.saved) || cacheGet('plans');
  return S && S.plans ? S.plans[today] || null : null;
}
const HO_OUT = { Injury: 'Injury', Injury_no_muscular: 'Injury', Rehab: 'Rehab', Sick: 'Sick', NT: 'National team', Day_Off: 'Day off', Authorized: 'Absent', Unauthorized: 'Absent', Training_TeamB: 'B team', Game_B: 'B team' };
const HO_GROUP = { ProTraining: 'team', Partial: 'team', INDIVIDUAL: 'individual', Compensatory: 'comp', Recovery: 'recovery' };
/** The objectives of a compensatory session: the last 15 compensatory sessions (team averages) — mean, p25–p75. */
function hoCompRef(P) {
  const xs = P.sessions.sessions.filter((x) => x.group === 'compensatory' && x.team).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15);
  if (xs.length < 3) return null;
  const q = (a, f) => { const b = a.slice().sort((u, v) => u - v), i = (b.length - 1) * f, lo = Math.floor(i); return b[lo] + (b[Math.min(lo + 1, b.length - 1)] - b[lo]) * (i - lo); };
  const out = { n: xs.length, since: xs[xs.length - 1].date };
  HO_K.forEach(([k]) => { const v = xs.map((x) => (k === 'minutes' ? x.minutes : x.team[k])).filter((y) => y != null);
    if (v.length >= 3) out[k] = { med: Math.round(v.reduce((a, b) => a + b, 0) / v.length), p25: Math.round(q(v, 0.25)), p75: Math.round(q(v, 0.75)), p90: Math.round(q(v, 0.9)) }; });
  return out;
}
function drawHome() {
  const P = HO.P, root = document.getElementById('view-home');
  if (!root || !P.sessions || !P.objectives || !P.workload || !P.calendar) return;
  const D = hoData();
  const next = D.matches[0], dleft = next ? hoCount(D.today, next.start) : null;
  const header = `<div class="ho-hd"><div class="ho-date">${fmtDay(D.today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <div class="ho-chips">${D.matchToday ? '<span class="ho-md">MD</span>' : D.tag ? `<span class="ho-md">${D.tag}</span>` : ''}${D.plan.type ? `<span>${D.plan.type[0].toUpperCase() + D.plan.type.slice(1)} microcycle · ${D.plan.length} days</span>` : ''}${next ? `<button type="button" class="ho-chip-m" data-go="calendar">${crestHtml(next.opponent, 16)} ${escapeHtml(next.opponent)} · ${hoDay(next.start, { weekday: 'short', day: 'numeric' })}${next.time ? ' · <b>' + next.time + '</b>' : ''}${hoVenue(next) ? ' · ' + escapeHtml(hoVenue(next)) : ''} · ${dleft === 0 ? 'today' : dleft === 1 ? 'tomorrow' : 'in ' + dleft + ' days'}</button>` : ''}</div></div>`;
  root.innerHTML = `<div class="ho">${header}<div class="ho-g2">${hoYest(D)}${hoToday(D)}</div><div class="ho-g3">${hoAvail(D)}${hoWell(D)}${hoMatches(D)}</div>${hoAttn(D)}</div>`;
  hoBind(D);
}

function hoData() {
  const P = HO.P, today = todayIso(), plan = P.objectives.plan || {};
  TR.sessions = P.sessions; // playerName() reads its roster
  const tag = ((plan.days || []).find((d) => d.date === today) || {}).tag || null;
  const yest = P.sessions.sessions.filter((x) => x.date < today && x.team_ref && x.team_ref.td).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const done = P.sessions.sessions.find((x) => x.date === today && x.team_ref && x.team_ref.td);
  // today's objective = the Sessions page's (the week until the match: the team's usual MD-k → MD-1 added up, minus what
  // is done, shared over the days left — staff report "plan"); without it, the usual of that MD (Objectives table)
  const SR = (P.staff_report && P.staff_report.days) || {}, T = (P.objectives.table || {})[plan.type] || {};
  const pd = Object.keys(SR).filter((d) => d < today).sort().reverse().map((d) => (SR[d].plan || []).find((x) => x.date === today)).find(Boolean);
  const row = pd ? Object.fromEntries(HO_K.filter(([k]) => pd[k] && pd[k][0] != null).map(([k]) => [k, { med: pd[k][0], usual: pd[k][1], p25: pd[k][2], p75: pd[k][3] }]))
    : tag && T[tag] ? Object.fromEntries(HO_K.filter(([k]) => T[tag][k]).map(([k]) => [k, { ...T[tag][k], med: T[tag][k].med }])) : null;
  const pl = P.workload.players.filter((p) => p.pos !== 'GK'); // outfield players: the GPS to hand out
  const tp = hoTodayPlan(today), st = tp && tp.status ? tp.status : null;
  const dayOff = !!(tp && tp.off) || (P.calendar.events || []).some((e) => e.kind === 'off' && e.start <= today && (e.end || e.start) >= today);
  let out, groups = null;
  if (st && !(tp && tp.off)) { // today's Session Plan: who trains, in which group, who is out
    out = pl.filter((p) => HO_OUT[st[p.id]]).map((p) => ({ ...p, planStatus: HO_OUT[st[p.id]] }));
    groups = { team: [], comp: [], recovery: [], individual: [] };
    pl.forEach((p) => { const g = HO_GROUP[st[p.id]]; if (g) groups[g].push(p); });
  } else out = pl.filter((p) => p.status !== 'available' && p.today !== 'NC'); // not in yesterday's squad (NC) is not an absence today
  // no plan yet, the day after a match and no day off: the compensatory group proposed from yesterday's match sheet
  let proposed = null;
  const ym = P.sessions.sessions.find((x) => x.kind === 'match' && hoCount(x.date, today) === 1);
  if (!st && !dayOff && ym) {
    const gk = new Set(Object.entries(P.sessions.roster || {}).filter(([, v]) => v.pos === 'GK').map(([k]) => k));
    const outIds = new Set(out.map((p) => p.id));
    proposed = [...ym.players.filter((p) => p.min < 45).map((p) => ({ id: p.id, why: `${p.min}' yesterday` })),
      ...(ym.absent || []).filter((p) => p.cat !== 'x' && /^(Game|NC)$/.test(p.type)).map((p) => ({ id: p.id, why: p.type === 'NC' ? 'not in the squad' : 'did not play' }))]
      .filter((p) => !gk.has(p.id) && !outIds.has(p.id));
  }
  let w = P.wellness || {}, by = Object.fromEntries(Object.entries(w.byId || {}).filter(([, v]) => v && v.score != null).map(([k, v]) => [k, v.score]));
  if (!Object.keys(by).length && P.wellness_history) { // no check-in yet this morning: the last morning with answers
    const last = (P.wellness_history.days || []).filter((d) => d.teamScore != null).slice(-1)[0];
    if (last) { w = { date: last.date, teamScore: last.teamScore, waiting: w.date === today }; by = Object.fromEntries(Object.entries(last.byId || {}).filter(([, v]) => v != null)); }
  }
  const drops = P.wellness_history && w.date ? svWellDrops(P.wellness_history, w.date) : {};
  const red = Object.entries(by).filter(([, v]) => v < 50).sort((a, b) => a[1] - b[1]).map(([id, v]) => ({ id, v, t: 'red' }));
  const dr = Object.entries(drops).filter(([id]) => !(by[id] < 50)).map(([id, d]) => ({ id, v: d.now, t: 'drop', d }));
  const low = Object.entries(by).filter(([id, v]) => v >= 50 && v < 60 && !drops[id]).sort((a, b) => a[1] - b[1]).map(([id, v]) => ({ id, v }));
  // the fixtures with the staff edits (time, stadium, home/away), as the Calendar page shows them; the next match's own fields too
  const evs = typeof applyCalendarEdits === 'function' ? applyCalendarEdits(P.calendar) : (P.calendar.events || []), pn = plan.next || {};
  const matches = evs.filter((e) => e.kind === 'match' && e.start >= today).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 5)
    .map((e) => (e.id === pn.id ? { ...pn, ...e, time: e.time || pn.time, venue: e.venue || pn.venue, ha: e.ha || pn.ha } : e));
  return { P, today, tag, plan, yest, done, row, out, avail: pl.length - out.length, total: pl.length, tp, dayOff, groups, proposed, comp: hoCompRef(P), w, by, red, dr, low, matches, matchToday: matches[0] && matches[0].start === today ? matches[0] : null };
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
  const G = D.groups, teamOn = !G || G.team.length > 0;
  const compIds = G ? G.comp.map((p) => p.id) : D.proposed ? D.proposed.map((p) => p.id) : [];
  const r = teamOn ? D.row : null;
  if (!r && !compIds.length && D.done) return hoYest(D, D.done); // a day with no objective (MD+1, MD+2): the session done, against its usual
  const hoRows = (o) => HO_K.filter(([k]) => o[k]).map(([k, l, u]) => { const x = o[k], lo = x.p25, hi = x.p75, mx = Math.max(x.p90 || 0, hi || 0, x.med || 0) * 1.15 || 1;
    return `<div class="ho-t"><span class="ho-l">${l}</span><span class="ho-bar"><i class="ho-rg" style="left:${lo / mx * 100}%;width:${Math.max(1, (hi - lo) / mx * 100)}%"></i><i class="ho-med" style="left:${x.med / mx * 100}%"></i></span>
      <span class="ho-v"><b>${fmtN(x.med)}</b><small>${u}</small></span><span class="ho-u">${fmtN(lo)}–${fmtN(hi)}</span></div>`; }).join('');
  let comp = '';
  if (compIds.length && D.comp) {
    const prop = !G && D.proposed;
    comp = `<div class="ho-cg"><div class="ho-cgh"><b>Compensatory session · ${compIds.length} players</b>${prop ? '<span class="ho-prop">proposed · not in the Session Plan yet</span>' : ''}</div>
      <div class="ho-rows">${hoRows(D.comp)}</div><div class="ho-sub">objective = the mean of the last ${D.comp.n} compensatory sessions (team average) · band = their usual range${G && G.recovery.length ? ` · recovery: ${G.recovery.length} players (no GPS)` : ''}</div></div>`;
  }
  const none = D.dayOff ? '<p class="ho-none">Team day off.</p>' : `<p class="ho-none">No training planned today${next ? ` · next: ${escapeHtml(next.opponent)} ${hoDay(next.start, { weekday: 'short', day: 'numeric' })}` : ''}.</p>`;
  const rows = r ? hoRows(r) + comp : comp || none;
  const done = D.done ? `<button type="button" class="ho-done" data-go="sessions" data-date="${D.today}">✓ Session done · ${D.done.n} players — see it ›</button>` : '';
  return `<section class="ho-card"><div class="ho-k">Today's training${D.tag ? ` · ${D.tag}` : ''}${D.plan.type ? ` · ${D.plan.type} microcycle` : ''}</div>
    <div class="ho-sub">${fmtDay(D.today, { weekday: 'long', day: 'numeric', month: 'short' })}${next ? ` · ${dleft === 1 ? 'the day before' : dleft + ' days before'} ${escapeHtml(next.opponent)}` : ''}${r ? ` · objective = the Sessions page's (the week until the match, minus what is done) · band = usual range of a ${D.tag}` : ''}${G ? ` · from today's Session Plan` : ''}</div>
    ${done}<div class="ho-rows">${rows}</div></section>`;
}
function hoAvail(D) {
  const lab = { injured: 'Injury', rehab: 'Rehab', sick: 'Sick', national: 'National team', absent: 'Absent' }, col = { injured: '#e5484d', rehab: '#ff9f0a', Injury: '#e5484d', Rehab: '#ff9f0a' };
  const G = D.groups;
  const split = G ? `<div class="ho-grp">${[['team', 'Team session'], ['comp', 'Compensatory'], ['recovery', 'Recovery'], ['individual', 'Individual']].filter(([k]) => G[k].length).map(([k, l]) => `<span class="${k}"><b>${G[k].length}</b> ${l}</span>`).join('')}</div>` : '';
  return `<section class="ho-card"><div class="ho-k">Available for the session${G ? ' · today\'s plan' : D.dayOff ? ' · day off' : ''}</div>
    <div class="ho-ab"><b>${D.avail}</b><span>/ ${D.total}</span></div>${split}
    <div class="ho-out">${D.out.map((p) => { const t = p.planStatus || lab[p.status] || p.today || p.status;
      return `<button type="button" class="ho-op" data-player="${p.id}">${avatarHtml(p.id, p.name, 26)}<b>${escapeHtml(p.name)}</b><i style="background:${col[p.planStatus] || col[p.status] || '#8e8e93'}">${escapeHtml(t)}</i></button>`; }).join('') || '<span class="ho-none">Everyone available</span>'}</div>
    <div class="ho-sub">${G ? 'from today\'s Session Plan · out = injured, rehab, sick, national team, B team or absent' : 'out = injured, in rehab, sick, national team or absent today · the Session Plan of today replaces this once saved'}</div></section>`;
}
function hoWell(D) {
  const W = D.w;
  if (!W.date) return '<section class="ho-card"><div class="ho-k">Wellness alerts</div><p class="ho-none">No check-ins yet.</p></section>';
  const when = W.date === D.today ? 'this morning' : hoDay(W.date, { weekday: 'short', day: 'numeric' }) + (W.waiting ? ' · none yet today' : ' morning');
  const item = (x) => `<button type="button" class="ho-wp ${x.t}" data-well="${x.id}">${avatarHtml(x.id, playerName(x.id), 24)}<b>${escapeHtml(playerName(x.id))}</b><em>${x.t === 'drop' ? `${x.d.prev} → ${x.v} %` : x.v + ' %'}</em><small>${x.t === 'red' ? 'in the red' : `2 mornings below his ${x.d.avg} %`}</small></button>`;
  const all = [...D.red, ...D.dr];
  return `<section class="ho-card"><div class="ho-k">Wellness alerts · ${when}</div>
    <div class="ho-wh"><span class="ho-ws" style="color:${W.teamScore >= 70 ? '#34c759' : '#ff9f0a'}">${W.teamScore != null ? Math.round(W.teamScore) + ' %' : '—'}</span><span>players · ${Object.keys(D.by).filter((id) => typeof GOALKEEPER_IDS === 'undefined' || !GOALKEEPER_IDS.includes(id)).length} check-ins</span><span class="ho-wn"><b style="color:#e5484d">${D.red.length}</b> in the red · <b style="color:#ff9f0a">${D.dr.length}</b> dropping</span></div>
    <div class="ho-wl">${all.map(item).join('') || '<span class="ho-none">No alert</span>'}</div>
    ${D.low.length ? `<div class="ho-sub">also low (50–60 %): ${D.low.map((x) => escapeHtml(playerName(x.id)) + ' ' + x.v + ' %').join(' · ')}</div>` : ''}</section>`;
}
function hoMatches(D) {
  const m = D.matches.map((e, i) => { const n = hoCount(D.today, e.start), away = /away/i.test(e.venue || '') || e.ha === 'A';
    return `<div class="ho-m${i === 0 ? ' first' : ''}" title="${escapeHtml(hoVenue(e))}">${crestHtml(e.opponent, 30)}<span class="ho-mt"><b>${escapeHtml(e.opponent)}</b><small>${escapeHtml(e.competition || '')}${e.round ? ' · ' + escapeHtml(e.round) : ''} · ${away ? 'Away' : 'Home'}</small></span>
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
  const over = at.filter((a) => a.over).sort((a, b) => b.ov.length - a.ov.length || b.ov[0].a - a.ov[0].a).map((a) => ({ p: a.p, v: ovV(a) + (a.p.ret && s.kind !== 'match' ? ` · return ${a.p.ret}/7` : ''), t: a.over }));
  const well = at.filter((a) => a.well || a.wdrop).sort((a, b) => !!b.well - !!a.well).map((a) => ({ p: a.p, v: a.well ? `${a.w} %` : `${a.dr.prev} → ${a.dr.now} %`, t: a.well || a.wdrop }));
  let wellNote = '< 50 %, or −10 % two mornings';
  if (s.date < D.today && D.w.date === D.today) { // no session yet today: the wellness of this morning (as the Wellness alerts card), not the last session's
    const all = [...svFlat(s), ...svOffGps(s), ...svKeepers(s)], find = (id) => all.find((p) => p.id === id) || { id, cat: 't' };
    well.length = 0;
    D.red.forEach((x) => well.push({ p: find(x.id), v: `${x.v} %`, t: `Wellness ${x.v} % this morning — in the red.` }));
    D.dr.forEach((x) => well.push({ p: find(x.id), v: `${x.d.prev} → ${x.d.now} %`, t: `Wellness below his average two mornings in a row (his average ${x.d.avg} %).` }));
    wellNote = 'this morning: < 50 %, or −10 % two mornings';
  }
  const big = at.filter((a) => a.big || a.week).map((a) => { const x = a.bigs.length ? a.bigs[0] : a.wk[0]; return { p: a.p, v: `${a.bigs.length ? 'today' : 'week'} ${SV_BIGS[x.k] || x.k} z ${fmtSigned(x.z)}`, t: [a.big, a.week].filter(Boolean).join(' ') }; });
  const speed = [...svFlat(s), ...svOffGps(s)].filter((p) => p.days_hsv >= 10 && p.cat !== 'r').sort((a, b) => b.days_hsv - a.days_hsv).map((p) => ({ p, v: `${p.days_hsv} days`, t: `No run at 90 % of his max speed for ${p.days_hsv} days.` }));
  return { s, n: svFlat(s).length + svOffGps(s).length + svKeepers(s).length, flagged: new Set([...over, ...well, ...big].map((x) => x.p.id)).size, G: [
    { k: 'over', c: 'red', t: '2 weeks overload', note: `A:C > ${SV_OVER} this week and last`, xs: over },
    { k: 'well', c: 'red', t: 'Wellness', note: wellNote, xs: well },
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
