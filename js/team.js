/**
 * Workload › Team — the team's load by day, week and month (his Power BI "Team weekload" pages, his mockup of
 * 2026-10-11). Bars = the team's load (workload payload `team`: his Team rule — ProTraining, whole-game players, 0 on
 * days off); under each chart, on the same dates, the A:C 7:28 in its zones. The bars' colour is his choice:
 *   z-score — a day vs the usual same MD (sessions payload `team_ref`), a week vs the other full weeks of the season,
 *             a month's average week vs the season's weeks;
 *   A:C     — the ratio that day, at the end of the week, on average over the month.
 * Plus the team's wellness (wellness_history payload), with the number of check-ins under it. A match day has a "G".
 * The page takes the whole width (his choice, 2026-10-12): two charts per row, each drawn at the real width of its card
 * (TM.cw) so the type keeps its size; TM.fit = the number of bars that still take a value and a date each.
 */
const TM = { view: 'week', color: 'z', from: null, to: null };
// the sprints are judged on their distance (> 25 km/h), not their number (his choice, 2026-10-12); the number stays in the week table
const TM_KEYS = [['td', 'Total distance', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr', 'Sprint distance', 'm'], ['acc_dec', 'High Acc + Dec', ''], ['srpe', 'sRPE', 'AU']];
const TM_ZCOL = { vlow: '#1d5fae', low: '#7fb0ea', ok: '#34c759', up: '#ff9f0a', vup: '#e5484d', na: '#aeaeb2' };
const tmZone = (r) => (r == null ? ['#aeaeb2', 'no ratio yet'] : r < 0.5 ? ['#1d5fae', 'under 0.5'] : r < 0.78 ? ['#7fb0ea', 'under 0.78'] : r <= 1.37 ? ['#34c759', 'in the zone 0.78–1.37'] : r <= 1.5 ? ['#ff9f0a', 'above 1.37'] : ['#e5484d', 'above 1.5']);
const tmZ = (z) => (z == null || Number.isNaN(z) ? 'na' : z <= -2 ? 'vlow' : z <= -1 ? 'low' : z < 1 ? 'ok' : z < 2 ? 'up' : 'vup');
const tmK = (v) => (v == null ? '—' : v >= 10000 ? (v / 1000).toFixed(1) + 'k' : fmtN(Math.round(v)));
const tmS = (z) => fmtSigned(Math.round(z * 10) / 10 || 0); // −0.04 reads 0.0, not −0.0
const tmWell = (v) => (v == null ? '#aeaeb2' : v >= 70 ? '#34c759' : v >= 50 ? '#ff9f0a' : '#e5484d');
function tmStats(xs) {
  if (!xs.length) return { mean: null, sd: null, p25: null, p75: null };
  const v = xs.slice().sort((a, b) => a - b), q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))], m = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)), p25: q(0.25), p75: q(0.75) };
}
const tmZof = (v, st) => (st.sd ? (v - st.mean) / st.sd : null);

function renderTeam() {
  const root = document.getElementById('view-team');
  root.innerHTML = `
    ${pageHead('Workload', 'Team', 'tm-sub')}
    <div class="tm-tiles" id="tm-tiles"></div>
    <div class="tm-bar">
      <div class="tm-dates"><label>From <input type="date" id="tm-from"></label><label>to <input type="date" id="tm-to"></label><button type="button" class="linkbtn" id="tm-reset" hidden>Reset</button></div>
      <div class="tm-ctl"><span class="tm-lab">Colour</span>${segHtml('tm-color', [['z', 'z-score'], ['ac', 'A:C']], TM.color)}${segHtml('tm-view', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], TM.view)}</div>
    </div>
    <div class="tm-legend" id="tm-legend"></div>
    <div class="tm-grid" id="tm-charts"><div class="panel"><div class="empty">Loading…</div></div></div>
    <div id="tm-table"></div>`;
  bindSeg('tm-color', (v) => { TM.color = v; drawTeam(); });
  bindSeg('tm-view', (v) => { TM.view = v; drawTeam(); });
  const pick = (id, f) => { document.getElementById(id).onchange = (e) => { if (e.target.value) { tmRange(); TM[f] = e.target.value; if (TM.from > TM.to) TM[f === 'from' ? 'to' : 'from'] = e.target.value; TM.custom = true; drawTeam(); } }; };
  pick('tm-from', 'from'); pick('tm-to', 'to');
  if (!TM.bound) { TM.bound = true; let timer; window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(drawTeam, 150); }); }
  document.getElementById('tm-reset').onclick = () => { TM.custom = false; TM.from = TM.to = null; drawTeam(); };
  withData('workload', (d) => { WL.data = d; drawTeam(); }, (err) => { root.innerHTML = loadError(err); });
  withData('sessions', (d) => { TR.sessions = d; drawTeam(); }, () => {}); // each day's MD and its usual (z-score)
  withData('wellness_history', (d) => { TM.well = d; drawTeam(); }, () => {});
  withData('intensity', (d) => { TM.int = d; drawTeam(); }, () => {}); // the week-by-week table's WCS and RHIE
}

/** The dates shown: his choice, else the last 5 weeks (Day), the weeks that fit — 12 or more (Week), the season (Month). */
function tmRange() {
  const t = WL.data.team, asOf = WL.data.as_of;
  if (!TM.custom) { TM.to = asOf; TM.from = TM.view === 'day' ? addDays(asOf, -34) : TM.view === 'week' ? addDays(asOf, -7 * Math.max(12, TM.fit || 12) + 1) : t.start; }
  if (TM.from < t.start) TM.from = t.start;
  if (TM.to > asOf) TM.to = asOf;
  return [TM.from, TM.to];
}

function tmBuild() {
  const d = WL.data, t = d.team, days = t.daily.td.map((_, i) => addDays(t.start, i)), idx = Object.fromEntries(days.map((x, i) => [x, i]));
  const keys = TM_KEYS.filter(([k]) => t.daily[k]);
  const sess = Object.fromEntries(((TR.sessions && TR.sessions.sessions) || []).map((x) => [x.date, x]));
  const well = Object.fromEntries(((TM.well && TM.well.days) || []).filter((x) => x.teamScore != null).map((x) => [x.date, { v: x.teamScore, n: Object.keys(x.byId || {}).length }]));
  const week1 = t.week1 || (t.weeks.length ? t.weeks[0].start : t.start); // W01 = the season's first full week (Sunday)
  const weeks = t.weeks.map((w) => ({ ...w, end: addDays(w.start, 6), done: addDays(w.start, 6) <= d.as_of,
    label: 'W' + String(Math.round(daysBetween(week1, w.start) / 7) + 1).padStart(2, '0') }));
  const real = (k) => weeks.filter((w) => w.done && w[k] > 0);
  const acAt = (k, date) => t.acwr[k][Math.min(idx[date] ?? days.length - 1, days.length - 1)];
  const wellOf = (from, to) => { const xs = Object.entries(well).filter(([x]) => x >= from && x <= to).map(([, o]) => o); return xs.length ? { v: xs.reduce((a, o) => a + o.v, 0) / xs.length, n: xs.reduce((a, o) => a + o.n, 0) / xs.length, days: xs.length } : null; };
  return { d, t, days, idx, keys, sess, well, weeks, real, acAt, wellOf };
}
/** One chart: bars, and under them on the same x a strip — the A:C line in its zones, or small bars (check-ins). */
function tmChart(o) {
  const ns = o.strip === 'none', W = o.W || TM.cw || 548, cap = W > 700 ? 40 : 34, padL = 44, padR = 12, H1 = W > 700 ? 180 : 168, top = 20, gap = ns ? 12 : 30, H2 = ns ? 0 : 60, n = o.items.length || 1, bw = (W - padL - padR) / n;
  const max = o.max || Math.max(...o.items.map((x) => Math.max(x.v || 0, x.hi || 0)), o.band ? o.band[1] : 0) * 1.14 || 1;
  const Y = (v) => top + H1 - (v / max) * H1, X = (i) => padL + i * bw + bw / 2, y2 = top + H1 + gap, R = (r) => y2 + H2 - (Math.min(r, 2) / 2) * H2;
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((f) => f >= raw);
  let s = `<svg viewBox="0 0 ${W} ${y2 + H2 + 28}" class="tm-svg" role="img" aria-label="${escapeHtml(o.title || '')}">`;
  for (let g = 0; g <= max + 1e-9; g += st) s += `<line x1="${padL}" x2="${W - padR}" y1="${Y(g)}" y2="${Y(g)}" class="tm-gl"/><text x="${padL - 6}" y="${Y(g) + 3.5}" class="tm-ax" text-anchor="end">${tmK(g)}</text>`;
  if (o.band) s += `<rect x="${padL}" y="${Y(o.band[1])}" width="${W - padL - padR}" height="${Y(o.band[0]) - Y(o.band[1])}" class="tm-band"/>`;
  o.items.forEach((x, i) => {
    const w = Math.max(3, Math.min(cap, bw * 0.68)), cx = X(i);
    if (x.sep) s += `<line x1="${cx - bw / 2}" x2="${cx - bw / 2}" y1="${top}" y2="${y2 + H2}" class="tm-sep"/>`;
    if (x.hi != null) s += `<rect x="${cx - w / 2 - 2}" y="${Y(x.hi)}" width="${w + 4}" height="${Math.max(1.5, Y(x.lo) - Y(x.hi))}" class="tm-usual"/>`;
    if (x.v > 0) s += `<rect x="${cx - w / 2}" y="${Y(x.v)}" width="${w}" height="${top + H1 - Y(x.v)}" rx="${Math.min(4, w / 3)}" fill="${x.col}"${x.soft ? ' opacity=".55"' : ''}><title>${escapeHtml(x.tip || '')}</title></rect>`;
    if (x.label) s += `<text x="${cx}" y="${Y(Math.max(x.v || 0, x.hi || 0)) - 5}" class="tm-val" text-anchor="middle">${x.label}</text>`;
    if (x.game) s += `<text x="${cx}" y="${top + H1 + 11}" class="tm-game" text-anchor="middle">G</text>`;
    if (x.tick) s += `<text x="${cx}" y="${y2 + H2 + 14}" class="tm-ax${x.now ? ' now' : ''}" text-anchor="middle">${x.tick}</text>`;
    if (x.go) s += `<rect x="${cx - bw / 2}" y="${top - 14}" width="${bw}" height="${H1 + 14}" class="tm-hit" data-wk="${x.go}"><title>${escapeHtml((x.tip ? x.tip + ' — ' : '') + 'click for the detail of the week')}</title></rect>`;
  });
  s += `<line x1="${padL}" x2="${W - padR}" y1="${top + H1}" y2="${top + H1}" class="tm-base"/>`;
  if (ns) return s + '</svg>'; // no strip under the bars (Workload › Player, his choice 2026-10-19)
  if (o.strip === 'count') { // the check-ins of each day (wellness)
    const mx = Math.max(1, ...o.items.map((x) => x.n || 0));
    s += `<text x="${padL}" y="${y2 - 8}" class="tm-cap">CHECK-INS</text><line x1="${padL}" x2="${W - padR}" y1="${y2 + H2}" y2="${y2 + H2}" class="tm-gl"/>`;
    o.items.forEach((x, i) => { if (x.n > 0) { const w = Math.max(3, Math.min(cap, bw * 0.68)), h = (x.n / mx) * (H2 - 14); s += `<rect x="${X(i) - w / 2}" y="${y2 + H2 - h}" width="${w}" height="${h}" rx="2" class="tm-cnt"><title>${Math.round(x.n)} check-ins</title></rect>`;
      if (o.dots) s += `<text x="${X(i)}" y="${y2 + H2 - h - 4}" class="tm-pt" text-anchor="middle">${Math.round(x.n)}</text>`; } });
    return s + '</svg>';
  }
  // the A:C strip: the zone 0.78–1.37, the 1.5 line, the ratio at each date
  s += `<text x="${padL}" y="${y2 - 8}" class="tm-cap">A:C 7:28</text><rect x="${padL}" y="${R(1.37)}" width="${W - padL - padR}" height="${R(0.78) - R(1.37)}" class="tm-band"/>
    <line x1="${padL}" x2="${W - padR}" y1="${R(1.5)}" y2="${R(1.5)}" class="tm-red"/><text x="${padL + 3}" y="${R(1.5) - 3}" class="tm-ax red">1.5</text>`;
  [0.78, 1.37].forEach((r) => { s += `<text x="${padL - 6}" y="${R(r) + 3.5}" class="tm-ax" text-anchor="end">${r}</text>`; });
  const pts = o.items.map((x, i) => (x.ac == null ? null : [X(i), R(x.ac), x.ac]));
  let run = [];
  const flush = () => { if (run.length > 1) s += `<polyline points="${run.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" class="tm-line"/>`; run = []; };
  pts.forEach((p) => { if (p) run.push(p); else flush(); });
  flush();
  const lastPt = pts.reduce((a, p, i) => (p ? i : a), -1);
  pts.forEach((p, i) => { if (!p || !(o.dots || i === lastPt)) return;
    s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="${tmZone(p[2])[0]}" class="tm-dot"/><text x="${p[0]}" y="${p[1] - 7}" class="tm-pt" text-anchor="${!o.dots ? 'end' : 'middle'}">${p[2].toFixed(2)}</text>`; });
  return s + '</svg>';
}

function tmTiles(B) {
  const asOf = B.d.as_of, last = B.real('td').slice(-1)[0];
  const load = B.keys.map(([k, l, u]) => {
    const now = B.t.acwr_now[k], prev = B.acAt(k, addDays(asOf, -7)), [col, txt] = tmZone(now);
    const st = last ? tmStats(B.real(k).filter((w) => w.start !== last.start).map((w) => w[k])) : tmStats([]), z = last ? tmZof(last[k], st) : null;
    // big: the last full week's z-score · small: the A:C (his choice, 2026-10-19)
    return `<div class="tm-tile"><span class="k">${l}</span><div class="ac"><b style="color:${TM_ZCOL[tmZ(z)]}">${z == null ? '—' : tmS(z)}</b><span>z · ${last ? last.label : ''}</span></div>
      <span class="tm-zone"><i style="background:${col}"></i><span title="${txt}">A:C <b>${now == null ? '—' : now.toFixed(2)}</b></span>${now > 1.5 && prev > 1.5 ? ' <span class="tm-2w">2W</span>' : ''}</span>
      <div class="ln"><span>A:C a week ago</span><b>${prev == null ? '—' : prev.toFixed(2)}</b></div>
      ${last ? `<div class="ln"><span>${last.label}</span><b>${tmK(last[k])}${u ? ' ' + u : ''}</b></div><div class="ln"><span>Usual week</span><b>${tmK(st.p25)}–${tmK(st.p75)}</b></div>` : ''}</div>`;
  }).join('');
  const dates = Object.keys(B.well).sort(), lastW = dates[dates.length - 1], w7 = B.wellOf(addDays(asOf, -6), asOf), w28 = B.wellOf(addDays(asOf, -34), addDays(asOf, -7));
  const wt = lastW ? `<div class="tm-tile"><span class="k">Wellness</span><div class="ac"><b style="color:${tmWell(B.well[lastW].v)}">${Math.round(B.well[lastW].v)}<small> %</small></b><span>${fmtDay(lastW, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
      <span class="tm-zone"><i style="background:${tmWell(B.well[lastW].v)}"></i>${B.well[lastW].n} check-ins</span>
      <div class="ln"><span>Last 7 days</span><b>${w7 ? Math.round(w7.v) + ' %' : '—'}</b></div><div class="ln"><span>The 4 weeks before</span><b>${w28 ? Math.round(w28.v) + ' %' : '—'}</b></div><div class="ln"><span>Target</span><b>70 % or more</b></div></div>` : '';
  return load + wt;
}

function drawTeam() {
  const root = document.getElementById('view-team');
  if (!WL.data || !WL.data.team || !root || root.hidden || !document.getElementById('tm-charts')) return;
  // the charts are drawn at the width of their card: two per row, one on a phone
  // (a window without a size yet — a tab opened in the background — keeps the standard chart; the resize redraws it)
  const two = window.matchMedia('(min-width: 761px)').matches, gridW = document.getElementById('tm-charts').clientWidth;
  TM.cw = gridW ? Math.max(480, Math.round((gridW - (two ? 16 : 0)) / (two ? 2 : 1) - 36)) : 548;
  TM.fit = Math.max(8, Math.floor((TM.cw - 56) / 30));
  const B = tmBuild(), [from, to] = tmRange(), z = TM.color === 'z', view = TM.view, asOf = B.d.as_of, fit = TM.fit;
  document.getElementById('tm-sub').textContent = `Your Team rule (ProTraining, whole-game players, 0 on days off) · data up to ${fmtDay(asOf, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtUpdated(B.d.generated_at)}`;
  const fi = document.getElementById('tm-from'), ti = document.getElementById('tm-to');
  fi.min = ti.min = B.t.start; fi.max = ti.max = asOf; fi.value = from; ti.value = to;
  document.getElementById('tm-reset').hidden = !TM.custom;
  document.getElementById('tm-tiles').innerHTML = tmTiles(B);
  const head = (l, note) => `<h2>${l}<small>${note}</small></h2>`;
  let cards = '', table = '';

  if (view === 'day') {
    const ds = B.days.filter((x) => x >= from && x <= to), few = ds.length <= fit;
    const tick = (x, i) => { const dow = dateOf(x).getUTCDay(); return few ? fmtDay(x, { weekday: 'short', day: 'numeric' }) : dow === 0 || (i === 0 && ds.length < 8) ? fmtDay(x, { day: 'numeric', month: 'short' }) : ''; };
    cards = B.keys.map(([k, l, u]) => `<div class="tm-card">${head(l, `per day${u ? ' · ' + u : ''} · grey box = usual for that MD`)}${tmChart({ title: l, dots: few,
      items: ds.map((x, i) => { const j = B.idx[x], v = B.t.daily[k][j], s = B.sess[x], ok = s && s.group !== 'compensatory' && !(s.kind === 'training' && s.md === 'MD'), r = ok && s.team_ref ? s.team_ref[k] : null, zz = r && v > 0 ? r.z : null, ac = B.t.acwr[k][j];
        return { v, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], lo: r && v > 0 ? r.p25 : null, hi: r && v > 0 ? r.p75 : null, ac, game: !!(s && s.kind === 'match'), sep: dateOf(x).getUTCDay() === 0 && !few, tick: tick(x, i), label: few && v > 0 ? tmK(v) : '',
          tip: `${fmtDay(x)}${s && s.md ? ' · ' + s.md : ''}: ${fmtN(v)}${r ? ` · usual ${fmtN(r.p25)}–${fmtN(r.p75)}${zz == null ? '' : ' · z ' + tmS(zz)}` : ''}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}` }; }) })}</div>`).join('');
    const wd = ds.map((x) => ({ x, o: B.well[x] }));
    const hist = (x) => tmStats(Object.entries(B.well).filter(([y]) => y < x && y >= addDays(x, -28)).map(([, o]) => o.v));
    cards += `<div class="tm-card">${head('Wellness', 'team score per day · % · green band = 70 % or more')}${tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'count', dots: few,
      items: wd.map(({ x, o }, i) => { const st = o ? hist(x) : null, zz = o && st.sd ? tmZof(o.v, st) : null, s = B.sess[x];
        return { v: o ? o.v : 0, n: o ? o.n : 0, col: !o ? '#aeaeb2' : z ? TM_ZCOL[tmZ(zz)] : tmWell(o.v), game: !!(s && s.kind === 'match'), sep: dateOf(x).getUTCDay() === 0 && !few, tick: tick(x, i), label: few && o ? Math.round(o.v) : '',
          tip: o ? `${fmtDay(x)}: ${Math.round(o.v)} % · ${o.n} check-ins${zz == null ? '' : ' · z ' + tmS(zz) + ' vs the 4 weeks before'}` : '' }; }) })}</div>`;
  } else if (view === 'week') {
    const ws = B.weeks.filter((w) => w.end >= from && w.start <= to);
    cards = B.keys.map(([k, l, u]) => { const st = tmStats(B.real(k).map((w) => w[k]));
      return `<div class="tm-card">${head(l, `per week${u ? ' · ' + u : ''}${st.p25 == null ? '' : ` · usual ${tmK(st.p25)}–${tmK(st.p75)}`}`)}${tmChart({ title: l, dots: ws.length <= fit, band: st.p25 == null ? null : [st.p25, st.p75],
        items: ws.map((w) => { const ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : asOf) : null, zz = tmZof(w[k], tmStats(B.real(k).filter((x) => x.start !== w.start).map((x) => x[k])));
          return { v: w[k], go: w.start, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], ac, label: w[k] > 0 ? tmK(w[k]) : ws.length <= fit ? 'no GPS' : '', tick: ws.length <= fit || w === ws[ws.length - 1] ? w.label : '', now: !w.done, soft: !w.done,
            tip: `${w.label} · ${fmtDay(w.start, { day: 'numeric', month: 'short' })}: ${fmtN(w[k])}${zz == null ? '' : ' · z ' + tmS(zz)}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}` }; }) })}</div>`; }).join('');
    const wst = tmStats(B.weeks.filter((w) => w.done).map((w) => B.wellOf(w.start, w.end)).filter(Boolean).map((o) => o.v));
    cards += `<div class="tm-card">${head('Wellness', 'average team score of the week · % · green band = 70 % or more')}${tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'count', dots: ws.length <= fit,
      items: ws.map((w) => { const o = B.wellOf(w.start, w.end), zz = o ? tmZof(o.v, wst) : null; return { v: o ? o.v : 0, n: o ? o.n : 0, go: w.start, col: !o ? '#aeaeb2' : z ? TM_ZCOL[tmZ(zz)] : tmWell(o.v), label: o ? Math.round(o.v) : '', tick: ws.length <= fit || w === ws[ws.length - 1] ? w.label : '', now: !w.done, soft: !w.done,
        tip: o ? `${w.label}: ${Math.round(o.v)} % on ${o.days} mornings · ${Math.round(o.n)} check-ins a day` : '' }; }) })}</div>`;
    // the table (his columns, 2026-10-12): the make-up of the week, then each load with its z and A:C — the sprints are
    // judged on their distance (> 25 km/h), their number beside it
    const TK = [['td', 'Distance'], ['hit', '&gt; 20 km/h'], ['spr', 'Sprint distance'], ['acc_dec', 'Acc + Dec'], ['srpe', 'sRPE']].filter(([k]) => B.t.daily[k]), has = (k) => TK.some(([x]) => x === k);
    const mk = (w) => { const ss = Array.from({ length: 7 }, (_, i) => addDays(w.start, i)).filter((x) => x <= asOf).map((x) => B.sess[x]).filter(Boolean);
      return { train: ss.filter((x) => x.kind !== 'match').length, games: ss.filter((x) => x.kind === 'match').length, min: ss.filter((x) => x.group !== 'compensatory').reduce((a, x) => a + (x.minutes || 0), 0) }; };
    const main = (w, k) => { if (!has(k)) return ''; const zz = w[k] > 0 ? tmZof(w[k], tmStats(B.real(k).filter((x) => x.start !== w.start).map((x) => x[k]))) : null, ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : asOf) : null;
      return `<td class="b">${w[k] > 0 ? tmK(w[k]) : '—'}</td><td>${zz == null ? '' : `<span class="mz ${tmZ(zz)}">${tmS(zz)}</span>`}</td><td class="g">${ac == null ? '' : `<span class="tm-acchip" style="background:${tmZone(ac)[0]}">${ac.toFixed(2)}</span>`}</td>`; };
    const IW = {}, ID = TM.int;
    if (ID && ID.weeks) {
      const m90 = (ID.rhie.m10 || 0) * 9, avg = (P) => (P.length ? P.reduce((a, x) => a + (x.n || 0), 0) / P.length : null);
      ID.weeks.forEach((x) => { const parts = [...Object.values(x.train).map((t) => avg(Object.values(t.rhie.players || {}))), ...(x.matches || []).map((m) => avg(Object.values(ID.rhie.matches[m] || {})))].filter((v) => v != null);
        const rh = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
        IW[x.ws] = { td: x.gap.td[0], hi: x.gap.hi[0], n90: x.n90.td, nb: x.nbest, rh, rx: rh != null && m90 ? rh / m90 : null }; });
    }
    const hasI = Object.keys(IW).length > 0, pcol = (v) => (v == null ? '' : v >= 100 ? '#1f7a3d' : v >= 90 ? '#34a853' : v >= 80 ? '#8ccf9f' : v >= 60 ? '#e8a33d' : '#d9534f');
    const iCells = (w) => { if (!hasI) return ''; const x = IW[w.start];
      if (!x) return '<td class="b muted">—</td><td></td><td class="b muted">—</td>';
      const pc = (v) => (v == null ? '—' : `<span class="tm-acchip" style="background:${pcol(v)}">${Math.round(v)} %</span>`);
      return `<td class="b" title="${x.nb ? `${x.n90} of ${x.nb} players at 90 % or more` : ''}">${pc(x.td)}</td><td>${pc(x.hi)}</td><td class="b">${x.rh == null ? '—' : `<b>${x.rh.toFixed(1)}</b>`}${x.rx == null ? '' : ` <small class="muted">× ${x.rx.toFixed(1)}</small>`}</td>`; };
    const rows = ws.slice().reverse().map((w) => { const e = mk(w), o = B.wellOf(w.start, w.end);
      return `<tr class="tm-go${w.done ? '' : ' now'}" data-wk="${w.start}" tabindex="0" title="Open the detail of ${w.label}"><td><b>${w.label}</b> <span class="muted">${fmtDay(w.start, { day: 'numeric', month: 'short' })}${w.done ? '' : ' · in progress'}</span></td>
        <td class="b">${e.train || '—'}</td><td>${e.games || '—'}</td><td>${e.min ? fmtN(e.min) : '—'}</td>${main(w, 'td')}${main(w, 'hit')}${main(w, 'spr')}<td>${w.spr_n > 0 ? fmtN(w.spr_n) : '—'}</td>${main(w, 'acc_dec')}${iCells(w)}${main(w, 'srpe')}
        <td class="b">${o ? `<b style="color:${tmWell(o.v)}">${Math.round(o.v)} %</b>` : '—'}</td><td>${o ? Math.round(o.n) : '—'}</td></tr>`; }).join('');
    const full = B.weeks.filter((w) => w.done && w.td > 0), rng = (xs, f) => { const st = tmStats(xs); return st.p25 == null ? '—' : `${(f || tmK)(st.p25)}–${(f || tmK)(st.p75)}`; };
    const uM = (k) => (has(k) ? `<td class="b u3" colspan="3">${rng(full.map((w) => w[k]))}</td>` : ''), uE = (f) => rng(full.map((w) => mk(w)[f]), (v) => fmtN(v)), wf = full.map((w) => B.wellOf(w.start, w.end)).filter(Boolean);
    const usual = full.length < 3 ? '' : `<tr class="usu"><td><b>Usual week</b><small class="muted" style="display:block">middle half of the ${full.length} full weeks</small></td><td class="b">${uE('train')}</td><td>${uE('games')}</td><td>${uE('min')}</td>${uM('td')}${uM('hit')}${uM('spr')}<td>${rng(full.map((w) => w.spr_n || 0), (v) => fmtN(v))}</td>${uM('acc_dec')}${hasI ? (() => { const xs = full.map((w) => IW[w.start]).filter(Boolean);
          return xs.length < 3 ? '<td class="b" colspan="3">—</td>' : `<td class="b">${rng(xs.map((x) => x.td), (v) => Math.round(v))} %</td><td>${rng(xs.map((x) => x.hi), (v) => Math.round(v))} %</td><td class="b">${rng(xs.map((x) => x.rh), (v) => v.toFixed(1))}</td>`; })() : ''}${uM('srpe')}
        <td class="b">${wf.length ? rng(wf.map((o) => o.v), (v) => Math.round(v)) + ' %' : '—'}</td><td>${wf.length ? rng(wf.map((o) => o.n), (v) => Math.round(v)) : '—'}</td></tr>`;
    const m3 = (k, l) => (has(k) ? `<th class="b">${l}</th><th>z</th><th class="g">A:C</th>` : ''), n3 = (...ks) => 3 * ks.filter(has).length;
    table = `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Week by week</h2><span class="panel-note">z vs the other full weeks of the season · A:C 7:28 at the end of the week · sprints: z and A:C on their distance (&gt; 25 km/h) · WCS: the squad's best minute of the week in training, % of the match worst case · RHIE: a player's bouts in the week (training + matches), and how many matches it makes · click a week for its detail day by day</span></div>
      <div class="table-wrap"><table class="tm-tbl tm-wide"><thead>
        <tr class="grp"><th></th><th colspan="${3 + n3('td')}">Volume</th><th colspan="${1 + n3('hit', 'spr')}">Speed</th><th colspan="${n3('acc_dec')}">Accelerations</th>${hasI ? '<th colspan="2" title="each player\'s best 1 min of the week in training, as a % of his WCS (worst case of the matches) — the squad\'s mean">WCS · best minute</th><th title="repeated high-intensity efforts: a player\'s bouts in the week, training + matches · × = how many matches it makes">RHIE</th>' : ''}<th colspan="${2 + n3('srpe')}">Internal load &amp; wellness</th></tr>
        <tr><th>Week</th><th class="b">Sessions</th><th>Matches</th><th>Minutes</th>${m3('td', 'Distance')}${m3('hit', '&gt; 20 km/h')}${m3('spr', 'Sprint dist.')}<th>Sprints</th>${m3('acc_dec', 'Acc + Dec')}${hasI ? '<th class="b">m/min</th><th>A/D + spr</th><th class="b">Per player</th>' : ''}${m3('srpe', 'sRPE')}<th class="b">Wellness</th><th>Check-ins</th></tr></thead>
        <tbody>${rows}${usual}</tbody></table></div></section>`;
  } else {
    const months = [...new Set(B.days.filter((x) => x >= from && x <= to).map((x) => x.slice(0, 7)))], cur = asOf.slice(0, 7);
    const lab = (m) => fmtDay(m + '-15', { month: 'short' }) + (m === cur ? ' · so far' : '');
    const info = (m, k) => { const ds = B.days.filter((x) => x.startsWith(m) && x <= asOf), tot = ds.reduce((a, x) => a + (B.t.daily[k][B.idx[x]] || 0), 0), acs = ds.map((x) => B.t.acwr[k][B.idx[x]]).filter((x) => x != null);
      const share = (f) => (acs.length ? Math.round((100 * acs.filter(f).length) / acs.length) : null);
      return { n: ds.length, tot, perWeek: ds.length ? (tot / ds.length) * 7 : 0, ac: acs.length ? acs.reduce((a, b) => a + b, 0) / acs.length : null, low: share((r) => r < 0.78), ok: share((r) => r >= 0.78 && r <= 1.37), hi: share((r) => r > 1.37 && r <= 1.5), red: share((r) => r > 1.5),
        sess: ds.filter((x) => B.sess[x] && B.sess[x].kind !== 'match').length, games: ds.filter((x) => B.sess[x] && B.sess[x].kind === 'match').length }; };
    cards = B.keys.map(([k, l, u]) => { const st = tmStats(B.real(k).map((w) => w[k]));
      return `<div class="tm-card">${head(l, `average week of the month${u ? ' · ' + u : ''}`)}${tmChart({ title: l, dots: true, band: st.p25 == null ? null : [st.p25, st.p75],
        items: months.map((m) => { const x = info(m, k), zz = tmZof(x.perWeek, st); return { v: x.perWeek, col: z ? TM_ZCOL[tmZ(zz)] : tmZone(x.ac)[0], ac: x.ac, label: tmK(x.perWeek), tick: lab(m), now: m === cur, soft: m === cur,
          tip: `${lab(m)}: ${fmtN(x.tot)} in ${x.n} days${zz == null ? '' : ' · z ' + tmS(zz) + ' vs the season\'s weeks'}${x.ac == null ? '' : ' · average A:C ' + x.ac.toFixed(2)}` }; }) })}</div>`; }).join('');
    const wm = (m) => B.wellOf(m + '-01', m + '-31'), wst = tmStats(B.weeks.filter((w) => w.done).map((w) => B.wellOf(w.start, w.end)).filter(Boolean).map((o) => o.v));
    cards += `<div class="tm-card">${head('Wellness', 'average team score of the month · % · green band = 70 % or more')}${tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'count', dots: true,
      items: months.map((m) => { const o = wm(m), zz = o ? tmZof(o.v, wst) : null; return { v: o ? o.v : 0, n: o ? o.n : 0, col: !o ? '#aeaeb2' : z ? TM_ZCOL[tmZ(zz)] : tmWell(o.v), label: o ? Math.round(o.v) : '', tick: lab(m), now: m === cur, soft: m === cur, tip: o ? `${lab(m)}: ${Math.round(o.v)} % on ${o.days} mornings` : '' }; }) })}</div>`;
    const bar = (x) => (x.ok == null ? '<span class="muted">no ratio yet</span>' : `<div class="tm-share">${[['low', '#7fb0ea'], ['ok', '#34c759'], ['hi', '#ff9f0a'], ['red', '#e5484d']].map(([f, c]) => (x[f] ? `<i style="width:${x[f]}%;background:${c}" title="${x[f]} % of the days"></i>` : '')).join('')}</div><small class="muted">${x.ok} % of the days in the zone</small>`);
    const rows = months.slice().reverse().map((m) => { const a = info(m, 'td'), o = wm(m); return `<tr class="${m === cur ? 'now' : ''}"><td><b>${fmtDay(m + '-15', { month: 'long' })}</b> <span class="muted">${a.sess} sessions · ${a.games} matches</span></td>${B.keys.map(([k]) => { const x = info(m, k);
      return `<td>${tmK(x.tot)}</td><td>${tmK(x.perWeek)}</td><td class="g">${x.ac == null ? '' : `<span class="tm-acchip" style="background:${tmZone(x.ac)[0]}">${x.ac.toFixed(2)}</span>`}</td>`; }).join('')}<td>${o ? `<b style="color:${tmWell(o.v)}">${Math.round(o.v)} %</b>` : '—'}</td><td class="l">${bar(a)}</td></tr>`; }).join('');
    table = `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Month by month</h2><span class="panel-note">total · average week · average A:C · last column: share of the days in each A:C zone (distance)</span></div>
      <div class="table-wrap"><table class="tm-tbl"><thead><tr><th>Month</th>${B.keys.map(([, l]) => `<th>${l.replace('Distance ', '').replace('Total distance', 'Distance').replace('High ', '')}</th><th>/ week</th><th class="g">A:C</th>`).join('')}<th>Wellness</th><th class="l">Days by A:C zone</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  document.getElementById('tm-charts').innerHTML = cards;
  document.getElementById('tm-table').innerHTML = table;
  root.querySelectorAll('[data-wk]').forEach((el) => { el.onclick = () => tmWeekOpen(el.dataset.wk); el.onkeydown = (e) => { if (e.key === 'Enter') tmWeekOpen(el.dataset.wk); }; });
  const ref ={ day: 'the usual same MD', week: 'the other full weeks of the season', month: 'the season\'s weeks' }[view], acAt = { day: 'A:C that day', week: 'A:C at the end of the week', month: 'average A:C of the month' }[view];
  const cols = z ? [['#1d5fae', 'z ≤ −2'], ['#7fb0ea', '−2…−1'], ['#34c759', `usual (|z| < 1) vs ${ref}`], ['#ff9f0a', '+1…+2'], ['#e5484d', 'z ≥ +2'], ['#aeaeb2', 'no usual']] : [['#1d5fae', `${acAt} under 0.5`], ['#7fb0ea', '0.5–0.78'], ['#34c759', '0.78–1.37'], ['#ff9f0a', '1.37–1.5'], ['#e5484d', 'above 1.5']];
  document.getElementById('tm-legend').innerHTML = cols.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')
    + (view === 'day' ? '<span><i class="u"></i>usual for that MD (middle half of the last 15)</span><span><b class="g">G</b>match day</span>' : '<span><i class="b"></i>usual week of the season (the middle half of its full weeks)</span>')
    + (view === 'week' ? '<span>click a week: its detail day by day</span>' : '')
    + '<span><em></em>under each chart: A:C 7:28 on the same dates · band 0.78–1.37 · dashes 1.5</span>' + (z ? '' : '<span>wellness: green 70 % or more · orange 50–70 · red under 50</span>');
}

/**
 * A week opened (his ask and his mockup of 2026-10-12) — the drawer of the Sessions page's player sheet, for a week:
 * why it is above or below its usual, each metric as one bar cut by day (the piece = the MD of that day, in the colour
 * of that day vs its usual MD; a match = "G"), the make-up of the week, and the days one by one.
 * The usual week = the middle half of the season's other full weeks. A week in progress has no z of its own yet.
 */
function tmWeekOpen(start) {
  if (!WL.data || !WL.data.team) return;
  const B = tmBuild(), t = B.t, asOf = B.d.as_of, wi = B.weeks.findIndex((x) => x.start === start);
  if (wi < 0) return;
  svEnsureDrawer();
  const W = B.weeks[wi], others = B.weeks.filter((x) => x.done && x.td > 0 && x.start !== start), ds = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const val = (d, k) => t.daily[k][B.idx[d]] || 0, pl = (n, w) => `${n} ${w}${n === 1 ? '' : w === 'match' ? 'es' : 's'}`;
  const kindOf = (d) => { const x = B.sess[d]; return d > asOf ? 'later' : !x ? 'off' : x.kind === 'match' ? 'match' : x.group === 'compensatory' ? 'comp' : 'train'; };
  const count = (wk, f) => Array.from({ length: 7 }, (_, i) => addDays(wk.start, i)).filter((d) => f(kindOf(d))).length;
  const usualN = (f) => (others.length ? others.reduce((a, x) => a + count(x, f), 0) / others.length : null);
  const isM = (k) => k === 'match', isT = (k) => k === 'train' || k === 'comp', isO = (k) => k === 'off';
  const nM = count(W, isM), nT = count(W, isT), nO = count(W, isO), uM = usualN(isM), uT = usualN(isT), uO = usualN(isO), u1 = (v) => (v == null ? '—' : v.toFixed(1));
  const wv = ds.map((d) => B.well[d]).filter(Boolean), wAvg = wv.length ? wv.reduce((a, o) => a + o.v, 0) / wv.length : null;
  // a day vs its usual same MD, as the Day view (a compensatory day counts 0 for the team: nothing to compare)
  const zDay = (d, k) => { const x = B.sess[d], ok = x && x.group !== 'compensatory' && !(x.kind === 'training' && x.md === 'MD'), r = ok && x.team_ref ? x.team_ref[k] : null; return r && val(d, k) > 0 ? r : null; };
  const M = B.keys.map(([k, l, u]) => { const st = tmStats(others.map((x) => x[k])); return { k, l, u, st, v: W[k] || 0, z: W.done ? tmZof(W[k], st) : null, ac: W[k] > 0 ? B.acAt(k, W.done ? W.end : asOf) : null }; });

  // why: the metrics out of the usual, the make-up of the week, the days far from their usual MD
  const out = M.filter((m) => m.z != null && Math.abs(m.z) >= 1), up = out.filter((m) => m.z > 0), dn = out.filter((m) => m.z < 0), names = (xs) => xs.map((m) => `${m.l.toLowerCase()} (${tmS(m.z)})`).join(', ');
  const head = !W.done ? `Week in progress, up to ${fmtDay(asOf, { weekday: 'long', day: 'numeric', month: 'short' })} — it is compared with a usual week once it is complete.`
    : !out.length ? 'A usual week on every metric.'
      : [up.length ? `<b>Above</b> its usual week on ${names(up)}` : '', dn.length ? `<b>${up.length ? 'below' : 'Below'}</b> ${up.length ? '' : 'its usual week '}on ${names(dn)}` : ''].filter(Boolean).join(' · ') + '.';
  const why = [];
  if (W.done && uM != null && Math.abs(nM - uM) >= 0.75) why.push(`<b>${pl(nM, 'match')}</b> this week — a usual week has ${u1(uM)}.`);
  if (W.done && uT != null && Math.abs(nT - uT) >= 1) why.push(`<b>${pl(nT, 'training day')}</b> — a usual week has ${u1(uT)}${nO - uO >= 1 ? ` (${pl(nO, 'day')} without a team session, usually ${u1(uO)})` : ''}.`);
  const far = ds.flatMap((d) => ['td', 'hit'].map((k) => ({ d, k, r: zDay(d, k) }))).filter((x) => x.r && x.r.z != null && Math.abs(x.r.z) >= 1.5).sort((a, b) => Math.abs(b.r.z) - Math.abs(a.r.z));
  [...new Set(far.map((x) => x.d))].slice(0, 3).forEach((d) => { const xs = far.filter((x) => x.d === d), x = B.sess[d];
    why.push(`<b>${fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })} (${escapeHtml(x.md || '')})</b> ${xs[0].r.z > 0 ? 'above' : 'below'} its usual ${x.kind === 'match' ? 'match' : escapeHtml(x.md || 'day')}: ${xs.map((y) => `${y.k === 'td' ? 'distance' : '> 20 km/h'} ${fmtN(val(d, y.k))} vs ${fmtN(y.r.p25)}–${fmtN(y.r.p75)} (z ${tmS(y.r.z)})`).join(', ')}.`); });
  // wellness: the week = the average of its mornings, against the other full weeks' averages
  const wSt = tmStats(others.map((x) => B.wellOf(x.start, x.end)).filter(Boolean).map((o) => o.v)), wZ = W.done && wAvg != null ? tmZof(wAvg, wSt) : null;
  if (wZ != null && Math.abs(wZ) >= 1) why.push(`<b>Wellness ${Math.round(wAvg)} %</b> ${wZ > 0 ? 'above' : 'below'} its usual week (${Math.round(wSt.p25)}–${Math.round(wSt.p75)} %, z ${tmS(wZ)}).`);
  const comps = ds.filter((d) => kindOf(d) === 'comp');
  if (comps.length) why.push(`${comps.map((d) => fmtDay(d, { weekday: 'short', day: 'numeric' })).join(', ')}: compensatory session for the players who did not play — the team (the starters, recovering) counts 0 that day, as in your Team rule.`);

  // the piece of a day carries its MD ("MD-4", "-4" when it is narrow), a match "G"
  const tag = (d, wd) => { const md = (B.sess[d] && B.sess[d].md) || ''; return kindOf(d) === 'match' ? 'G' : !/^MD[+-]\d$/.test(md) ? '' : wd > 6.5 ? md : wd > 3 ? md.slice(2) : ''; };
  const bar = (m) => { const scale = Math.max(m.v, m.st.p75 || 0) * 1.12 || 1, live = ds.filter((d) => val(d, m.k) > 0); let x = 0;
    return `<div class="tw-bar">${m.st.p25 == null ? '' : `<u style="left:${(m.st.p25 / scale * 100).toFixed(2)}%;width:${((m.st.p75 - m.st.p25) / scale * 100).toFixed(2)}%" title="usual week ${fmtN(m.st.p25)}–${fmtN(m.st.p75)}"></u>`}${live.map((d) => { const v = val(d, m.k), left = x, r = zDay(d, m.k), wd = v / scale * 100, md = (B.sess[d] && B.sess[d].md) || ''; x += v;
      return `<i class="${d === live[live.length - 1] ? 'last' : ''}" style="left:${(left / scale * 100).toFixed(2)}%;width:${wd.toFixed(2)}%;background:${TM_ZCOL[tmZ(r ? r.z : null)]}" title="${escapeHtml(`${fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })}${md ? ' · ' + md : ''}: ${fmtN(v)}${r ? ` · usual ${fmtN(r.p25)}–${fmtN(r.p75)}${r.z == null ? '' : ' · z ' + tmS(r.z)}` : ''}`)}"><span>${tag(d, wd)}</span></i>`; }).join('')}</div>`; };
  const chip = (z) => `<span class="mz ${tmZ(z)}">${z == null ? '—' : tmS(z)}</span>`;
  const rows = M.map((m) => `<div class="tw-m"><span class="n">${m.l}</span><span class="v">${tmK(m.v)}${m.u ? ` <small class="muted">${m.u}</small>` : ''}</span>${bar(m)}<span class="c">${chip(m.z)}</span><span class="u">${m.st.p25 == null ? '' : `usual ${tmK(m.st.p25)}–${tmK(m.st.p75)}`}</span><span class="c">${m.ac == null ? '—' : `<span class="tm-acchip" style="background:${tmZone(m.ac)[0]}">${m.ac.toFixed(2)}</span>`}</span></div>`).join('');
  // wellness is not a sum: one cell per day (its MD and the team score of that morning, in the colour of its zone)
  const mdOf = (d) => { const md = (B.sess[d] && B.sess[d].md) || ''; return kindOf(d) === 'match' ? 'G' : /^MD[+-]\d$/.test(md) ? md : ''; };
  const wRow = !wv.length && wSt.p25 == null ? '' : `<div class="tw-m"><span class="n">Wellness</span><span class="v">${wAvg == null ? '—' : Math.round(wAvg)} <small class="muted">%</small></span><div class="tw-days">${ds.map((d) => { const o = B.well[d], md = mdOf(d);
    return `<i class="${o ? '' : 'no'}"${o ? ` style="background:${tmWell(o.v)}"` : ''} title="${escapeHtml(`${fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })}${md ? ' · ' + md : ''}: ${o ? `${Math.round(o.v)} % · ${o.n} check-ins` : 'no check-in'}`)}">${md ? `<small>${md}</small>` : ''}${o ? Math.round(o.v) : d > asOf ? '' : '–'}</i>`; }).join('')}</div><span class="c">${chip(wZ)}</span><span class="u">${wSt.p25 == null ? '' : `usual ${Math.round(wSt.p25)}–${Math.round(wSt.p75)} %`}</span><span class="c"></span></div>`;
  const cell = (d, k) => { const v = val(d, k), r = zDay(d, k); return `<td>${v > 0 ? fmtN(v) : '—'}${r && r.z != null ? chip(r.z) : v > 0 ? '<span class="mz na">—</span>' : ''}</td>`; };
  const KL = { train: 'Training', match: 'Match', comp: 'Compensatory', off: 'No team session', later: 'Not yet' };
  const dayRows = ds.map((d) => { const x = B.sess[d], k = kindOf(d), o = B.well[d];
    return `<tr class="${k === 'off' || k === 'later' ? 'off' : ''}"><td><b>${fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })}</b></td><td class="l">${x && k !== 'later' ? `<span class="tw-md${k === 'match' ? ' g' : ''}">${k === 'match' ? 'G · MD' : escapeHtml(x.md || '—')}</span>` : ''}</td><td class="l">${KL[k]}</td><td>${x && x.minutes ? fmtN(x.minutes) + '\'' : ''}</td><td>${x && x.n ? x.n : ''}</td>${B.keys.map(([kk]) => cell(d, kk)).join('')}<td>${o ? `<b style="color:${tmWell(o.v)}">${Math.round(o.v)} %</b>` : '—'}</td></tr>`; }).join('');
  const tot = `<tr class="tot"><td colspan="5">This week${W.done ? '' : ' so far'}</td>${M.map((m) => `<td>${fmtN(m.v)}${chip(m.z)}</td>`).join('')}<td>${wAvg == null ? '—' : Math.round(wAvg) + ' %'}</td></tr>
    <tr class="usu"><td colspan="5">Usual week (middle half of the season's ${others.length} other full weeks)</td>${M.map((m) => `<td>${m.st.p25 == null ? '—' : `${tmK(m.st.p25)}–${tmK(m.st.p75)}`}</td>`).join('')}<td></td></tr>`;
  const cls = (a, b) => (b == null || !W.done ? '' : a - b >= 0.75 ? 'hi' : b - a >= 0.75 ? 'lo' : ''), short = (l) => l.replace('Total distance', 'Distance').replace('Distance ', '').replace('High ', '');
  const prev = B.weeks[wi - 1], next = B.weeks[wi + 1];
  const sheet = document.getElementById('sv-sheet');
  sheet.innerHTML = `
    <div class="tw-head"><div><div class="eb">Workload · Team · week detail</div><h3>${W.label} · ${fmtDay(W.start, { day: 'numeric', month: 'short' })} → ${fmtDay(W.end, { day: 'numeric', month: 'short', year: 'numeric' })}${W.done ? '' : ' <small>in progress</small>'}</h3>
      <p>${pl(nT, 'training day')} · ${pl(nM, 'match')} · ${nO} without a team session</p></div>
      <div class="sv-nav"><button type="button" data-wk="${prev ? prev.start : ''}" ${prev ? '' : 'disabled'}>‹ ${prev ? prev.label : ''}</button><button type="button" data-wk="${next ? next.start : ''}" ${next ? '' : 'disabled'}>${next ? next.label : ''} ›</button><button type="button" class="sv-x" aria-label="Close">×</button></div></div>
    <div class="tw-why"><b class="t">Why this week is where it is</b>${head}${why.length ? `<ul>${why.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
    <div class="tw-card"><h4>The week on each metric<small>the bar = the week, one piece per day: its MD, in the colour of that day vs its usual MD · between the two black lines = usual week · G = match</small></h4>
      <div class="tw-scroll"><div class="tw-m h"><span>Metric</span><span class="r">Week</span><span>MD by MD</span><span class="c">z</span><span>Usual week</span><span class="c">A:C ${W.done ? 'end' : 'now'}</span></div>${rows}${wRow}</div>
      ${wRow ? '<p class="tw-note">Wellness: one cell per morning, Sunday to Saturday — the team score, green 70 % or more · orange 50–70 · red under 50; the week = the average of its mornings.</p>' : ''}</div>
    <div class="tw-card"><h4>Make-up of the week<small>compared with the season's other full weeks</small></h4><div class="tw-mk">
      <div class="${cls(nM, uM)}"><span>Matches</span><b>${nM}</b><em>usual ${u1(uM)}</em></div><div class="${cls(nT, uT)}"><span>Training days</span><b>${nT}</b><em>usual ${u1(uT)}</em></div>
      <div><span>Days without a team session</span><b>${nO}</b><em>usual ${u1(uO)}</em></div><div><span>Wellness</span><b>${wAvg == null ? '—' : Math.round(wAvg) + ' %'}</b><em>${pl(wv.length, 'morning')}</em></div></div></div>
    <div class="tw-card"><h4>Day by day<small>the team's load · chip = z vs the usual same MD (a match: vs the usual match)</small></h4>
      <div class="table-wrap"><table class="tw-dt"><thead><tr><th>Day</th><th class="l">MD</th><th class="l">Session</th><th>Time</th><th>Players</th>${B.keys.map(([, l]) => `<th>${short(l)}</th>`).join('')}<th>Wellness</th></tr></thead><tbody>${dayRows}${tot}</tbody></table></div></div>`;
  const dr = document.getElementById('sv-drawer'), wasHidden = dr.hidden;
  dr.hidden = false;
  document.getElementById('sv-dim').hidden = false;
  document.body.classList.add('sv-noscroll');
  if (wasHidden) dr.scrollTop = 0;
  sheet.querySelector('.sv-x').onclick = svClose;
  sheet.querySelectorAll('[data-wk]').forEach((b) => { b.onclick = () => { if (b.dataset.wk) tmWeekOpen(b.dataset.wk); }; });
}
