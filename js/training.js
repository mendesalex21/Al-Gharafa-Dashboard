/**
 * Training › Sessions (session review: objectives compliance, players vs squad, drills) and
 * Training › Objectives (targets by microcycle type from the club's own history + upcoming week plan).
 * Data: sync/build.py → "sessions" and "objectives" payloads.
 */
const TR = { sessions: null, obj: null, date: null, type: 'normal', mdz: 'td' };
const TYPE_LABEL = { short: 'Short', normal: 'Normal', long: 'Long' };
const OBJ_METRICS = ['td', 'hit', 'spr', 'acc_dec', 'srpe'];

function objectiveFor(obj, type, tag) {
  return obj && type && tag && obj.table[type] ? obj.table[type][tag] || null : null;
}
const OBJ_BARS = [
  ['td', 'Total distance', 'm'], ['d15', 'Distance > 15 km/h', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'],
  ['spr_n', 'Sprints', ''], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE load', 'AU'], ['mpm', 'Intensity', 'm/min'], ['minutes', 'Duration', 'min'],
];

/**
 * Objective bar of one team metric: zones from the usual (mean ± SD of the same MD in the same microcycle type) —
 * blue below, green on target, orange slightly above, red well above — and today's team value as the dot.
 * Status = team z, the same number as the calendar and the planner.
 */
function zBulletHtml(label, unit, actual, ref) {
  const lv = zLevel(ref.z), m = ref.mean, sd = ref.sd || 1;
  const max = Math.max(m + 2.6 * sd, (actual || 0) * 1.06, 1);
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const lo = Math.max(0, m - sd), hi = m + sd, hi2 = m + 2 * sd;
  return `<div class="bullet">
    <div class="bl-head"><span>${label}</span><span class="bl-val">${fmtN(actual)} <small>${unit}</small></span></div>
    <div class="bl-track zb"><span class="zb-b" style="left:0;width:${pct(lo)}%"></span><span class="zb-g" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></span><span class="zb-o" style="left:${pct(hi)}%;width:${pct(hi2) - pct(hi)}%"></span><span class="zb-r" style="left:${pct(hi2)}%;width:${100 - pct(hi2)}%"></span>
      <span class="bl-med" style="left:${pct(m)}%"></span>${actual != null ? `<span class="bl-act" style="left:${pct(actual)}%;background:${Z_COL[lv]}"></span>` : ''}</div>
    <div class="bl-foot zf"><span>usual ${fmtN(m)} <span class="muted">(${fmtN(lo)}–${fmtN(hi)})</span></span><span class="zs ${lv}">${Z_LABEL[lv]} · z ${fmtSigned(ref.z)}</span></div></div>`;
}

/** "the last 15 MD-3 sessions · since 14 Dec 2025" (MD references: the last 15 sessions of the same MD, his choice
 * 2026-10-07 — the date moves with them, all this season by December); a match: its games since the date. */
function refPeriod(ref, what) {
  const since = ref.since ? fmtDay(ref.since, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return ref.last ? `the last ${ref.n} ${what}${since ? ` · since ${since}` : ''}` : `${ref.n} ${what}${since ? ` since ${since}` : ''}`;
}
function objectivesPanel(s) {
  const cyc = s.cycle, ref = s.team_ref;
  const per90 = s.kind === 'match', comp = s.group === 'compensatory';
  if (!ref) {
    return `<section class="panel"><div class="panel-head"><h2 class="panel-title small">${comp ? 'Compensatory session · averages' : 'Team averages'}</h2><span class="panel-note">${comp ? 'no reference yet for compensatory sessions' : 'no objective: outside a standard microcycle (break or pre-season)'}</span></div>
      <div class="obj-plain">${OBJ_BARS.map(([k, l, u]) => { const v = k === 'minutes' ? s.minutes : s.team[k]; return v == null ? '' : `<div><span>${l}</span><b>${fmtN(v)}<small> ${u}</small></b></div>`; }).join('')}</div></section>`;
  }
  const bars = OBJ_BARS.filter(([k]) => ref[k] && ref[k].z != null)
    .map(([k, l, u]) => zBulletHtml(l, u + (per90 && k !== 'mpm' ? ' /90' : ''), ref[k].v, ref[k])).join(''); // v = value behind the z
  return `<section class="panel">
    <div class="panel-head">${comp
    ? `<h2 class="panel-title small">Objectives · compensatory session${s.md ? ` (${s.md})` : ''}</h2><span class="panel-note">average of the ${s.n_core} compensatory players vs ${refPeriod(ref, 'compensatory sessions')} — not vs the usual ${s.md || 'training'}</span>`
    : `<h2 class="panel-title small">Objectives · ${s.md} of a ${TYPE_LABEL[cyc.type].toLowerCase()} microcycle${per90 ? ' (per 90 min)' : ''}</h2><span class="panel-note">team average vs ${refPeriod(ref, ref.last ? `${s.md} sessions` : 'games')}</span>`}</div>
    <div class="bullets">${bars}</div>
    <p class="panel-foot">Green = usual ± 1 SD (on target, |z| &lt; 1) · blue below · orange 1–2 SD above · red more than 2 SD above. Dark tick = usual. Same z-scores as the calendar and the planner.</p></section>`;
}

// ------------------------------------------------------------------ the week until the match, beside today's objectives
// mockup A chosen 2026-10-07: full width, the 9 metrics of the day's objectives, each day left kept visible (dotted, at its
// usual) with its objective inside, what goes over the target in red
const WK_M = [['td', 'Total distance', 'm'], ['d15', 'Distance > 15 km/h', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Distance > 25 km/h', 'm'],
  ['spr_n', 'Sprints', ''], ['acc_dec', 'HIT Acc + Dec', ''], ['srpe', 'sRPE load', 'AU'], ['mpm', 'Intensity', 'm/min'], ['minutes', 'Duration', 'min']];
const WK_BLUE = '#2a78d6';
const wkFmt = (k, v) => (v == null ? '—' : k === 'td' && Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : fmtN(v));
/** Today's objectives and, beside them, the week until the match (staff report data: done, objectives of the days left). */
function sePanels(s) {
  const wk = weekPanel(s);
  return wk ? `<div class="se-top two sv-bleed">${objectivesPanel(s)}${wk}</div>` : objectivesPanel(s);
}
/** The microcycle of one metric (geometry: stMicroGeo, shared with the staff report): done (green, a tick between days),
 * then each day left at its usual size (dotted) with its objective filled inside, the target (black line), and in red
 * what goes over it: done already (solid) or if the days left are as usual (hatched). Every day keeps room for its MD. */
function wkBar(X, k) {
  const t = (X.tot || {})[k];
  if (!t) return k === 'mpm' ? '<div class="wk-mb wk-note">An intensity has no week total: each day left keeps its usual m/min.</div>' : '';
  const W = 300, G = stMicroGeo(X, k, W), { target, done, udone, proj, xOf } = G;
  let rects = `<rect x="0" y="3" width="${W}" height="13" rx="4" style="fill:var(--surface-2)"/>`, over = '', labs = '';
  G.segs.forEach((s) => {
    if (s.gap) return;
    const lab = (fill) => (s.w > 17 ? `<text x="${s.x + s.w / 2}" y="12.5" text-anchor="middle" font-size="8.5" font-weight="800" style="fill:${fill}">${s.md}</text>` : '');
    if (s.done) { rects += `<rect x="${s.x}" y="3" width="${s.w}" height="13" fill="#34c759"/><line x1="${s.x + s.w}" x2="${s.x + s.w}" y1="3" y2="16" style="stroke:var(--surface)" stroke-width="1.5"/>`; labs += lab('#fff'); return; }
    rects += `<rect x="${s.x + 0.6}" y="3.6" width="${Math.max(0, s.w - 1.2)}" height="11.8" rx="2" fill="none" stroke="${WK_BLUE}" stroke-width="1" stroke-dasharray="2.5 2"/>`;
    if (s.o > 0 && s.v > 0) rects += `<rect x="${s.x + 1.2}" y="4.2" width="${Math.max(0, s.w * s.o / s.v - 2.4)}" height="10.6" rx="1.5" fill="rgba(42,120,214,.28)"/>`;
    labs += lab(WK_BLUE);
  });
  if (target && done > target) over += `<rect x="${xOf(target)}" y="3" width="${xOf(done) - xOf(target)}" height="13" fill="#e5484d"/>`;
  else if (target && proj > target * 1.02) over += `<rect x="${xOf(target)}" y="3" width="${xOf(proj) - xOf(target)}" height="13" fill="url(#wk-hatch)"/>`;
  if (G.segs.some((s) => s.done) && udone) over += `<line x1="${xOf(udone)}" x2="${xOf(udone)}" y1="1" y2="18" style="stroke:var(--ink-muted)" stroke-width="1.5" stroke-dasharray="2 1.5"/>`;
  if (target) over += `<line x1="${xOf(target)}" x2="${xOf(target)}" y1="0" y2="19" style="stroke:var(--ink)" stroke-width="2"/>`;
  const defs = '<defs><pattern id="wk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="rgba(229,72,77,.08)"/><line x1="0" y1="0" x2="0" y2="5" stroke="rgba(229,72,77,.6)" stroke-width="1.6"/></pattern></defs>';
  const vs = G.segs.some((s) => s.done) && udone ? Math.round((done / udone - 1) * 100) : null, cls = vs == null ? '' : Math.abs(vs) < 10 ? 'ok' : Math.abs(vs) < 25 ? 'warn' : 'bad';
  const pc = (v) => Math.round((v / target - 1) * 100);
  const warn = !target ? '' : done > target ? `<span class="wk-over">target passed: +${wkFmt(k, done - target)} (+${pc(done)} %)</span>`
    : proj > target * 1.02 ? `<span class="wk-over">if the days left are as usual: +${wkFmt(k, proj - target)} (+${pc(proj)} %)</span>` : '';
  return `<div class="wk-mb"><svg viewBox="0 0 ${W} 19" role="img" aria-label="microcycle: done, days left, target">${defs}${rects}${over}${labs}</svg><span>done <b>${wkFmt(k, done)}</b>${vs != null ? ` <b class="wk-vs ${cls}">${vs > 0 ? '+' : vs < 0 ? '−' : ''}${Math.abs(vs)} %</b>` : ''} · to do <b>${wkFmt(k, Math.max(0, target - done))}</b> · target <b>${wkFmt(k, target)}</b></span>${warn}</div>`;
}
/** One metric day by day until the match: every day has a dotted slot up to its usual (grey: done, blue: left) — so a
 * small day stays visible next to a big one —; done = solid bar inside (colour = z); day left = its objective filled
 * inside, written in blue (red when cut below its usual); black line = usual, grey band = usual range. */
function wkChart(X, k, mt) {  // mt: the match of a match day [value /90, usual, low, high, z]
  const days = [...X.profile.map((d) => ({ ...d, done: 1 })), ...(X.plan || [])], W = 300, H = 150, L = 6, R = 6, T = 18, B = 30;
  const n = days.length + 1, step = (W - L - R) / n, ih = H - T - B, bw = Math.min(34, step * 0.5);
  const top = Math.max(1, ...days.filter((d) => d[k]).map((d) => Math.max(d[k][0] || 0, d[k][1] || 0, d[k][3] || 0)), ...(mt ? [mt[0] || 0, mt[1] || 0, mt[3] || 0] : [])) * 1.12;
  const y = (v) => T + ih * (1 - Math.min(v, top) / top), base = y(0);
  const lab = (x, yy, v, fill) => `<text x="${x}" y="${Math.max(10, yy - 5)}" text-anchor="middle" font-size="10.5" font-weight="800" style="fill:${fill};stroke:var(--surface);stroke-width:3px;paint-order:stroke">${wkFmt(k, v)}</text>`;
  let g = '';
  days.forEach((d, i) => {
    const p = d[k], x = L + step * (i + 0.5), bx = x - bw / 2;
    let t = '';
    if (p) {
      const u = p[1] || 0;
      if (p[2] != null && p[3] != null) g += `<rect x="${bx - 5}" y="${y(p[3])}" width="${bw + 10}" height="${Math.max(2, y(p[2]) - y(p[3]))}" rx="4" style="fill:var(--surface-2)"/>`;
      if (u > 0) g += `<rect x="${bx + 0.7}" y="${y(u)}" width="${bw - 1.4}" height="${Math.max(1, base - y(u))}" rx="4" fill="none" style="stroke:${d.done ? 'var(--ink-muted)' : WK_BLUE}" stroke-width="1.2" stroke-dasharray="3 2.5"/>`;
      if (d.done && p[0] != null) {
        const lv = zLevel(p[4]), yy = Math.min(y(p[0]), base - 2.5);
        g += `<rect x="${bx + 2}" y="${yy}" width="${bw - 4}" height="${base - yy}" rx="3" fill="${lv ? Z_COL[lv] : '#aeaeb2'}"/>`;
        t = lab(x, Math.min(yy, y(u)), p[0], 'var(--ink)');
      } else if (!d.done && (p[0] != null || u)) {
        const o = Math.min(p[0] || 0, u || p[0] || 0);
        if (o > 0) g += `<rect x="${bx + 2}" y="${y(o)}" width="${bw - 4}" height="${Math.max(1, base - y(o))}" rx="3" fill="rgba(42,120,214,.28)"/>`;
        t = lab(x, Math.min(y(u), y(o)), p[0] || 0, u && (p[0] || 0) < u * 0.98 ? '#c4373c' : WK_BLUE);
      }
      if (p[1] != null) g += `<line x1="${bx - 5}" x2="${bx + bw + 5}" y1="${y(p[1])}" y2="${y(p[1])}" style="stroke:var(--ink)" stroke-width="2" stroke-linecap="round"/>`;
    }
    g += t + `<text x="${x}" y="${H - 16}" text-anchor="middle" font-size="10" font-weight="800" style="fill:${d.done ? 'var(--ink)' : WK_BLUE}">${d.md}</text><text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" style="fill:var(--ink-muted)">${fmtDay(d.date, { weekday: 'short', day: 'numeric' })}</text>`;
  });
  const xm = L + step * (n - 0.5);
  if (mt && mt[0] != null) {  // the match: solid bar (colour = z vs its usual), its range and usual
    const bx = xm - bw / 2, yy = Math.min(y(mt[0]), base - 2.5), lv = zLevel(mt[4]);
    if (mt[2] != null && mt[3] != null) g += `<rect x="${bx - 5}" y="${y(mt[3])}" width="${bw + 10}" height="${Math.max(2, y(mt[2]) - y(mt[3]))}" rx="4" style="fill:var(--surface-2)"/>`;
    g += `<rect x="${bx + 2}" y="${yy}" width="${bw - 4}" height="${base - yy}" rx="3" fill="${lv ? Z_COL[lv] : '#aeaeb2'}"/>` + lab(xm, Math.min(yy, y(mt[1] || 0)), mt[0], 'var(--ink)')
      + (mt[1] != null ? `<line x1="${bx - 5}" x2="${bx + bw + 5}" y1="${y(mt[1])}" y2="${y(mt[1])}" style="stroke:var(--ink)" stroke-width="2" stroke-linecap="round"/>` : '');
  } else g += `<rect x="${xm - bw / 2}" y="${T}" width="${bw}" height="${ih}" rx="6" fill="none" style="stroke:var(--hairline)" stroke-dasharray="3 3"/><text x="${xm}" y="${T + ih / 2 + 3}" text-anchor="middle" font-size="9" font-weight="700" style="fill:var(--ink-muted)">match</text>`;
  g += ''
    + `<text x="${xm}" y="${H - 16}" text-anchor="middle" font-size="10" font-weight="800" style="fill:var(--ink)">${mt ? 'MD /90' : 'MD'}</text>${X.next ? `<text x="${xm}" y="${H - 4}" text-anchor="middle" font-size="9" style="fill:var(--ink-muted)">${fmtDay(X.next.date, { weekday: 'short', day: 'numeric' })}</text>` : ''}`;
  return `<svg class="wk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="day by day until the match">${g}</svg>`;
}
function weekPanel(s) {
  const SD = TR.staff && TR.staff.days ? TR.staff.days : {};
  // a match day: the week of its last prep session (all done), the match in its MD slot (his ask, 2026-10-19)
  const isM = s.kind === 'match', X = isM ? SD[Object.keys(SD).filter((d) => d < s.date && SD[d].next && SD[d].next.date === s.date).sort().pop()] : SD[s.date];
  if (!X || (!isM && s.kind !== 'training') || !(X.profile.length || (X.plan || []).length)) return '';
  const R = isM ? s.team_ref || {} : null, mt = (k) => (R && R[k] && R[k].v != null ? [R[k].v, R[k].mean, R[k].mean - (R[k].sd || 0), R[k].mean + (R[k].sd || 0), R[k].z] : null);
  const nx = X.next, all = [...X.profile, ...(X.plan || [])], mets = WK_M.filter(([k]) => all.some((d) => d[k]));
  return `<section class="panel"><div class="panel-head"><h2 class="panel-title small">${isM ? 'The week · its objectives and the match' : 'The week · objectives until the match'}</h2>${nx ? `<span class="panel-note">→ ${escapeHtml([nx.competition, nx.opponent].filter(Boolean).join(' · '))} · ${fmtDay(nx.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>` : ''}</div>
    <div class="wk-grid">${mets.map(([k, l, u]) => `<div class="wk-cell"><div class="wk-t">${l}<span>${u}</span></div>${wkBar(X, k)}${wkChart(X, k, isM ? mt(k) : null)}</div>`).join('')}</div>
    <div class="wk-legend"><span><i class="lg-done"></i>done (colour = z vs usual)</span><span><i class="lg-left"></i>dotted = the day's usual (grey: done · blue: day left)</span><span><i class="lg-obj"></i>its objective: the usual of MD-4 → MD-1 added up, minus what is done, shared over the days left</span><span><i class="lg-line"></i>target · usual</span><span><i class="lg-over"></i>over the target</span><span><i class="lg-proj"></i>over if the days left are as usual</span><span><b class="wk-red">red number</b> = objective cut below its usual</span>${isM ? '<span>MD /90 = the match, team average per 90 min (colour = z vs its usual games, line = usual) · the bar above = the training days only</span>' : ''}</div></section>`;
}

// ------------------------------------------------------------------ Sessions
function renderSessions(opts) {
  if (opts && opts.date) TR.date = opts.date;
  if (opts && opts.player) TR.openPlayer = opts.player; // #sessions/<date>/<player> opens his sheet
  const root = document.getElementById('view-sessions');
  root.innerHTML = `
    ${pageHead('Training', 'Sessions', 'se-sub', `<div class="stepper"><button type="button" id="se-prev" aria-label="Previous session">‹</button><select class="select" id="se-pick" aria-label="Session"></select><button type="button" id="se-next" aria-label="Next session">›</button></div>`)}
    <div id="se-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  withData('sessions', (d) => { TR.sessions = d; drawSessions(); }, (err) => { root.innerHTML = loadError(err); });
  withData('objectives', (d) => { TR.obj = d; drawSessions(); }, () => {});
  withData('workload', (d) => { TR.workload = d; drawSessions(); svRefresh(); }, () => {}); // A:C ratios (sheet + attention)
  withData('staff_report', (d) => { TR.staff = d; drawSessions(); }, () => {}); // the week until the match (its objectives)
  withData('wellness_history', (d) => { TR.whist = d; drawSessions(); }, () => {}); // wellness of the session's morning (alerts)
  withData('wellness', (d) => { TR.wellness = d; svRefresh(); }, () => {}); // today's wellness ring of the player sheet
}

function sessionLabel(s) {
  const kind = s.kind === 'match' ? `Match${s.cycle.opponent ? ' · ' + s.cycle.opponent : ''}` : `${s.md || 'Training'}${s.group === 'compensatory' ? ' · compensatory' : ''}`;
  return `${fmtDay(s.date)} · ${kind}`;
}

/** Who did what: "6 compensatory · 1 partial · 12 recovery (no GPS)" — players with GPS data, then the recovery /
 * gym group without GPS (the starters the day after a match). */
const SESS_TYPE = { ProTraining: 'training', 'ProTraining+ExtraWork': 'training + extra work', 'ProTraining+Compensatory': 'training + compensatory',
  Training_TeamB: 'B-team training', Compensatory: 'compensatory', Partial: 'partial', Adapted: 'adapted', INDIVIDUAL: 'individual', Individual: 'individual',
  GYM: 'gym', Gym: 'gym', Recovery: 'recovery', Game_B: 'B-team game', 'Game B': 'B-team game' };
function sessComposition(s) {
  const lab = (t) => SESS_TYPE[t] || String(t || 'other').toLowerCase();
  const count = (list) => list.reduce((o, p) => { o[lab(p.type)] = (o[lab(p.type)] || 0) + 1; return o; }, {});
  const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return [...sorted(count(s.players)).map(([t, n]) => `${n} ${t}`),
    ...sorted(count(s.absent.filter((a) => a.cat === 'i'))).map(([t, n]) => `${n} ${t} (no GPS)`)].join(' · ');
}

function drawSessions(opts) {
  if (opts && opts.date) TR.date = opts.date;
  const d = TR.sessions;
  if (!d || document.getElementById('view-sessions').hidden) return;
  const list = d.sessions;
  if (!list.length) { document.getElementById('se-body').innerHTML = '<div class="panel"><div class="empty">No session this season yet.</div></div>'; return; }
  let idx = list.findIndex((s) => s.date === TR.date);
  if (idx < 0) { idx = 0; TR.date = list[0].date; }
  const pick = document.getElementById('se-pick');
  if (pick.options.length !== list.length) pick.innerHTML = list.map((s) => `<option value="${s.date}">${escapeHtml(sessionLabel(s))}</option>`).join('');
  pick.value = TR.date;
  pick.onchange = () => { TR.date = pick.value; drawSessions(); };
  document.getElementById('se-prev').onclick = () => { if (idx < list.length - 1) { TR.date = list[idx + 1].date; drawSessions(); } };
  document.getElementById('se-next').onclick = () => { if (idx > 0) { TR.date = list[idx - 1].date; drawSessions(); } };
  document.getElementById('se-prev').disabled = idx >= list.length - 1;
  document.getElementById('se-next').disabled = idx <= 0;
  const s = list[idx];
  document.getElementById('se-sub').textContent = `${list.length} sessions since the start of the season · ${fmtUpdated(d.generated_at)}`;

  const cyc = s.cycle;
  const cycText = cyc.pre_match ? `Match week after a ${cyc.length}-day gap · compared as normal` : cyc.type ? `${TYPE_LABEL[cyc.type]} microcycle · ${cyc.length} days` : cyc.length ? `${cyc.length}-day gap` : 'Outside a microcycle';
  const body = document.getElementById('se-body');
  body.innerHTML = `
    <section class="panel sess-head sv-bleed">
      <div class="sh-l"><span class="sh-date">${fmtDay(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span class="tag ${s.kind === 'match' ? 'strong' : s.group === 'compensatory' ? 'comp' : ''}"${s.group === 'compensatory' ? ' title="The players who did not play the match did a compensatory session; the others recovered."' : ''}>${s.kind === 'match' ? 'Match' : s.group === 'compensatory' ? 'Compensatory session' : 'Training'}</span>
        ${s.md ? `<span class="tag">${s.md}</span>` : ''}
        <span class="tag">${cycText}</span>
        ${cyc.competition ? `<span class="tag">${escapeHtml(cyc.competition)}${cyc.opponent ? ' · ' + escapeHtml(cyc.opponent) : ''}</span>` : ''}</div>
      <div class="sh-r"><span class="sh-meta">${fmtN(s.minutes)} min · ${s.n} players${s.n_core !== s.n ? ` · team averages on ${s.n_core} ${s.kind === 'match' ? 'whole-game players' : s.group === 'compensatory' ? 'compensatory players' : 'full-session players'}` : ''}${s.kind === 'match' ? '' : ` · ${escapeHtml(sessComposition(s))}`}</span>
        ${daysBetween(s.date, todayIso()) <= 30 ? `<button type="button" class="linkbtn sh-corr" data-correct="${s.date}">✎ Correct this session</button>` : ''}</div>
    </section>
    ${sePanels(s)}
    <div id="sv-attention"></div>
    ${svIndividualHtml(s)}
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">vs his usual for this day</h2>${s.mdref ? `<span class="mz-leg">${MZ_LEVELS.map(([c, l]) => `<span><i class="mz ${c}"></i>${l}</span>`).join('')}</span>` : ''}</div>
      <p class="note" id="se-mdz-note"></p>
      <div id="se-mdz"></div>
    </section>
    ${s.drills.length ? `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Drills</h2><span class="panel-note">team average per drill · "vs match" = per-minute intensity as % of the players' match intensity · tap a drill for players</span></div><div class="drills-wrap" id="se-drills"></div></section>` : ''}`;

  drawMdz(s);
  const corr = body.querySelector('[data-correct]');
  if (corr) corr.onclick = () => splOpenCorrection(corr.dataset.correct); // the Session Plan's correction table (option A)
  document.getElementById('se-mdz').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) svOpen(s, r.dataset.id); };
  svMount(s);
  if (s.drills.length) drawDrills(s);
  if (TR.openPlayer) { svOpen(s, TR.openPlayer); TR.openPlayer = null; }
}

const Z_STATUS = Z_LABEL, zStatus = zLevel; // shared colour code (ui.js)

const MDZ_METRICS = [['td', 'TD'], ['d15', '>15'], ['hit', '>20'], ['spr', '>25'], ['spr_n', 'Sprints'], ['acc_dec', 'Acc+Dec'], ['srpe', 'sRPE']];
const MDZ_UNIT = { td: 'm', d15: 'm', hit: 'm', spr: 'm', spr_n: '', acc_dec: '', srpe: 'AU' };

/** Five-level colour of a z vs his usual: dark blue ≤ −2 · light blue −2…−1 · green |z| < 1 · orange 1…2 · red ≥ 2. */
const MZ_LEVELS = [['vlow', 'well below (z ≤ −2)'], ['low', 'below'], ['ok', 'usual (|z| < 1)'], ['up', 'slightly above'], ['vup', 'well above (z ≥ 2)']];
function mzClass(z) { return z == null ? 'na' : z <= -2 ? 'vlow' : z <= -1 ? 'low' : z < 1 ? 'ok' : z < 2 ? 'up' : 'vup'; }

/** The microcycle so far, beside the day's z-scores (his mockup A, 2026-10-11): for each player what he has done since
 * the last match, one piece of the bar per MD, against his usual for those same days (black tick). Each piece has the
 * colour of its own day (that day's z vs his usual for that MD: which day was high or low — his choice, 2026-10-11);
 * the number on the right is about his total (z from the staff report `mc`). Three readings of the number: z-score · % of his usual · % of his match (the mean
 * of his 3 best games, dotted line = one match). Training days with a staff-report block only. */
const MC_KEYS = [['td', 'TD'], ['hit', '>20'], ['acc_dec', 'Acc+Dec'], ['spr_n', 'Sprints']]; // the staff report's order
const MC_MODES = [['z', 'z-score'], ['usual', '% of his usual'], ['match', '% of his match']];
const MC_COL = { vlow: '#1d5fae', low: '#7fb0ea', ok: '#34c759', up: '#ff9f0a', vup: '#e5484d', na: '#aeaeb2' };
function mcMicro(s) {
  const SD = TR.staff && TR.staff.days ? TR.staff.days : {}, se = TR.sessions, isM = s.kind === 'match';
  // a match day: the microcycle of its last prep session, the match added (his ask, 2026-10-19)
  const X = isM ? SD[Object.keys(SD).filter((d) => d < s.date && SD[d].next && SD[d].next.date === s.date).sort().pop()] : SD[s.date];
  if (!X || !X.micro || !X.micro.from || !se || !se.usual) return null;
  const days = se.sessions.filter((x) => x.date >= X.micro.from && x.date <= s.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) return null;
  const usual = se.usual, out = {};
  for (const p of s.players.filter((q) => q.mdref)) {
    const done = {}, exp = {}, parts = {}, vr = {}, zd = {};  // zd: done on the days with a usual (the z, as the build's micro_z)
    MC_KEYS.forEach(([k]) => { done[k] = 0; exp[k] = 0; parts[k] = []; vr[k] = 0; zd[k] = 0; });
    for (const x of days) {
      const q = x.players.find((r) => r.id === p.id);
      if (!q) continue;
      const comp = q.mdref && q.mdref.kind === 'comp', type = (x.cycle || {}).type, game = x.kind === 'match', sc = game && q.mdref ? svScale(q) : 1;
      const u = game ? (q.mdref ? Object.fromEntries(MC_KEYS.map(([k]) => [k, [(q.mdref.mean || {})[k], (q.mdref.sd || {})[k]]])) : null)  // his usual game, at today's minutes
        : comp ? (((usual.comp || {}).players || {})[p.id] || (usual.comp || {}).squad)
          : ((((usual.players || {})[p.id] || {})[type] || {})[x.md] || ((usual.squad || {})[type] || {})[x.md]);
      MC_KEYS.forEach(([k]) => { const v = q[k] || 0, e = u && u[k] && u[k][0] != null ? u[k][0] * sc : 0, sd = u && u[k] ? (u[k][1] || 0) * sc : 0;
        done[k] += v; exp[k] += e; if (u && u[k] && u[k][0] != null) { vr[k] += Math.max(sd, 0.15 * e, 1) ** 2; zd[k] += v; }
        parts[k].push({ md: game ? 'MD' : x.md, v, u: e, z: q.mdref && q.mdref.z ? q.mdref.z[k] : null }); });
    }
    const z = isM ? MC_KEYS.map(([k]) => (vr[k] ? Math.round((zd[k] - exp[k]) / Math.sqrt(vr[k]) * 10) / 10 : null)) : ((X.players || {})[p.id] || {}).mc || [];
    out[p.id] = { done, exp, parts, z, game: (se.top3 || {})[p.id] || null };
  }
  return { md: days.map((x) => (x.kind === 'match' ? 'MD' : x.md)), out };
}
function mcBar(k, j, c, mode) {
  const done = c.done[k], exp = c.exp[k], z = c.z[j], g = c.game && c.game[k];
  const val = k === 'td' && done >= 1000 ? (done / 1000).toFixed(1) + 'k' : fmtN(done);
  const scale = mode === 'match' && g ? Math.max(done, exp, g) * 1.12 : Math.max(done, exp, 1) * 1.15;
  let x = 0;
  const live = c.parts[k].filter((d) => d.v > 0);
  const segs = c.parts[k].map((d) => { if (!(d.v > 0)) return ''; const left = x; x += d.v;
    return `<i class="${d === live[live.length - 1] ? 'last' : ''}" style="left:${left / scale * 100}%;width:${d.v / scale * 100}%;background:${MC_COL[mzClass(d.z)]}" title="${escapeHtml(d.md || '')}: ${fmtN(d.v)} · his usual ${fmtN(d.u)}${d.z == null ? '' : ' · z ' + fmtSigned(d.z)}"></i>`; }).join('');
  const tick = exp > 0 ? `<em style="left:${exp / scale * 100}%" title="his usual for these days: ${fmtN(exp)}"></em>` : '';
  if (mode === 'match') {
    if (!g) return `<div class="mcb"><b>${val}</b><div class="mcb-bar">${segs}${tick}</div><small>no match</small></div>`;
    return `<div class="mcb"><b>${val}</b><div class="mcb-bar">${segs}<u style="left:${g / scale * 100}%" title="one match of his (average of his 3 best games): ${fmtN(g)}"></u>${tick}</div><strong>${Math.round(done / g * 100)} %</strong></div>`;
  }
  const pc = exp > 0 ? Math.round((done / exp - 1) * 100) : null;
  const tail = mode === 'z' ? `<span class="mz ${mzClass(z)}" title="${fmtN(done)} vs his usual ${fmtN(exp)}">${z == null ? '—' : fmtSigned(z)}</span>` : `<small>${pc == null ? '—' : `${pc >= 0 ? '+' : ''}${pc} %`}</small>`;
  return `<div class="mcb"><b>${val}</b><div class="mcb-bar">${segs}${tick}</div>${tail}</div>`;
}

/** z-score of each player vs his own past sessions with the same MD tag in the same microcycle type — all metrics. */
function drawMdz(s) {
  const note = document.getElementById('se-mdz-note'), mount = document.getElementById('se-mdz');
  const ref = s.mdref;
  if (!ref) {
    note.textContent = 'No reference for this day: it is outside a standard microcycle (break or pre-season), or there is no comparable history yet.';
    mount.innerHTML = '';
    return;
  }
  // each player vs his own sessions of the same type: training (this MD, same microcycle type), compensatory, or match
  const nC = s.players.filter((p) => p.mdref && p.mdref.kind === 'comp').length, nT = s.players.filter((p) => p.mdref && p.mdref.kind !== 'comp').length;
  const dd = (d) => (d ? fmtDay(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const day = ref.tag === 'MD' ? 'previous A and B games of 75 min or more, this season and the last (per 90 min; a player with less time today is compared at his minutes)' : `the last ${ref.sessions} ${ref.tag} sessions of ${(TYPE_LABEL[ref.type] || '').toLowerCase()} microcycles`;
  const compTxt = `the last ${ref.comp} <b>compensatory sessions</b>${ref.comp_since ? ` (since ${dd(ref.comp_since)})` : ''} — the players who did not play the match`;
  const dayTxt = ref.tag === 'MD' ? `${day} (${ref.sessions} games since ${dd(ref.since)})` : `${day}${ref.since ? ` (since ${dd(ref.since)})` : ''}`;
  const what = nC && nT ? `compensatory players with his ${compTxt}, the others with his ${dayTxt}` : nC ? `his ${compTxt}, not with a usual ${ref.tag || 'training'}` : `his ${dayTxt}`;
  note.innerHTML = `Each player is compared with <b>his own</b> sessions of the same type: ${what}; with fewer than 5 of his own, the squad's is used. <span class="muted">z = (today − his usual) / his usual variation · hover a cell for the values · click a column to sort · click a player for his full session.</span>`;
  const ps = s.players.filter((p) => p.mdref);
  if (!ps.length) { mount.innerHTML = emptyState('No player with a reference for this session.'); return; }
  const k0 = TR.mdzSort || 'td';
  const val = (p, k) => (p.mdref.per90 && p.min ? p[k] * 90 / p.min : p[k]);
  const cell = (p, k) => {
    const z = p.mdref.z[k], u = p.mdref.mean[k];
    return `<td class="c"><span class="mz ${mzClass(z)}" title="${fmtN(val(p, k))} vs his usual ${fmtN(u)}${MDZ_UNIT[k] ? ' ' + MDZ_UNIT[k] : ''}">${z == null ? '—' : fmtSigned(z)}</span></td>`;
  };
  const rows = ps.slice().sort((a, b) => (k0 === 'name' ? playerName(a.id).localeCompare(playerName(b.id)) : (b.mdref.z[k0] ?? -9) - (a.mdref.z[k0] ?? -9)));
  // the microcycle so far, beside the day (the panel then takes the full width)
  if (!TR.mcMode) { try { TR.mcMode = localStorage.getItem('mc_mode') || 'z'; } catch (err) { TR.mcMode = 'z'; } } // his last reading
  const mc = mcMicro(s), mode = MC_MODES.some(([m]) => m === TR.mcMode) ? TR.mcMode : 'z';
  mount.closest('section').classList.toggle('sv-bleed', !!mc);
  const grp = mc ? `<tr class="mcb-grp"><th></th><th class="c" colspan="${MDZ_METRICS.length + 1}">Today · vs his usual ${escapeHtml(ref.tag || '')}</th><th class="mcb-sep" colspan="${MC_KEYS.length}"><div class="mcb-top"><span>Microcycle so far · ${mc.md.map(escapeHtml).join(' · ')}</span>
      <span class="seg">${MC_MODES.map(([m, l]) => `<button type="button" data-mc="${m}" class="${mode === m ? 'active' : ''}">${l}</button>`).join('')}</span></div></th></tr>` : '';
  mount.innerHTML = `<div class="table-wrap"><table class="dtable compact mz-tab"><thead>${grp}<tr><th data-mz="name" class="${k0 === 'name' ? 'sorted' : ''}">Player</th>${MDZ_METRICS.map(([k, l]) => `<th class="c ${k0 === k ? 'sorted' : ''}" data-mz="${k}">${l}${k0 === k ? ' ↓' : ''}</th>`).join('')}<th class="c">Reference</th>${mc ? MC_KEYS.map(([, l], j) => `<th class="${j ? '' : 'mcb-sep'}">${l}</th>`).join('') : ''}</tr></thead><tbody>
    ${rows.map((p) => `<tr data-id="${p.id}" class="clickable"><td><span class="mz-p">${avatarHtml(p.id, playerName(p.id), 22)}<b>${escapeHtml(playerName(p.id))}</b>${p.cat === 't' || p.cat === 'm' ? '' : `<small>${escapeHtml(String(p.type).toLowerCase())}</small>`}</span></td>${MDZ_METRICS.map(([k]) => cell(p, k)).join('')}<td class="c"><small class="muted">${p.mdref.src === 'own' ? `his ${p.mdref.n}` : 'squad'}${p.mdref.kind === 'comp' ? ' comp.' : ''}</small></td>${mc ? MC_KEYS.map(([k], j) => `<td class="mcb-td${j ? '' : ' mcb-sep'}">${mc.out[p.id] ? mcBar(k, j, mc.out[p.id], mode) : ''}</td>`).join('') : ''}</tr>`).join('')}
    </tbody></table></div>${mc ? `<p class="note mcb-note"><span class="mcb-key"><i></i><i></i></span>one piece of the bar per day since the last match (${mc.md.map(escapeHtml).join(' · ')}) · <em class="mcb-tick"></em>his usual for those same days · colour of a piece = that day vs his usual for that MD · the number = his total${mode === 'match' ? ' · <u class="mcb-dot"></u>one match of his = the average of his 3 best games' : ''} · hover a piece for the day.</p>` : ''}`;
  mount.querySelectorAll('th[data-mz]').forEach((th) => th.addEventListener('click', (e) => { e.stopPropagation(); TR.mdzSort = th.dataset.mz; drawMdz(s); }));
  mount.querySelectorAll('[data-mc]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); TR.mcMode = b.dataset.mc; try { localStorage.setItem('mc_mode', TR.mcMode); } catch (err) { /* private mode */ } drawMdz(s); }));
}

function playerName(id) {
  const r = (TR.sessions && TR.sessions.roster && TR.sessions.roster[id]) || null;
  return r ? r.name : id;
}

function drawDrills(s) {
  const totalTd = s.drills.reduce((a, dr) => a + (dr.team.td || 0), 0) || 1;
  const vs = (v) => (v == null ? '<span class="muted">—</span>' : `<span class="${v > 110 ? 'chip-v orange' : 'num'}">${v}%</span>`);
  document.getElementById('se-drills').innerHTML = `
    <div class="drill-row drill-head"><span>Drill</span><span>Min</span><span>n</span><span>TD</span><span>m/min</span><span>>15</span><span>>20</span><span>>25</span><span>Acc+Dec</span><span>m/min vs match</span><span>>20 vs match</span><span>Acc+Dec vs match</span><span>Share of TD</span></div>
    ${s.drills.map((dr) => `<details class="drill"><summary class="drill-row">
      <span class="dname">${escapeHtml(dr.name)}${dr.ampm && dr.ampm !== 'PM' && dr.ampm !== 'nan' && dr.ampm !== '0' ? ` <small class="muted">${escapeHtml(dr.ampm)}</small>` : ''}</span>
      <span>${fmtN(dr.min)}</span><span>${dr.n}</span><span>${fmtN(dr.team.td)}</span><span>${fmtN(dr.team.mpm)}</span><span>${fmtN(dr.team.d15)}</span><span>${fmtN(dr.team.hit)}</span><span>${fmtN(dr.team.spr)}</span><span>${fmtN(dr.team.acc_dec)}</span>
      <span>${vs(dr.vs_match && dr.vs_match.td)}</span><span>${vs(dr.vs_match && dr.vs_match.hit)}</span><span>${vs(dr.vs_match && dr.vs_match.acc_dec)}</span>
      <span class="share"><i style="width:${Math.round((dr.team.td || 0) / totalTd * 100)}%"></i><small>${Math.round((dr.team.td || 0) / totalTd * 100)}%</small></span></summary>
      <table class="dtable compact"><thead><tr><th>Player</th><th class="c">Min</th><th class="c">TD</th><th class="c">m/min</th><th class="c">>15</th><th class="c">>20</th><th class="c">>25</th><th class="c">Sprints</th><th class="c">Acc+Dec</th><th class="c">Vmax</th></tr></thead><tbody>
      ${Object.entries(dr.players).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0)).map(([id, v]) => `<tr><td>${escapeHtml(playerName(id))}</td><td class="c">${fmtN(v[0])}</td><td class="c">${fmtN(v[1])}</td><td class="c">${v[0] ? fmtN(v[1] / v[0]) : '—'}</td><td class="c">${fmtN(v[6])}</td><td class="c">${fmtN(v[2])}</td><td class="c">${fmtN(v[3])}</td><td class="c">${fmtN(v[7])}</td><td class="c">${fmtN(v[4])}</td><td class="c">${fmtN(v[5], 1)}</td></tr>`).join('')}
      </tbody></table></details>`).join('')}`;
}

// ------------------------------------------------------------------ Objectives
function renderObjectives(opts) {
  if (opts && opts.cycle) TR.cycle = opts.cycle;
  const root = document.getElementById('view-objectives');
  root.innerHTML = `
    ${pageHead('Training', 'Session objectives', 'ob-sub', segHtml('ob-type', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']], TR.type))}
    <div id="ob-body"><div class="panel"><div class="empty">Loading…</div></div></div>`;
  bindSeg('ob-type', (v) => { TR.type = v; drawObjectives(); });
  withData('objectives', (d) => { TR.obj = d; drawObjectives(); }, (err) => { root.innerHTML = loadError(err); });
  withData('calendar', (d) => { CAL.data = d; drawObjectives(); }, () => {}); // staff edits of the next match date
}

function drawObjectives() {
  const o = TR.obj;
  if (!o || document.getElementById('view-objectives').hidden) return;
  document.getElementById('ob-sub').textContent = `${TYPE_LABEL[TR.type]} microcycle = ${o.types[TR.type]} · team averages of full-session players · the last ${o.last || 15} sessions of each day · ${fmtUpdated(o.generated_at)}`;
  const tab = o.table[TR.type] || {};
  const tags = o.tags.filter((t) => tab[t]);
  const cell = (c, k, unit) => (c && c[k] ? `<b>${fmtN(c[k].med)}</b><small>${fmtN(c[k].p25)}–${fmtN(c[k].p75)}${unit ? ' ' + unit : ''}</small>${c[k].pct != null && k !== 'minutes' ? `<em>${c[k].pct}%</em>` : ''}` : '—');
  const body = document.getElementById('ob-body');
  body.innerHTML = `
    <section class="panel" id="pl-panel"></section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Microcycle totals across the season · done vs typical</h2><span class="panel-note">click a bar to open that microcycle</span></div>
      <div id="pl-season"></div>
      <p class="panel-foot">Bar = team total of the microcycle's training days · line = what those same days usually add up to (median of each day). Green within ±15 %, blue below, orange 15–30 % above, red more than 30 % above.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Targets by day · ${TYPE_LABEL[TR.type].toLowerCase()} microcycle</h2><span class="panel-note">median · interquartile range · % of match demands</span></div>
      <div class="table-wrap"><table class="dtable objectives"><thead><tr><th>Day</th><th class="c">n</th>${OBJ_METRICS.map((k) => `<th class="c">${METRIC_SHORT[k]}${METRIC_UNIT[k] ? ` <small>${METRIC_UNIT[k]}</small>` : ''}</th>`).join('')}<th class="c">Duration <small>min</small></th><th class="c">m/min</th></tr></thead>
      <tbody>${tags.map((t) => `<tr class="${t === 'MD' ? 'md-row' : ''}"><td><span class="tag ${t === 'MD' ? 'strong' : ''}">${t}</span></td><td class="c muted">${tab[t].n}</td>${OBJ_METRICS.map((k) => `<td class="c obj">${cell(tab[t], k)}</td>`).join('')}<td class="c obj">${cell(tab[t], 'minutes')}</td><td class="c obj">${tab[t].mpm ? `<b>${fmtN(tab[t].mpm.med)}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="panel-foot">MD row = match demands per 90 min (players ≥60 min). MD+1 is usually recovery / compensatory work and has no team target.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title small">Load profile · % of match demands</h2></div>
      <div class="profile">${tags.filter((t) => t !== 'MD').map((t) => `<div class="prow"><span class="tag">${t}</span>${['td', 'hit', 'spr', 'acc_dec'].map((k) => {
        const p = tab[t][k] ? tab[t][k].pct : null;
        return `<span class="pbar" title="${METRIC_LONG[k]}"><i style="width:${Math.min(100, p || 0)}%"></i><small>${METRIC_SHORT[k]} ${p == null ? '—' : p + '%'}</small></span>`;
      }).join('')}</div>`).join('') || emptyState('Not enough sessions of this type yet.')}</div>
    </section>`;
  drawPlanner();
  drawPlanSeason();
}

// ------------------------------------------------------------------ Microcycle planner
const PLAN_METRICS = [['td', 'TD', 'm'], ['d15', '>15', 'm'], ['hit', '>20', 'm'], ['spr', '>25', 'm'], ['acc_dec', 'Acc+Dec', ''], ['srpe', 'sRPE', 'AU']];
const PLAN_LONG = { td: 'Total distance', d15: 'Distance > 15 km/h', hit: 'Distance > 20 km/h', spr: 'Distance > 25 km/h', acc_dec: 'HIT Acc + Dec', srpe: 'sRPE load' };
const PLAN_COL = Z_COL;
TR.cycle = 'next'; TR.planK = 'td'; TR.off = {};

function planRound(v) { return v == null ? null : Math.abs(v) >= 1000 ? Math.round(v / 10) * 10 : Math.round(v); }

/** Cycle days with their usual values. Past days without a team session, MD+1 (recovery) and days set as off are not planned. */
function planDays(o, cyc) {
  return cyc.days.map((d) => {
    const cell = objectiveFor(o, cyc.type, d.tag) || objectiveFor(o, 'long', d.tag) || objectiveFor(o, 'normal', d.tag); // MD-6/MD-5 only exist in long cycles
    const past = d.date <= o.as_of;
    const why = d.tag === 'MD+1' ? 'Recovery' : !cell ? 'No reference' : past && !d.actual ? 'No team session' : !past && TR.off[cyc.id + '|' + d.date] ? 'Off' : null;
    return { ...d, cell, past, off: !!why, why };
  });
}

/** Share `rem` over the days in proportion to their usual value, each kept within [lo, hi]. */
function shareOut(rem, items) {
  const out = items.map(() => null);
  let free = items.map((_, i) => i), left = rem;
  for (let pass = 0; pass <= items.length && free.length; pass++) {
    const sum = free.reduce((a, i) => a + items[i].med, 0) || 1;
    const fixed = [];
    free.forEach((i) => {
      const v = left * (items[i].med || 0) / sum;
      if (v < items[i].lo) fixed.push([i, items[i].lo]); else if (v > items[i].hi) fixed.push([i, items[i].hi]);
    });
    if (!fixed.length) { free.forEach((i) => { out[i] = left * (items[i].med || 0) / sum; }); break; }
    fixed.forEach(([i, v]) => { out[i] = v; left -= v; });
    free = free.filter((i) => out[i] == null);
  }
  return out;
}

/**
 * Adaptive plan for one metric. Target of the microcycle = sum of the usual (median) value of each planned day.
 * Objective of a day = what was still left to do the evening before, shared over that day and the following ones.
 */
function planMetric(days, k) {
  const act = days.filter((d) => !d.off && d.cell[k] && !(d.past && d.actual[k] == null)); // e.g. sRPE not entered yet
  const total = act.reduce((a, d) => a + d.cell[k].med, 0);
  let known = act.findIndex((d) => !d.past);
  if (known < 0) known = act.length;
  const byDate = {};
  act.forEach((d, i) => {
    const cut = Math.min(i, known);
    const done = act.slice(0, cut).reduce((a, x) => a + (x.actual[k] || 0), 0);
    const rest = act.slice(cut);
    const items = rest.map((x) => ({ med: x.cell[k].med, lo: x.cell[k].p10, hi: x.tag === 'MD-1' ? x.cell[k].p75 : x.cell[k].p90 }));
    const obj = planRound(shareOut(total - done, items)[i - cut]);
    const c = d.cell[k], v = d.actual ? d.actual[k] : null;
    const tol = Math.max((c.p75 - c.p25) / 2, 0.1 * obj, 1);
    const status = v == null ? null : v > obj + 2 * tol ? 'high' : v > obj + tol ? 'above' : v < obj - tol ? 'below' : 'on';
    byDate[d.date] = { obj, usual: c.med, p25: c.p25, p75: c.p75, actual: v, status };
  });
  const done = act.slice(0, known).reduce((a, x) => a + (x.actual[k] || 0), 0);
  const due = act.slice(0, known).reduce((a, x) => a + x.cell[k].med, 0);
  const planned = act.slice(known).reduce((a, x) => a + byDate[x.date].obj, 0);
  return { byDate, total, done, due, planned, left: act.length - known, known };
}

/** Past microcycles from the build + the upcoming one rebuilt here from the calendar (with staff edits applied). */
function plannerCycles(o) {
  const list = o.cycles || [];
  if (!CAL.data || !o.prev_match) return list;
  const nxt = upcomingCycle(o, CAL.data), rest = list.filter((c) => !c.upcoming);
  return nxt ? [nxt, ...rest] : rest;
}

function upcomingCycle(o, cal) {
  const today = todayIso(), when = (e) => e.confirmed_date || e.start;
  const evs = applyCalendarEdits(cal).filter((e) => e.kind === 'match' && e.gharafa === 'yes' && !e.played_date && when(e) > today);
  if (!evs.length) return null;
  const nx = evs.reduce((a, b) => (when(a) <= when(b) ? a : b)), nd = when(nx), prev = o.prev_match;
  const length = daysBetween(prev, nd), brk = length > 12;
  let typ = cycleType(length), start = addDays(prev, 1);
  if (!typ) { start = addDays(nd, -6); typ = 'normal'; } // long break: plan the last week as a normal microcycle
  const firm = !!nx.confirmed_date || nx.start === nx.end; // a confirmed date beats the tags typed in the GPS file
  const days = [];
  for (let d = start; d < nd; d = addDays(d, 1)) {
    const rec = o.recent && o.recent[d], calc = computedTag(d, brk ? null : prev, nd);
    days.push({ date: d, tag: (firm ? calc : null) || (rec && rec.md) || calc, actual: rec ? rec.actual : null, n: rec ? rec.n : 0 });
  }
  return { id: 'next', from: addDays(start, -1), to: nd, type: typ, length, upcoming: true, break: brk, days,
    label: `${nx.round || nx.competition}${nx.opponent ? ' · ' + nx.opponent : ''}`, provisional: !nx.confirmed_date && nx.start !== nx.end };
}

function drawPlanner() {
  const o = TR.obj, mount = document.getElementById('pl-panel');
  if (!mount) return;
  const cycles = plannerCycles(o);
  if (!cycles.length) { mount.innerHTML = '<p class="note">No microcycle to plan yet.</p>'; return; }
  const cyc = cycles.find((c) => c.id === TR.cycle) || cycles[0];
  TR.cycle = cyc.id;
  const days = planDays(o, cyc);
  const plans = {};
  PLAN_METRICS.forEach(([k]) => { plans[k] = planMetric(days, k); });
  const k = TR.planK, p = plans[k];
  const matchDay = cyc.to;
  const opt = (c) => `<option value="${c.id}" ${c.id === cyc.id ? 'selected' : ''}>${c.upcoming ? 'Next · ' : ''}${fmtDay(c.to, { day: 'numeric', month: 'short' })} · ${escapeHtml(c.label || 'Match')}</option>`;
  const intro = cyc.upcoming && cyc.break
    ? `${cyc.length} days since the last match — no standard microcycle. The last ${cyc.days.length} days before the match are planned as a <b>${cyc.type}</b> microcycle${cyc.provisional ? ' (match date to be confirmed)' : ''}.`
    : `<b>${TYPE_LABEL[cyc.type]} microcycle</b> · ${cyc.length} days${cyc.provisional ? ' · match date to be confirmed' : ''}.`;
  const next = days.find((d) => !d.past && !d.off);
  const lead = !next ? (cyc.upcoming ? '' : 'Microcycle completed — objectives shown as they were re-adjusted day by day.')
    : `Proposed next: <b>${next.tag}</b> on ${fmtDay(next.date, { weekday: 'long', day: 'numeric', month: 'short' })}${p.known ? `, re-adjusted from the ${p.known} session${p.known > 1 ? 's' : ''} already done` : ''}.`;

  const cellHtml = (d, key) => {
    const r = plans[key].byDate[d.date];
    if (!r) return '<td class="c muted">—</td>';
    const act = r.actual != null ? `<div><span class="zs ${r.status}">${fmtN(r.actual)}</span></div>` : '';
    return `<td class="c pl-cell ${key === k ? 'sel' : ''}"><b>${fmtN(r.obj)}</b><small>usual ${fmtN(r.usual)}</small>${act}</td>`;
  };
  const rows = days.map((d) => `<tr class="${d.off ? 'off' : ''} ${next && d.date === next.date ? 'is-next' : ''}">
      <td>${fmtDay(d.date)}</td><td><span class="tag">${d.tag || '—'}</span></td>
      ${d.off ? `<td class="c muted" colspan="${PLAN_METRICS.length}">${d.why}${!d.past && d.why === 'Off' ? ` · <button type="button" class="linkbtn" data-off="${d.date}">plan it</button>` : ''}</td>`
        : PLAN_METRICS.map(([key]) => cellHtml(d, key)).join('')}
      <td class="c">${!d.past && !d.off && d.tag !== 'MD+1' ? `<button type="button" class="linkbtn" data-off="${d.date}">set off</button>` : ''}</td></tr>`).join('');

  const bars = PLAN_METRICS.map(([key, short, unit]) => {
    const q = plans[key];
    if (!q.total) return '';
    const max = Math.max(q.total, q.done + q.planned) * 1.05;
    const pc = (v) => Math.max(0, Math.min(100, v / max * 100));
    const gap = q.known ? (q.done - q.due) / Math.max(q.due, 1) : null;
    const st = gap == null ? null : gap > 0.15 ? 'above' : gap < -0.15 ? 'below' : 'on';
    return `<div class="pl-prog ${key === k ? 'sel' : ''}" data-k="${key}">
      <div class="pl-prog-head"><span>${PLAN_LONG[key]}</span><span><b>${fmtN(q.done)}</b> / ${fmtN(planRound(q.total))} ${unit}${st ? ` <span class="zs ${st}">${gap > 0 ? '+' : ''}${Math.round(gap * 100)}% vs usual so far</span>` : ''}</span></div>
      <div class="pl-track"><i class="done" style="width:${pc(q.done)}%;background:${st ? PLAN_COL[st] : '#2a78d6'}"></i><i class="todo" style="left:${pc(q.done)}%;width:${pc(q.planned)}%"></i>${q.known ? `<span class="due" style="left:${pc(q.due)}%" title="usual by now"></span>` : ''}<span class="tot" style="left:${pc(q.total)}%"></span></div></div>`;
  }).join('');

  mount.innerHTML = `
    <div class="panel-head"><h2 class="panel-title small">Microcycle planner · team average</h2>
      <select class="select" id="pl-cycle" aria-label="Microcycle">${cycles.map(opt).join('')}</select></div>
    <p class="note">${intro} Match: ${fmtDay(matchDay, { weekday: 'long', day: 'numeric', month: 'long' })}. ${lead}</p>
    ${segHtml('pl-metric', PLAN_METRICS.map(([key, short]) => [key, short]), k)}
    <div class="pl-legend"><span><i class="lg-band"></i>usual range (25–75th)</span><span><i class="lg-obj"></i>objective</span><span><i class="lg-todo"></i>to do</span><span><i style="background:${PLAN_COL.on}"></i>on target</span><span><i style="background:${PLAN_COL.below}"></i>below</span><span><i style="background:${PLAN_COL.above}"></i>slightly above</span><span><i style="background:${PLAN_COL.high}"></i>well above</span></div>
    <div id="pl-chart"></div>
    <div class="table-wrap"><table class="dtable compact plan"><thead><tr><th>Day</th><th>Tag</th>${PLAN_METRICS.map(([key, short, unit]) => `<th class="c ${key === k ? 'sel' : ''}">${short}${unit ? ` <small>${unit}</small>` : ''}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 class="pl-sub">Microcycle total · done / target</h3>
    <div class="pl-progs">${bars}</div>
    <p class="panel-foot">Target of the microcycle = the usual (median) team value of each planned day, added up. Each day's objective = what is still left to do, shared over the remaining days in proportion to their usual load and kept within the club's usual range for that day (10th–90th percentile; MD-1 capped at the 75th to stay fresh). Every synced session re-adjusts the following days — e.g. after MD-2, the MD-1 objective absorbs what was over- or under-done. Coloured values = actual team average (green on target, blue below, orange slightly above, red well above the objective). Use “set off” for a day without team training.</p>`;

  document.getElementById('pl-cycle').addEventListener('change', (e) => { TR.cycle = e.target.value; drawPlanner(); drawPlanSeason(); });
  bindSeg('pl-metric', (v) => { TR.planK = v; drawPlanner(); drawPlanSeason(); });
  mount.querySelectorAll('.pl-prog').forEach((el) => el.addEventListener('click', () => { TR.planK = el.dataset.k; drawPlanner(); drawPlanSeason(); }));
  mount.querySelectorAll('[data-off]').forEach((b) => b.addEventListener('click', () => {
    const key = cyc.id + '|' + b.dataset.off;
    if (TR.off[key]) delete TR.off[key]; else TR.off[key] = true;
    drawPlanner();
  }));
  planChart(document.getElementById('pl-chart'), days, p, k);
}

/** One column per day: usual range (band), objective (dark line), actual (bar coloured by status) or "to do" (hollow bar). */
function planChart(mount, days, p, k) {
  const W = Math.max(280, Math.round(mount.clientWidth)), H = 240, P = { l: 44, r: 12, t: 24, b: 40 };
  const n = days.length, iw = W - P.l - P.r, ih = H - P.t - P.b, step = iw / n;
  const vals = [0];
  days.forEach((d) => { const r = p.byDate[d.date]; if (r) vals.push(r.obj, r.p75, r.actual || 0); });
  const top = Math.max(...vals) * 1.12 || 1, ticks = chNiceTicks(0, top).filter((t) => t <= top);
  const yMax = Math.max(top, ticks[ticks.length - 1]);
  const xAt = (i) => P.l + step * (i + 0.5), yAt = (v) => P.t + ih * (1 - Math.max(0, Math.min(yMax, v)) / yMax);
  const bw = Math.min(46, step * 0.5), base = yAt(0);
  let s = '';
  ticks.forEach((t) => { s += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${yAt(t)}" y2="${yAt(t)}"/><text class="ch-axis" x="${P.l - 6}" y="${yAt(t) + 3.5}" text-anchor="end">${chFmt(t)}</text>`; });
  days.forEach((d, i) => {
    const r = p.byDate[d.date], x = xAt(i);
    s += `<text class="ch-axis" x="${x}" y="${H - 22}" text-anchor="middle" style="font-weight:600">${d.tag || ''}</text><text class="ch-axis" x="${x}" y="${H - 8}" text-anchor="middle">${fmtDay(d.date, { weekday: 'short', day: 'numeric' })}</text>`;
    if (!r) { s += `<text class="ch-axis" x="${x}" y="${base - 8}" text-anchor="middle">${d.why || ''}</text>`; return; }
    const bx = x - bw / 2;
    s += `<rect x="${bx - 6}" y="${yAt(r.p75)}" width="${bw + 12}" height="${Math.max(1, yAt(r.p25) - yAt(r.p75))}" rx="4" style="fill:var(--ink-muted)" opacity=".13"/>`;
    if (r.actual != null) {
      const y = yAt(r.actual), h = Math.max(1, base - y), rr = Math.min(4, h);
      s += `<path d="M${bx},${base}V${y + rr}Q${bx},${y} ${bx + rr},${y}H${bx + bw - rr}Q${bx + bw},${y} ${bx + bw},${y + rr}V${base}Z" style="fill:${PLAN_COL[r.status]}"/>`;
    } else {
      s += `<rect x="${bx + 1}" y="${yAt(r.obj)}" width="${bw - 2}" height="${Math.max(1, base - yAt(r.obj))}" rx="4" style="fill:rgba(42,120,214,.08);stroke:#2a78d6" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      s += `<text class="ch-axis" x="${x}" y="${yAt(r.obj) - 12}" text-anchor="middle" style="font-weight:700;fill:var(--ink)">${fmtN(r.obj)}</text>`;
    }
    s += `<line x1="${bx - 8}" x2="${bx + bw + 8}" y1="${yAt(r.obj)}" y2="${yAt(r.obj)}" style="stroke:var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
  });
  mount.innerHTML = `<svg class="ch-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
  const svg = mount.querySelector('svg');
  chHover(mount, svg, P.t, H - P.b, (rx) => {
    const i = Math.floor((rx - P.l) / step);
    if (i < 0 || i >= n) return null;
    const d = days[i], r = p.byDate[d.date];
    const html = r ? `<b>${d.tag} · ${fmtDay(d.date)}</b><span>Objective ${fmtN(r.obj)} · usual ${fmtN(r.usual)} (${fmtN(r.p25)}–${fmtN(r.p75)})</span>${r.actual != null ? `<span>Done ${fmtN(r.actual)} — ${Z_STATUS[r.status].toLowerCase()}</span>` : '<span>To do</span>'}`
      : `<b>${d.tag || ''} · ${fmtDay(d.date)}</b><span>${d.why}</span>`;
    return { x: xAt(i), y: r ? yAt(Math.max(r.obj, r.p75, r.actual || 0)) : base - 20, html };
  });
}

/** Each past microcycle: team total done vs the usual total of the same days. */
function drawPlanSeason() {
  const o = TR.obj, mount = document.getElementById('pl-season');
  if (!mount) return;
  const k = TR.planK;
  const rows = (o.cycles || []).filter((c) => !c.upcoming).map((c) => {
    let done = 0, usual = 0, n = 0;
    planDays(o, c).forEach((d) => { if (!d.off && d.actual && d.cell[k]) { done += d.actual[k] || 0; usual += d.cell[k].med; n++; } });
    return { c, done, usual, n };
  }).filter((r) => r.n).reverse();
  if (!rows.length) { mount.innerHTML = emptyState('No completed microcycle this season yet.'); return; }
  const stOf = (r) => { const g = (r.done - r.usual) / Math.max(r.usual, 1); return g > 0.3 ? 'high' : g > 0.15 ? 'above' : g < -0.15 ? 'below' : 'on'; };
  chXY(mount, {
    x: rows.map((r) => r.c.to), height: 200,
    bars: { values: rows.map((r) => r.done), color: (v, i) => (rows[i].c.id === TR.cycle ? '#1d1d1f' : PLAN_COL[stOf(rows[i])]) },
    markers: [{ values: rows.map((r) => r.usual), color: 'var(--ink)' }],
    tick: (x) => fmtDay(x, { day: 'numeric', month: 'short' }),
    tip: (i) => { const r = rows[i]; return `<b>${fmtN(r.done)} / ${fmtN(planRound(r.usual))}</b><span>${escapeHtml(r.c.label || '')} · ${fmtDay(r.c.to, { day: 'numeric', month: 'short' })}</span><span>${TYPE_LABEL[r.c.type]} · ${r.n} training day${r.n > 1 ? 's' : ''} · ${PLAN_LONG[k]}</span>`; },
    onClick: (i) => { TR.cycle = rows[i].c.id; drawPlanner(); drawPlanSeason(); document.getElementById('pl-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  });
}
