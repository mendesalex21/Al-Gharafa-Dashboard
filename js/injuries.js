/* Return from injury (his ask, 2026-11-06; admin first): payload workload.injuries (sync/injuries.py).
 * - Workload › Player: the return card (mockup A) while his return is open, and his injury history at the bottom.
 * - Workload › Injuries: every player in his return window (mockup C) and the season's injuries.
 * Class by days out: short ≤ 7 (watched 2 weeks), medium 8–21 (4 weeks), long ≥ 22 (6 weeks). Return complete = ≥ 90 % of
 * his max speed touched + (90 % of his week before, same kind of week, on total distance and > 20 km/h — 1 week for a short
 * injury, 2 running otherwise — or a 60 min match at his usual intensity). */
const INJ_OPEN = ['first_week', 'on_track', 'behind', 'not_back'];
const INJ_STATE = {
  complete: ['return complete', 'green'], on_track: ['on track', 'green'], behind: ['behind the usual return', 'blue'], first_week: ['first week back', 'grey'],
  not_back: ['not back to his load', 'orange'], interrupted: ['out again before the end', 'grey'], out: ['out now', 'red'], no_data: ['no data after', 'grey'],
};
const INJ_MS = [['team', 'First full team session'], ['v90', '≥ 90 % of his max speed'], ['match', 'First match minutes'], ['m60', 'First 60 min match']];
const injAll = (d) => (d && d.injuries) || null;
const injOf = (d, pid) => { const I = injAll(d); return I && I.players ? I.players[pid] || [] : []; };
const injSpells = (rows) => rows.filter((s) => s.cls); // spells of 5 days or more (the others: the medical list only)
const injCur = (d, pid) => injSpells(injOf(d, pid))[0] || null; // his latest spell
const injRecent = (s, asOf, extra = 14) => !!s.back && daysBetween(s.back, asOf) <= 7 * s.win + extra; // still in (or just after) his return window
const injDay = (iso) => fmtDay(iso, { day: 'numeric', month: 'short' });
const injDayY = (iso) => fmtDay(iso, { day: 'numeric', month: 'short', year: 'numeric' });
function injStateChip(s) {
  const [t, c] = INJ_STATE[s.state] || [s.state || '—', 'grey'];
  const txt = s.state === 'complete' && s.complete ? `${t} · week ${s.complete.week}` : s.state === 'not_back' ? `${t} after ${s.win} weeks` : t;
  return `<span class="inj-st ${c}" title="${s.state === 'complete' && s.complete ? (s.complete.how === 'match' ? 'a 60 min match at his usual intensity' : 'back to his load of before') + ' · ' + injDay(s.complete.date) : ''}">${escapeHtml(txt)}</span>`;
}
/** "Fast return": > 20 km/h above the top of the usual return (p75 of his class) in week 1 or 2. The words follow our own
 * history, recomputed at each build: a warning only while these returns were re-injured clearly more often (+5 points). */
const injFastRisk = (I) => { const f = I.fast_stats || {}; return f.re_fast != null && f.re_other != null && f.n_fast >= 10 && f.re_fast >= f.re_other + 5; };
function injFastTxt(I, s) {
  const f = I.fast_stats || {};
  return `> 20 km/h at ${s.fast.pct} % of his week before in week ${s.fast.week} — above the top of the usual return (${s.fast.p75} %)${f.re_fast != null ? ` · in our returns since 2024, ${f.re_fast} % of these fast returns were re-injured within 8 weeks, ${f.re_other} % of the others${injFastRisk(I) ? '' : ' — no link with re-injuries so far'}` : ''}`;
}
function injFastChip(I, s) {
  if (!s.fast) return '';
  return `<span class="inj-st ${injFastRisk(I) ? 'orange' : 'blue'}" title="${escapeHtml(injFastTxt(I, s))}">${injFastRisk(I) ? 'fast return — watch' : 'fast high-speed return'}</span>`;
}
function injClsChip(I, s, long) {
  if (!s.cls) return '<span class="inj-cls none">under 5 days</span>';
  const c = I.classes[s.cls];
  return `<span class="inj-cls ${s.cls}">${c.label}${long ? ` injury · ${c.range} · watched ${c.weeks} weeks` : ` · ${s.out} d`}</span>`;
}
function injMedTxt(m) {
  if (!m) return '';
  const side = m.side === 'L' ? 'left' : m.side === 'R' ? 'right' : m.side === 'B' ? 'both sides' : '';
  return [[m.region, side].filter(Boolean).join(' '), [m.type, m.mechanism].filter(Boolean).join(', '), m.where, m.severity, m.recur && m.recur !== 'new' ? m.recur : ''].filter(Boolean).join(' · ');
}
/** % of his week before, week by week, over the band of the usual return of his class — small and plain (his ask,
 * 2026-11-06: the charts were far too big): one of three side by side, the title in HTML, 50 / 100 % only. */
function injCurve(I, s, k, lab) {
  const nw = s.win, W = 380, H = 128, L = 30, R = 34, T = 8, Bm = 18, band = (I.bands[s.cls] || {})[k] || [];
  const x = (i) => L + (nw > 1 ? i * (W - L - R) / (nw - 1) : (W - L - R) / 2), y = (p) => T + (1 - Math.min(Math.max(p, 0), 160) / 160) * (H - T - Bm);
  let g = `<svg viewBox="0 0 ${W} ${H}" class="inj-cv" role="img" aria-label="${escapeHtml(lab)}">`;
  [50, 100].forEach((p) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="gl"/><text x="${L - 5}" y="${y(p) + 3.5}" class="ax" text-anchor="end">${p}%</text>`; });
  for (let i = 0; i < nw; i++) g += `<text x="${x(i)}" y="${H - 4}" class="ax" text-anchor="middle">W${i + 1}</text>`;
  const b = band.map((v, i) => [i, v]).filter(([, v]) => v);
  if (b.length) {
    g += `<polygon points="${b.map(([i, v]) => `${x(i).toFixed(1)},${y(v[2]).toFixed(1)}`).join(' ')} ${b.slice().reverse().map(([i, v]) => `${x(i).toFixed(1)},${y(v[0]).toFixed(1)}`).join(' ')}" class="bd"/>`;
    g += `<polyline points="${b.map(([i, v]) => `${x(i).toFixed(1)},${y(v[1]).toFixed(1)}`).join(' ')}" class="md"/>`;
  }
  g += `<line x1="${L}" x2="${W - R}" y1="${y(90)}" y2="${y(90)}" class="g90"/>`;
  const pts = s.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => i < nw && w.pct[k] != null && (w.ok || (!w.done && w.days >= 3)));
  if (pts.length) {
    const done = pts.filter(({ w }) => w.done);
    if (done.length > 1) g += `<polyline points="${done.map(({ w, i }) => `${x(i).toFixed(1)},${y(w.pct[k]).toFixed(1)}`).join(' ')}" class="pl"/>`;
    pts.forEach(({ w, i }) => { g += `<circle cx="${x(i).toFixed(1)}" cy="${y(w.pct[k]).toFixed(1)}" r="${w.done ? 3.5 : 3}" class="${w.done ? 'pd' : 'po'}"><title>week ${i + 1}${w.done ? '' : ' so far'} · ${w.pct[k]} % of his week before${w.nm ? ` · ${w.nm} match${w.nm > 1 ? 'es' : ''}` : ''}</title></circle>`; });
    const l = pts[pts.length - 1]; g += `<text x="${(x(l.i) + 7).toFixed(1)}" y="${(y(l.w.pct[k]) + 3.5).toFixed(1)}" class="pv">${l.w.pct[k]}%</text>`;
  }
  return `<div class="inj-c"><div class="inj-ct">${escapeHtml(lab)}</div>${g}</svg></div>`;
}
/** % of his max speed day by day after his return, with the 80 / 85 / 90 % lines (his ask, 2026-11-06). */
function injSpeed(I, s) {
  const pts = (s.vmax_days || []).filter(([dd]) => dd < 7 * s.win);
  const m = s.ms || {}, f = (k) => (m[k] != null ? `day ${m[k]}` : '—');
  const N = 7 * s.win, W = 560, H = 150, L = 30, R = 34, T = 8, Bm = 18, lo = 60, hi = 105;
  const x = (dd) => L + dd / Math.max(1, N - 1) * (W - L - R), y = (v) => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - T - Bm);
  let g = `<svg viewBox="0 0 ${W} ${H}" class="inj-cv" role="img" aria-label="max speed after his return">`;
  [[90, '#34c759'], [85, '#a3d977'], [80, '#e8c26a']].forEach(([v, c]) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="1" stroke-dasharray="3 3"/><text x="${W - R + 5}" y="${y(v) + 3.5}" class="ax">${v}</text>`; });
  g += `<text x="${L - 5}" y="${y(100) + 3.5}" class="ax" text-anchor="end">100%</text><text x="${L - 5}" y="${y(70) + 3.5}" class="ax" text-anchor="end">70%</text>`;
  for (let w = 0; w < s.win; w++) g += `<text x="${x(w * 7 + 3)}" y="${H - 4}" class="ax" text-anchor="middle">W${w + 1}</text>`;
  if (pts.length > 1) g += `<polyline points="${pts.map(([dd, v]) => `${x(dd).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink-2)" stroke-width="1.2" stroke-linejoin="round" opacity=".55"/>`;
  pts.forEach(([dd, v]) => { g += `<circle cx="${x(dd).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${v >= 90 ? '#34c759' : v >= 85 ? '#a3d977' : v >= 80 ? '#e8c26a' : '#c9c8c1'}"><title>day ${dd} · ${injDay(addDays(s.back, dd))} · ${v} % of his max speed</title></circle>`; });
  return `<div class="inj-c"><div class="inj-ct">Max speed of each day · % of his max</div>${g}</svg><div class="inj-cs">first ≥ 80 % ${f('v80')} · ≥ 85 % ${f('v85')} · ≥ 90 % ${f('v90')}</div></div>`;
}
/** The load of his return in a small week table (his choice, mockup A 2026-11-06): one row per metric, one column per week,
 * % of his week before (green from 90 %, orange 70–89, red under 70), the matches of each week under it. */
function injWeekTable(s) {
  const nw = s.win, ws = s.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => i < nw && (w.ok || (!w.done && w.days >= 3)));
  const at = (i) => (ws.find((x) => x.i === i) || {}).w;
  const col = (v) => (v >= 90 ? 'g' : v >= 70 ? 'o' : 'r');
  const th = Array.from({ length: nw }, (_, i) => { const w = at(i); return `<th class="c">W${i + 1}${w && !w.done ? '<small> so far</small>' : ''}</th>`; }).join('');
  const rows = [['td', 'Total distance'], ['hit', '> 20 km/h'], ['acc_dec', 'Acc + Dec']].map(([k, l]) => `<tr><td><b>${l}</b></td>${Array.from({ length: nw }, (_, i) => { const w = at(i), v = w ? w.pct[k] : null;
    return v == null ? '<td class="c muted">·</td>' : `<td class="c"><span class="inj-wk ${col(v)}" title="week ${i + 1}: ${v} % of his week before">${v} %</span></td>`; }).join('')}</tr>`).join('');
  const nm = Array.from({ length: nw }, (_, i) => { const w = at(i); return `<td class="c">${w && w.nm ? `${w.nm} match${w.nm > 1 ? 'es' : ''}` : ''}</td>`; }).join('');
  return `<div class="inj-c"><div class="inj-ct">Load · % of his week before the injury</div><table class="dtable compact inj-wt"><thead><tr><th></th>${th}</tr></thead><tbody>${rows}<tr class="nm"><td>matches</td>${nm}</tr></tbody></table>
    <div class="inj-cs">green ≥ 90 % = back to his load · orange 70–89 % · red under 70 %</div></div>`;
}
function injMsRow(I, s) {
  const m = s.ms || {}, u = (I.ms_usual || {})[s.cls] || {};
  return `<div class="inj-msl">${[['team', 'Team session'], ['v90', '≥ 90 % Vmax'], ['match', 'First match minutes'], ['m60', '60 min match']].map(([k, l]) => { const ok = m[k] != null;
    return `<span class="${ok ? 'ok' : ''}" title="${ok ? injDay(addDays(s.back, m[k])) : ''}"><i>${ok ? '✓' : ''}</i>${l} <b>${ok ? 'day ' + m[k] : 'not yet'}</b>${u[k] != null ? `<small>usual ${u[k]}</small>` : ''}</span>`; }).join('')}</div>`;
}
function injMilestones(I, s) {
  const u = (I.ms_usual || {})[s.cls] || {};
  return `<div class="inj-msr">${INJ_MS.map(([k, l]) => { const n = s.ms ? s.ms[k] : null, ok = n != null;
    return `<div class="inj-ms${ok ? ' ok' : ''}"><i>${ok ? '✓' : ''}</i><div><b>${l}</b><small>${ok ? `day ${n} · ${injDay(addDays(s.back, n))}` : 'not yet'}${u[k] != null ? ` · usual for a ${I.classes[s.cls].label.toLowerCase()} injury: day ${u[k]}` : ''}</small></div></div>`; }).join('')}</div>`;
}
/** Workload › Player: the return card, while his return is open (admin). */
function injCardHtml(d, p) {
  injMergeLocal(d);
  const I = injAll(d), s = injCur(d, p.id);
  if (!I || !s || !INJ_OPEN.includes(s.state) || !injRecent(s, d.as_of, 7)) return '';
  const pre = s.pre, wk = Math.min(s.win, s.weeks.length || 1);
  const ref = pre ? `His week before the injury (4 normal weeks): total distance ${(pre.td / 1000).toFixed(1)} km · > 20 km/h ${pre.hit} m · sprint ${pre.spr} m · Acc + Dec ${pre.acc_dec}` : 'No normal week before the injury to compare with.';
  return `<section class="panel inj-card"><div class="inj-ph"><div style="flex:1"><div class="inj-t">Return from injury</div>
      <div class="muted">${s.med ? escapeHtml(injMedTxt(s.med)) + ' · ' : injCanEdit() ? `<a class="link" href="#injuries/${p.id}" onclick="switchView('injuries', { player: '${p.id}' }); return false;">add the injury's details</a> · ` : ''}out ${s.out} days from ${injDay(s.inj_date || s.start)} · back on ${injDay(s.back)} · week ${wk} of ${s.win}</div></div>${injClsChip(I, s, true)}${injStateChip(s)}${injFastChip(I, s)}</div>
    <div class="muted sm" style="margin:8px 0 2px">${ref}</div>
    <div class="inj-ab">${pre ? injWeekTable(s) : '<div class="inj-c muted sm">No normal week before the injury to compare with.</div>'}${injSpeed(I, s)}</div>
    ${injMsRow(I, s)}
    <p class="muted sm" style="margin:12px 0 0">${s.fast ? `<b>Fast high-speed return:</b> ${escapeHtml(injFastTxt(I, s))}.<br>` : ''}Return complete = ≥ 90 % of his max speed touched, and 90 % of his week before on total distance and > 20 km/h (a congested week compared with his congested weeks; ${s.cls === 'short' ? '1 week' : '2 weeks running'}) or a 60 min match at his usual intensity.</p></section>`;
}
/** Workload › Player, at the bottom: his injuries (admin; in place of the physical tests). */
function injHistoryHtml(d, p) {
  injMergeLocal(d);
  const I = injAll(d), rows = injOf(d, p.id);
  if (!I) return '<div class="empty">Not computed yet.</div>';
  if (!rows.length) return '<div class="empty">No injury of 5 days or more in the data (since 2024), none on the medical list.</div>';
  const mk = bodyMapMarks(rows.filter((s) => s.med).map((s) => s.med));
  const ms = (s) => (s.ms ? [s.ms.v90 != null ? `≥ 90 % Vmax day ${s.ms.v90}` : '', s.ms.m60 != null ? `60 min match day ${s.ms.m60}` : ''].filter(Boolean).join(' · ') : '');
  const item = (s) => `<div class="inj-hi"><div class="inj-hd"><b>${injDayY(s.inj_date || s.start)}</b><span>${s.med ? escapeHtml(injMedTxt(s.med)) : `<span class="muted">details to complete</span>${injCanEdit() && s.cls ? ` · <a class="link" href="#injuries/${p.id}" onclick="switchView('injuries', { player: '${p.id}' }); return false;">add</a>` : ''}`}</span>${ms(s) ? `<small>${ms(s)}</small>` : ''}</div>
    <div class="inj-hc">${injClsChip(I, s)}${s.cls ? injStateChip(s) + injFastChip(I, s) : ''}</div></div>`;
  return `<div class="inj-hgrid">${Object.keys(mk).length ? `<div class="inj-hmap">${bodyMapHtml(mk, { w: 100 })}${bodyMapLegend()}</div>` : ''}<div class="inj-hlist">${rows.map(item).join('')}</div></div>
    <p class="muted sm" style="margin:8px 0 0">Injuries of 5 days or more from the GPS statuses (injured / rehab), with the details entered by the medical staff · days of the milestones counted from his first day back.</p>`;
}

/* Workload › Injuries */
const INJ = {};
/** opts.player (address #injuries/<player id>, the player's sheet link): his injury without details opens in the entry. */
function renderInjuries(opts) {
  INJ.want = (opts && opts.player) || '';
  const root = document.getElementById('view-injuries');
  root.innerHTML = `<div class="sv-bleed">${pageHead('Workload', 'Injuries', 'inj-sub')}<div id="inj-body"><div class="panel"><div class="empty">Loading…</div></div></div></div>`;
  withData('workload', (d) => { WL.data = d; drawInjuries(opts); }, (err) => { root.innerHTML = loadError(err); });
}
function drawInjuries(opts) {
  if (opts && opts.player) INJ.want = opts.player;
  const d = WL.data, box = document.getElementById('inj-body');
  if (!d || !box || document.getElementById('view-injuries').hidden) return;
  const I = injAll(d);
  if (!I) { box.innerHTML = '<div class="panel"><div class="empty">Not computed yet — at the next update.</div></div>'; return; }
  injMergeLocal(d);
  document.getElementById('inj-sub').textContent = `Data up to ${fmtDay(d.as_of, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const name = (pid) => { const p = d.players.find((x) => x.id === pid); return p ? p.name : pid; }, pos = (pid) => { const p = d.players.find((x) => x.id === pid); return p ? p.pos || '' : ''; };
  const recent = addDays(d.as_of, -14);
  const cur = Object.keys(I.players).map((pid) => ({ pid, s: injCur(d, pid) })).filter(({ s }) => s && ((INJ_OPEN.includes(s.state) && injRecent(s, d.as_of)) || s.state === 'out' || (s.state === 'interrupted' && s.back >= addDays(d.as_of, -42)) || (s.state === 'complete' && s.complete && s.complete.date >= recent)))
    .sort((a, b) => ({ out: 0, behind: 1, not_back: 1, first_week: 2, on_track: 2, interrupted: 3, complete: 4 }[a.s.state] - { out: 0, behind: 1, not_back: 1, first_week: 2, on_track: 2, interrupted: 3, complete: 4 }[b.s.state]) || String(b.s.back || b.s.start).localeCompare(String(a.s.back || a.s.start)));
  const pct = (s, k) => { if (s.state === 'interrupted') return '<span class="muted">—</span>'; const w = s.weeks.filter((x) => x.ok || (!x.done && x.days >= 3)).slice(-1)[0]; return w && w.pct[k] != null ? `${w.pct[k]}%` : '<span class="muted">—</span>'; };
  const tick = (s, k) => (s.ms && s.ms[k] != null ? `✓ day ${s.ms[k]}` : '<span class="muted">not yet</span>');
  const rows = cur.map(({ pid, s }) => `<tr data-pl="${pid}"><td><b>${escapeHtml(name(pid))}</b> <small class="muted">${escapeHtml(pos(pid))}</small></td><td>${injClsChip(I, s)}${s.med ? `<small class="muted inj-reg">${escapeHtml(s.med.region || '')}</small>` : ''}</td>
    <td class="c">${s.back ? injDay(s.back) : '<span class="muted">—</span>'}</td><td class="c">${s.back ? `${Math.min(s.win, s.weeks.length || 1)} / ${s.win}` : '—'}</td><td class="c">${s.back ? pct(s, 'td') : '—'}</td><td class="c">${s.back ? pct(s, 'hit') : '—'}</td><td class="c">${s.back ? pct(s, 'spr') : '—'}</td>
    <td class="c">${s.back ? tick(s, 'v90') : '—'}</td><td class="c">${s.back ? tick(s, 'm60') : '—'}</td><td>${injStateChip(s)}${injFastChip(I, s)}</td></tr>`).join('');
  const y = d.as_of.slice(0, 4), m = +d.as_of.slice(5, 7), season = `${m >= 7 ? y : y - 1}-07-01`;
  const all = Object.entries(I.players).flatMap(([pid, rs]) => rs.filter((s) => (s.inj_date || s.start) >= season).map((s) => ({ pid, s }))).sort((a, b) => String(b.s.inj_date || b.s.start).localeCompare(String(a.s.inj_date || a.s.start)));
  const reg = {}; all.forEach(({ s }) => { if (s.med && s.med.region) reg[s.med.region] = (reg[s.med.region] || 0) + 1; });
  const smk = bodyMapMarks(all.filter(({ s }) => s.med).map(({ s }) => s.med));
  box.innerHTML = `${injCanEdit() ? '<div id="inj-entry-box"></div>' : ''}<section class="panel"><div class="panel-head"><h2 class="panel-title">In their return</h2><span class="panel-note">out now, in the return window of their injury, or back to their load in the last 2 weeks · click a player: his sheet</span></div>
      ${rows ? `<div class="table-wrap"><table class="dtable inj-tb"><thead><tr><th>Player</th><th>Injury</th><th class="c">Back</th><th class="c">Week</th><th class="c">Total dist.</th><th class="c">&gt; 20 km/h</th><th class="c">Sprint</th><th class="c">≥ 90 % Vmax</th><th class="c">60 min match</th><th>Where he is</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nobody in a return.</div>'}
      <p class="muted sm" style="margin:10px 0 0">Short ≤ 7 days out (watched 2 weeks) · medium 8–21 days (4 weeks) · long ≥ 22 days (6 weeks) · % = his last week against his 4 normal weeks before · "where he is" = against the usual return of the same length (our ${I.n.short + I.n.medium + I.n.long} returns since 2024) · return complete = ≥ 90 % of his max speed + back to 90 % of his load (a congested week compared with his congested weeks) or a 60 min match at his usual intensity.</p></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">This season</h2><span class="panel-note">${all.length} injuries since ${injDayY(season)}${Object.keys(reg).length ? ' · ' + Object.entries(reg).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${escapeHtml(r)} ${n}`).join(' · ') : ''}</span></div>
      <div class="inj-season"><div class="inj-smap">${bodyMapHtml(smk, { w: 128 })}${bodyMapLegend()}</div>
      <div class="table-wrap"><table class="dtable inj-tb"><thead><tr><th>Date</th><th>Player</th><th>Injury</th><th>Out</th><th>Return</th></tr></thead><tbody>${all.map(({ pid, s }) =>
        `<tr data-pl="${pid}"><td>${injDay(s.inj_date || s.start)}</td><td><b>${escapeHtml(name(pid))}</b></td><td>${s.med ? escapeHtml(injMedTxt(s.med)) : '<span class="muted">to complete</span>'}${injCanEdit() ? `<button type="button" class="inj-ed" data-ed="${pid}|${s.start}" title="Edit the details">✎</button>` : ''}</td><td>${injClsChip(I, s)}</td><td>${s.cls ? injStateChip(s) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
  box.querySelectorAll('[data-pl]').forEach((r) => { r.style.cursor = 'pointer'; r.onclick = () => switchView('player', { player: r.dataset.pl }); });
  box.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); const [pid, st] = b.dataset.ed.split('|'); injOpen(pid, st); }; });
  if (injCanEdit()) {
    const w = INJ.want && injTodo(d).find((x) => x.pid === INJ.want);
    INJ.want = '';
    if (w) injOpen(w.pid, w.s.start); else injEntryDraw();
  }
}

/* ------------------------------------------------------------------ entry of the details (his choice, 2026-11-07: body map A)
 * "To complete" = this season's injuries of 5 days or more (from the GPS statuses) without their details; one tap on the muscle
 * gives the region and the side, chips the rest. Saved in the club's database (Cloudflare D1, /api/injuries — medical staff and
 * admin only, who / when kept) and shown at once; the next update links them to the returns. Local demo: kept in this browser. */
const INJ_MED_KEYS = ['type', 'region', 'side', 'onset', 'mechanism', 'where', 'severity', 'recur'];
const INJ_CHIPS = [
  ['type', 'Type', ['Muscle', 'Tendon', 'Ligament / sprain', 'Bone', 'Contusion', 'Other']], ['onset', 'Onset', ['Sudden', 'Gradual']],
  ['mechanism', 'Contact', ['Contact', 'Non-contact']], ['where', 'During', ['Training', 'Match', 'Other']], ['recur', 'New / recurrence', [['new', 'New'], ['recurrence', 'Recurrence']]],
  ['severity', 'Expected time out', ['≤ 1 week', '1–3 weeks', '3–6 weeks', '> 6 weeks']],
];
const INJ_LOCAL = 'demo_medical_v1';
const injCanEdit = () => AUTH.demo || isAdminUi() || ['admin', 'medical'].includes((AUTH.user || {}).role);
function injLocal() { try { return JSON.parse(localStorage.getItem(INJ_LOCAL) || '[]'); } catch (e) { return []; } }
/** A saved detail on the payload (so the pages show it at once): on its return (the spell it was entered for, else the one
 * starting 10 days after to 3 days before the injury day, as the build links them), else as an injury under 5 days. */
function injApply(d, rec) {
  const I = injAll(d);
  if (!I) return;
  const med = Object.fromEntries(INJ_MED_KEYS.map((k) => [k, rec[k] || ''])), rows = I.players[rec.pid] || (I.players[rec.pid] = []);
  let s = rec.spell ? rows.find((x) => x.start === rec.spell) : null;
  if (!s) s = rows.find((x) => x.med && (x.inj_date || x.start) === rec.date);
  if (!s) s = rows.find((x) => x.cls && !x.med && daysBetween(x.start, rec.date) >= -10 && daysBetween(x.start, rec.date) <= 3);
  if (s) { s.med = med; if (s.cls) s.inj_date = rec.date; else { s.start = rec.date; s.out = +rec.days || s.out || 0; } }
  else rows.push({ start: rec.date, out: +rec.days || 0, cls: null, short_spell: true, med });
  rows.sort((a, b) => String(b.inj_date || b.start).localeCompare(String(a.inj_date || a.start)));
}
function injMergeLocal(d) {
  if (!AUTH.demo || !d || !injAll(d) || d._medLocal) return;
  d._medLocal = true;
  injLocal().forEach((r) => injApply(d, r));
}
async function injSave(rec) {
  if (AUTH.demo) {
    const all = injLocal().filter((x) => !(x.pid === rec.pid && (x.date === rec.date || (rec.spell && x.spell === rec.spell))));
    all.push(rec);
    try { localStorage.setItem(INJ_LOCAL, JSON.stringify(all)); } catch (e) { /* private mode: shown until the page reloads */ }
  } else {
    const r = await fetch('/api/injuries', { method: 'POST', headers: { ...cfHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    cfRebuild(); // the returns and the reports with it, a few minutes later
  }
  injApply(WL.data, rec);
}
/** This season's returns without their details. */
function injTodo(d) {
  const I = injAll(d), y = d.as_of.slice(0, 4), m = +d.as_of.slice(5, 7), season = `${m >= 7 ? y : y - 1}-07-01`;
  return Object.entries(I.players).flatMap(([pid, rs]) => rs.filter((s) => s.cls && !s.med && s.start >= season).map((s) => ({ pid, s })))
    .sort((a, b) => String(b.s.start).localeCompare(String(a.s.start)));
}
/** Open the form on a return (pid + its first day out) or on a new injury (no pid). */
function injOpen(pid, start) {
  const d = WL.data, rows = pid ? injOf(d, pid) : [], s = rows.find((x) => x.start === start) || null, m = (s && s.med) || {};
  INJ.form = { pid: pid || '', spell: s && s.cls ? s.start : '', date: (s && (s.inj_date || s.start)) || addDays(d.as_of, -1), days: s && !s.cls ? s.out || '' : '',
    extra: !s || !s.cls, edit: !!(s && s.med), ...Object.fromEntries(INJ_MED_KEYS.map((k) => [k, m[k] || ''])) };
  if (!INJ.form.recur) INJ.form.recur = 'new';
  INJ.msg = '';
  injEntryDraw();
  const box = document.getElementById('inj-entry-box');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function injEntryDraw() {
  const box = document.getElementById('inj-entry-box'), d = WL.data;
  if (!box || !d) return;
  const todo = injTodo(d), F = INJ.form, P = (pid) => d.players.find((x) => x.id === pid) || { name: pid, pos: '' };
  const ini = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const list = todo.map(({ pid, s }) => `<button type="button" class="inj-todo${F && F.pid === pid && F.spell === s.start ? ' sel' : ''}" data-todo="${pid}|${s.start}">
      <span class="inj-av">${escapeHtml(ini(P(pid).name))}</span><span class="inj-tn"><b>${escapeHtml(P(pid).name)}</b><small>${escapeHtml(P(pid).pos || '')} · ${s.back ? `${injDay(s.start)} → ${injDay(addDays(s.back, -1))}` : `out since ${injDay(s.start)}`}</small></span>
      ${s.back ? '<span class="inj-st green">back</span>' : '<span class="inj-st red">out now</span>'}</button>`).join('') || '<div class="muted sm" style="padding:6px 2px 10px">Every injury of the season has its details.</div>';
  let form = '<div class="inj-fempty">Choose an injury on the left, or add another one.</div>';
  if (F) {
    const who = F.pid ? P(F.pid).name : 'New injury', central = BM_CENTRAL.includes(F.region);
    const where = F.region ? `${central ? '' : F.side === 'R' ? 'Right ' : F.side === 'L' ? 'Left ' : F.side === 'B' ? 'Both sides · ' : ''}${central || !F.side ? F.region : F.region.toLowerCase()}` : 'Tap the injured zone on the body';
    const chip = (k, v, l) => `<button type="button" class="inj-chip${F[k] === v ? ' on' : ''}${k === 'type' ? ' t' : ''}" data-k="${k}" data-v="${escapeHtml(v)}">${escapeHtml(l)}</button>`;
    const groups = INJ_CHIPS.map(([k, lab, opts]) => `<div class="inj-g${k === 'type' || k === 'severity' ? ' wide' : ''}"><div class="inj-gl">${lab}</div><div class="inj-chips">${opts.map((o) => (Array.isArray(o) ? chip(k, o[0], o[1]) : chip(k, o, o))).join('')}</div></div>`).join('');
    const sides = F.region && !central ? `<div class="inj-chips" style="justify-content:center;margin-top:6px">${[['L', 'Left'], ['R', 'Right'], ['B', 'Both']].map(([v, l]) => chip('side', v, l)).join('')}</div>` : '';
    const extra = F.extra ? `<div class="inj-xtra"><label>Player<select data-f="pid"><option value="">—</option>${d.players.map((p) => `<option value="${p.id}"${p.id === F.pid ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
        <label>Day of the injury<input type="date" data-f="date" value="${F.date}" max="${d.as_of}"></label><label>Days out<input type="number" data-f="days" min="0" max="400" value="${F.days}" placeholder="0"></label></div>` : '';
    form = `<div class="inj-fh"><b>${escapeHtml(who)}${F.extra ? '' : ` · injury of ${injDayY(F.date)}`}</b><span class="inj-priv">🔒 medical staff and admin only</span></div>
      ${F.extra ? '' : `<div class="muted sm">Day of the injury taken from the data (first day out): <input type="date" data-f="date" value="${F.date}" max="${d.as_of}" class="inj-date"> — change it if the injury happened earlier.</div>`}${extra}
      <div class="inj-fb"><div class="inj-fmap">${bodyMapHtml({}, { picking: true, pick: F.region ? { region: F.region, side: F.side } : null, w: 118 })}<div class="inj-where">${escapeHtml(where)}</div>${sides}</div>
        <div class="inj-groups">${groups}</div></div>
      <div class="inj-ff"><span class="muted sm">${INJ.msg ? `<b class="${INJ.err ? 'red' : 'green'}">${escapeHtml(INJ.msg)}</b>` : `Saved with who / when · editable later${AUTH.demo ? ' · demo: kept in this browser' : ''}`}</span>
        <span><button type="button" class="btn-g" data-act="later">${F.edit ? 'Cancel' : 'Later'}</button><button type="button" class="btn-p" data-act="save">Save</button></span></div>`;
  }
  box.innerHTML = `<section class="panel inj-entry"><div class="panel-head"><h2 class="panel-title">To complete${todo.length ? ` <span class="inj-cnt">${todo.length}</span>` : ''}</h2><span class="panel-note">new injured / rehab status in the GPS data: add the details once — they appear on the body maps and the player's sheet</span></div>
    <div class="inj-ent"><div class="inj-list">${list}<button type="button" class="inj-new" data-act="new">+ Another injury</button></div><div class="inj-form">${form}</div></div></section>`;
  box.querySelectorAll('[data-todo]').forEach((b) => { b.onclick = () => { const [pid, st] = b.dataset.todo.split('|'); injOpen(pid, st); }; });
  box.querySelector('[data-act="new"]').onclick = () => injOpen('', '');
  if (!F) return;
  box.querySelectorAll('.bm-hit').forEach((z) => { z.onclick = () => { F.region = z.dataset.r; F.side = z.dataset.s || ''; INJ.msg = ''; injEntryDraw(); }; });
  box.querySelectorAll('[data-k]').forEach((c) => { c.onclick = () => { F[c.dataset.k] = F[c.dataset.k] === c.dataset.v && c.dataset.k !== 'side' ? '' : c.dataset.v; INJ.msg = ''; injEntryDraw(); }; });
  box.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => { F[i.dataset.f] = i.value; if (i.dataset.f === 'pid') injEntryDraw(); }; });
  box.querySelector('[data-act="later"]').onclick = () => { INJ.form = null; injEntryDraw(); };
  box.querySelector('[data-act="save"]').onclick = async () => {
    const miss = !F.pid ? 'the player' : !F.region ? 'the zone (tap the body)' : !F.type ? 'the type' : !/^\d{4}-\d{2}-\d{2}$/.test(F.date) ? 'the day' : '';
    if (miss) { INJ.msg = `Missing: ${miss}`; INJ.err = true; injEntryDraw(); return; }
    const rec = { pid: F.pid, date: F.date, days: F.extra ? F.days : '', spell: F.spell || '', ...Object.fromEntries(INJ_MED_KEYS.map((k) => [k, F[k] || ''])) };
    try {
      await injSave(rec);
      INJ.form = null; INJ.msg = '';
      drawInjuries();
    } catch (e) { INJ.msg = `Not saved: ${e.message}`; INJ.err = true; injEntryDraw(); }
  };
}
