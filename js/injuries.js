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
/** % of his week before, week by week, over the band of the usual return of his class. */
function injCurve(I, s, k, lab) {
  const nw = s.win, W = 520, H = 170, L = 38, R = 40, T = 14, Bm = 26, band = (I.bands[s.cls] || {})[k] || [];
  const x = (i) => L + (nw > 1 ? i * (W - L - R) / (nw - 1) : (W - L - R) / 2), y = (p) => T + (1 - Math.min(Math.max(p, 0), 160) / 160) * (H - T - Bm);
  let g = `<svg viewBox="0 0 ${W} ${H}" class="inj-cv" role="img" aria-label="${escapeHtml(lab)}"><text x="${L}" y="10" class="ct">${escapeHtml(lab)}</text>`;
  [0, 50, 100, 150].forEach((p) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="${p === 100 ? 'g100' : 'gl'}"/><text x="${L - 6}" y="${y(p) + 4}" class="ax" text-anchor="end">${p}%</text>`; });
  for (let i = 0; i < nw; i++) g += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">week ${i + 1}</text>`;
  const b = band.map((v, i) => [i, v]).filter(([, v]) => v);
  if (b.length) {
    g += `<polygon points="${b.map(([i, v]) => `${x(i).toFixed(1)},${y(v[2]).toFixed(1)}`).join(' ')} ${b.slice().reverse().map(([i, v]) => `${x(i).toFixed(1)},${y(v[0]).toFixed(1)}`).join(' ')}" class="bd"/>`;
    g += `<polyline points="${b.map(([i, v]) => `${x(i).toFixed(1)},${y(v[1]).toFixed(1)}`).join(' ')}" class="md"/>`;
  }
  g += `<line x1="${L}" x2="${W - R}" y1="${y(90)}" y2="${y(90)}" class="g90"/><text x="${W - R + 4}" y="${y(90) + 4}" class="ax">90%</text>`;
  const pts = s.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => i < nw && w.pct[k] != null && (w.ok || (!w.done && w.days >= 3)));
  if (pts.length) {
    const done = pts.filter(({ w }) => w.done);
    if (done.length > 1) g += `<polyline points="${done.map(({ w, i }) => `${x(i).toFixed(1)},${y(w.pct[k]).toFixed(1)}`).join(' ')}" class="pl"/>`;
    pts.forEach(({ w, i }) => { g += `<circle cx="${x(i).toFixed(1)}" cy="${y(w.pct[k]).toFixed(1)}" r="${w.done ? 5 : 4}" class="${w.done ? 'pd' : 'po'}"><title>week ${i + 1}${w.done ? '' : ' so far'} · ${w.pct[k]} % of his week before${w.nm ? ` · ${w.nm} match${w.nm > 1 ? 'es' : ''}` : ''}</title></circle>`; });
    const l = pts[pts.length - 1]; g += `<text x="${(x(l.i) + 9).toFixed(1)}" y="${(y(l.w.pct[k]) + 4).toFixed(1)}" class="pv">${l.w.pct[k]}%</text>`;
  }
  return g + '</svg>';
}
function injMilestones(I, s) {
  const u = (I.ms_usual || {})[s.cls] || {};
  return `<div class="inj-msr">${INJ_MS.map(([k, l]) => { const n = s.ms ? s.ms[k] : null, ok = n != null;
    return `<div class="inj-ms${ok ? ' ok' : ''}"><i>${ok ? '✓' : ''}</i><div><b>${l}</b><small>${ok ? `day ${n} · ${injDay(addDays(s.back, n))}` : 'not yet'}${u[k] != null ? ` · usual for a ${I.classes[s.cls].label.toLowerCase()} injury: day ${u[k]}` : ''}</small></div></div>`; }).join('')}</div>`;
}
/** Workload › Player: the return card, while his return is open (admin). */
function injCardHtml(d, p) {
  const I = injAll(d), s = injCur(d, p.id);
  if (!I || !s || !INJ_OPEN.includes(s.state) || !injRecent(s, d.as_of, 7)) return '';
  const pre = s.pre, wk = Math.min(s.win, s.weeks.length || 1);
  const ref = pre ? `His week before the injury (4 normal weeks): total distance ${(pre.td / 1000).toFixed(1)} km · > 20 km/h ${pre.hit} m · sprint ${pre.spr} m · Acc + Dec ${pre.acc_dec}` : 'No normal week before the injury to compare with.';
  return `<section class="panel inj-card"><div class="inj-ph"><div style="flex:1"><div class="inj-t">Return from injury</div>
      <div class="muted">${s.med ? escapeHtml(injMedTxt(s.med)) + ' · ' : ''}out ${s.out} days from ${injDay(s.inj_date || s.start)} · back on ${injDay(s.back)} · week ${wk} of ${s.win}</div></div>${injClsChip(I, s, true)}${injStateChip(s)}</div>
    <div class="muted sm" style="margin:10px 0 4px">${ref}</div>
    ${pre ? `<div class="inj-g2">${injCurve(I, s, 'td', 'Total distance · % of his week before')}${injCurve(I, s, 'hit', '> 20 km/h · % of his week before')}</div>
    <div class="inj-lg"><span><i class="l1"></i>${escapeHtml(p.name)}</span><span><i class="l2"></i>usual return after a ${I.classes[s.cls].label.toLowerCase()} injury at the club (middle half of our ${I.n[s.cls]} returns since 2024)</span><span><i class="l3"></i>median</span><span><i class="l4"></i>90 % = back to his load</span></div>` : ''}
    ${injMilestones(I, s)}
    <p class="muted sm" style="margin:10px 0 0">Return complete = ≥ 90 % of his max speed touched, and 90 % of his week before on total distance and > 20 km/h (a congested week compared with his congested weeks; ${s.cls === 'short' ? '1 week' : '2 weeks running'}) or a 60 min match at his usual intensity.</p></section>`;
}
/** Workload › Player, at the bottom: his injuries (admin; in place of the physical tests). */
function injHistoryHtml(d, p) {
  const I = injAll(d), rows = injOf(d, p.id);
  if (!I) return '<div class="empty">Not computed yet.</div>';
  if (!rows.length) return '<div class="empty">No injury of 5 days or more in the data (since 2024), none on the medical list.</div>';
  return `<div class="table-wrap"><table class="dtable inj-tb"><thead><tr><th>Date</th><th>Injury</th><th>Out</th><th>Return</th><th class="c">≥ 90 % Vmax</th><th class="c">60 min match</th></tr></thead><tbody>${rows.map((s) =>
    `<tr><td>${injDayY(s.inj_date || s.start)}</td><td>${s.med ? escapeHtml(injMedTxt(s.med)) : '<span class="muted">status in the Excel</span>'}</td><td>${injClsChip(I, s)}</td>
      <td>${s.cls ? injStateChip(s) : '<span class="muted">—</span>'}</td><td class="c">${s.ms && s.ms.v90 != null ? 'day ' + s.ms.v90 : '<span class="muted">—</span>'}</td><td class="c">${s.ms && s.ms.m60 != null ? 'day ' + s.ms.m60 : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted sm" style="margin:8px 0 0">Injuries of 5 days or more from the statuses of the Excel (injured / rehab, since 2024), with the details of the medical department's list when it has them · days of the milestones counted from his first day back.</p>`;
}

/* Workload › Injuries */
const INJ = {};
function renderInjuries() {
  const root = document.getElementById('view-injuries');
  root.innerHTML = `<div class="sv-bleed">${pageHead('Workload', 'Injuries', 'inj-sub', '<span class="tc-lock">🔒 only you see this page</span>')}<div id="inj-body"><div class="panel"><div class="empty">Loading…</div></div></div></div>`;
  withData('workload', (d) => { WL.data = d; drawInjuries(); }, (err) => { root.innerHTML = loadError(err); });
}
function drawInjuries() {
  const d = WL.data, box = document.getElementById('inj-body');
  if (!d || !box || document.getElementById('view-injuries').hidden) return;
  const I = injAll(d);
  if (!I) { box.innerHTML = '<div class="panel"><div class="empty">Not computed yet — at the next update.</div></div>'; return; }
  document.getElementById('inj-sub').textContent = `Data up to ${fmtDay(d.as_of, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const name = (pid) => { const p = d.players.find((x) => x.id === pid); return p ? p.name : pid; }, pos = (pid) => { const p = d.players.find((x) => x.id === pid); return p ? p.pos || '' : ''; };
  const recent = addDays(d.as_of, -14);
  const cur = Object.keys(I.players).map((pid) => ({ pid, s: injCur(d, pid) })).filter(({ s }) => s && ((INJ_OPEN.includes(s.state) && injRecent(s, d.as_of)) || s.state === 'out' || (s.state === 'interrupted' && s.back >= addDays(d.as_of, -42)) || (s.state === 'complete' && s.complete && s.complete.date >= recent)))
    .sort((a, b) => ({ out: 0, behind: 1, not_back: 1, first_week: 2, on_track: 2, interrupted: 3, complete: 4 }[a.s.state] - { out: 0, behind: 1, not_back: 1, first_week: 2, on_track: 2, interrupted: 3, complete: 4 }[b.s.state]) || String(b.s.back || b.s.start).localeCompare(String(a.s.back || a.s.start)));
  const pct = (s, k) => { if (s.state === 'interrupted') return '<span class="muted">—</span>'; const w = s.weeks.filter((x) => x.ok || (!x.done && x.days >= 3)).slice(-1)[0]; return w && w.pct[k] != null ? `${w.pct[k]}%` : '<span class="muted">—</span>'; };
  const tick = (s, k) => (s.ms && s.ms[k] != null ? `✓ day ${s.ms[k]}` : '<span class="muted">not yet</span>');
  const rows = cur.map(({ pid, s }) => `<tr data-pl="${pid}"><td><b>${escapeHtml(name(pid))}</b> <small class="muted">${escapeHtml(pos(pid))}</small></td><td>${injClsChip(I, s)}${s.med ? `<small class="muted inj-reg">${escapeHtml(s.med.region || '')}</small>` : ''}</td>
    <td class="c">${s.back ? injDay(s.back) : '<span class="muted">—</span>'}</td><td class="c">${s.back ? `${Math.min(s.win, s.weeks.length || 1)} / ${s.win}` : '—'}</td><td class="c">${s.back ? pct(s, 'td') : '—'}</td><td class="c">${s.back ? pct(s, 'hit') : '—'}</td><td class="c">${s.back ? pct(s, 'spr') : '—'}</td>
    <td class="c">${s.back ? tick(s, 'v90') : '—'}</td><td class="c">${s.back ? tick(s, 'm60') : '—'}</td><td>${injStateChip(s)}</td></tr>`).join('');
  const y = d.as_of.slice(0, 4), m = +d.as_of.slice(5, 7), season = `${m >= 7 ? y : y - 1}-07-01`;
  const all = Object.entries(I.players).flatMap(([pid, rs]) => rs.filter((s) => (s.inj_date || s.start) >= season).map((s) => ({ pid, s }))).sort((a, b) => String(b.s.inj_date || b.s.start).localeCompare(String(a.s.inj_date || a.s.start)));
  const reg = {}; all.forEach(({ s }) => { if (s.med && s.med.region) reg[s.med.region] = (reg[s.med.region] || 0) + 1; });
  box.innerHTML = `<section class="panel"><div class="panel-head"><h2 class="panel-title">In their return</h2><span class="panel-note">out now, in the return window of their injury, or back to their load in the last 2 weeks · click a player: his sheet</span></div>
      ${rows ? `<div class="table-wrap"><table class="dtable inj-tb"><thead><tr><th>Player</th><th>Injury</th><th class="c">Back</th><th class="c">Week</th><th class="c">Total dist.</th><th class="c">&gt; 20 km/h</th><th class="c">Sprint</th><th class="c">≥ 90 % Vmax</th><th class="c">60 min match</th><th>Where he is</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nobody in a return.</div>'}
      <p class="muted sm" style="margin:10px 0 0">Short ≤ 7 days out (watched 2 weeks) · medium 8–21 days (4 weeks) · long ≥ 22 days (6 weeks) · % = his last week against his 4 normal weeks before · "where he is" = against the usual return of the same length (our ${I.n.short + I.n.medium + I.n.long} returns since 2024) · return complete = ≥ 90 % of his max speed + back to 90 % of his load (a congested week compared with his congested weeks) or a 60 min match at his usual intensity.</p></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">This season</h2><span class="panel-note">${all.length} injuries since ${injDayY(season)}${Object.keys(reg).length ? ' · ' + Object.entries(reg).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${escapeHtml(r)} ${n}`).join(' · ') : ''}</span></div>
      <div class="table-wrap"><table class="dtable inj-tb"><thead><tr><th>Date</th><th>Player</th><th>Injury</th><th>Out</th><th>Return</th></tr></thead><tbody>${all.map(({ pid, s }) =>
        `<tr data-pl="${pid}"><td>${injDay(s.inj_date || s.start)}</td><td><b>${escapeHtml(name(pid))}</b></td><td>${s.med ? escapeHtml(injMedTxt(s.med)) : '<span class="muted">status in the Excel</span>'}</td><td>${injClsChip(I, s)}</td><td>${s.cls ? injStateChip(s) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
  box.querySelectorAll('[data-pl]').forEach((r) => { r.style.cursor = 'pointer'; r.onclick = () => switchView('player', { player: r.dataset.pl }); });
}
