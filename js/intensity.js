/**
 * Training › Intensity (2026-10-16, his physical coach's pick; every week and full width 2026-10-18): the WCS of the week (each player's best passage,
 * % of his WCS 1 / 3 / 5 min; the gap match vs training; each drill against the WCS of its kind) and the RHIE (each session
 * and drill against a match, the season's matches, each player's week, his profile in a match and in training).
 * Data: the `intensity` payload (sync/intensity.py): {gps, mref, rhie: {…, matches}, weeks: [{label, ws, we, matches, opp, train, best, gap, n90, nbest}]}.
 */
const IN = { data: null, state: { tab: 'wcs' } };

function renderIntensity() {
  const root = document.getElementById('view-intensity');
  root.innerHTML = '<div class="wc" id="in-body"><div class="panel"><div class="empty">Loading…</div></div></div>';
  root.addEventListener('click', (e) => { const s = e.target.closest('[data-v]'), g = s && s.parentElement.dataset.k; if (!g || !IN.data) return; if (g === 'wk') { const n = IN.data.weeks.length, i = Math.max(0, Math.min(n - 1, IN.state.wk + (s.dataset.v === 'next' ? 1 : -1))); if (i === IN.state.wk) return; IN.state.wk = i; IN.state.day = IN.state.rday = null; } else IN.state[g] = s.dataset.v; drawIntensity(); });
  withData('intensity', (d) => { IN.data = d; if (IN.state.wk == null || IN.state.wk >= (d.weeks || []).length) IN.state.wk = Math.max(0, (d.weeks || []).length - 1); drawIntensity(); }, (err) => { root.innerHTML = loadError(err); });
}

function drawIntensity() {
  if (!IN.data || document.getElementById('view-intensity').hidden) return;

  const D = IN.data, S = IN.state, WK = (D.weeks || [])[S.wk];
  if (!WK) { document.getElementById('in-body').innerHTML = '<div class="panel"><div class="empty">No week with training in the WCS data yet.</div></div>'; return; }
  const MS = WK.matches || [], MD = MS[MS.length - 1] || null;  // the week's matches · MD = the last one (the players' week)
  const W = { ...WK, roster: D.gps, mref: D.mref, week: { ws: WK.ws, we: WK.we, label: WK.label, match: MD, opp: (WK.opp || {})[MD] || '' },
    rhie: { ...D.rhie, match: (MD && D.rhie.matches[MD]) || {} } };
  const RH = W.rhie, m10 = RH.m10, m90 = m10 * 9;
  const DS = Object.keys(W.train).sort();
  if (!S.day || !W.train[S.day]) S.day = DS.find((d) => W.train[d].drills.length) || DS[0];
  if (!S.rday || !W.train[S.rday]) S.rday = DS.find((d) => (W.train[d].rhie.drills || []).length) || DS[0];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], dl = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MON[d.getMonth()]}`; };
  const DOW = (iso) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00').getDay()];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nameOf = (n) => (W.roster[n] || {}).name || n, posOf = (n) => (W.roster[n] || {}).pos || '';
  const short = (t) => { const m = String(t).match(/^\s*([A-Za-z]+)\s*-\s*(\d+v\d+)(\+[1-9]\d*J)?/i); return m ? `${m[1]} ${m[2]}${m[3] || ''}${/speed/i.test(t) ? ' · speed' : ''}` : String(t).replace(/\s*-\s*/g, ' · ').trim(); };
  const mean = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b), n = v.length; return n ? Math.round(n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };
  const addv = (a, b) => a.map((x, i) => x + ((b || [0, 0, 0])[i] || 0)), sumK = (xs, k) => xs.reduce((a, x) => addv(a, x && x[k]), [0, 0, 0]);
  const O = ['CD', 'WD', 'CM', 'WM', 'FW'], PL = { CD: 'Centre-backs', WD: 'Full-backs', CM: 'Central midfielders', WM: 'Wide midfielders', FW: 'Forwards' };
  const days = DS;
  const byPos = (ns) => ns.filter((n) => posOf(n) && posOf(n) !== 'GK').sort((a, b) => O.indexOf(posOf(a)) - O.indexOf(posOf(b)) || nameOf(a).localeCompare(nameOf(b)));
  const pc = (p) => (p == null ? 'pna' : p >= 100 ? 'p100' : p >= 90 ? 'p90' : p >= 80 ? 'p80' : p >= 60 ? 'p60' : 'p0');
  const cell = (p) => `<span class="wc-pc ${pc(p)}">${p == null ? '–' : p + ' %'}</span>`;
  const q = (p) => (p == null ? 'q1' : p >= 100 ? 'q5' : p >= 70 ? 'q4' : p >= 40 ? 'q3' : p > 0 ? 'q2' : 'q1');
  const tyBar = (ty) => { const T = (ty || []).reduce((a, b) => a + b, 0); if (!T) return '<span class="wc-mu">–</span>'; return `<div class="rh-ty">${ty.map((v, i) => (v > 0 ? `<i class="${'smx'[i]}" style="flex:${v} 1 0">${v / T >= 0.15 ? Math.round(v / T * 100) : ''}</i>` : '')).join('')}</div>`; };
  const vbar = (p) => (p == null ? '<span class="wc-mu">–</span>' : `<div class="rh-vb"><div class="t"><i style="width:${Math.min(100, p / 180 * 100)}%;background:${p >= 100 ? '#1f7a3d' : p >= 70 ? '#34c759' : p >= 40 ? '#ffc56b' : '#f4a3a3'}"></i><u></u></div><b>${Math.round(p)} %</b></div>`);
  const LEG = `<div class="rh-lg"><span><i style="background:#16269e"></i>Sprint bout · half of its actions or more above 20 km/h</span><span><i style="background:#6f80dc"></i>Mixed</span><span><i style="background:#c8cff2"></i>Acc / Dec · none above 20 km/h</span><span class="wc-mu">numbers = % of the bouts</span></div>`;
  const WL = ['1 min', '3 min', '5 min'];
  function autoWin(t) { if (/warm|strength|gym|activation|individual|rehab/i.test(t)) return null; if (/speed|sprint|velocid|\bacc|\bdec|agil/i.test(t)) return 0; const m = t.match(/(\d+)\s*v\s*(\d+)/i), s = m ? Math.max(+m[1], +m[2]) : 0; return s >= 8 ? 2 : s && s <= 2 ? 0 : 1; }
  const chips = (k, cur) => `<div class="wc-chips" data-k="${k}">${days.map((d) => `<span data-v="${d}" class="${d === cur ? 'on' : ''}">${DOW(d)} ${dl(d)} · ${W.train[d].md}${W.train[d].group === 'compensatory' ? ' · comp.' : ''}</span>`).join('')}</div>`;
  
  // ---------------------------------------------------------------- the WCS tab
  function wcsTab() {
    const ns = byPos(Object.keys(W.best));
    const rows = O.map((p) => { const xs = ns.filter((n) => posOf(n) === p); return xs.length ? `<tr class="pos"><td class="l" colspan="8">${p} · ${PL[p]}</td></tr>` + xs.map((n) => { const b = W.best[n];
      return `<tr><td class="l"><span class="wc-nm">${esc(nameOf(n))}${b.pos ? '<small class="wc-pr">pos. ref</small>' : ''}</span></td><td class="wc-mu">${b.n}</td>${[0, 1, 2].map((i) => `<td class="${i ? '' : 'b'}">${cell(b.td[i])}</td><td>${cell(b.hi[i])}</td>`).join('')}</tr>`; }).join('') : ''; }).join('');
    const best = `<div class="wc-card"><div class="wc-ch"><b>Best passage of the week</b><small>% of his WCS · his best 1, 3 and 5 minutes in training</small></div><div class="wc-note">WCS = the mean of his 3 best matches since 21 Aug · A/D + spr = acc and dec ≥ 3 m/s² + efforts above 20 km/h, per minute</div>
      <div class="wc-scroll"><table class="wc-t"><tr><th></th><th></th><th class="g" colspan="2">1 min</th><th class="g" colspan="2">3 min</th><th class="g" colspan="2">5 min</th></tr><tr><th class="l">Player</th><th>Sessions</th>${[0, 1, 2].map(() => '<th>m/min</th><th>A/D+spr</th>').join('')}</tr>${rows}</table></div>
      <div class="wc-leg">${[['p100', '100'], ['p90', '90'], ['p80', '80'], ['p60', '60'], ['p0', '0']].map(([c, l], i) => `<span><span class="wc-pc ${c}">${l}</span>${['100 % or more', '90 – 100 %', '80 – 90 %', '60 – 80 %', 'under 60 %'][i]}</span>`).join('')}</div></div>`;
    const gbar = (v) => `<div class="wc-bar"><i style="width:${Math.min(100, v / 160 * 100)}%;background:${v >= 100 ? '#1f7a3d' : v >= 90 ? '#34c759' : v >= 80 ? '#a8e6b9' : '#ffc56b'}"></i><em style="color:${v >= 90 ? '#fff' : 'var(--ink)'}">${Math.round(v)} %</em><span class="m80"></span><span class="m100"></span></div>`;
    const gap = `<div class="wc-card"><div class="wc-ch"><b>Match vs training — the gap</b><small>${dl(W.week.ws)} – ${dl(W.week.we)}</small></div><div class="wc-note">The squad's mean best of the week as a % of the WCS · black line = the match's worst case (100 %), dashed = 80 % · right: players at 90 % or more (1 min)</div>
      <div class="wc-gap"><span></span><span class="hd">1 min</span><span class="hd">3 min</span><span class="hd">5 min</span><span class="hd">≥ 90 %</span>${['td', 'hi'].map((k) => `<b>${k === 'td' ? 'm/min' : 'A/D + spr'}</b>${W.gap[k].map((v) => (v == null ? '<span class="wc-mu">–</span>' : gbar(v))).join('')}<span style="text-align:right">${W.n90[k]} / ${W.nbest}</span>`).join('')}</div></div>`;
    // each drill of the chosen day against the WCS of its kind
    const t = W.train[S.day], drows = t.drills.map((d) => { const w = autoWin(d.name); const P = Object.values(d.players);
      const st = (k) => { const v = P.map((p) => (w == null ? null : p.pct[k][w])).filter((x) => x != null); return { m: med(v), lo: v.length ? Math.min(...v) : null, hi: v.length ? Math.max(...v) : null, n80: v.filter((x) => x >= 80).length }; };
      return { d, w, n: P.length, td: st('td'), hi: st('hi') }; });
    const dc = (s) => `<td>${cell(s.m)}<span class="wc-rg">${s.lo == null ? '' : `${s.lo}–${s.hi} %`}</span></td>`;
    const drills = `<div class="wc-card"><div class="wc-ch"><b>Each drill against the WCS</b><small>median of the players · range below · the WCS of the drill's kind</small></div>${chips('day', S.day)}
      <div class="wc-scroll"><table class="wc-t"><tr><th class="l">Drill</th><th>Min</th><th>Players</th><th>Against</th><th>m/min</th><th>≥ 80 %</th><th>A/D + spr</th><th>≥ 80 %</th><th>Times ≥ 80 % of the 1-min WCS<br>per player · m/min · A/D</th></tr>
      ${drows.map((x) => `<tr><td class="l"><b>${esc(short(x.d.name))}</b></td><td>${x.d.min}'</td><td>${x.n}</td><td>${x.w == null ? '<span class="wc-mu">not judged</span>' : `<span class="wc-win">${WL[x.w].toUpperCase()} WCS</span>`}</td>${x.w == null ? '<td colspan="4" class="wc-mu">warm-up · strength · individual work</td>' : `${dc(x.td)}<td>${x.td.n80}/${x.n}</td>${dc(x.hi)}<td>${x.hi.n80}/${x.n}</td>`}
        <td>${(mean(Object.values(x.d.players).map((p) => p.cnt.td[0])) || 0).toFixed(1)} · ${(mean(Object.values(x.d.players).map((p) => p.cnt.hi[0])) || 0).toFixed(1)}</td></tr>`).join('')}</table></div>
      <div class="wc-note" style="margin-top:8px">Small-sided games → his best 3 min vs his 3-min WCS · larger games (8 a side +) → 5 min · speed, acc / dec and duels → 1 min · the staff can choose it in the drill's card</div></div>`;
    return `<div class="wc-row">${best}<div>${gap}${W.gap.td[0] == null ? '' : `<div class="wc-read"><b>Reading</b> · the squad reached ${Math.round(W.gap.td[0])} % of its 1-min WCS in m/min this week (${W.n90.td} of ${W.nbest} players at 90 % or more) and ${Math.round(W.gap.hi[0])} % in Acc/Dec + sprints.</div>`}</div></div>${drills}`;
  }
  
  // ---------------------------------------------------------------- the RHIE tab
  function rhieTab() {
    const r10 = (x) => (x && x.min ? x.n / x.min * 10 : null);
    const def = `<div class="rh-def"><div><b>RHIE bout</b>3 high-intensity actions or more, each starting at most 21 s after the end of the previous one</div><div><b>Actions</b>running above 20 km/h · acceleration ≥ 3 m/s² · deceleration ≤ −3 m/s² (efforts closer than 1 s = one)</div><div><b>Type</b>sprint = half of its actions or more above 20 km/h · mixed · acc / dec = none</div><div><b>A match</b>${m90.toFixed(1)} bouts per player and 90 min · ${m10.toFixed(2)} per 10 min · the season's ${RH.n} matches</div></div>`;
    // the week: sessions, then the chosen day's drills
    const mrow = (d) => { const P = Object.values(D.rhie.matches[d] || {}), b = mean(P.map((p) => p.n));
      return `<tr class="me"><td class="l">${DOW(d)} ${dl(d)} · <b>Match</b>${(WK.opp || {})[d] ? ' · ' + esc(WK.opp[d]) : ''}</td><td>${P.length}</td><td><b>${b == null ? '–' : b.toFixed(1)}</b></td><td>${(mean(P.map(r10)) || 0).toFixed(2)}</td><td>${tyBar(sumK(P, 'ty'))}</td><td>${b == null ? '–' : vbar(b / m90 * 100)}</td></tr>`; };
    const ses = days.map((d) => { const P = Object.values(W.train[d].rhie.players); return { d, md: W.train[d].md, comp: W.train[d].group === 'compensatory', n: P.length, b: mean(P.map((p) => p.n)), r: mean(P.map(r10)), ty: sumK(P, 'ty') }; });
    const week = `<div class="wc-card"><div class="wc-ch"><b>The week against a match</b><small>RHIE bouts per player · whole session ÷ a whole match</small></div>
      <div class="wc-scroll"><table class="wc-t"><tr><th class="l">Session</th><th>Players</th><th>RHIE per player</th><th>Per 10 min</th><th>Type</th><th>Vs a whole match</th></tr>
      ${[...ses.map((x) => [x.d, x]), ...MS.map((d) => [d, null])].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, x]) => (!x ? mrow(d)
        : `<tr><td class="l">${DOW(x.d)} ${dl(x.d)} · <b>${x.md}</b>${x.comp ? ' <small class="wc-mu">comp.</small>' : ''}</td><td>${x.n}</td><td><b>${x.b == null ? '–' : x.b.toFixed(1)}</b></td><td>${x.r == null ? '–' : x.r.toFixed(2)}</td><td>${tyBar(x.ty)}</td><td>${x.b == null ? '–' : vbar(x.b / m90 * 100)}</td></tr>`)).join('')}</table></div></div>`;
    const t = W.train[S.rday], dr = (t.rhie.drills || []).map((x) => { const P = Object.values(x.players), r = mean(P.map(r10)); return { name: x.name, min: x.min, n: P.length, b: mean(P.map((p) => p.n)), r, pb: mean(P.map((p) => p.pb)), ty: sumK(P, 'ty'), pct: r == null ? null : r / m10 * 100 }; });
    const drills = `<div class="wc-card"><div class="wc-ch"><b>Each drill against a match</b><small>RHIE per player per 10 min of play · line = a match</small></div>${chips('rday', S.rday)}
      <div class="wc-scroll"><table class="wc-t"><tr><th class="l">Drill</th><th>Min</th><th>Players</th><th>RHIE per player</th><th>Per 10 min</th><th>Actions per bout</th><th>Type · spr · mix · a/d</th><th>Vs the match · per 10 min</th></tr>
      ${dr.map((x) => `<tr><td class="l"><b>${esc(short(x.name))}</b></td><td>${x.min}'</td><td>${x.n}</td><td>${x.b.toFixed(1)}</td><td><b>${x.r == null ? '–' : x.r.toFixed(2)}</b></td><td>${x.pb == null ? '–' : x.pb.toFixed(1)}</td><td>${tyBar(x.ty)}</td><td>${vbar(x.pct)}</td></tr>`).join('')}</table></div>${LEG}</div>`;
    // each player: day by day against his matches
    const all7 = [...Array(7)].map((_, i) => { const d = new Date(W.week.ws + 'T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const isM = (d) => MS.includes(d), pl = (d) => (isM(d) ? D.rhie.matches[d] || {} : ((W.train[d] || {}).rhie || { players: {} }).players);
    const of = (d, n) => pl(d)[n];
    const ns = byPos([...new Set(all7.flatMap((d) => Object.keys(pl(d))))]);
    const T = {};
    days.forEach((d) => Object.entries(W.train[d].rhie.players).forEach(([n, x]) => { const e = T[n] || (T[n] = { n: 0, ty: [0, 0, 0], k: [0, 0, 0] }); e.n += x.n; e.ty = addv(e.ty, x.ty); e.k = addv(e.k, x.k); }));
    const tT = Object.values(T).reduce((a, e) => ({ n: a.n + e.n, k: addv(a.k, e.k) }), { n: 0, k: [0, 0, 0] });
    const M = Object.fromEntries(Object.entries(RH.mref).map(([n, m]) => [n, { n: m.b, k: m.k, ty: m.ty }])), tM = Object.values(M).reduce((a, e) => ({ n: a.n + e.n, k: addv(a.k, e.k) }), { n: 0, k: [0, 0, 0] });
    const sh = (k) => { const s = k[0] + k[1] + k[2]; return k.map((v) => v / Math.max(1, s)); };
    const prof = (e, t0) => { if (!e || e.n < 6) return null; const a = sh(e.k), b = sh(t0.k), ix = a.map((v, i) => v / b[i]), i = ix.indexOf(Math.max(...ix)); return ix[i] >= 1.1 ? 'SAD'[i] : 'M'; };
    const PN = { S: 'Sprint', A: 'Acceleration', D: 'Deceleration', M: 'Mixed' }, chip = (p) => (p ? `<span class="rh-pf ${p}">${PN[p]}</span>` : '<span class="wc-mu">–</span>');
    const prow = (n) => { const m = RH.mref[n], xs = all7.map((d) => of(d, n)), tot = xs.filter(Boolean).reduce((a, x) => a + x.n, 0);
      return `<tr><td class="l"><span class="wc-nm">${esc(nameOf(n))}<small>${posOf(n)}</small></span></td><td><b>${m ? m.bouts.toFixed(1) : '–'}</b></td>${xs.map((x, i) => `<td>${x ? `<span class="wc-pc ${isM(all7[i]) ? 'qm' : q(m && m.bouts ? x.n / m.bouts * 100 : null)}" style="min-width:30px">${x.n}</span>` : '<span class="wc-mu">·</span>'}</td>`).join('')}
        <td class="b"><b>${tot}</b></td><td>${tyBar(T[n] ? T[n].ty : null)}</td><td>${chip(prof(M[n], tM))}</td><td>${chip(prof(T[n], tT))}</td></tr>`; };
    const players = `<div class="wc-card"><div class="wc-ch"><b>Each player · the week against his matches</b><small>colour = the day's bouts as a % of his bouts in a match · blue = the match</small></div>
      <div class="wc-scroll"><table class="wc-t"><tr><th class="l">Player</th><th>A match</th>${all7.map((d) => `<th>${DOW(d)}<br>${isM(d) ? 'MD' : (W.train[d] || {}).md || ''}</th>`).join('')}<th class="b">Week</th><th>Type in training</th><th>Profile · match</th><th>Profile · training</th></tr>
      ${O.map((p) => { const xs = ns.filter((n) => posOf(n) === p); return xs.length ? `<tr class="pos"><td class="l" colspan="14">${p} · ${PL[p]}</td></tr>` + xs.map(prow).join('') : ''; }).join('')}</table></div>
      <div class="wc-leg">${[['q5', '100 % +'], ['q4', '70–100'], ['q3', '40–70'], ['q2', 'under 40']].map(([c, l]) => `<span><span class="wc-pc ${c}">&nbsp;</span>${l} of his match</span>`).join('')}<span>Profile = the effort he repeats 10 % more than the team (sprints, accelerations or decelerations) · training over the last 4 weeks once live</span></div></div>`;
    // the season's matches
    const SE = Object.entries(RH.season).sort(([a], [b]) => (a < b ? -1 : 1));
    const season = `<div class="wc-card"><div class="wc-ch"><b>The season's matches</b><small>RHIE per player on the pitch · 90 min</small></div>
      <div class="wc-scroll"><table class="wc-t"><tr><th class="l">Match</th><th>Players</th><th>RHIE · 90 min</th><th>Actions per bout</th><th>Longest</th><th>Recovery</th><th>% in a RHIE</th><th>Type</th></tr>
      ${SE.map(([d, r]) => `<tr class="${MS.includes(d) ? 'me' : ''}"><td class="l"><b>${dl(d)}</b></td><td>${r.pl}</td><td><b>${r.r90.toFixed(1)}</b></td><td>${r.pb == null ? '–' : r.pb.toFixed(1)}</td><td>${r.max}</td><td>${r.rec == null ? '–' : r.rec.toFixed(1) + ' s'}</td><td>${r.pin} %</td><td>${tyBar(r.ty)}</td></tr>`).join('')}</table></div></div>`;
    return def + `<div class="wc-row wc-two">${week}${season}</div>` + drills + players;
  }
  
  function render() {
    const N = D.weeks.length;
    document.getElementById('in-body').innerHTML = `<div class="sv-bleed"><div class="wc-top"><div><div class="wc-eb">Training</div><div class="wc-h1">Intensity</div><p class="wc-sub">${S.tab === 'wcs' ? 'The training against the matches\' worst case scenarios: the best passages of the week, the gap to the match, each drill against the WCS of its kind.' : 'Repeated high-intensity efforts: each session and drill against a match, each player\'s week, the type of the bouts and his profile.'}</p></div>
      <div class="wc-ctl"><span class="wc-seg" data-k="tab"><span data-v="wcs" class="${S.tab === 'wcs' ? 'on' : ''}">WCS</span><span data-v="rhie" class="${S.tab === 'rhie' ? 'on' : ''}">RHIE</span></span><span class="wc-seg in-wk" data-k="wk"><span data-v="prev" class="${S.wk ? '' : 'off'}">‹</span><span class="on">${W.week.label || 'Week'} · ${dl(W.week.ws)} – ${dl(W.week.we)}</span><span data-v="next" class="${S.wk < N - 1 ? '' : 'off'}">›</span></span></div></div>
      ${S.tab === 'wcs' ? wcsTab() : rhieTab()}</div>`;
  }
  render();
}
