/**
 * Training › Sessions — the individual part ("exceptions first, detail on demand"):
 *  · Attention today: players outside their usual range, speed exposure, high RPE — and, for the days left before the
 *    match, joker candidates (high-speed target of the microcycle already reached) and players needing a top-up;
 *  · the compact table (bar = value, colour = z vs his usual for this MD tag and microcycle type, tick = his usual)
 *    or the four ranking panels (distance / m·min, high-intensity running, Acc + Dec, sprints);
 *  · the player sheet (drawer): today vs his usual, vs the team and his match, and his microcycle — done so far vs
 *    still to do until the match, re-planned after every session.
 * Data: sessions payload — players[].mdref (his usual for this day: mean, sd, z) and `usual` (per type × tag).
 */
const SV = { view: 'table', sort: null, td: 'td', hi: 'hit', mc: 'hit', sorted: null };
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
function svLegend() {
  return `<span class="sv-lg">${['below', 'on', 'above', 'high'].map((k) => `<span><i style="background:${Z_COL[k]}"></i>${{ below: 'below his usual', on: 'usual', above: 'slightly above', high: 'well above' }[k]}</span>`).join('')}<span><i class="tick"></i>his usual</span></span>`;
}

// ------------------------------------------------------------------ his microcycle (done so far vs still to do)
function svTagNum(tag) { const m = /^MD([+-])(\d+)$/.exec(tag || ''); return m ? (m[1] === '-' ? -Number(m[2]) : Number(m[2])) : null; }
/** Days that prepare the match (MD-6 → MD-1) of the microcycle of session s, from the MD tags: done, today, left.
 * MD+1 / MD+2 are left out: recovery for the starters, compensation for the others — not a shared target. */
function svMicrocycle(s) {
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
    out[k] = { rows, target, done, expected, planned: fut.reduce((a, r) => a + r.obj, 0), left: fut.length };
  });
  return out;
}
function svMcStatus(m) {
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
const SV_A = { td: 'Total distance', d15: '> 15 km/h', hit: '> 20 km/h', spr: '> 25 km/h', acc_dec: 'Acc + Dec', srpe: 'sRPE' };
function svAttention(s) {
  const out = [];
  let calm = 0;
  svFlat(s).forEach((p) => {
    const r = [];
    Object.keys(SV_A).forEach((k) => {
      const z = svZ(p, k);
      if (z == null) return;
      const d = `${fmtN(p[k])} vs ${fmtN(svUsual(p, k))} · z ${fmtSigned(z)}`;
      if (z >= 2) r.push({ lv: 'high', sev: 3, t: `${SV_A[k]} well above his usual`, d });
      else if (z >= 1) r.push({ lv: 'above', sev: 1, t: `${SV_A[k]} slightly above his usual`, d });
      else if (z <= -1 && ['td', 'd15', 'hit'].includes(k) && p.cat === 't') r.push({ lv: 'below', sev: 2, t: `${SV_A[k]} below his usual`, d });
    });
    if (p.days_hsv >= 10) r.push({ lv: 'high', sev: 3, t: `${p.days_hsv} days without ≥ 90 % of his Vmax`, d: `today ${fmtN(p.vmax, 1)} km/h${p.vmax_pct != null ? ' · ' + p.vmax_pct + '%' : ''}` });
    if (p.rpe >= 8) r.push({ lv: 'above', sev: 1, t: `RPE ${fmtN(p.rpe)}`, d: `sRPE ${fmtN(p.srpe)} AU` });
    const ser = TR.workload && TR.workload.series ? TR.workload.series[p.id] : null;
    const two = ser ? svAc2(ser, daysBetween(ser.start, s.date)) : [];
    const ov = two.filter((x) => x.over), un = two.filter((x) => !x.over);
    if (ov.length) r.push({ lv: 'high', sev: 3, t: `2 weeks in a row of overload (A:C > 1.37)`, d: ov.map((x) => `${x.l} ${x.b.toFixed(2)} → ${x.a.toFixed(2)}`).join(' · ') });
    if (un.length) r.push({ lv: 'below', sev: 2, t: `2 weeks in a row of underload (A:C < 0.78)`, d: un.map((x) => `${x.l} ${x.b.toFixed(2)} → ${x.a.toFixed(2)}`).join(' · ') });
    if (r.length) out.push({ p, r: r.sort((a, b) => b.sev - a.sev), sev: Math.max(...r.map((x) => x.sev)) * 10 + r.length });
    else calm++;
  });
  return { list: out.sort((a, b) => b.sev - a.sev), calm };
}
function svAttentionHtml(s) {
  const at = svAttention(s), n = svFlat(s).length;
  const cnt = (lv) => at.list.filter((a) => a.r.some((x) => x.lv === lv)).length;
  const mc = svMicrocycle(s);
  let plans = '';
  if (mc && mc.started && mc.days.some((d) => d.date > mc.today)) {
    const next = mc.days.filter((d) => d.date > mc.today).map((d) => d.md).join(' / ');
    const jok = [], top = [];
    svFlat(s).forEach((p) => {
      const plan = svPlan(p, mc), rd = svReading(plan);
      if (rd.joker) jok.push({ p, t: rd.reached.filter((k) => k === 'hit' || k === 'spr').map((k) => `${SV_LBL[k]} ${Math.round(plan[k].done / plan[k].target * 100)}%`).join(' · ') });
      if (rd.topup) top.push({ p, t: `${SV_LBL[rd.kTop]} ${fmtN(plan[rd.kTop].done)} / ${fmtN(plan[rd.kTop].target)} m` });
    });
    const chip = (x, i) => `<button type="button" class="sv-pchip ${i >= 6 ? 'extra' : ''}" data-id="${x.p.id}">${avatarHtml(x.p.id, playerName(x.p.id), 22)}<b>${escapeHtml(playerName(x.p.id))}</b><small>${x.t}</small></button>`;
    const chips = (xs) => (xs.length ? xs.map(chip).join('') + (xs.length > 6 ? `<button type="button" class="sv-more-btn" data-more>+ ${xs.length - 6} more</button>` : '') : '<span class="muted">None</span>');
    const team = top.length > 6 ? `<p class="sv-plan-hint"><b>${top.length} of ${svFlat(s).length} players</b> are short — the group missed its high-speed dose: consider a speed-exposure block for everyone on ${next}.</p>` : '';
    plans = `<div class="sv-plans">
      <div class="sv-plan on"><h4>Joker candidates · ${next}</h4><p>High-speed target of his microcycle already reached (distance > 20 or > 25 km/h).</p><div>${chips(jok)}</div></div>
      <div class="sv-plan below"><h4>Need a high-speed top-up · ${next}</h4><p>Too far behind at > 20 or > 25 km/h to reach his microcycle target within his usual sessions (done / target).</p>${team}<div>${chips(top)}</div></div>
    </div>`;
  }
  const card = (a, i) => `<button type="button" class="sv-card ${i >= 10 ? 'extra' : ''}" data-id="${a.p.id}">
      <span class="sv-card-head">${avatarHtml(a.p.id, playerName(a.p.id), 34)}<span><b>${escapeHtml(playerName(a.p.id))}</b><small>${escapeHtml(svSub(a.p) || '')} · ${fmtN(a.p.min)} min · RPE ${fmtN(a.p.rpe)}</small></span><i>›</i></span>
      ${a.r.slice(0, 3).map((x) => `<span class="sv-reason"><i style="background:${Z_COL[x.lv]}"></i><span>${x.t}<small>${x.d}</small></span></span>`).join('')}${a.r.length > 3 ? `<span class="sv-more">+${a.r.length - 3} more</span>` : ''}</button>`;
  return `<section class="panel">
    <div class="panel-head"><h2 class="panel-title small">Attention today</h2>
      <span class="sv-sum"><b>${at.calm}</b> of ${n} players within their usual range<span class="sep"></span><i style="background:${Z_COL.high}"></i>${cnt('high')} well above / speed exposure<i style="background:${Z_COL.below}"></i>${cnt('below')} below<i style="background:${Z_COL.above}"></i>${cnt('above')} slightly above</span></div>
    ${plans}
    ${at.list.length ? `<div class="sv-cards">${at.list.map(card).join('')}</div>${at.list.length > 10 ? `<button type="button" class="sv-more-btn" data-allcards>Show all ${at.list.length} players ›</button>` : ''}` : '<p class="note">Every player is within his usual range for this day ✓</p>'}
    <p class="panel-foot">Automatic — vs each player's usual ${s.md || 'day'}${s.cycle.type ? ` of ${TYPE_LABEL[s.cycle.type].toLowerCase()} microcycles` : ''} (z-score) · speed exposure = no sprint ≥ 90 % of his max speed for 10 days or more · 2 weeks in a row = A:C 7:28 above 1.37 (or under 0.78) this week and last week on TD, HI Acc+Dec, HIT > 20 or sprints · click a player for his full session.</p>
  </section>`;
}

// ------------------------------------------------------------------ session table: the report's page design (Reports → PDF page 1) + distance > 25 km/h
const SV_COLS = ['time', 'rpe', 'mpm', 'td', 'd15', 'd20', 'd25', 'vmax', 'pmax', 'days', 'sprints', 'accdec'];
/** Players the team average is made of: full session only (matches: ≥ 60 min) — same rule as the build. */
function rtCore(s) {
  const core = s.players.filter((p) => (s.kind === 'match' ? p.cat === 'm' && p.min >= 60 : p.cat === 't'));
  return core.length >= 3 ? core : s.players.filter((p) => p.min > 0);
}
function svTableHtml(s) {
  const full = s.minutes || Math.max(0, ...s.players.map((p) => p.min || 0));
  const rows = s.players.filter((p) => p.min > 0).map((p) => ({ id: p.id, name: playerName(p.id), pos: posOf(p.id, TR.sessions.roster), type: p.type,
    pro: s.kind === 'match' ? p.cat === 'm' : p.cat === 't', // did the team session: sets the grey "team max" track, as in the report
    time: p.min, rpe: p.rpe, mpm: p.mpm, td: p.td, d15: p.d15, d20: p.hit, d25: p.spr, vmax: p.vmax, pmax: p.vmax_pct != null ? p.vmax_pct / 100 : null,
    days: p.days_hsv, sprints: p.spr_n, accdec: p.acc_dec }));
  const core = new Set(rtCore(s).map((p) => p.id));
  const avg = (k) => { const xs = rows.filter((r) => core.has(r.id) && r[k] != null).map((r) => r[k]); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const team = Object.fromEntries(SV_COLS.map((k) => [k, avg(k)]));
  team.time = s.minutes;
  const ref = rows.some((r) => r.pro) ? rows.filter((r) => r.pro) : rows;
  const teamMax = (k) => Math.max(0, ...ref.map((r) => r[k] || 0));
  const scaleMax = (k) => Math.max(teamMax(k), ...rows.map((r) => r[k] || 0));
  const lo = (k) => Math.min(...rows.map((r) => r[k] ?? 0)), hi = (k) => Math.max(...rows.map((r) => r[k] ?? 0));
  const t01 = (k, v) => (hi(k) > lo(k) ? ((v ?? 0) - lo(k)) / (hi(k) - lo(k)) : 0);
  const tpl = '170px ' + SV_COLS.map((k) => RP_WIDTHS[k] || '44px').join(' ');
  const fmt = (k, v) => (k === 'rpe' && v != null && !Number.isInteger(v) ? v.toFixed(1) : rpFmt(k, v));
  const cell = (r, k, isTeam) => {
    const v = r[k];
    if (v == null) return '<div class="rp-c rp-txt"><span class="rp-v sv-na">–</span></div>';
    if (RP_BARS.includes(k)) {
      const m = scaleMax(k), trk = rpPct(teamMax(k), m), col = isTeam ? '#b8bcc8' : RP_COLORS[k];
      if (k === 'vmax') return `<div class="rp-c"><div class="rp-bar rp-mid"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${col}"></i><em>${fmt(k, v)}</em></div></div>`;
      return `<div class="rp-c"><span class="rp-v">${fmt(k, isTeam ? Math.round(v) : v)}</span><div class="rp-bar"><i class="rp-trk" style="width:${trk}"></i><i style="width:${rpPct(v, m)};background:${col}"></i></div></div>`;
    }
    if (isTeam) return `<div class="rp-c rp-txt"><span class="rp-v">${k === 'pmax' ? fmt(k, v) : k === 'rpe' ? v.toFixed(1) : fmt(k, Math.round(v))}</span></div>`;
    if (k === 'mpm') return `<div class="rp-c rp-chip"><span class="rp-v" style="background:rgb(${rpLerp([235, 244, 253], [110, 175, 240], t01(k, v))})">${fmt(k, v)}</span></div>`;
    if (k === 'sprints') { const [bg, fg] = rpSprintColor(t01(k, v)); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${fmt(k, v)}</span></div>`; }
    if (k === 'days') { const [bg, fg] = rpDaysColor(v); return `<div class="rp-c rp-chip"><span class="rp-v" style="background:${bg};color:${fg}">${fmt(k, v)}</span></div>`; }
    if (k === 'time' && r.pro && v < full * 0.9) return `<div class="rp-c rp-txt"><span class="rp-v sv-partial">${fmt(k, v)}</span></div>`;
    return `<div class="rp-c rp-txt"><span class="rp-v">${fmt(k, v)}</span></div>`;
  };
  const face = (id) => { const ph = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id]; return `<span class="rp-face"${ph ? ` style="background-image:url('${ph}')"` : ''}></span>`; };
  const row = (r) => `<div class="rp-tr rp-row sv-r" data-id="${escapeHtml(r.id)}" style="grid-template-columns:${tpl}"${r.pro ? '' : ` title="${escapeHtml(r.type || '')}"`}><span class="rp-nm">${face(r.id)}<b>${escapeHtml(r.name)}</b>${r.pro ? '' : '<small class="sv-ind">indiv.</small>'}</span>${SV_COLS.map((k) => cell(r, k)).join('')}</div>`;
  const head = `<div class="rp-tr rp-th sv-th" style="grid-template-columns:${tpl}"><span data-k="name" class="${SV.sort ? '' : 'on'}">Players</span>${SV_COLS.map((k) => `<span data-k="${k}" class="${SV.sort === k ? 'on' : ''}">${RP_LABELS[k]}${SV.sort === k ? ' ↓' : ''}</span>`).join('')}</div>`;
  const teamRow = `<div class="rp-tr rp-row sv-team" style="grid-template-columns:${tpl}"><span class="rp-nm"><b>Team avg</b></span>${SV_COLS.map((k) => cell(team, k, true)).join('')}</div>`;
  let body;
  if (SV.sort && SV_COLS.includes(SV.sort)) body = rows.slice().sort((a, b) => (b[SV.sort] ?? -1) - (a[SV.sort] ?? -1) || a.name.localeCompare(b.name)).map(row).join('');
  else {
    const grp = (r) => (POS_ORDER.includes(r.pos) ? r.pos : '—');
    body = [...POS_ORDER, '—'].filter((g) => rows.some((r) => grp(r) === g)).map((g) => `<div class="rp-grp">${g === '—' ? '' : g}<small>${POS_LABEL[g] || 'Other'}</small></div>`
      + rows.filter((r) => grp(r) === g).sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')).join('');
  }
  return `<div class="sv-rp-wrap"><div class="rp sv-rp" id="sv-tbl"><div class="rp-tbl">${head}${teamRow}${body}</div></div></div>
    <div class="rt-leg"><span><i class="sv-lg-b" style="background:#6fb0ee"></i>player value</span><span><i class="sv-lg-b sv-lg-t"></i>team max (players of the team session)</span><span><b class="rt-or">Orange time</b> = partial session</span><span>Days = since his last run ≥ 90 % of his max speed</span><span>Team avg = full-session players only</span></div>`;
}
function svBindTable(s, root) {
  root.querySelectorAll('.sv-th [data-k]').forEach((hd) => hd.addEventListener('click', () => {
    SV.sort = hd.dataset.k === 'name' ? null : hd.dataset.k;
    svDrawIndividual(s);
  }));
}

// ------------------------------------------------------------------ four ranking panels
function svRankHead(title, k, s, seg) {
  const r = s.kind !== 'match' && s.team_ref && s.team_ref[k], lv = r ? zLevel(r.z) : null;
  const unit = { td: 'm', mpm: 'm/min', hit: 'm', d15: 'm', acc_dec: '', spr: 'm' }[k] || '';
  return `<div class="sv-rk-head"><div><h3>${title}</h3><small>Team <b>${fmtN(r ? r.v : s.team[k])}</b> ${unit}${r ? ` · usual ${fmtN(r.mean)}` : ''}${lv ? ` <span class="zs ${lv}">${Z_LABEL[lv]} · z ${fmtSigned(r.z)}</span>` : ''}</small></div>${seg || ''}</div>`;
}
function svRankRows(s, k, o = {}) {
  const list = svFlat(s).filter((p) => p[k] != null).sort((a, b) => (b[k] || 0) - (a[k] || 0));
  const max = Math.max(1, ...list.map((p) => Math.max(p[k] || 0, o.noRef ? 0 : svUsual(p, k) || 0)));
  const avg = s.team[k];
  return list.map((p) => {
    const z = o.noRef ? null : svZ(p, k), lv = zLevel(z), u = o.noRef ? null : svUsual(p, k);
    const col = o.noRef ? 'rgba(92,164,240,.8)' : lv ? Z_COL[lv] : '#aeaeb2';
    let bar;
    if (o.split) { const a = (p.acc || 0) / max * 100, d = (p.dec || 0) / max * 100; bar = `<i class="acc" style="left:0;width:${a}%;background:${col}"></i><i class="dec" style="left:${a}%;width:${d}%;background:${col};opacity:.45"></i>`; }
    else bar = `<i style="left:0;width:${Math.max(1.5, (p[k] || 0) / max * 100)}%;background:${col}"></i>`;
    const zs = zLevel(svZ(p, 'spr_n'));
    const val = o.split ? `${fmtN(p[k])} <small>${fmtN(p.acc)} + ${fmtN(p.dec)}</small>`
      : o.pips ? `${fmtN(p[k])} <small>m</small> <span class="sv-pips" title="${fmtN(p.spr_n)} sprints">${Array.from({ length: Math.min(p.spr_n || 0, 14) }, () => `<i style="background:${zs ? Z_COL[zs] : '#aeaeb2'}"></i>`).join('')}</span>`
        : `${fmtN(p[k])}${o.other ? ` <small>${o.other(p)}</small>` : ''}`;
    return `<button type="button" class="sv-rk-row ${o.pips ? 'spr' : ''}" data-id="${p.id}" title="${escapeHtml(playerName(p.id))}${u != null ? ` · his usual ${fmtN(u)} · z ${fmtSigned(z)}` : ''}"><span class="sv-rk-name">${avatarHtml(p.id, playerName(p.id), 22)}${escapeHtml(playerName(p.id))}${p.cat === 't' || p.cat === 'm' ? '' : ` <small>${escapeHtml(String(p.type).toLowerCase())}</small>`}</span>
      <span class="sv-rk-track">${bar}${u != null ? `<u style="left:${Math.min(100, u / max * 100)}%"></u>` : ''}${avg != null ? `<s style="left:${Math.min(100, avg / max * 100)}%"></s>` : ''}</span><span class="sv-rk-val">${val}</span></button>`;
  }).join('');
}
function svRankHtml(s) {
  const foot = (extra = '') => `<div class="sv-rk-foot">${svLegend()}<span class="sv-lg"><span><i class="dash"></i>team average</span>${extra}</span></div>`;
  return `<div class="sv-rk-grid">
    <section class="sv-rk">${svRankHead(SV.td === 'td' ? 'Total distance' : 'Intensity · m/min', SV.td, s, segHtml('sv-td', [['td', 'Distance'], ['mpm', 'm/min']], SV.td))}${svRankRows(s, SV.td, { noRef: SV.td === 'mpm', other: SV.td === 'td' ? (p) => `${fmtN(p.mpm)} m/min` : (p) => `${fmtN(p.td)} m` })}${foot(SV.td === 'mpm' ? '<span>m/min: no personal reference yet</span>' : '')}</section>
    <section class="sv-rk">${svRankHead(SV.hi === 'hit' ? 'High-intensity running · > 20 km/h' : 'High-speed running · > 15 km/h', SV.hi, s, segHtml('sv-hi', [['hit', '> 20 km/h'], ['d15', '> 15 km/h']], SV.hi))}${svRankRows(s, SV.hi, { other: (p) => (SV.hi === 'hit' ? `${fmtN(p.hit_n)} efforts` : `>20: ${fmtN(p.hit)}`) })}${foot()}</section>
    <section class="sv-rk">${svRankHead('HIT accelerations + decelerations', 'acc_dec', s)}${svRankRows(s, 'acc_dec', { split: true })}${foot('<span>dark = acc · light = dec</span>')}</section>
    <section class="sv-rk">${svRankHead('Sprints · distance > 25 km/h and number', 'spr', s)}${svRankRows(s, 'spr', { pips: true })}${foot('<span>bar = distance > 25 km/h · dots = number of sprints</span>')}</section>
  </div>`;
}

// ------------------------------------------------------------------ individual panel (table / rankings)
function svIndividualHtml(s) {
  return `<section class="panel sv-bleed" id="sv-ind">
    <div class="panel-head"><h2 class="panel-title small">Individual ${s.kind === 'match' ? 'match' : 'training'} · full session</h2>${segHtml('sv-view', [['table', 'Table'], ['rank', 'Rankings']], SV.view)}</div>
    ${SV.view === 'table' ? svTableHtml(s) : svRankHtml(s)}
    ${s.absent.length ? `<p class="panel-foot"><b>Not in the session:</b> ${s.absent.map((a) => `${escapeHtml(playerName(a.id))} <span class="muted">(${escapeHtml(a.type)})</span>`).join(', ')}</p>` : ''}
    <p class="panel-foot">${SV.view === 'table' ? 'Click a column header to sort (Player = back to positions) · click a player for his full session.' : 'Each panel ranks every player · colour = z vs his usual for this day · tick = his usual · dashed = team average · click a player for his full session.'}</p>
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
  if (SV.view === 'table') svBindTable(s, el);
  else {
    bindSeg('sv-td', (v) => { SV.td = v; svDrawIndividual(s); });
    bindSeg('sv-hi', (v) => { SV.hi = v; svDrawIndividual(s); });
  }
  el.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => svOpen(s, r.dataset.id)));
}
/** Width of the page scrollbar, so the full-width table panel stays centred on Windows too. */
function svScrollbarVar() { document.documentElement.style.setProperty('--sbw', `${Math.max(0, window.innerWidth - document.documentElement.clientWidth)}px`); }
window.addEventListener('resize', svScrollbarVar);
/** Called by drawSessions: fills the attention and individual sections and binds their clicks. */
function svMount(s) {
  svScrollbarVar();
  document.getElementById('sv-attention').innerHTML = svAttentionHtml(s);
  document.querySelectorAll('#sv-attention [data-id]').forEach((r) => r.addEventListener('click', () => svOpen(s, r.dataset.id)));
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
  const refTxt = p.mdref ? `${p.mdref.src === 'own' ? `his ${p.mdref.n} sessions` : 'squad reference'}${per90 ? ', to his minutes' : ''}` : 'no reference';
  const cycTxt = plan ? `His microcycle → match ${fmtDay(mc.matchDate, { weekday: 'short', day: 'numeric', month: 'short' })} <small>${mc.days[0].md} → MD-1 · as of ${s.md}</small>` : 'His microcycle <small>no plan on a match day or a break</small>';
  const ins = plan ? svInsights(s, plan, rd, left) : [];
  return `
    <div class="sv-head3">${svWellHtml(p)}
      <div class="sv-mid"><div class="sv-top"><div class="sv-id"><h3>${escapeHtml(playerName(p.id))}</h3>
        <p>${escapeHtml(svPos(p.id))}${svPos(p.id) ? ' · ' : ''}${escapeHtml(p.type || '')} · ${fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.kind === 'match' ? 'match' : s.md || 'training'}${s.cycle.type ? ` of a ${TYPE_LABEL[s.cycle.type].toLowerCase()} microcycle` : ''} · <button type="button" class="sv-link" data-load="${p.id}">Workload history ›</button></p></div>${nav}</div>
        ${kpis}</div>
      ${svAcHtml(s, p)}</div>
    <div class="sv-grid-wrap"><table class="sv-grid">
      <colgroup><col style="width:104px"><col><col style="width:112px"><col style="width:58px"><col><col style="width:112px"><col style="width:92px"><col style="width:56px"><col style="width:56px"></colgroup>
      <thead><tr class="grp"><th></th><th colspan="3">Today vs his usual ${s.kind === 'match' ? 'match' : s.md || ''} <small>${refTxt}</small></th><th colspan="3" class="sep">${cycTxt}</th><th colspan="2" class="sep">Today vs</th></tr>
        <tr><th>Metric</th><th>blue · green usual · orange · red &nbsp;● today &nbsp;| usual</th><th class="r">today / usual</th><th class="c">z</th><th class="sep">done · to do · target</th><th class="r">done / target</th><th class="c">status</th><th class="r sep">team</th><th class="r">match</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${plan ? `<div class="sv-bottom"><div class="sv-ins">${ins.map((x) => `<div class="sv-in ${x.lv}"><i>${x.i}</i><span>${x.t}</span></div>`).join('')}
        <div class="sv-leg"><span><i class="lg-done"></i>done</span><span><i class="lg-todo"></i>his objective for the days left</span><span><i class="lg-exp"></i>his usual by today</span><span><i class="lg-tgt"></i>microcycle target</span><span>target = his own usual for each day, added up · re-planned after every session</span></div></div>
      <div class="sv-chart"><div class="sv-chart-h"><b>${SV_LBL[SV.mc]}</b> day by day <small>· click a line above to change · dark line = his usual for that day · dashed = his objective</small></div>${svMcChart(plan[SV.mc], SV.mc)}</div></div>` : ''}`;
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
