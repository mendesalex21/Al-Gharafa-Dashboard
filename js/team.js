/**
 * Workload › Team — the team's load by day, week and month (his Power BI "Team weekload" pages, his mockup of
 * 2026-10-11). Bars = the team's load (workload payload `team`: his Team rule — ProTraining, whole-game players, 0 on
 * days off); under each chart, on the same dates, the A:C 7:28 in its zones. The bars' colour is his choice:
 *   z-score — a day vs the usual same MD (sessions payload `team_ref`), a week vs the other full weeks of the season,
 *             a month's average week vs the season's weeks;
 *   A:C     — the ratio that day, at the end of the week, on average over the month.
 * Plus the team's wellness (wellness_history payload), with the number of check-ins under it. A match day has a "G".
 */
const TM = { view: 'week', color: 'z', from: null, to: null };
const TM_KEYS = [['td', 'Total distance', 'm'], ['hit', 'Distance > 20 km/h', 'm'], ['spr_n', 'Sprints', ''], ['acc_dec', 'High Acc + Dec', ''], ['srpe', 'sRPE', 'AU']];
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
  document.getElementById('tm-reset').onclick = () => { TM.custom = false; TM.from = TM.to = null; drawTeam(); };
  withData('workload', (d) => { WL.data = d; drawTeam(); }, (err) => { root.innerHTML = loadError(err); });
  withData('sessions', (d) => { TR.sessions = d; drawTeam(); }, () => {}); // each day's MD and its usual (z-score)
  withData('wellness_history', (d) => { TM.well = d; drawTeam(); }, () => {});
}

/** The dates shown: his choice, else the last 5 weeks (Day), the last 12 weeks (Week), the season (Month). */
function tmRange() {
  const t = WL.data.team, asOf = WL.data.as_of;
  if (!TM.custom) { TM.to = asOf; TM.from = TM.view === 'day' ? addDays(asOf, -34) : TM.view === 'week' ? addDays(asOf, -7 * 12 + 1) : t.start; }
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
  const W = 548, padL = 44, padR = 12, H1 = 168, top = 20, gap = 30, H2 = 60, n = o.items.length || 1, bw = (W - padL - padR) / n;
  const max = o.max || Math.max(...o.items.map((x) => Math.max(x.v || 0, x.hi || 0)), o.band ? o.band[1] : 0) * 1.14 || 1;
  const Y = (v) => top + H1 - (v / max) * H1, X = (i) => padL + i * bw + bw / 2, y2 = top + H1 + gap, R = (r) => y2 + H2 - (Math.min(r, 2) / 2) * H2;
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((f) => f >= raw);
  let s = `<svg viewBox="0 0 ${W} ${y2 + H2 + 28}" class="tm-svg" role="img" aria-label="${escapeHtml(o.title || '')}">`;
  for (let g = 0; g <= max + 1e-9; g += st) s += `<line x1="${padL}" x2="${W - padR}" y1="${Y(g)}" y2="${Y(g)}" class="tm-gl"/><text x="${padL - 6}" y="${Y(g) + 3.5}" class="tm-ax" text-anchor="end">${tmK(g)}</text>`;
  if (o.band) s += `<rect x="${padL}" y="${Y(o.band[1])}" width="${W - padL - padR}" height="${Y(o.band[0]) - Y(o.band[1])}" class="tm-band"/>`;
  o.items.forEach((x, i) => {
    const w = Math.max(3, Math.min(34, bw * 0.68)), cx = X(i);
    if (x.sep) s += `<line x1="${cx - bw / 2}" x2="${cx - bw / 2}" y1="${top}" y2="${y2 + H2}" class="tm-sep"/>`;
    if (x.hi != null) s += `<rect x="${cx - w / 2 - 2}" y="${Y(x.hi)}" width="${w + 4}" height="${Math.max(1.5, Y(x.lo) - Y(x.hi))}" class="tm-usual"/>`;
    if (x.v > 0) s += `<rect x="${cx - w / 2}" y="${Y(x.v)}" width="${w}" height="${top + H1 - Y(x.v)}" rx="${Math.min(4, w / 3)}" fill="${x.col}"${x.soft ? ' opacity=".55"' : ''}><title>${escapeHtml(x.tip || '')}</title></rect>`;
    if (x.label) s += `<text x="${cx}" y="${Y(Math.max(x.v || 0, x.hi || 0)) - 5}" class="tm-val" text-anchor="middle">${x.label}</text>`;
    if (x.game) s += `<text x="${cx}" y="${top + H1 + 11}" class="tm-game" text-anchor="middle">G</text>`;
    if (x.tick) s += `<text x="${cx}" y="${y2 + H2 + 14}" class="tm-ax${x.now ? ' now' : ''}" text-anchor="middle">${x.tick}</text>`;
  });
  s += `<line x1="${padL}" x2="${W - padR}" y1="${top + H1}" y2="${top + H1}" class="tm-base"/>`;
  if (o.strip === 'count') { // the check-ins of each day (wellness)
    const mx = Math.max(1, ...o.items.map((x) => x.n || 0));
    s += `<text x="${padL}" y="${y2 - 8}" class="tm-cap">CHECK-INS</text><line x1="${padL}" x2="${W - padR}" y1="${y2 + H2}" y2="${y2 + H2}" class="tm-gl"/>`;
    o.items.forEach((x, i) => { if (x.n > 0) { const w = Math.max(3, Math.min(34, bw * 0.68)), h = (x.n / mx) * (H2 - 14); s += `<rect x="${X(i) - w / 2}" y="${y2 + H2 - h}" width="${w}" height="${h}" rx="2" class="tm-cnt"><title>${Math.round(x.n)} check-ins</title></rect>`;
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
    return `<div class="tm-tile"><span class="k">${l}</span><div class="ac"><b style="color:${col}">${now == null ? '—' : now.toFixed(2)}</b><span>A:C 7:28${now > 1.5 && prev > 1.5 ? '<i class="tm-2w">2W</i>' : ''}</span></div>
      <span class="tm-zone"><i style="background:${col}"></i>${txt}</span>
      <div class="ln"><span>A week ago</span><b>${prev == null ? '—' : prev.toFixed(2)}</b></div>
      ${last ? `<div class="ln"><span>${last.label}</span><b>${tmK(last[k])}${u ? ' ' + u : ''} <span class="mz ${tmZ(z)}">${z == null ? '—' : tmS(z)}</span></b></div><div class="ln"><span>Usual week</span><b>${tmK(st.p25)}–${tmK(st.p75)}</b></div>` : ''}</div>`;
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
  const B = tmBuild(), [from, to] = tmRange(), z = TM.color === 'z', view = TM.view, asOf = B.d.as_of;
  document.getElementById('tm-sub').textContent = `Your Team rule (ProTraining, whole-game players, 0 on days off) · data up to ${fmtDay(asOf, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtUpdated(B.d.generated_at)}`;
  const fi = document.getElementById('tm-from'), ti = document.getElementById('tm-to');
  fi.min = ti.min = B.t.start; fi.max = ti.max = asOf; fi.value = from; ti.value = to;
  document.getElementById('tm-reset').hidden = !TM.custom;
  document.getElementById('tm-tiles').innerHTML = tmTiles(B);
  const head = (l, note) => `<h2>${l}<small>${note}</small></h2>`;
  let cards = '', table = '';

  if (view === 'day') {
    const ds = B.days.filter((x) => x >= from && x <= to), few = ds.length <= 16;
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
      return `<div class="tm-card">${head(l, `per week${u ? ' · ' + u : ''}${st.p25 == null ? '' : ` · usual ${tmK(st.p25)}–${tmK(st.p75)}`}`)}${tmChart({ title: l, dots: ws.length <= 16, band: st.p25 == null ? null : [st.p25, st.p75],
        items: ws.map((w) => { const ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : asOf) : null, zz = tmZof(w[k], tmStats(B.real(k).filter((x) => x.start !== w.start).map((x) => x[k])));
          return { v: w[k], col: z ? TM_ZCOL[tmZ(zz)] : tmZone(ac)[0], ac, label: w[k] > 0 ? tmK(w[k]) : ws.length <= 16 ? 'no GPS' : '', tick: ws.length <= 16 || w === ws[ws.length - 1] ? w.label : '', now: !w.done, soft: !w.done,
            tip: `${w.label} · ${fmtDay(w.start, { day: 'numeric', month: 'short' })}: ${fmtN(w[k])}${zz == null ? '' : ' · z ' + tmS(zz)}${ac == null ? '' : ' · A:C ' + ac.toFixed(2)}` }; }) })}</div>`; }).join('');
    const wst = tmStats(B.weeks.filter((w) => w.done).map((w) => B.wellOf(w.start, w.end)).filter(Boolean).map((o) => o.v));
    cards += `<div class="tm-card">${head('Wellness', 'average team score of the week · % · green band = 70 % or more')}${tmChart({ title: 'Wellness', max: 100, band: [70, 100], strip: 'count', dots: ws.length <= 16,
      items: ws.map((w) => { const o = B.wellOf(w.start, w.end), zz = o ? tmZof(o.v, wst) : null; return { v: o ? o.v : 0, n: o ? o.n : 0, col: !o ? '#aeaeb2' : z ? TM_ZCOL[tmZ(zz)] : tmWell(o.v), label: o ? Math.round(o.v) : '', tick: ws.length <= 16 || w === ws[ws.length - 1] ? w.label : '', now: !w.done, soft: !w.done,
        tip: o ? `${w.label}: ${Math.round(o.v)} % on ${o.days} mornings · ${Math.round(o.n)} check-ins a day` : '' }; }) })}</div>`;
    const rows = ws.slice().reverse().map((w) => `<tr class="${w.done ? '' : 'now'}"><td><b>${w.label}</b> <span class="muted">${fmtDay(w.start, { day: 'numeric', month: 'short' })}${w.done ? '' : ' · in progress'}</span></td>${B.keys.map(([k]) => { const zz = w[k] > 0 ? tmZof(w[k], tmStats(B.real(k).filter((x) => x.start !== w.start).map((x) => x[k]))) : null, ac = w[k] > 0 ? B.acAt(k, w.done ? w.end : asOf) : null;
      return `<td>${w[k] > 0 ? tmK(w[k]) : '—'}</td><td>${zz == null ? '' : `<span class="mz ${tmZ(zz)}">${tmS(zz)}</span>`}</td><td class="g">${ac == null ? '' : `<span class="tm-acchip" style="background:${tmZone(ac)[0]}">${ac.toFixed(2)}</span>`}</td>`; }).join('')}<td>${(() => { const o = B.wellOf(w.start, w.end); return o ? `<b style="color:${tmWell(o.v)}">${Math.round(o.v)} %</b>` : '—'; })()}</td></tr>`).join('');
    table = `<section class="panel"><div class="panel-head"><h2 class="panel-title small">Week by week</h2><span class="panel-note">load · z vs the other full weeks of the season · A:C 7:28 at the end of the week</span></div>
      <div class="table-wrap"><table class="tm-tbl"><thead><tr><th>Week</th>${B.keys.map(([, l]) => `<th>${l.replace('Distance ', '').replace('Total distance', 'Distance').replace('High ', '')}</th><th>z</th><th class="g">A:C</th>`).join('')}<th>Wellness</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
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
  const ref = { day: 'the usual same MD', week: 'the other full weeks of the season', month: 'the season\'s weeks' }[view], acAt = { day: 'A:C that day', week: 'A:C at the end of the week', month: 'average A:C of the month' }[view];
  const cols = z ? [['#1d5fae', 'z ≤ −2'], ['#7fb0ea', '−2…−1'], ['#34c759', `usual (|z| < 1) vs ${ref}`], ['#ff9f0a', '+1…+2'], ['#e5484d', 'z ≥ +2'], ['#aeaeb2', 'no usual']] : [['#1d5fae', `${acAt} under 0.5`], ['#7fb0ea', '0.5–0.78'], ['#34c759', '0.78–1.37'], ['#ff9f0a', '1.37–1.5'], ['#e5484d', 'above 1.5']];
  document.getElementById('tm-legend').innerHTML = cols.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')
    + (view === 'day' ? '<span><i class="u"></i>usual for that MD (middle half of the last 15)</span><span><b class="g">G</b>match day</span>' : '<span><i class="b"></i>usual week of the season (the middle half of its full weeks)</span>')
    + '<span><em></em>under each chart: A:C 7:28 on the same dates · band 0.78–1.37 · dashes 1.5</span>' + (z ? '' : '<span>wellness: green 70 % or more · orange 50–70 · red under 50</span>');
}
