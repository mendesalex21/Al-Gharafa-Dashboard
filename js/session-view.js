/**
 * Training › Sessions — the individual part ("exceptions first, detail on demand"):
 *  · Attention today: the real alerts only — A:C above 1.5 two weeks in a row, a load far from his usual today (one line
 *    per player) — then joker candidates and players needing a speed top-up (no run at 90 % of his max speed for 10
 *    days, or behind his high-speed target of the microcycle);
 *  · the compact table (bar = value, colour = z vs his usual for this MD tag and microcycle type, tick = his usual)
 *    or the four ranking panels (distance / m·min, high-intensity running, Acc + Dec, sprints);
 *  · the player sheet (drawer): today vs his usual, vs the team and his match, and his microcycle — done so far vs
 *    still to do until the match, re-planned after every session.
 * Data: sessions payload — players[].mdref (his usual for this day: mean, sd, z) and `usual` (per type × tag).
 */
const SV = { view: 'table', sort: null, dsort: 'mpm', drill: null, mc: 'hit', sorted: null };
const SV_M = [['td', 'Total distance', 'm'], ['d15', '> 15 km/h', 'm'], ['hit', '> 20 km/h', 'm'], ['spr', '> 25 km/h', 'm'], ['spr_n', 'Sprints', ''], ['acc_dec', 'Acc + Dec', ''], ['srpe', 'sRPE', 'AU']];
const SV_LBL = Object.fromEntries(SV_M.map(([k, l]) => [k, l]));
const SV_UNIT = Object.fromEntries(SV_M.map(([k, , u]) => [k, u]));

// ------------------------------------------------------------------ helpers
/** His usual for today's MD tag, in the session's units (matches: per-90 reference brought back to his minutes). */
function svScale(p) { return p.mdref && p.mdref.per90 && p.min ? p.min / 90 : 1; }
const svZ = (p, k) => (p.mdref && p.mdref.z ? p.mdref.z[k] : null);
const svUsual = (p, k) => (p.mdref && p.mdref.mean && p.mdref.mean[k] != null ? p.mdref.mean[k] * svScale(p) : null);
const svSd = (p, k) => (p.mdref && p.mdref.sd && p.mdref.sd[k] != null ? p.mdref.sd[k] * svScale(p) : null);
const svRpeBg = (v) => (v == null ? '' : `background:rgba(229,72,77,${(Math.max(0, Math.min(1, (v - 2) / 8)) * 0.75).toFixed(2)});${v >= 7 ? 'color:#fff;' : ''}`);
function svPos(id) { const l = POS_LABEL[posOf(id, TR.sessions.roster)]; return l ? l.replace(/s$/, '') : ''; }
function svSub(p) { return [svPos(p.id), p.cat === 't' || p.cat === 'm' ? '' : p.type].filter(Boolean).join(' · '); }
function svGroups(s) {
  const out = {};
  s.players.filter((p) => p.min > 0).forEach((p) => { const g = posOf(p.id, TR.sessions.roster); (out[g] = out[g] || []).push(p); });
  const rank = (g) => { const i = POS_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  return Object.keys(out).sort((a, b) => rank(a) - rank(b)).map((g) => ({ g, label: POS_LABEL[g] || 'Other', list: out[g].sort((a, b) => (b.td || 0) - (a.td || 0)) }));
}
function svFlat(s) { return svGroups(s).flatMap((g) => g.list); }

// ------------------------------------------------------------------ his microcycle (done so far vs still to do)
function svTagNum(tag) { const m = /^MD([+-])(\d+)$/.exec(tag || ''); return m ? (m[1] === '-' ? -Number(m[2]) : Number(m[2])) : null; }
/** Days that prepare the match (MD-6 → MD-1) of the microcycle of session s, from the MD tags: done, today, left.
 * MD+1 / MD+2 are left out: recovery for the starters, compensation for the others — not a shared target. */
function svMicrocycle(s) {
  if (s.kind === 'match') return svPrepCycle(s);
  const t = svTagNum(s.md);
  if (s.kind !== 'training' || t == null || !s.cycle.type || t < -6) return null;
  const toMatch = t < 0 ? -t : (s.cycle.length && !s.cycle.pre_match ? s.cycle.length - t : null);
  if (!toMatch || toMatch < 1) return null;
  const matchDate = addDays(s.date, toMatch);
  if (!SV.sorted || SV.sorted.src !== TR.sessions) SV.sorted = { src: TR.sessions, list: TR.sessions.sessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)) };
  const sorted = SV.sorted.list, idx = sorted.findIndex((x) => x.date === s.date);
  const days = t < 0 ? [{ date: s.date, md: s.md, sess: s }] : [];
  for (let i = idx - 1; t < 0 && i >= 0; i--) { // walk back through the MD-k days of this microcycle
    const x = sorted[i], n = svTagNum(x.md);
    if (x.kind !== 'training' || n == null || n > 0 || n < -6 || -n <= toMatch || daysBetween(x.date, matchDate) > 12) break;
    days.unshift({ date: x.date, md: x.md, sess: x });
  }
  for (let j = Math.min(toMatch - 1, 6); j >= 1; j--) days.push({ date: addDays(matchDate, -j), md: `MD-${j}` });
  return { matchDate, type: s.cycle.type, days, today: s.date, started: t < 0 };
}
/** Match day: the training days that prepared this match (MD-6 → MD-1), all done — his preparation vs his usual. */
function svPrepCycle(s) {
  if (!SV.sorted || SV.sorted.src !== TR.sessions) SV.sorted = { src: TR.sessions, list: TR.sessions.sessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)) };
  const sorted = SV.sorted.list, idx = sorted.findIndex((x) => x.date === s.date), days = [];
  for (let i = idx - 1; i >= 0; i--) {
    const x = sorted[i], n = svTagNum(x.md);
    if (x.kind !== 'training' || n == null || n >= 0 || n < -6 || daysBetween(x.date, s.date) > 8) break;
    days.unshift({ date: x.date, md: x.md, sess: x });
  }
  const type = s.cycle.type || (days.length ? days[days.length - 1].sess.cycle.type : null); // after a break: the type of the preparation days
  return days.length && type ? { matchDate: s.date, type, days, today: s.date, started: true, prep: true } : null;
}
/** [mean, sd] of his usual for a day tag: that day's own reference when he trained, else the per-tag table (own, then squad). */
function svUsualFor(pid, tag, type, k, sess) {
  const own = sess && sess.players.find((y) => y.id === pid);
  if (own && own.mdref && own.mdref.mean && own.mdref.mean[k] != null) return [own.mdref.mean[k], own.mdref.sd ? own.mdref.sd[k] : null];
  const u = TR.sessions.usual || {};
  const c = ((((u.players || {})[pid] || {})[type] || {})[tag]) || (((u.squad || {})[type] || {})[tag]);
  return c && c[k] ? c[k] : null;
}
/** Per metric: target = his usual for each day added up; done = what he did; the rest shared over the days left
 * (proportional to his usual, at most 160 % of it — 120 % on MD-1). A metric not recorded on a past day is left out. */
function svPlan(p, mc) {
  const out = {};
  SV_M.forEach(([k]) => {
    const rows = [];
    mc.days.forEach((d) => {
      const past = d.date <= mc.today, q = past && d.sess ? d.sess.players.find((y) => y.id === p.id) : null;
      const u = svUsualFor(p.id, d.md, mc.type, k, d.sess);
      if (!u || u[0] == null || (q && q[k] == null)) return;
      rows.push({ date: d.date, md: d.md, past, today: d.date === mc.today, u: u[0], sd: u[1], v: past ? (q ? q[k] || 0 : 0) : null, z: q && q.mdref && q.mdref.z ? q.mdref.z[k] : null, absent: past && !q });
    });
    const target = rows.reduce((a, r) => a + r.u, 0);
    const done = rows.filter((r) => r.past).reduce((a, r) => a + r.v, 0);
    const expected = rows.filter((r) => r.past).reduce((a, r) => a + r.u, 0);
    const fut = rows.filter((r) => !r.past);
    const share = shareOut(Math.max(0, target - done), fut.map((r) => ({ med: r.u, lo: 0, hi: (r.md === 'MD-1' ? 1.2 : 1.6) * r.u })));
    fut.forEach((r, i) => { r.obj = share[i] || 0; });
    out[k] = { rows, target, done, expected, planned: fut.reduce((a, r) => a + r.obj, 0), left: fut.length, prep: !!mc.prep };
  });
  return out;
}
function svMcStatus(m) {
  if (m.prep) { // his preparation for a match, done: compared with his usual for those days
    const r = m.target ? m.done / m.target : 1;
    return r > 1.3 ? { lv: 'high', t: 'Well above' } : r > 1.15 ? { lv: 'above', t: 'Above' } : r >= 0.9 ? { lv: 'on', t: 'As usual ✓' } : r >= 0.7 ? { lv: 'on', t: 'Slightly below' } : { lv: 'below', t: 'Below' };
  }
  if (m.done >= m.target * 0.97) return m.done > m.target * 1.3 ? { lv: 'high', t: 'Well above' } : { lv: 'on', t: m.left ? 'Reached ✓' : 'Done ✓' };
  const r = m.expected ? m.done / m.expected : 1;
  return r < 0.75 ? { lv: 'below', t: 'Behind' } : r > 1.25 ? { lv: 'above', t: 'Ahead' } : { lv: 'on', t: 'On track' };
}
const SV_HS = ['d15', 'hit', 'spr', 'spr_n'];
/** Joker / top-up reading of a player's plan (high-speed metrics only; sprints in number are a complement). */
function svReading(plan) {
  const hs = SV_HS.filter((k) => plan[k] && plan[k].target && plan[k].left);
  const reached = hs.filter((k) => plan[k].done >= plan[k].target * 0.97);
  const behind = hs.filter((k) => plan[k].expected && plan[k].done < plan[k].expected * 0.75 && plan[k].done < plan[k].target * 0.97);
  const joker = reached.some((k) => k === 'hit' || k === 'spr'); // decided on distances > 20 / > 25 km/h
  const k0 = ['hit', 'spr', 'd15', 'spr_n'].find((k) => behind.includes(k));
  // top-up = even at his safe maximum on the days left, he cannot get back to 90 % of his target at > 20 or > 25 km/h
  const cant = (k) => behind.includes(k) && plan[k].done + plan[k].planned < plan[k].target * 0.9;
  const kTop = ['hit', 'spr'].find(cant);
  return { reached, behind, joker, topup: !!kTop, kTop, k0, short: k0 ? plan[k0].done + plan[k0].planned < plan[k0].target * 0.9 : false };
}

function svMcChart(m, k) {
  const W = 560, H = 196, P = { l: 40, r: 6, t: 20, b: 36 }, n = m.rows.length || 1;
  const iw = W - P.l - P.r, ih = H - P.t - P.b, step = iw / n, bw = Math.min(50, step * 0.46);
  const raw = Math.max(1, ...m.rows.map((r) => Math.max(r.v || 0, r.u || 0, r.obj || 0))) * 1.12;
  const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
  const top = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  const y = (v) => P.t + ih * (1 - Math.min(v, top) / top), base = y(0);
  const fv = (v) => (k === 'td' && v >= 1000 ? (v / 1000).toFixed(1) + 'k' : fmtN(v));
  let g = '';
  [0, top / 2, top].forEach((t) => { g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--hairline)"/><text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${fv(t)}</text>`; });
  m.rows.forEach((r, i) => {
    const x = P.l + step * (i + 0.5), bx = x - bw / 2;
    if (r.today) g += `<rect x="${P.l + step * i + 3}" y="2" width="${step - 6}" height="${H - 4}" rx="10" style="fill:rgba(0,113,227,.07)"/>`;
    if (r.past && r.absent) g += `<text x="${x}" y="${base - 8}" text-anchor="middle">absent</text>`;
    else if (r.past) {
      const lv = r.z != null ? zLevel(r.z) : r.sd ? zLevel((r.v - r.u) / r.sd) : null;
      const yy = y(r.v), h = Math.max(1.5, base - yy), rr = Math.min(5, h);
      g += `<path d="M${bx},${base}V${yy + rr}Q${bx},${yy} ${bx + rr},${yy}H${bx + bw - rr}Q${bx + bw},${yy} ${bx + bw},${yy + rr}V${base}Z" style="fill:${lv ? Z_COL[lv] : '#aeaeb2'}"/><text class="v" x="${x}" y="${Math.max(12, yy - 6)}" text-anchor="middle">${fv(r.v)}</text>`;
    } else {
      g += `<rect x="${bx + 1}" y="${y(r.obj)}" width="${bw - 2}" height="${Math.max(1, base - y(r.obj))}" rx="5" style="fill:rgba(42,120,214,.08);stroke:#2a78d6" stroke-width="1.5" stroke-dasharray="4 3"/><text class="v" x="${x}" y="${Math.max(12, y(r.obj) - 6)}" text-anchor="middle" style="fill:#1d5fae">${fv(r.obj)}</text>`;
    }
    g += `<line x1="${bx - 7}" x2="${bx + bw + 7}" y1="${y(r.u)}" y2="${y(r.u)}" style="stroke:var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
    g += `<text x="${x}" y="${H - 20}" text-anchor="middle" style="font-weight:700;fill:var(--ink-2)">${r.md}</text><text x="${x}" y="${H - 6}" text-anchor="middle">${r.today ? 'today' : fmtDay(r.date, { weekday: 'short', day: 'numeric' })}</text>`;
  });
  return `<svg class="sv-mc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${SV_LBL[k]} day by day">${g}</svg>`;
}

/** Match day: was his preparation (MD-k → MD-1) lighter or heavier than usual? */
function svPrepInsights(plan, mc) {
  const pc = (m) => Math.round(m.done / m.target * 100), ks = SV_M.map(([k]) => k).filter((k) => plan[k] && plan[k].target);
  const lo = ks.filter((k) => plan[k].done < plan[k].target * 0.85), hi = ks.filter((k) => plan[k].done > plan[k].target * 1.15);
  const span = `${mc.days[0].md} → MD-1`, ins = [];
  if (lo.length) ins.push({ lv: 'below', i: '↓', t: `<b>Lighter preparation than usual</b> (${span}) — ${lo.map((k) => `${SV_LBL[k]} ${pc(plan[k])}%`).join(' · ')} of his usual for these days.` });
  if (hi.length) ins.push({ lv: 'above', i: '↑', t: `<b>Heavier preparation than usual</b> (${span}) — ${hi.map((k) => `${SV_LBL[k]} ${pc(plan[k])}%`).join(' · ')} of his usual for these days.` });
  const absent = (plan.td && plan.td.rows || []).filter((r) => r.absent);
  if (absent.length) ins.push({ lv: 'below', i: '·', t: `Not in the team session on ${absent.map((r) => `${fmtDay(r.date, { weekday: 'short', day: 'numeric' })} (${r.md})`).join(', ')} — counted as 0.` });
  if (!ins.length) ins.push({ lv: 'on', i: '✓', t: `Preparation as usual on every metric (${span}).` });
  return ins;
}

/** Plain-language reading of his microcycle: joker, behind (top-up), volume already done, missed sessions. */
function svInsights(s, plan, rd, left) {
  const pc = (a, b) => Math.round(a / b * 100), u = (k) => (SV_UNIT[k] ? ' ' + SV_UNIT[k] : '');
  const ins = [];
  if (rd.reached.length && left) ins.push({ lv: 'on', i: '✓', t: `<b>High-speed target already reached</b> — ${rd.reached.map((k) => `${SV_LBL[k]} ${pc(plan[k].done, plan[k].target)}%`).join(' · ')} of his microcycle total.${rd.joker ? ` He can be a <b>joker</b> in the high-speed drills of ${left}.` : ''}` });
  if (rd.k0 && left) ins.push({ lv: 'below', i: '↓', t: `<b>Behind in high speed</b> (${rd.behind.map((k) => SV_LBL[k]).join(', ')}) — ${SV_LBL[rd.k0]}: ${fmtN(plan[rd.k0].done)}${u(rd.k0)} done vs ${fmtN(plan[rd.k0].expected)}${u(rd.k0)} he usually has by ${s.md}. ${rd.short ? `Even at his safe maximum on ${left} he stays below target: plan an individual top-up (e.g. a short sprint block).` : `Add high-speed exposure on ${left}.`}` });
  const vol = ['td', 'acc_dec', 'srpe'].filter((k) => plan[k].target && plan[k].left && plan[k].done >= plan[k].target * 0.97);
  if (vol.length) ins.push({ lv: 'above', i: '!', t: `<b>${vol.map((k) => SV_LBL[k]).join(', ')}</b> already at his microcycle total — keep ${left} light for him.` });
  const absent = (plan.td.rows || []).filter((r) => r.absent);
  if (absent.length) ins.push({ lv: 'below', i: '·', t: `Not in the team session on ${absent.map((r) => `${fmtDay(r.date, { weekday: 'short', day: 'numeric' })} (${r.md})`).join(', ')} — counted as 0.` });
  if (!ins.length) ins.push({ lv: 'on', i: '✓', t: left ? `On track on every metric — his objectives for ${left} are in the chart.` : 'Microcycle complete.' });
  return ins;
}

// ------------------------------------------------------------------ Attention today
// Real alerts only (the user's rules, 2026-10-05): A:C above 1.5 two weeks in a row, wellness in the red that morning or
// 10 % below his average two mornings in a row, a load far from his usual today (the MD) or this week so far (z ≥ 2 or ≤ −2). Speed exposure (no run at 90 % of his max
// speed for 10 days or more) goes to "Need a speed top-up", beside the jokers. Same rules as the staff e-mail.
const SV_OVER = 1.5; // A:C 7:28 above this this week and last week (the "14:35")
const SV_AC_L = { td: 'distance', acc_dec: 'HI Acc+Dec', hit: '> 20 km/h', spr_n: 'sprints' };
const SV_BIG = { td: ['distance', 'm'], d15: ['> 15 km/h', 'm'], hit: ['> 20 km/h', 'm'], spr: ['> 25 km/h', 'm'], spr_n: ['sprints', ''], acc_dec: ['Acc+Dec', ''], srpe: ['sRPE', 'AU'] };
const SV_WDROP = { pct: 0.10, n: 28, min: 10, gap: 4 }; // 10 % below his average (last 28 answers, ≥ 10), 2 check-ins ≤ 4 days apart
/** Players whose last two check-ins (that morning's and his previous one, ≤ 4 days before) are both 10 % or more below
 * his average (his last 28 answers before each, at least 10). → { id: { prev, now, avg } } — as staff_email.well_drops. */
function svWellDrops(hist, date) {
  const out = {}, h = {};
  if (!hist || !hist.days) return out;
  hist.days.filter((d) => d.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((d) => {
    Object.entries(d.byId || {}).forEach(([id, v]) => { if (v != null) (h[id] = h[id] || []).push([d.date, v]); });
  });
  Object.entries(h).forEach(([id, x]) => {
    const n = x.length - 1;
    if (n < 1 || x[n][0] !== date || daysBetween(x[n - 1][0], date) > SV_WDROP.gap) return;
    const avg = [n - 1, n].map((i) => { const b = x.slice(Math.max(0, i - SV_WDROP.n), i).map((y) => y[1]); return b.length >= SV_WDROP.min ? b.reduce((a, c) => a + c, 0) / b.length : null; });
    if (avg.every((a, j) => a != null && (a - x[n - 1 + j][1]) / a >= SV_WDROP.pct)) out[id] = { prev: x[n - 1][1], now: x[n][1], avg: Math.round(avg[1]) };
  });
  return out;
}
function svWeekTxt(wk) {
  const part = wk.slice(0, 2).map((x) => { const [l, u] = SV_BIG[x.k] || [x.k, '']; return `${fmtN(x.v)}${u ? ' ' + u : ''} ${l} (z ${fmtSigned(x.z)})`; }).join(' and ');
  return `Week so far ${wk[0].z > 0 ? 'well above' : 'well below'} his usual weeks: ${part}.`;
}
function svOverTxt(ov) {
  const f = (x) => `${x.b.toFixed(2)} → ${x.a.toFixed(2)}`;
  if (ov.length === 1) return `Overload two weeks in a row on ${SV_AC_L[ov[0].k]}: A:C ${f(ov[0])}.`;
  return `Overload two weeks in a row on ${ov.length === 4 ? 'all four loads' : ov.map((x) => SV_AC_L[x.k]).join(' and ')} (${ov.slice(0, 2).map((x) => `${SV_AC_L[x.k]} ${f(x)}`).join(', ')}).`;
}
function svBigTxt(p, big) {
  const hs = big.some((x) => ['d15', 'hit', 'spr', 'spr_n'].includes(x.k)), where = p.cat === 'i' ? ' in his individual session' : p.cat === 'c' ? ' in his compensatory session' : '';
  const part = big.slice(0, 2).map((x) => { const [l, u] = SV_BIG[x.k]; return `${fmtN(p[x.k])}${u ? ' ' + u : ''} ${l} (usual ${fmtN(svUsual(p, x.k))})`; }).join(' and ');
  return `${big[0].z > 0 ? 'Much more' : 'Much less'} ${hs ? 'high-speed running' : 'load'} than usual today${where}: ${part}.`;
}
/** Available players with no GPS in the session (individual work…): their A:C, wellness and week still count (as in the e-mail). */
function svOffGps(s) {
  const st = {};
  ((TR.workload && TR.workload.players) || []).forEach((p) => { st[p.id] = p.status; });
  return (s.absent || []).filter((a) => st[a.id] === 'available');
}
function svAttention(s) {
  const out = [], wday = TR.whist && TR.whist.days ? TR.whist.days.find((d) => d.date === s.date) : null; // wellness of that morning
  const st = TR.staff && TR.staff.days ? TR.staff.days[s.date] : null, wkeys = (TR.staff && TR.staff.week_keys) || [], drops = svWellDrops(TR.whist, s.date);
  [...svFlat(s), ...svOffGps(s)].forEach((p) => {
    const partial = (s.kind === 'match' || p.cat === 'b') && (p.min || 0) < 75; // under 75 min a game is scaled: not flagged
    const ser = TR.workload && TR.workload.series ? TR.workload.series[p.id] : null, i = ser && ser.a7 ? daysBetween(ser.start, s.date) : -1;
    const ov = i >= 0 ? SV_AC.map(([k]) => ({ k, a: ser.a7[k] ? ser.a7[k][i] : null, b: ser.a14[k] ? ser.a14[k][i] : null }))
      .filter((x) => x.a != null && x.b != null && x.a > SV_OVER && x.b > SV_OVER).sort((x, y) => y.a - x.a) : [];
    const big = partial ? [] : Object.keys(SV_BIG).map((k) => ({ k, z: svZ(p, k) }))
      .filter((x) => x.z != null && (x.z >= 2 || (x.z <= -2 && p.cat === 't'))).sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
    const w = wday && wday.byId ? wday.byId[p.id] : null, well = w != null && w < 50 ? `Wellness ${w} % that morning — in the red.` : null;
    const dr = well ? null : drops[p.id], wdrop = dr ? `Wellness below his average two mornings in a row: ${dr.prev} % then ${dr.now} % (his average ${dr.avg} %).` : null;
    const sx = st && st.players ? st.players[p.id] : null;
    const wk = sx && sx.wk ? wkeys.map((k, j) => ({ k, z: sx.wk[j], v: (sx.wv || [])[j] })).filter((x) => x.z != null && Math.abs(x.z) >= 2).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)) : [];
    // ranked as the e-mail: the most serious reason (100 overload · 90 wellness red · 80 wellness down · 70 today · 60 week), + 3 per red, + 1 per orange
    const its = [[ov.length, 100, 3], [well, 90, 3], [wdrop, 80, 1], [big.length, 70, 1], [wk.length, 60, 1]].filter((x) => x[0]);
    if (its.length) {
      out.push({ p, over: ov.length ? svOverTxt(ov) : null, well, wdrop, big: big.length ? svBigTxt(p, big) : null, week: wk.length ? svWeekTxt(wk) : null,
        sev: Math.max(...its.map((x) => x[1])) + its.reduce((a, x) => a + x[2], 0) });
    }
  });
  return out.sort((a, b) => b.sev - a.sev);
}
function svAttentionHtml(s) {
  const at = svAttention(s), n = svFlat(s).length + svOffGps(s).length, nOver = at.filter((a) => a.over).length, nWell = at.filter((a) => a.well).length, nDrop = at.filter((a) => a.wdrop).length, nBig = at.filter((a) => a.big || a.week).length;
  const mc = svMicrocycle(s), left = mc && mc.started ? mc.days.filter((d) => d.date > mc.today) : [], next = left.map((d) => d.md).join(' / ');
  const jok = [], top = new Map();
  if (left.length) {
    svFlat(s).forEach((p) => {
      const plan = svPlan(p, mc), rd = svReading(plan);
      if (rd.joker) jok.push({ p, t: rd.reached.filter((k) => k === 'hit' || k === 'spr').map((k) => `${SV_LBL[k]} ${Math.round(plan[k].done / plan[k].target * 100)}%`).join(' · ') });
      if (rd.topup) top.set(p.id, { p, short: true, t: [`${SV_LBL[rd.kTop]} ${fmtN(plan[rd.kTop].done)} / ${fmtN(plan[rd.kTop].target)} m`] });
    });
  }
  svFlat(s).filter((p) => p.days_hsv >= 10).sort((a, b) => b.days_hsv - a.days_hsv).forEach((p) => { // no run at 90 % of his max speed for 10 days or more
    const x = top.get(p.id) || { p, t: [] };
    x.t.push(`${p.days_hsv} days`);
    top.set(p.id, x);
  });
  const tops = [...top.values()].map((x) => ({ p: x.p, t: x.t.join(' · ') })), shortN = [...top.values()].filter((x) => x.short).length;
  const chip = (x, i) => `<button type="button" class="sv-pchip ${i >= 10 ? 'extra' : ''}" data-id="${x.p.id}">${avatarHtml(x.p.id, playerName(x.p.id), 22)}<b>${escapeHtml(playerName(x.p.id))}</b><small>${x.t}</small></button>`;
  const chips = (xs) => (xs.length ? xs.map(chip).join('') + (xs.length > 10 ? `<button type="button" class="sv-more-btn" data-more>+ ${xs.length - 10} more</button>` : '') : '<span class="muted">None</span>');
  const plans = left.length || tops.length ? `<div class="sv-plans">
      ${left.length ? `<div class="sv-plan on"><h4>Joker candidates · ${next}</h4><p>High-speed target of his microcycle already reached (distance > 20 or > 25 km/h).</p><div>${chips(jok)}</div></div>` : ''}
      <div class="sv-plan below"><h4>Need a speed top-up${next ? ' · ' + next : ''}</h4><p>No run at 90 % of his max speed for 10 days or more (days since)${left.length ? ', or too far behind his high-speed target of the microcycle (done / target)' : ''}.</p>${shortN > 6 ? `<p class="sv-plan-hint"><b>${shortN} of ${n} players</b> are short of high-speed running — consider a speed-exposure block for everyone on ${next}.</p>` : ''}<div>${chips(tops)}</div></div>
    </div>` : '';
  const rows = at.map((a) => `<button type="button" class="sv-al" data-id="${a.p.id}">${avatarHtml(a.p.id, playerName(a.p.id), 30)}<b>${escapeHtml(playerName(a.p.id))}<small>${escapeHtml(svSub(a.p) || '')}</small></b>
      <span class="sv-al-c">${a.over ? '<i class="sv-ch red">2 weeks overload</i>' : ''}${a.well ? '<i class="sv-ch red">wellness</i>' : ''}${a.wdrop ? '<i class="sv-ch orange">wellness down</i>' : ''}${a.big ? '<i class="sv-ch orange">big change today</i>' : ''}${a.week ? '<i class="sv-ch orange">week load</i>' : ''}</span>
      <span class="sv-al-t">${escapeHtml([a.over, a.well, a.wdrop, a.big, a.week].filter(Boolean).join(' '))}</span><i class="sv-al-go">›</i></button>`).join('');
  return `<section class="panel">
    <div class="panel-head"><h2 class="panel-title small">Attention today</h2>
      <span class="sv-sum">${at.length ? `<b>${at.length}</b> of ${n} players to look at<span class="sep"></span>${[[nOver, Z_COL.high, 'two weeks overload'], [nWell, Z_COL.high, 'wellness in the red'], [nDrop, Z_COL.above, 'wellness down'], [nBig, Z_COL.above, 'big change (today or week)']]
        .filter((x) => x[0]).map(([v, c, l]) => `<i style="background:${c}"></i>${v} ${l}`).join('')}` : '✓ No alert today'}</span></div>
    ${at.length ? `<div class="sv-als">${rows}</div>` : ''}
    ${plans}
    <p class="panel-foot">Alerts only for: A:C above ${SV_OVER} two weeks in a row (distance, HI Acc+Dec, > 20 km/h, sprints) · wellness in the red that morning (< 50 %), or 10 % below his average (his last 28 check-ins) two mornings in a row · a load far from his usual today (z ≥ 2, or ≤ −2 in a full session) or this week so far (z ≥ 2 or ≤ −2 vs his usual weeks) · click a player for his full session. Speed exposure is in “Need a speed top-up”. Same rules as the staff e-mail.</p>
  </section>`;
}
// ------------------------------------------------------------------ session table: the report's page design (Reports → PDF page 1)
// Full session: + distance > 25 km/h and HIT Acc / HIT Dec. Drills: the same table for one drill (chips), ranked by m/min.
const SV_COLS = ['time', 'rpe', 'mpm', 'td', 'd15', 'd20', 'd25', 'vmax', 'pmax', 'days', 'sprints', 'hacc', 'hdec', 'accdec'];
const SV_DCOLS = ['time', 'mpm', 'td', 'd15', 'd20', 'd25', 'vmax', 'sprints', 'hacc', 'hdec', 'accdec'];
const SV_W = { td: 'minmax(0,1.55fr)', d15: 'minmax(0,1.35fr)', d20: 'minmax(0,0.95fr)', d25: 'minmax(0,0.8fr)', vmax: 'minmax(0,0.9fr)', accdec: 'minmax(0,1fr)',
  hacc: '50px', hdec: '50px', time: '40px', rpe: '38px', mpm: '50px', pmax: '56px', days: '46px', sprints: '54px' }; // site only: the PDF keeps RP_WIDTHS
const svLabel = (k) => ({ hacc: 'HIT Acc', hdec: 'HIT Dec' })[k] || RP_LABELS[k]; // reports.js loads after this file
/** Players the team average is made of — same rule as the build: the players of the whole game (matches), the
 * compensatory players (a compensatory session: the others recovered without GPS), else the full session. */
function rtCore(s) {
  const whole = s.kind === 'match' ? Math.min(90, Math.max(0, ...s.players.filter((p) => p.cat === 'm').map((p) => p.min || 0)) - 2) : 0;
  const core = s.players.filter((p) => (s.kind === 'match' ? p.cat === 'm' && p.min >= whole : s.group === 'compensatory' ? p.cat === 'c' : p.cat === 't'));
  return core.length >= 3 ? core : s.players.filter((p) => p.min > 0);
}
const svPro = (s, cat) => (s.kind === 'match' ? cat === 'm' : s.group === 'compensatory' ? cat === 'c' : cat === 't'); // did the session of the group: the grey "team max" track
const svGroupTxt = (s) => (s.kind === 'match' ? 'whole-game players' : s.group === 'compensatory' ? 'compensatory players' : 'full-session players');

/** The table: rows = {id, pro, type, metrics…}; sort = a column (ranked list) or null (position groups). */
function svTable(rows, cols, o = {}) {
  const ref = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows;
  const teamMax = (k) => Math.max(0, ...ref.map((r) => r[k] || 0)), scaleMax = (k) => Math.max(teamMax(k), ...rows.map((r) => r[k] || 0));
  const span = (k) => (k === 'mpm' ? ref : rows); // m/min colours: the players of the team session only (individual / rehab grey)
  const lo = (k) => Math.min(...span(k).map((r) => r[k] ?? 0)), hi = (k) => Math.max(...span(k).map((r) => r[k] ?? 0));
  const t01 = (k, v) => (hi(k) > lo(k) ? Math.max(0, Math.min(1, ((v ?? 0) - lo(k)) / (hi(k) - lo(k)))) : 0);
  const tpl = '170px ' + cols.map((k) => SV_W[k] || '44px').join(' ');
  const fmt = (k, v) => (k === 'rpe' && v != null && !Number.isInteger(v) ? v.toFixed(1) : rpFmt(k, v));
  const chip = (bg, v, fg = '') => `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg}${fg ? `;color:${fg}` : ''}">${v}</span></div>`;
  const cell = (r, k, isTeam) => {
    const v = r[k];
    if (v == null) return '<div class="rp-c rp-txt"><span class="rp-v sv-na">–</span></div>';
    if (RP_BARS.includes(k)) {
      const m = scaleMax(k), trk = rpPct(teamMax(k), m), col = isTeam ? '#b8bcc8' : RP_COLORS[k];
      if (k === 'vmax') return `<div class="rp-c"><div class="rp-bar rp-mid"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${col}"></i><em>${fmt(k, v)}</em></div></div>`;
      return `<div class="rp-c"><span class="rp-v">${fmt(k, isTeam ? Math.round(v) : v)}</span><div class="rp-bar"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${col}"></i></div></div>`;
    }
    if (isTeam) return `<div class="rp-c rp-txt"><span class="rp-v">${k === 'pmax' ? fmt(k, v) : k === 'rpe' ? v.toFixed(1) : fmt(k, Math.round(v))}</span></div>`;
    if (k === 'mpm') return !r.pro && rows.some((y) => y.pro) ? chip('#eef0f4', fmt(k, v), '#8a8f9e') : chip(`rgb(${rpLerp([235, 244, 253], [110, 175, 240], t01(k, v))})`, fmt(k, v));
    if (k === 'hacc' || k === 'hdec') return chip(`rgb(${rpLerp([238, 249, 232], [140, 214, 104], t01(k, v))})`, fmt(k, v));
    if (k === 'sprints') { const [bg, fg] = rpSprintColor(t01(k, v)); return chip(bg, fmt(k, v), fg); }
    if (k === 'days') { const [bg, fg] = rpDaysColor(v); return chip(bg, fmt(k, v), fg); }
    if (k === 'time' && o.full && r.pro && v < o.full * 0.9) return `<div class="rp-c rp-txt"><span class="rp-v sv-partial">${fmt(k, v)}</span></div>`;
    return `<div class="rp-c rp-txt"><span class="rp-v">${fmt(k, v)}</span></div>`;
  };
  const face = (id) => { const ph = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id]; return `<span class="rp-face"${ph ? ` style="background-image:url('${ph}')"` : ''}></span>`; };
  const row = (r, i) => `<div class="rp-tr rp-row sv-r" data-id="${escapeHtml(r.id)}" style="grid-template-columns:${tpl}"${r.pro ? '' : ` title="${escapeHtml(r.type || '')}"`}><span class="rp-nm">${i != null ? `<i class="sv-rank${i < 3 ? ' r' + (i + 1) : ''}">${i + 1}</i>` : ''}${face(r.id)}<b>${escapeHtml(playerName(r.id))}</b>${r.pro ? '' : '<small class="sv-ind">indiv.</small>'}</span>${cols.map((k) => cell(r, k)).join('')}</div>`;
  const head = `<div class="rp-tr rp-th sv-th" style="grid-template-columns:${tpl}"><span data-k="name" class="${o.sort ? '' : 'on'}">Players</span>${cols.map((k) => `<span data-k="${k}" class="${o.sort === k ? 'on' : ''}">${svLabel(k)}${o.sort === k ? ' ↓' : ''}</span>`).join('')}</div>`;
  const teamRow = o.team ? `<div class="rp-tr rp-row sv-team" style="grid-template-columns:${tpl}"><span class="rp-nm"><b>Team avg</b></span>${cols.map((k) => cell(o.team, k, true)).join('')}</div>` : '';
  let body;
  if (o.sort && cols.includes(o.sort)) body = rows.slice().sort((a, b) => (b[o.sort] ?? -1) - (a[o.sort] ?? -1) || playerName(a.id).localeCompare(playerName(b.id))).map((r, i) => row(r, i)).join('');
  else {
    const grp = (r) => { const p = posOf(r.id, TR.sessions.roster); return POS_ORDER.includes(p) ? p : '—'; };
    body = [...POS_ORDER, '—'].filter((g) => rows.some((r) => grp(r) === g)).map((g) => `<div class="rp-grp">${g === '—' ? '' : g}<small>${POS_LABEL[g] || 'Other'}</small></div>`
      + rows.filter((r) => grp(r) === g).sort((a, b) => playerName(a.id).localeCompare(playerName(b.id))).map((r) => row(r)).join('')).join('');
  }
  return `<div class="sv-rp-wrap"><div class="rp sv-rp" id="sv-tbl"><div class="rp-tbl">${head}${teamRow}${body}</div></div></div>`;
}
function svAvgRow(rows, cols, core) {
  const t = {};
  cols.forEach((k) => { const xs = rows.filter((r) => core(r) && r[k] != null).map((r) => r[k]); t[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
  return t;
}
function svTableHtml(s) {
  const full = s.minutes || Math.max(0, ...s.players.map((p) => p.min || 0));
  const rows = s.players.filter((p) => p.min > 0).map((p) => ({ id: p.id, type: p.type, pro: svPro(s, p.cat), time: p.min, rpe: p.rpe, mpm: p.mpm, td: p.td, d15: p.d15, d20: p.hit, d25: p.spr,
    vmax: p.vmax, pmax: p.vmax_pct != null ? p.vmax_pct / 100 : null, days: p.days_hsv, sprints: p.spr_n, hacc: p.acc, hdec: p.dec, accdec: p.acc_dec }));
  const core = new Set(rtCore(s).map((p) => p.id));
  const team = svAvgRow(rows, SV_COLS, (r) => core.has(r.id));
  team.time = s.minutes;
  return svTable(rows, SV_COLS, { sort: SV.sort, team, full })
    + `<div class="rt-leg"><span><i class="sv-lg-b" style="background:#6fb0ee"></i>player value</span><span><i class="sv-lg-b sv-lg-t"></i>team max (players of the ${s.group === 'compensatory' ? 'compensatory session' : 'team session'})</span><span><b class="rt-or">Orange time</b> = partial session</span><span>HIT Acc / Dec: lighter → darker = fewer → more</span><span>Days = since his last run ≥ 90 % of his max speed</span><span>Team avg = ${svGroupTxt(s)} only</span></div>`;
}
const svDrillName = (d) => String(d.name || 'Drill').replace(/^Game_/, '').replace(/(\d)(st|nd|rd|th)Half/i, '$1$2 half');
function svDrillsHtml(s) {
  const list = s.drills || [];
  if (!list.length) return `<p class="note">No drill data for this session.</p>`;
  if (!SV.drill || SV.drill.date !== s.date || !list[SV.drill.i]) SV.drill = { date: s.date, i: 0 };
  const d = list[SV.drill.i], twoParts = new Set(list.map((x) => x.ampm)).size > 1;
  const cat = Object.fromEntries(s.players.map((p) => [p.id, p]));
  const rows = Object.entries(d.players).map(([id, x]) => ({ id, type: cat[id] ? cat[id].type : '', pro: cat[id] ? svPro(s, cat[id].cat) : false, time: x[0], td: x[1], d20: x[2], d25: x[3],
    accdec: x[4], vmax: x[5], d15: x[6], sprints: x[7], hacc: x[8], hdec: x[9], mpm: x[0] ? Math.round(x[1] / x[0]) : null }));
  const chips = list.map((x, i) => `<button type="button" data-dr="${i}" class="${i === SV.drill.i ? 'on' : ''}">${twoParts ? `${x.ampm} · ` : ''}${x.no} · ${escapeHtml(svDrillName(x))} <small>${fmtN(x.min)}'</small></button>`).join('');
  const vm = d.vs_match || {}, pc = (v) => (v == null ? '–' : `${v} %`);
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + (r.mpm || 0), 0) / rows.length) : 0;
  const strip = `<div class="sv-dstrip"><b>${d.no} · ${escapeHtml(svDrillName(d))}</b><span>${fmtN(d.min)}' · ${rows.length} player${rows.length > 1 ? 's' : ''}</span><span>team ${avg} m/min${d.team && d.team.vmax ? ` · max speed ${fmtN(d.team.vmax, 1)} km/h` : ''}</span>
    ${s.kind === 'match' ? '' : `<span class="sv-dvs" title="Median of the players' per-minute output in the drill vs their own per-minute match output">Intensity vs his match (per min): TD <b>${pc(vm.td)}</b> · &gt; 15 <b>${pc(vm.d15)}</b> · &gt; 20 <b>${pc(vm.hit)}</b> · Acc+Dec <b>${pc(vm.acc_dec)}</b></span>`}</div>`;
  return `<div class="sv-dchips">${chips}</div>${strip}${svTable(rows, SV_DCOLS, { sort: SV.dsort, team: svAvgRow(rows, SV_DCOLS, (r) => r.pro) })}
    <div class="rt-leg"><span>Time = minutes in the drill · m/min = his intensity in the drill</span><span><i class="sv-lg-b sv-lg-t"></i>team max in this drill</span><span>Ranked by ${SV.dsort ? svLabel(SV.dsort) : 'position'} · click a column to rank by it (Players = by position)</span></div>`;
}

// ------------------------------------------------------------------ individual panel (full session / drills)
function svIndividualHtml(s) {
  const drills = SV.view === 'drills';
  return `<section class="panel sv-bleed" id="sv-ind">
    <div class="panel-head"><h2 class="panel-title small">Individual ${s.kind === 'match' ? 'match' : 'training'} · ${drills ? (s.kind === 'match' ? 'halves' : 'drills') : 'full session'}</h2>${segHtml('sv-view', [['table', 'Full session'], ['drills', s.kind === 'match' ? 'Halves' : 'Drills']], SV.view)}</div>
    ${drills ? svDrillsHtml(s) : svTableHtml(s)}
    ${s.absent.length && !drills ? `<p class="panel-foot"><b>Not in the session:</b> ${s.absent.map((a) => `${escapeHtml(playerName(a.id))} <span class="muted">(${escapeHtml(a.type)})</span>`).join(', ')}</p>` : ''}
    <p class="panel-foot">Click a player for his full session.</p>
  </section>`;
}
function svDrawIndividual(s) {
  const el = document.getElementById('sv-ind');
  if (!el) return;
  el.outerHTML = svIndividualHtml(s);
  svBindIndividual(s);
}
function svBindIndividual(s) {
  const el = document.getElementById('sv-ind');
  bindSeg('sv-view', (v) => { SV.view = v; svDrawIndividual(s); });
  el.querySelectorAll('.sv-th [data-k]').forEach((hd) => hd.addEventListener('click', () => {
    const k = hd.dataset.k === 'name' ? null : hd.dataset.k;
    if (SV.view === 'drills') SV.dsort = k; else SV.sort = k;
    svDrawIndividual(s);
  }));
  el.querySelectorAll('[data-dr]').forEach((b) => b.addEventListener('click', () => { SV.drill = { date: s.date, i: Number(b.dataset.dr) }; svDrawIndividual(s); }));
  el.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => svOpen(s, r.dataset.id)));
}
/** Width of the page scrollbar, so the full-width table panel stays centred on Windows too. */
function svScrollbarVar() { document.documentElement.style.setProperty('--sbw', `${Math.max(0, window.innerWidth - document.documentElement.clientWidth)}px`); }
window.addEventListener('resize', svScrollbarVar);
/** Called by drawSessions: fills the attention and individual sections and binds their clicks. */
function svMount(s) {
  svScrollbarVar();
  document.getElementById('sv-attention').innerHTML = svAttentionHtml(s);
  document.querySelectorAll('#sv-attention [data-id]').forEach((r) => r.addEventListener('click', () => { // no GPS today: his player page
    if (svFlat(s).some((x) => x.id === r.dataset.id)) svOpen(s, r.dataset.id); else switchView('player', { player: r.dataset.id });
  }));
  document.querySelectorAll('#sv-attention [data-more]').forEach((b) => b.addEventListener('click', () => { b.closest('.sv-plan').classList.add('all'); b.remove(); }));
  document.querySelectorAll('#sv-attention [data-allcards]').forEach((b) => b.addEventListener('click', () => { b.previousElementSibling.classList.add('all'); b.remove(); }));
  svBindIndividual(s);
}

// ------------------------------------------------------------------ player sheet (drawer)
function svEnsureDrawer() {
  if (document.getElementById('sv-drawer')) return;
  document.body.insertAdjacentHTML('beforeend', '<div class="sv-dim" id="sv-dim" hidden></div><aside class="sv-drawer" id="sv-drawer" role="dialog" aria-modal="true" aria-label="Player session" hidden><div id="sv-sheet"></div></aside>');
  document.getElementById('sv-dim').addEventListener('click', svClose);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('sv-drawer').hidden) svClose(); });
}
function svClose() {
  const dr = document.getElementById('sv-drawer');
  if (!dr) return;
  dr.hidden = true;
  document.getElementById('sv-dim').hidden = true;
  document.body.classList.remove('sv-noscroll');
}
/** Today's wellness (not the session day): photo inside the score ring, as on the Wellness page. */
function svWellHtml(p) {
  const w = TR.wellness, info = w && w.byId ? w.byId[p.id] : null, has = info && info.today;
  const photo = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[p.id];
  const img = photo ? `<img src="${photo}" alt="">` : `<span>${escapeHtml(initialsOf(playerName(p.id)))}</span>`;
  const date = w && w.date ? (/^\d{4}-\d{2}-\d{2}$/.test(w.date) ? fmtDay(w.date, { weekday: 'short', day: 'numeric', month: 'short' }) : escapeHtml(w.date)) : '';
  const diff = has && info.diff != null ? `<div class="sv-wdiff ${info.diff < -3 ? 'down' : info.diff > 3 ? 'up' : ''}">${diffLabel(info.diff).html}</div>` : '';
  const worst = has && info.worst && info.status !== 'green' ? `<div class="sv-wworst" style="color:${WCOLORS[info.status]}">↓ ${escapeHtml(info.worst.label)} (${info.worst.value}/5)</div>` : '';
  return `<div class="sv-well"><div class="sv-well-h">Today's wellness${date ? `<small>${date}</small>` : ''}</div>
    <div class="sv-ring ${has ? '' : 'off'}">${scoreRingSvg(has ? info.status : null, has ? info.score / 100 : null)}<div class="sv-ring-photo">${img}</div>${has ? `<div class="sv-ring-score" style="color:${WCOLORS[info.status]}">${info.score}%</div>` : ''}</div>
    ${has ? diff + worst : `<div class="sv-wdiff">${w ? 'No check-in today' : 'Loading…'}</div>`}</div>`;
}
const SV_AC = [['td', 'Total distance'], ['acc_dec', 'HI Acc + Dec'], ['hit', 'HIT > 20'], ['spr_n', 'Nb sprints']];
/** A:C on the session day, as the club Power BI: 7:28 = last 7 days ÷ the 28 days before; 14:35 = the same one week
 * earlier. Both above 1.37 (or both under 0.78) = two weeks in a row of overload (underload). */
function svAc2(ser, i) {
  if (!ser || !ser.a7 || i < 0) return [];
  return SV_AC.map(([k, l]) => ({ k, l, a: ser.a7[k] ? ser.a7[k][i] : null, b: ser.a14[k] ? ser.a14[k][i] : null }))
    .filter((x) => x.a != null && x.b != null && ((x.a > ACWR_TH.high && x.b > ACWR_TH.high) || (x.a < ACWR_TH.low && x.b < ACWR_TH.low)))
    .map((x) => ({ ...x, over: x.a > ACWR_TH.high }));
}
function svAcHtml(s, p) {
  const wl = TR.workload, ser = wl && wl.series ? wl.series[p.id] : null;
  const i = ser && ser.a7 ? daysBetween(ser.start, s.date) : -1;
  const ok = ser && ser.a7 && i >= 0 && i < (ser.a7.td || []).length;
  const v = (set, k) => (ok && ser[set][k] ? ser[set][k][i] : null);
  const two = ok ? svAc2(ser, i) : [];
  return `<div class="sv-ac"><table><thead><tr><th>A:C <small>${fmtDay(s.date, { day: 'numeric', month: 'short' })}</small></th><th title="last 7 days ÷ the 28 days before">7:28</th><th title="the same ratio one week earlier">14:35</th></tr></thead><tbody>
    ${SV_AC.map(([k, l]) => { const t = two.find((x) => x.k === k); return `<tr class="${t ? (t.over ? 'ov2' : 'un2') : ''}"><td>${l}${t ? ` <b class="sv-2w">${t.over ? '2 wks ↑' : '2 wks ↓'}</b>` : ''}</td><td>${acwrChip(v('a7', k))}</td><td>${acwrChip(v('a14', k))}</td></tr>`; }).join('')}</tbody></table>
    ${wl ? (ok ? '' : '<small class="muted">no load history for this day</small>') : '<small class="muted">Loading…</small>'}</div>`;
}
/** Re-draws an open sheet once the wellness / workload data has arrived. */
function svRefresh() {
  const dr = document.getElementById('sv-drawer');
  if (dr && !dr.hidden && SV.open) svOpen(SV.open.s, SV.open.id);
}

/** Player sheet on one screen: KPIs, then one line per metric — today vs his usual (zones), his microcycle
 * (done / still to do / target), % of the team and of his match — then the advice and the day-by-day chart. */
function svSheetHtml(s, p, nav) {
  const mc = svMicrocycle(s);
  const plan = mc && mc.days.length ? svPlan(p, mc) : null;
  const rd = plan ? svReading(plan) : null;
  const left = plan ? mc.days.filter((d) => d.date > mc.today).map((d) => d.md).join(' / ') : '';
  if (plan && (!plan[SV.mc] || !plan[SV.mc].target)) SV.mc = 'td';
  const per90 = p.mdref && p.mdref.per90;
  const unit = (k) => (SV_UNIT[k] ? `<small> ${SV_UNIT[k]}</small>` : '');
  const kp = (l, v, sub, warn) => `<div class="sv-k ${warn ? 'warn' : ''}"><span>${l}</span><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const kpis = `<div class="sv-kstrip">${kp('Time', `${fmtN(p.min)}<small> min</small>`, `session ${fmtN(s.minutes)}`)}${kp('RPE', fmtN(p.rpe), `sRPE ${fmtN(p.srpe)} AU`)}${kp('Intensity', `${fmtN(p.mpm)}<small> m/min</small>`, `team ${fmtN(s.team.mpm)}`)}${kp('Max speed', `${fmtN(p.vmax, 1)}<small> km/h</small>`, p.vmax_pct != null ? `${p.vmax_pct}% of max` : '')}${kp('Last ≥ 90% Vmax', p.days_hsv == null ? '—' : `${p.days_hsv}<small> ${p.days_hsv === 1 ? 'day' : 'days'}</small>`, p.days_hsv >= 10 ? 'exposure needed' : 'ago', p.days_hsv >= 10)}</div>`;
  const rows = SV_M.map(([key, l]) => {
    const v = p[key];
    if (v == null) return '';
    const m = svUsual(p, key), z = svZ(p, key), lv = zLevel(z);
    let today = `<td></td><td class="num">${fmtN(v)}${unit(key)}</td><td></td>`;
    if (m != null) {
      const sd = svSd(p, key) || Math.max(0.15 * m, 1);
      const max = Math.max(m + 2.6 * sd, v * 1.06, 1), pc = (x) => Math.max(0, Math.min(100, x / max * 100));
      const lo = Math.max(0, m - sd), hi = m + sd, hi2 = m + 2 * sd;
      today = `<td><span class="sv-zt" title="his usual ${fmtN(m)} (${fmtN(lo)}–${fmtN(hi)})${z != null ? ' · z ' + fmtSigned(z) : ''}"><i class="b" style="width:${pc(lo)}%"></i><i class="g" style="left:${pc(lo)}%;width:${pc(hi) - pc(lo)}%"></i><i class="o" style="left:${pc(hi)}%;width:${pc(hi2) - pc(hi)}%"></i><i class="r" style="left:${pc(hi2)}%;right:0"></i><u style="left:${pc(m)}%"></u><b style="left:${pc(v)}%;background:${lv ? Z_COL[lv] : '#aeaeb2'}"></b></span></td>
        <td class="num">${fmtN(v)}${unit(key)}<small class="sv-us">/ ${fmtN(m)}</small></td><td class="c">${lv ? `<span class="zs ${lv}">${fmtSigned(z)}</span>` : ''}</td>`;
    }
    let cyc = '<td class="sep"></td><td></td><td></td>';
    const mm = plan && plan[key];
    if (mm && mm.target) {
      const mx = Math.max(mm.target, mm.done + mm.planned) * 1.08, w = (x) => Math.max(0, Math.min(100, x / mx * 100)), st = svMcStatus(mm);
      cyc = `<td class="sep"><span class="sv-pt" title="done ${fmtN(mm.done)} · usual by ${s.md} ${fmtN(mm.expected)} · target ${fmtN(mm.target)}${mm.planned ? ` · still to do ${fmtN(mm.planned)}` : ''}"><i class="done" style="width:${w(mm.done)}%;background:${Z_COL[st.lv]}"></i>${mm.planned ? `<i class="todo" style="left:${w(mm.done)}%;width:${w(mm.planned)}%"></i>` : ''}${mm.left ? `<s style="left:${w(mm.expected)}%"></s>` : ''}<b style="left:${w(mm.target)}%"></b></span></td>
        <td class="num">${fmtN(mm.done)}<small class="sv-us">/ ${fmtN(mm.target)}</small></td><td class="c"><span class="zs ${st.lv}">${st.t}</span></td>`;
    }
    const vt = s.team[key] ? Math.round(v / s.team[key] * 100) : null, vm = p['p3_' + key];
    return `<tr class="m ${plan && key === SV.mc ? 'sel' : ''}" ${plan && mm && mm.target ? `data-mck="${key}"` : ''}><td class="lbl">${l}</td>${today}${cyc}<td class="num sep">${vt == null ? '—' : `${vt > 300 ? '>300' : vt}%`}</td><td class="num">${vm == null ? '—' : `${vm}%`}</td></tr>`;
  }).join('');
  const game = s.kind === 'match' || p.cat === 'b'; // A-team match, or a B-team game on a training day
  const comp = p.mdref && p.mdref.kind === 'comp'; // a compensatory session: vs his usual compensatory session
  const refTxt = p.mdref ? `${p.mdref.src === 'own' ? `his ${p.mdref.n} ${game ? 'games of 75 min + (A + B, this season and last)' : comp ? 'compensatory sessions' : 'sessions'}` : comp ? 'squad, compensatory sessions' : 'squad reference'}${per90 && p.min < 75 ? `, scaled to his ${fmtN(p.min)} min — indicative` : ''}`
    : game && p.min < 20 ? 'under 20 min: no comparison' : 'no reference';
  const prep = plan && mc.prep;
  const cycTxt = prep ? `His preparation → this match <small>${mc.days[0].md} → MD-1 · vs his usual for these days</small>`
    : plan ? `His microcycle → match ${fmtDay(mc.matchDate, { weekday: 'short', day: 'numeric', month: 'short' })} <small>${mc.days[0].md} → MD-1 · as of ${s.md}</small>` : 'His microcycle <small>no plan on a break</small>';
  const ins = prep ? svPrepInsights(plan, mc) : plan ? svInsights(s, plan, rd, left) : [];
  return `
    <div class="sv-head3">${svWellHtml(p)}
      <div class="sv-mid"><div class="sv-top"><div class="sv-id"><h3>${escapeHtml(playerName(p.id))}</h3>
        <p>${escapeHtml(svPos(p.id))}${svPos(p.id) ? ' · ' : ''}${escapeHtml(p.type || '')} · ${fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.kind === 'match' ? 'match' : s.md || 'training'}${s.cycle.type ? ` of a ${TYPE_LABEL[s.cycle.type].toLowerCase()} microcycle` : ''} · <button type="button" class="sv-link" data-load="${p.id}">Workload history ›</button></p></div>${nav}</div>
        ${kpis}</div>
      ${svAcHtml(s, p)}</div>
    <div class="sv-grid-wrap"><table class="sv-grid">
      <colgroup><col style="width:104px"><col><col style="width:112px"><col style="width:58px"><col><col style="width:112px"><col style="width:92px"><col style="width:56px"><col style="width:56px"></colgroup>
      <thead><tr class="grp"><th></th><th colspan="3">Today vs his usual ${game ? 'match' : comp ? 'compensatory session' : s.md || ''} <small>${refTxt}</small></th><th colspan="3" class="sep">${cycTxt}</th><th colspan="2" class="sep">Today vs</th></tr>
        <tr><th>Metric</th><th>blue · green usual · orange · red &nbsp;● today &nbsp;| usual</th><th class="r">today / usual</th><th class="c">z</th><th class="sep">${prep ? 'done · | his usual' : 'done · to do · target'}</th><th class="r">${prep ? 'done / usual' : 'done / target'}</th><th class="c">status</th><th class="r sep">team</th><th class="r">match</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${plan ? `<div class="sv-bottom"><div class="sv-ins">${ins.map((x) => `<div class="sv-in ${x.lv}"><i>${x.i}</i><span>${x.t}</span></div>`).join('')}
        ${prep ? '<div class="sv-leg"><span><i class="lg-done"></i>done, MD-k → MD-1</span><span><i class="lg-tgt"></i>his usual for these days, added up</span></div></div>'
          : '<div class="sv-leg"><span><i class="lg-done"></i>done</span><span><i class="lg-todo"></i>his objective for the days left</span><span><i class="lg-exp"></i>his usual by today</span><span><i class="lg-tgt"></i>microcycle target</span><span>target = his own usual for each day, added up · re-planned after every session</span></div></div>'}
      <div class="sv-chart"><div class="sv-chart-h"><b>${SV_LBL[SV.mc]}</b> day by day <small>· click a line above to change · dark line = his usual for that day${prep ? '' : ' · dashed = his objective'}</small></div>${svMcChart(plan[SV.mc], SV.mc)}</div></div>` : ''}`;
}
function svOpen(s, id) {
  const list = svFlat(s), i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  svEnsureDrawer();
  const p = list[i], sheet = document.getElementById('sv-sheet');
  SV.open = { s, id };
  const nav = `<div class="sv-nav"><button type="button" data-go="${i - 1}" ${i ? '' : 'disabled'} title="${i ? escapeHtml(playerName(list[i - 1].id)) : ''}">‹ ${i ? escapeHtml(playerName(list[i - 1].id)) : ''}</button><button type="button" data-go="${i + 1}" ${i < list.length - 1 ? '' : 'disabled'}>${i < list.length - 1 ? escapeHtml(playerName(list[i + 1].id)) : ''} ›</button><button type="button" class="sv-x" aria-label="Close">×</button></div>`;
  sheet.innerHTML = svSheetHtml(s, p, nav);
  const dr = document.getElementById('sv-drawer');
  const wasHidden = dr.hidden;
  dr.hidden = false;
  document.getElementById('sv-dim').hidden = false;
  document.body.classList.add('sv-noscroll');
  if (wasHidden) dr.scrollTop = 0;
  sheet.querySelector('.sv-x').onclick = svClose;
  sheet.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { svOpen(s, list[Number(b.dataset.go)].id); dr.scrollTop = 0; }; });
  sheet.querySelectorAll('[data-mck]').forEach((b) => { b.onclick = () => { SV.mc = b.dataset.mck; svOpen(s, id); }; });
  sheet.querySelector('[data-load]').onclick = () => { svClose(); switchView('player', { player: p.id }); };
  if (wasHidden) sheet.querySelector('.sv-x').focus({ preventScroll: true });
}
