/**
 * Reports — the staff's match report "Game 10min" (Downloads › Staff on a match day; his mockup of 2026-10-13).
 * Pages: 1-3 the staff report's first pages for the match (table + team strip, TD & > 20 km/h, Acc+Dec & sprints, the
 * bars in the colour of the player's z vs his usual match) · 4 the halves player by player · 5 the match every 10
 * minutes (m/min, Acc + Dec, > 20 km/h against the usual band; reading; the season's matches with their micro-cycle) ·
 * 6 the players (output vs their usual match, m/min every 10') · 7 the end of the match (who held, who dropped, against
 * each player's own usual) · 8 the peaks of intensity (best 1, 3, 5 minutes vs his record) · 9 each player's end of match
 * over his last matches · 10 the team and its last 5 matches.
 * Data: the `match_report` payload (sync/match_report.py), one block per match cut in 10-minute periods. The measures of
 * fatigue are m/min and Acc + Dec (they fall with the minutes in every match); distance > 20 km/h and sprints follow
 * the game and are shown as output only.
 */
function rpMatchStaffPages(D, MR) {
const M = MR && MR.matches && MR.matches[D.session.date];
if (!M) return '';
const L = MR.labels;
const N = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const K = (v) => (v == null ? '–' : v >= 10000 ? (v / 1000).toFixed(1) + 'k' : N(v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const zc = (z) => (z == null ? 'na' : z <= -2 ? 'vlow' : z <= -1 ? 'low' : z < 1 ? 'ok' : z < 2 ? 'up' : 'vup');
const sg = (v, d = 0) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);
const pc = (v) => (v == null ? '–' : `${sg(Math.round(v))} %`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dlab = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MON[d.getMonth()]}`; };
// the player's photo, as rpFace (by id here): in the PDF the photo is laid on top of this circle at full resolution
const face = (id) => { const ph = D.noPhotos ? '' : typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id]; return `<span class="rp-face" data-pid="${esc(id || '')}"${ph ? ` style="background-image:url('${ph}')"` : ''}></span>`; };
const chip = (z) => `<span class="mz ${zc(z)}">${z == null ? '–' : sg(z, 1)}</span>`;
const title = `${M.id || D.session.id} · ${dlab(M.date)} ${M.date.slice(0, 4)} · ${M.comp || 'Match'}${M.opp ? ' vs ' + M.opp : ''}`;
const PL = M.players, cut = PL.filter((p) => p.cuts), T = M.team, TU = M.team_usual;
const meta = [['WEEK', M.week || D.session.week], ['MD', 'MD'], ['TIME', `${M.time}'`], ['PLAYERS', String(PL.length)], ['N SESSION', M.id || D.session.id]];
const header = (kicker) => rpHeader(kicker, title, meta);
/** How a player ended the match against his usual (match_report.py: the mean z of his two last-20' changes). */
const reading = (f) => (f ? f.reading : null);
const RD = { drop: ['dropped more than usual', '#c4282d', '#fde8e8'], usual: ['as usual', '#5b6072', '#eef0f4'], held: ['held better than usual', '#17753a', '#d9f5e1'] };
const dropped = PL.filter((p) => reading(p.fat) === 'drop'), held = PL.filter((p) => reading(p.fat) === 'held');
/** The opponent's crest in a chart (the club logos of the site), or his initials in a grey disc. */
const crest = (opp, cx, y, sz = 26) => { const slug = typeof clubSlug === 'function' ? clubSlug(opp) : null;
  return slug && typeof CLUB_LOGOS !== 'undefined' && CLUB_LOGOS.has(slug) ? `<image href="img/clubs/${slug}.png" x="${cx - sz / 2}" y="${y}" width="${sz}" height="${sz}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${cx}" cy="${y + sz / 2}" r="${sz / 2 - 1}" fill="#eef0f4"/><text x="${cx}" y="${y + sz / 2 + sz * 0.13}" font-size="${(sz * 0.33).toFixed(1)}" font-weight="800" fill="#6a6f80" text-anchor="middle">${esc(typeof clubInitials === 'function' ? clubInitials(opp) : '?')}</text>`; };
const STOP = new Set((M.stop || []).map((i) => i - 1)), stopLab = [...STOP].map((i) => L[i] + '\'').join(', ');
const nocuts = PL.filter((p) => !p.cuts && p.min >= 20), partcuts = PL.filter((p) => p.cuts && p.min - p.cuts_min >= 15);

/* ---------------------------------------------------------------- page 1: the match */
function page1() {
  const tl = M.tiles, tile = (k, v, s) => `<div class="mp-tile"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const out = (k, l, u) => { const x = tl[k]; if (!x) return tile(l, '–', ''); return tile(l, `${N(x.v)}<small> ${u}</small> ${chip(x.z)}`, `usual match ${K(x.p25)}–${K(x.p75)}`); };
  const dcol = (v, u, sd) => (v == null || !u ? '' : (v - u.mean) / (u.sd || 5) <= -1 ? 'color:#c4282d' : (v - u.mean) / (u.sd || 5) >= 1 ? 'color:#17753a' : '');
  const tiles = `<div class="mp-tiles">${out('td', 'TOTAL DISTANCE', 'm')}${out('hit', 'DISTANCE > 20 KM/H', 'm')}${out('spr', 'SPRINT DISTANCE', 'm')}${out('acc_dec', 'ACC + DEC · HIGH', '')}
    ${tile('2ND HALF vs 1ST · M/MIN', `<span style="${dcol(T.chg, TU.chg)}">${pc(T.chg)}</span>`, `usual ${pc(TU.chg.mean)} · ${N(T.h1)} then ${N(T.h2)} m/min`)}
    ${tile('LAST 20\' vs FIRST 20\'', `<span style="${dcol(T.lchg, TU.lchg)}">${pc(T.lchg)}</span><small> m/min</small> <span style="${dcol(T.adchg, TU.adchg)}">${pc(T.adchg)}</span><small> acc+dec</small>`,
    `usual ${pc(TU.lchg.mean)} and ${TU.adchg ? pc(TU.adchg.mean) : '–'}`)}</div>`;

  // one chart per measure on the same ten periods: bar = this match, band = the middle half of the earlier matches, dash = their average
  const chart = (k, label, color, dec, plot, axis) => {
    const Wd = 760, x0 = 46, bw = 44, step = 66, y0 = 24, ht = 34, H = plot, B = M.bins, U = M.usual_bins;
    const mx = Math.max(...B.map((x) => (x && x[k]) || 0), ...U.map((u) => (u[k] ? u[k].p75 : 0))) * 1.14, Y = (v) => y0 + H - (v / mx) * H;
    let s = `<svg class="mp-svg" width="${Wd}" height="${y0 + H + (axis ? 32 : 6)}" viewBox="0 0 ${Wd} ${y0 + H + (axis ? 32 : 6)}"><text x="0" y="11" font-size="10.5" font-weight="800" fill="#a52a2a">${label}</text>`;
    const raw = mx / 3, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((f) => f >= raw);
    for (let g = st; g < mx; g += st) s += `<line x1="${x0 - 6}" x2="${Wd}" y1="${Y(g)}" y2="${Y(g)}" stroke="#f0f1f5"/><text x="${x0 - 10}" y="${Y(g) + 3}" font-size="9" fill="#9aa0ae" text-anchor="end">${N(g, st < 1 ? 1 : 0)}</text>`;
    B.forEach((x, i) => {
      const cx = x0 + 20 + i * step + (i >= 5 ? ht : 0), u = U[i][k], v = x && x[k];
      if (u) s += `<rect x="${cx - 4}" y="${Y(u.p75)}" width="${bw + 8}" height="${Math.max(2, Y(u.p25) - Y(u.p75))}" fill="#e3e6ee"/>`;
      if (v != null) {
        s += `<rect x="${cx + 6}" y="${Y(v)}" width="${bw - 12}" height="${y0 + H - Y(v)}" rx="3" fill="${color}"${STOP.has(i) ? ' opacity=".38"' : ''}/>`;
        if (STOP.has(i) && k === 'mpm') s += `<text x="${cx + bw / 2}" y="${y0 + H - 6}" font-size="8.5" font-weight="800" fill="#3a3f4f" text-anchor="middle">stoppage</text>`;
        const far = u && !STOP.has(i) && (v < u.p25 * 0.93 ? '#c4282d' : v > u.p75 * 1.07 ? '#17753a' : null);
        s += `<text x="${cx + bw / 2}" y="${Math.min(Y(v), u ? Y(u.p75) : Y(v)) - 4}" font-size="11" font-weight="${far ? 800 : 700}" fill="${far || '#111'}" text-anchor="middle">${N(v, dec)}</text>`;
      } else s += `<text x="${cx + bw / 2}" y="${y0 + H - 6}" font-size="9.5" fill="#9aa0ae" text-anchor="middle">no cuts</text>`;
      if (u) s += `<line x1="${cx - 4}" x2="${cx + bw + 4}" y1="${Y(u.mean)}" y2="${Y(u.mean)}" stroke="#16269e" stroke-width="2" stroke-dasharray="4 2"/>`;
      if (axis) s += `<text x="${cx + bw / 2}" y="${y0 + H + 14}" font-size="10" font-weight="700" fill="#16269e" text-anchor="middle">${L[i]}'</text><text x="${cx + bw / 2}" y="${y0 + H + 26}" font-size="9" fill="#9aa0ae" text-anchor="middle">${x ? x.n : 0} pl.</text>`;
    });
    const hx = x0 + 20 + 4 * step + bw + (step - bw + ht) / 2;
    s += `<line x1="${hx}" x2="${hx}" y1="${y0 - 6}" y2="${y0 + H}" stroke="#c4c7cf" stroke-dasharray="2 3"/>${axis ? `<text x="${hx}" y="${y0 + H + 14}" font-size="9.5" font-weight="800" fill="#6a6f80" text-anchor="middle">HT</text>` : ''}`;
    return s + `<line x1="${x0 - 6}" x2="${Wd}" y1="${y0 + H}" y2="${y0 + H}" stroke="#dfe2ea"/></svg>`;
  };

  // reading the match: what the numbers of this match say, in a few lines
  const B = M.bins, U = M.usual_bins, notes = [];
  const u = (k) => TU[k] && TU[k].mean;
  notes.push(`<b>2nd half ${pc(T.chg)}</b> in m/min (${N(T.h1)} then ${N(T.h2)}); the usual is ${pc(u('chg'))}.${T.h1 < u('h1') - 4 ? ` The 1st half was low: ${N(T.h1)} for a usual ${N(u('h1'))}.` : T.h1 > u('h1') + 4 ? ` The 1st half was high: ${N(T.h1)} for a usual ${N(u('h1'))}.` : ''}`);
  const stop = [...STOP].map((i) => ({ x: B[i], i, u: U[i].mpm }));
  if (stop.length) notes.push(`<b>${stopLab}: ${stop.map((o) => N(o.x.mpm)).join(', ')} m/min</b>${stop[0].u ? `, for a usual ${N(stop[0].u.p25)}–${N(stop[0].u.p75)}` : ''} — every player at once: a long stoppage of the game, not fatigue. This period is left out of the comparisons of the report.`);
  const zl = (T.lchg - u('lchg')) / (TU.lchg.sd || 7), za = TU.adchg ? (T.adchg - u('adchg')) / (TU.adchg.sd || 4) : null;
  notes.push(`<b>End of the match:</b> the last 20' are ${pc(T.lchg)} under the first 20' in m/min (usual ${pc(u('lchg'))}) and ${pc(T.adchg)} in Acc + Dec (usual ${pc(u('adchg'))}) — ${Math.min(zl, za ?? zl) <= -1 ? 'a lower end than usual' : Math.max(zl, za ?? zl) >= 1 ? 'a better end than usual' : 'a usual end'}.`);
  if (dropped.length || held.length) notes.push(`${dropped.length ? `<b>${dropped.map((p) => esc(p.name)).join(', ')}</b> dropped more than their usual at the end` : ''}${dropped.length && held.length ? '; ' : ''}${held.length ? `<b>${held.map((p) => esc(p.name)).join(', ')}</b> held better than usual` : ''} — see "The end of the match".`);
  if (!M.cuts) notes.push('<span class="mp-mut">This match is not cut every 10\' in STATSports yet: the distances come from the raw GPS and Acc + Dec are missing. The report completes itself once the cuts are made.</span>');
  const subs = PL.filter((p) => p.sub);
  if (subs.length) notes.push(`<b>Substitutes:</b> ${subs.map((p) => `${esc(p.name)} ${p.sub.mpm} % of the starters' m/min${p.sub.hsr != null ? `, ${p.sub.hsr} % of their > 20 km/h` : ''}`).join(' · ')}.`);
  if (nocuts.length || partcuts.length) notes.push(`<span class="mp-mut">Not cut every 10' in STATSports: ${[...nocuts.map((p) => esc(p.name)), ...partcuts.map((p) => `${esc(p.name)} (${N(p.cuts_min)}' of ${p.min}')`)].join(', ')} — their totals are on the players' page.</span>`);

  // green = the team held better than its usual, red = it dropped more (z of the change against the earlier matches)
  const tone = (v, k) => { if (v == null || !TU[k]) return pc(v); const z = (v - TU[k].mean) / (TU[k].sd || 5), c = z >= 2 ? ['#34a853', '#fff'] : z >= 1 ? ['#d9f5e1', '#17753a'] : z <= -2 ? ['#e5484d', '#fff'] : z <= -1 ? ['#fde3e3', '#c4282d'] : null;
    return c ? `<span class="mp-tone" style="background:${c[0]};color:${c[1]}">${pc(v)}</span>` : pc(v); };
  const mc = (r) => (!r.micro ? '–' : `<span class="mp-mc${r.micro.days <= 4 ? ' short' : r.micro.days > 8 ? ' long' : ''}">${r.micro.days} d</span>`);
  const rows = M.matches.map((r) => `<tr class="${r.date === M.date ? 'cur' : ''}"><td>${dlab(r.date)} · ${esc(r.opp)}</td><td>${N(r.h1)}</td><td>${N(r.h2)}</td><td>${tone(r.chg, 'chg')}</td><td>${tone(r.lchg, 'lchg')}</td><td>${tone(r.adchg, 'adchg')}</td><td>${mc(r)}</td><td>${r.micro && r.micro.z != null ? `<span class="mz ${zc(r.micro.z)}">${sg(r.micro.z, 1)}</span>` : '–'}</td></tr>`).join('');
  // does the micro-cycle weigh on the drop? the short ones (4 days or fewer) against the others, on these matches
  const withMc = M.matches.filter((r) => r.micro && r.chg != null), short = withMc.filter((r) => r.micro.days <= 4), other = withMc.filter((r) => r.micro.days > 4 && r.micro.days <= 8);
  const avg = (xs, k) => { const v = xs.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const mcNote = short.length && other.length ? `Short micro-cycles (4 days or fewer, ${short.length} match${short.length > 1 ? 'es' : ''}): 2nd half ${pc(avg(short, 'chg'))}, last 20' ${pc(avg(short, 'lchg'))} · 5 to 8 days (${other.length}): ${pc(avg(other, 'chg'))}, ${pc(avg(other, 'lchg'))}` : '';
  const table = `<table class="mp-otab"><tr><th>Match</th><th>m/min<br>1st</th><th>m/min<br>2nd</th><th>2nd vs<br>1st</th><th>last 20'<br>vs first</th><th>acc+dec<br>last vs first</th><th>micro-cycle<br>days</th><th>micro-cycle<br>load (z)</th></tr>${rows}
    <tr class="usu"><td>Usual · ${TU.chg.n} matches</td><td>${N(TU.h1.mean)}</td><td>${N(TU.h2.mean)}</td><td>${pc(TU.chg.mean)}</td><td>${pc(TU.lchg.mean)}</td><td>${TU.adchg ? pc(TU.adchg.mean) : '–'}</td><td></td><td></td></tr></table>
    <div class="mp-legend" style="margin-top:6px"><span><b style="background:#d9f5e1"></b>held better than usual</span><span><b style="background:#34a853"></b>much better</span><span><b style="background:#fde3e3"></b>dropped more than usual</span><span><b style="background:#e5484d"></b>much more</span><span><b style="background:#ffe2b8"></b>short micro-cycle</span><span>· load = the team sessions' distance vs their usual MD (z)</span></div>
    ${mcNote ? `<div class="mp-mut" style="font-size:10.5px;margin-top:4px">${mcNote}</div>` : ''}`;
  return `<div class="rp-page">${header('MATCH REPORT · STAFF · THE MATCH')}${tiles}
    <div class="mp-row" style="grid-template-columns:760px 1fr;flex:1">
      <div class="mp-blk"><div class="mp-ti">The match every 10 minutes <small>players on the pitch for the whole period · grey band = usual (middle half of the season's ${M.n_before} earlier matches) · dash = their average</small></div>
        ${chart('mpm', 'METRES PER MINUTE', '#6fb0ee', 0, 128, false)}${chart('ad', 'ACC + DEC PER MINUTE · all intensities', '#9d8fe0', 1, 104, false)}${chart('hsr', '> 20 KM/H · METRES PER MINUTE · the game\'s intensity, not a fatigue sign', '#ea8a63', 1, 104, true)}</div>
      <div class="mp-blk" style="gap:12px"><div><div class="mp-ti">Reading the match</div><ul class="mp-notes">${notes.map((x) => `<li>${x}</li>`).join('')}</ul></div>
        <div style="margin-top:auto"><div class="mp-ti">This match and the season's others <small>players who played the whole match</small></div>${table}</div></div>
    </div></div>`;
}

/* ---------------------------------------------------------------- page 2: the players */
const HEAT = [[-15, '#4a90e2', '#fff'], [-5, '#cfe2fb', '#111'], [5, '#f3f4f8', '#111'], [15, '#fdd9ae', '#111'], [Infinity, '#f28c38', '#fff']];
function page2() {
  const OUT = [['td', 'TOTAL DISTANCE'], ['hit', '> 20 KM/H'], ['spr', 'SPRINT DIST.'], ['acc_dec', 'ACC + DEC']];
  const tpl = `150px 34px ${OUT.map(() => '52px 42px').join(' ')} 44px 40px 10px repeat(5, 40px) 14px repeat(5, 40px) 44px`;
  // the rows shrink when the squad is big, so the page always holds everybody
  const rowH = Math.max(22, Math.min(32, Math.floor((540 - (PL.some((p) => !p.starter) ? 44 : 22)) / (PL.length + 1)))), cellH = rowH - 7;
  const heat = (p, i) => { const x = p.bins[i]; if (!x) return '<span class="mp-h na">·</span>';
    const d = 100 * (x.mpm / p.avg - 1), [, bg, fg] = HEAT.find(([t]) => d < t);
    return `<span class="mp-h${x.full ? '' : ' part'}" style="height:${cellH}px;background:${bg};color:${fg}">${N(x.mpm)}</span>`; };
  const row = (p) => `<div class="mp-tr mp-r" style="grid-template-columns:${tpl};height:${rowH}px"><span class="mp-nm">${face(p.id)}${esc(p.name)}<small>${esc(p.pos)}</small></span><span class="mp-c">${p.min}'</span>
      ${OUT.map(([k]) => `<span class="mp-c r"><b>${N(p[k])}</b></span><span class="mp-c">${p.min >= 45 && p.z ? chip(p.z[k]) : ''}</span>`).join('')}
      <span class="mp-c r"><b>${N(p.vmax, 1)}</b></span><span class="mp-c"><small style="${p.vmax_pct >= 95 ? 'color:#c4282d;font-weight:800' : ''}">${p.vmax_pct == null ? '' : p.vmax_pct + ' %'}</small></span><span></span>
      ${p.cuts ? [0, 1, 2, 3, 4].map((i) => heat(p, i)).join('') + '<span></span>' + [5, 6, 7, 8, 9].map((i) => heat(p, i)).join('') + `<span class="mp-c"><b>${N(p.avg)}</b></span>`
    : `<span class="mp-nocut" style="grid-column:span 12">${p.min < 15 ? `came on for ${p.min}'` : `not cut every 10' in STATSports — ${N(p.mpm)} m/min on the match`}</span>`}</div>`;
  const grp = (l, n) => `<div class="mp-grp">${l}<small>${n}</small></div>`;
  const st = PL.filter((p) => p.starter), sb = PL.filter((p) => !p.starter);
  const tm = M.bins, tavg = tm.filter(Boolean).reduce((a, x) => a + x.mpm * x.dur, 0) / tm.filter(Boolean).reduce((a, x) => a + x.dur, 0);
  const team = `<div class="mp-tr mp-r team" style="grid-template-columns:${tpl};height:${rowH}px"><span class="mp-nm">TEAM<small>whole period</small></span><span></span>${OUT.map(([k]) => `<span class="mp-c r"><b>${N((M.tiles[k] || {}).v)}</b></span><span class="mp-c">${chip((M.tiles[k] || {}).z)}</span>`).join('')}<span></span><span></span><span></span>
      ${[0, 1, 2, 3, 4].map((i) => heat({ bins: tm.map((x) => x && { ...x, full: true }), avg: tavg }, i)).join('')}<span></span>${[5, 6, 7, 8, 9].map((i) => heat({ bins: tm.map((x) => x && { ...x, full: true }), avg: tavg }, i)).join('')}<span class="mp-c"><b>${N(tavg)}</b></span></div>`;
  const sq = PL.filter((p) => p.src === 'squad' && p.min >= 45).map((p) => esc(p.name));
  return `<div class="rp-page">${header('MATCH REPORT · STAFF · THE PLAYERS')}
    <div class="mp-tbl"><div class="mp-tr mp-gh" style="grid-template-columns:${tpl}"><span></span><span></span><span style="grid-column:span 8">MATCH OUTPUT · number = z vs his usual match (per 90')</span><span style="grid-column:span 2">MAX SPEED</span><span></span>
        <span style="grid-column:span 12">METRES PER MINUTE EVERY 10' · colour = vs his own average in this match</span></div>
      <div class="mp-tr mp-th" style="grid-template-columns:${tpl}"><span>Players</span><span>Min</span>${OUT.map(([, l]) => `<span style="grid-column:span 2">${l}</span>`).join('')}<span>km/h</span><span>% max</span><span></span>
        ${L.slice(0, 5).map((l, i) => `<span>${l}'${STOP.has(i) ? ' *' : ''}</span>`).join('')}<span></span>${L.slice(5).map((l, i) => `<span>${l}'${STOP.has(i + 5) ? ' *' : ''}</span>`).join('')}<span>avg</span></div>
      ${grp('STARTERS', `${st.length} players`)}${st.map(row).join('')}${sb.length ? grp('SUBSTITUTES', `${sb.length} · their periods start when they came on`) + sb.map(row).join('') : ''}${team}</div>
    <div class="mp-legend"><span>z vs his usual match (45 min or more):</span><span class="mz vlow">≤ −2</span><span class="mz low">−2…−1</span><span class="mz ok">usual</span><span class="mz up">+1…+2</span><span class="mz vup">≥ +2</span>
      ${sq.length ? `<span>· ${sq.join(', ')}: vs the squad's usual (fewer than 5 matches of their own)</span>` : ''}
      <span style="margin-left:auto">m/min vs his average:</span>${[['#4a90e2', '−15 % or less'], ['#cfe2fb', '−5…−15 %'], ['#f3f4f8', '±5 %'], ['#fdd9ae', '+5…+15 %'], ['#f28c38', '+15 % or more']].map(([c, l]) => `<span><b style="background:${c}"></b>${l}</span>`).join('')}
      <span>· dashed = part of the period · max speed in red = 95 % of his best or more${STOP.size ? ' · * long stoppage of the game' : ''}</span></div></div>`;
}

/* ---------------------------------------------------------------- page 3: the end of the match */
function page3() {
  const tpl = '150px 176px 84px 168px 168px 168px 84px 1fr';
  // his m/min of each period (line and dots) on his usual one (dotted), each player on his own scale
  const fpN = PL.filter((p) => p.cuts).length, rowH = Math.max(24, Math.min(36, Math.floor(430 / (fpN + 1))));
  const spark = (p) => { const W = 170, H = rowH - 6, mine = p.bins.map((x, i) => (x && !STOP.has(i) ? x.mpm : null)), vs = [...mine, ...(p.ub || [])].filter((v) => v != null);
    if (!vs.length) return '<span></span>';
    const lo = Math.min(...vs), hi = Math.max(...vs), X = (i) => 9 + i * 16.9, Y = (v) => 4 + (H - 8) * (1 - (v - lo) / (hi - lo || 1));
    const path = (pts) => pts.reduce((a, [x, y], i) => a + (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1), '');
    const today = mine.map((v, i) => (v == null ? null : [X(i), Y(v)])), usual = (p.ub || []).map((v, i) => (v == null ? null : [X(i), Y(v)]));
    const runs = (pts) => { const out = []; let cur = []; pts.forEach((q, i) => { if (q) cur.push(q); else if (!STOP.has(i) && cur.length) { out.push(cur); cur = []; } }); if (cur.length) out.push(cur); return out; };
    return `<svg class="mp-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${[...STOP].map((i) => `<rect x="${X(i) - 6}" y="0" width="12" height="${H}" fill="#eef0f4"/>`).join('')}
      ${runs(usual).map((r) => `<path d="${path(r)}" fill="none" stroke="#9aa0ae" stroke-width="1.4" stroke-dasharray="3 2.5"/>`).join('')}${runs(today).map((r) => `<path d="${path(r)}" fill="none" stroke="#16269e" stroke-width="1.8" stroke-linejoin="round"/>`).join('')}
      ${today.filter(Boolean).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="#16269e"/>`).join('')}</svg>`; };
  // a change in % on a common scale, the bar from 0, a tick at his usual; red = more drop than usual, green = less
  const bar = (v, us, z) => { if (v == null) return '<span class="mp-c mp-mut">–</span>';
    const lo = -45, hi = 20, X = (x) => 100 * (Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo), col = z == null ? '#9aa0ae' : z <= -1 ? '#e5484d' : z >= 1 ? '#34a853' : '#9aa0ae';
    return `<span class="mp-bar"><i class="t"><i class="z" style="left:${X(0)}%"></i><i class="b" style="left:${Math.min(X(0), X(v))}%;width:${Math.abs(X(v) - X(0))}%;background:${col}"></i>${us ? `<i class="u" style="left:${X(us.mean)}%" title="usual"></i>` : ''}</i>
      <b>${pc(v)}</b><small>${us ? pc(us.mean) : ''}</small></span>`; };
  const lvl = (v, usual) => (v == null ? '<span class="mp-c mp-mut">–</span>' : `<span class="mp-c lv"><b>${N(v)}</b><small>${usual == null ? '' : `usual ${N(usual)}`}</small>${usual == null ? '' : `<em style="color:${v / usual <= 0.93 ? '#c4282d' : v / usual >= 1.07 ? '#17753a' : '#6a6f80'}">${Math.round(100 * v / usual)} %</em>`}</span>`);
  const row = (p) => { const f = p.fat, r = f === NOF ? null : reading(f), R = RD[r];
    return `<div class="mp-tr mp-r tall" style="grid-template-columns:${tpl};height:${rowH}px"><span class="mp-nm">${face(p.id)}${esc(p.name)}<small>${p.min}'${p.ub_src === 'squad' ? ' · vs squad' : ''}</small></span>${spark(p)}${lvl(f.h1, f.h1_usual)}${bar(f.chg, f.usual.chg, f.z.chg)}${bar(f.lchg, f.usual.lchg, f.z.lchg)}${bar(f.adchg, f.usual.adchg, f.z.adchg)}${lvl(f.l20, f.l20_usual)}
      <span class="mp-c l">${R ? `<span class="mp-pill" style="color:${R[1]};background:${R[2]}">${R[0]}</span>` : ''}</span></div>`; };
  const NOF = { usual: {}, z: {} }, fp = PL.filter((p) => p.cuts).map((p) => (p.fat ? p : { ...p, fat: NOF }));
  const sq = M.squad_usual, tu = (k) => (TU[k] ? { mean: TU[k].mean } : null);
  const team = `<div class="mp-tr mp-r tall team" style="grid-template-columns:${tpl};height:${rowH}px"><span class="mp-nm">TEAM<small>${T.n} whole-match players</small></span>${spark({ bins: M.bins, ub: M.usual_bins.map((u) => u.mpm && u.mpm.mean) })}${lvl(T.h1, TU.h1.mean)}${bar(T.chg, tu('chg'), (T.chg - TU.chg.mean) / (TU.chg.sd || 3))}${bar(T.lchg, tu('lchg'), (T.lchg - TU.lchg.mean) / (TU.lchg.sd || 7))}${bar(T.adchg, tu('adchg'), TU.adchg ? (T.adchg - TU.adchg.mean) / (TU.adchg.sd || 4) : null)}<span></span><span class="mp-c l mp-mut" style="font-size:10.5px">${STOP.size ? `${stopLab} left out: a long stoppage` : ''}</span></div>`;

  // what to watch after the match
  const big = (p, lo) => ['td', 'hit', 'spr', 'acc_dec'].filter((k) => p.z && p.z[k] != null && (lo ? p.z[k] <= -1.5 : p.z[k] >= 1.5)).map((k) => `${{ td: 'distance', hit: '> 20 km/h', spr: 'sprint distance', acc_dec: 'Acc + Dec' }[k]} ${sg(p.z[k], 1)}`);
  const hi = PL.filter((p) => p.min >= 45 && big(p).length), lo = PL.filter((p) => p.min >= 45 && big(p, true).length), fast = PL.filter((p) => p.vmax_pct >= 95), few = PL.filter((p) => p.min < 45);
  const subs = PL.filter((p) => p.sub);
  const item = (k, c, html) => `<div class="mp-w"><span class="k" style="color:${c}">${k}</span><div>${html}</div></div>`;
  const list = (ps, f) => ps.map((p) => `<b>${esc(p.name)}</b>${f ? ' ' + f(p) : ''}`).join(' · ');
  const watch = [
    item('DROPPED MORE THAN USUAL AT THE END', '#c4282d', dropped.length ? list(dropped, (p) => `<span class="mp-mut">last 20' ${pc(p.fat.lchg)} m/min${p.fat.adchg != null ? `, ${pc(p.fat.adchg)} acc+dec` : ''}${p.fat.l20_usual ? ` · ${N(p.fat.l20)} m/min for a usual ${N(p.fat.l20_usual)}` : ''}</span>`) : '<span class="mp-mut">nobody</span>'),
    item('HIGH OUTPUT vs THEIR USUAL MATCH', '#9a4f00', hi.length ? list(hi, (p) => `<span class="mp-mut">${big(p).join(', ')}</span>`) : '<span class="mp-mut">nobody at +1.5 or more</span>'),
    item('LOW OUTPUT vs THEIR USUAL MATCH', '#1d5fae', lo.length ? list(lo, (p) => `<span class="mp-mut">${big(p, true).join(', ')}</span>`) : '<span class="mp-mut">nobody at −1.5 or less</span>'),
    item('MAX SPEED · 95 % OF THEIR BEST OR MORE', '#16269e', fast.length ? list(fast, (p) => `<span class="mp-mut">${N(p.vmax, 1)} km/h (${p.vmax_pct} %)</span>`) : '<span class="mp-mut">nobody</span>'),
    subs.length ? item('SUBSTITUTES vs THE STARTERS · SAME PERIODS', '#17753a', list(subs, (p) => `<span class="mp-mut">${p.min}' · m/min ${p.sub.mpm} %${p.sub.hsr != null ? ` · > 20 km/h ${p.sub.hsr} %` : ''}</span>`)) : '',
    item('FEW OR NO MATCH MINUTES', '#5b6072', `${few.length ? list(few, (p) => `<span class="mp-mut">${p.min}'</span>`) + ' · ' : ''}<span class="mp-mut">${M.apart.n ? `${M.apart.n} players trained apart (${M.apart.min}', ${N(M.apart.td)} m on average): ${M.apart.names.map(esc).join(', ')}` : 'nobody trained apart'}</span>`),
  ].join('');
  return `<div class="rp-page">${header('MATCH REPORT · STAFF · THE END OF THE MATCH')}
    <div class="mp-row" style="grid-template-columns:1fr;flex:1">
      <div class="mp-tbl"><div class="mp-tr mp-gh" style="grid-template-columns:${tpl}"><span></span><span>M/MIN EVERY 10'</span><span>START</span><span style="grid-column:span 3">HOW HE ENDED · black tick = his usual · red = more drop than usual, green = less</span><span>END</span><span></span></div>
        <div class="mp-tr mp-th" style="grid-template-columns:${tpl}"><span>Players</span><span><i class="mp-key"></i>today · <i class="mp-key u"></i>his usual</span><span>1st half<br>m/min</span><span>2nd half vs 1st<br>m/min</span><span>Last 20' vs first 20'<br>m/min</span><span>Last 20' vs first 20'<br>Acc + Dec</span><span>Last 20'<br>m/min</span><span class="l">Reading</span></div>
        ${fp.map(row).join('')}${team}</div>
      <div class="mp-row" style="grid-template-columns:1fr 400px;gap:28px;margin-top:auto">
        <div><div class="mp-ti">To watch after the match</div><div class="mp-watch">${watch}</div></div>
        <div class="mp-why"><b>Why these measures</b>On the season's matches cut every 10 minutes (64 whole matches by a player, October 2026), <b>m/min</b> falls in the 2nd half for 9 players in 10 (−8 % on average, −19 % between the first and the last 20') and <b>Acc + Dec</b> fall at the end for every one of them (−20 %).
          Distance &gt; 20 km/h, sprints and max speed do not fall in a regular way — they follow the game — so they are read as output (the players' page), not as fatigue. A strong 1st half explains part of a drop, and each player has his own habit: he is read against his own usual (the squad's when he has fewer than 3 whole matches).</div>
      </div></div></div>`;
}

/* ---------------------------------------------------------------- the team: this match and its last 5 matches */
function pageL5() {
  const MET = [['td', 'TOTAL DISTANCE', '#6fb0ee', 'm'], ['hit', 'DISTANCE > 20 KM/H', '#ea8a63', 'm'], ['acc_dec', 'ACCELERATION + DECELERATION', '#6fcf4b', ''], ['spr_n', 'NUMBER OF SPRINTS > 25 KM/H', '#ee8f9c', '']];
  const G = M.team5, prev = G.filter((g) => !g.cur), cur = G.find((g) => g.cur);
  const ZC = { below: '#2a78d6', on: '#34c759', above: '#ff9f0a', high: '#e5484d' }, lvl = (z) => (z == null ? null : z <= -1 ? 'below' : z < 1 ? 'on' : z < 2 ? 'above' : 'high');
  const chart = ([k, label, , unit]) => { const W = 593, H = 168, x0 = 20, y0 = 40, step = (W - x0 * 2) / G.length, bw = Math.min(54, step * 0.6);
    const avg = prev.reduce((a, g) => a + (g[k] || 0), 0) / (prev.length || 1), d = avg ? Math.round(100 * (cur[k] / avg - 1)) : null;
    const mx = Math.max(1, avg, ...G.map((g) => g[k] || 0)) * 1.2, Y = (v) => y0 + H - (v / mx) * H, f = (v) => (k === 'td' || k === 'hit' ? N(Math.round(v)) : N(v, Number.isInteger(v) ? 0 : 1));
    let s = `<svg class="mp-svg" width="${W}" height="${y0 + H + 68}" viewBox="0 0 ${W} ${y0 + H + 68}"><text x="0" y="12" font-size="12" font-weight="800" fill="#a52a2a">${label}</text>
      <text x="${W}" y="12" font-size="11" fill="#6a6f80" text-anchor="end">this match <tspan font-weight="800" fill="#111">${f(cur[k])}${unit ? ' ' + unit : ''}</tspan> · average of the last ${prev.length} <tspan font-weight="800" fill="#16269e">${f(avg)}</tspan>${d == null ? '' : ` · <tspan font-weight="800" fill="${d <= -10 ? '#1d5fae' : d >= 10 ? '#c4282d' : '#17753a'}">${sg(d)} %</tspan>`}</text>`;
    const bars = [], labels = [];
    G.forEach((g, i) => { const cx = x0 + step * (i + 0.5), v = g[k] || 0;
      const z = g.z ? g.z[k] : null, lv = lvl(z), col = ZC[lv] || '#c9cdd8';
      bars.push(`<rect x="${cx - bw / 2}" y="${Y(v)}" width="${bw}" height="${y0 + H - Y(v)}" rx="3" fill="${col}"/>`);
      labels.push(`<text x="${cx}" y="${Y(v) - (lv && lv !== 'on' ? 16 : 5)}" font-size="11" font-weight="${g.cur ? 800 : 600}" fill="${g.cur ? '#111' : '#5b6072'}" stroke="#fff" stroke-width="3.5" paint-order="stroke" text-anchor="middle">${f(v)}</text>`
        + (lv && lv !== 'on' ? `<text x="${cx}" y="${Y(v) - 4}" font-size="9.5" font-weight="800" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${sg(z, 1)}</text>` : ''));
      s += crest(g.opp, cx, y0 + H + 6) + `<text x="${cx}" y="${y0 + H + 46}" font-size="10" font-weight="${g.cur ? 800 : 700}" fill="#16269e" text-anchor="middle">${dlab(g.date)}</text><text x="${cx}" y="${y0 + H + 59}" font-size="9.5" fill="${g.cur ? '#111' : '#8a90a2'}" font-weight="${g.cur ? 700 : 400}" text-anchor="middle">${esc(g.opp)}</text>`; });
    // bars, then the average line, then the values on top of it
    return s + bars.join('') + `<line x1="${x0 + 4}" x2="${W - x0 + 6}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#16269e" stroke-width="2" stroke-dasharray="5 3"/>` + labels.join('') + `<line x1="0" x2="${W}" y1="${y0 + H}" y2="${y0 + H}" stroke="#dfe2ea"/></svg>`; };
  return `<div class="rp-page">${header('MATCH REPORT · STAFF · THE TEAM AND ITS LAST 5 MATCHES')}
    <div class="mp-row" style="grid-template-columns:1fr 1fr;gap:14px 40px;flex:1;align-content:start;padding-top:4px">${MET.map(chart).join('')}</div>
    <div class="mp-legend"><span>Colour = each match against the team's usual match of today (z):</span>${[['below', 'below usual'], ['on', 'usual'], ['above', 'above'], ['high', 'well above']].map(([c, l]) => `<span><b style="background:${ZC[c]}"></b>${l}</span>`).join('')}
      <span>· z printed when not usual · last bar = this match · dashed line = the average of the last ${prev.length} matches · team = the players who played the whole match (your Team rule)</span></div></div>`;
}

/* ================================================================ the peaks and each player's trend (2026-10-13) */
const idea = (n, t) => `MATCH REPORT · STAFF · ${t}`;

/* ---------------------------------------------------------------- idea 3: the peaks of intensity */
function pagePeaks() {
  const ps = PL.filter((p) => p.peaks);
  if (!ps.length) return '';
  const tpl = '150px 40px repeat(3, 236px) 210px 1fr';
  const cell = (p, k, dec) => { const v = p.peaks[k], b = p.peaks.best[k], pct = b ? 100 * v / b : null, X = (x) => Math.min(100, x / 1.15);
    return `<span class="mp-pk"><b>${N(v, dec)}</b><i class="t"><i class="b" style="width:${pct == null ? 0 : X(pct)}%;background:${pct >= 100 ? '#e5484d' : pct >= 90 ? '#ff9f0a' : '#6fb0ee'}"></i><i class="u" style="left:${X(100)}%"></i></i>
      <em style="${pct >= 100 ? 'color:#c4282d;font-weight:800' : ''}">${pct == null ? 'first match' : pct >= 100 ? 'record' : Math.round(pct) + ' %'}</em><small>${p.peaks[k + '_at']}'</small></span>`; };
  const rowH = Math.max(24, Math.min(36, Math.floor(486 / ps.length)));
  const row = (p) => `<div class="mp-tr mp-r tall" style="grid-template-columns:${tpl};height:${rowH}px"><span class="mp-nm">${face(p.id)}${esc(p.name)}<small>${esc(p.pos)}</small></span><span class="mp-c">${p.min}'</span>${cell(p, 'p1', 0)}${cell(p, 'p3', 0)}${cell(p, 'p5', 0)}${cell(p, 'h1', 0)}<span></span></div>`;
  const avg = (k) => ps.reduce((a, p) => a + (p.peaks[k] || 0), 0) / ps.length, top = (k) => Math.max(...ps.map((p) => p.peaks[k] || 0));
  const tile = (k, l, u) => `<div class="mp-tile"><span class="k">${l}</span><span class="v">${N(avg(k))}<small> ${u}</small></span><span class="s">squad average · highest ${N(top(k))}</span></div>`;
  return `<div class="rp-page">${header(idea(3, 'PEAKS OF INTENSITY'))}
    <div class="mp-tiles" style="grid-template-columns:repeat(4, 1fr) 1.6fr">${tile('p1', 'BEST 1 MINUTE', 'm/min')}${tile('p3', 'BEST 3 MINUTES', 'm/min')}${tile('p5', 'BEST 5 MINUTES', 'm/min')}${tile('h1', 'BEST 1 MINUTE > 20 KM/H', 'm')}
      <div class="mp-tile"><span class="k">FOR TRAINING</span><span class="s" style="white-space:normal;line-height:1.4;color:#3a3f4f">A game of 5 minutes at match intensity is <b>${N(avg('p5'))} m/min</b>, of 3 minutes <b>${N(avg('p3'))}</b>, of 1 minute <b>${N(avg('p1'))}</b> — the targets for the small-sided games.</span></div></div>
    <div class="mp-tbl"><div class="mp-tr mp-gh" style="grid-template-columns:${tpl}"><span></span><span></span><span style="grid-column:span 3">THE MOST INTENSE PASSAGES OF HIS MATCH · m/min · bar = % of his record, black tick = his record</span><span>HIGH SPEED</span><span></span></div>
      <div class="mp-tr mp-th" style="grid-template-columns:${tpl}"><span>Players</span><span>Min</span><span>Best 1 minute</span><span>Best 3 minutes</span><span>Best 5 minutes</span><span>Best 1 minute &gt; 20 km/h · m</span><span></span></div>${ps.map(row).join('')}</div>
    <div class="mp-legend"><span>From the raw 10 Hz GPS of the match · his record = his best in the season's ${M.peaks_n} earlier official matches · the small number = the minute of the match where it happened · orange = 90 % of his record or more, red = a new record</span></div></div>`;
}

/* ---------------------------------------------------------------- idea 4: his end of match, match after match */
function pageTrend() {
  const ps = PL.filter((p) => p.trend && p.trend.length >= 2 && p.fat);
  if (!ps.length) return '';
  const tall = ps.length <= 9;
  const mini = (p, k, label) => { const W = 178, H = tall ? 92 : 62, y0 = 16, xs = p.trend, n = xs.length, step = (W - 8) / 6, u = p.fat.usual[k], lo = -45, Y = (v) => y0 + (Math.max(lo, Math.min(0, v)) / lo) * H;
    let g = `<svg class="mp-svg" width="${W}" height="${y0 + H + 24}" viewBox="0 0 ${W} ${y0 + H + 24}"><text x="0" y="9" font-size="9" font-weight="800" fill="#a52a2a">${label}</text><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#c4c7cf"/>`;
    xs.forEach((m, i) => { const v = m[k], cx = 4 + step * (6 - n + i) + step / 2, last = i === n - 1; if (v == null) return;
      const z = u && u.sd ? (v - u.mean) / u.sd : 0, col = last ? (z <= -1 ? '#e5484d' : z >= 1 ? '#34a853' : '#5b6072') : '#c9cdd8';
      g += `<rect x="${cx - 9}" y="${y0}" width="18" height="${Math.max(1, Y(v) - y0)}" rx="2" fill="${col}"/><text x="${cx}" y="${Y(v) + 10}" font-size="8.5" font-weight="${last ? 800 : 600}" fill="${last ? '#111' : '#8a90a2'}" text-anchor="middle">${Math.round(v)}</text>
        ${crest(m.opp, cx, y0 + H + 4, 18)}`; });
    if (u) g += `<line x1="0" x2="${W}" y1="${Y(u.mean)}" y2="${Y(u.mean)}" stroke="#16269e" stroke-width="1.5" stroke-dasharray="4 2"/>`;
    return g + '</svg>'; };
  const slide = (p) => { const u = p.fat.usual.lchg, xs = p.trend.map((m) => m.lchg).filter((v) => v != null).slice(-3); return u && xs.length === 3 && xs.every((v) => v < u.mean - 1) ? '<span class="mp-pill" style="color:#c4282d;background:#fde8e8">3 matches under his usual</span>' : ''; };
  const card = (p) => `<div class="mp-card"><div class="h"><span class="mp-nm" style="padding:0">${face(p.id)}${esc(p.name)}<small>${p.trend.length} matches</small></span>${slide(p)}</div><div class="g">${mini(p, 'lchg', "LAST 20' vs FIRST 20' · M/MIN · %")}${mini(p, 'adchg', "LAST 20' vs FIRST 20' · ACC + DEC · %")}</div></div>`;
  return `<div class="rp-page">${header(idea(4, 'HIS END OF MATCH, MATCH AFTER MATCH'))}
    <div class="mp-cards">${ps.map(card).join('')}</div>
    <div class="mp-legend"><span>Each bar = one of his last whole matches, oldest first, with the opponent's crest (the deeper, the bigger his drop at the end) · dashed line = his usual · last bar = this match: red when he dropped more than his usual, green when less · a red label = three matches in a row under his usual</span></div></div>`;
}

/* ---------------------------------------------------------------- his staff pages 1-3 for the match, then the halves */
const S = { keys: MR.keys, week_keys: MR.keys, days: { [D.session.date]: M.day } }, C = rpStaffCtx(D, S), ses = D.session;
// page 1, his columns for a match (2026-10-12): no "Days", the distance > 25 km/h after the > 20 km/h
D.fullSession.forEach((r) => { const p = C.px(r.name), q = PL.find((x) => x.id === D.pids[r.name]); r.rpe = p ? p.rpe : null; r.d25 = q ? q.spr : null; });
const stitle = `${ses.id} · ${ses.dateLabel}${M.opp ? ' · ' + (M.comp || '') + ' vs ' + M.opp : M.comp ? ' · ' + M.comp : ''}`;
const smeta = [['WEEK', ses.week], ['MD', ses.md], ['TIME', ses.time + "'"], ['N EXERCICE', ses.exercise], ['AM/PM', ses.ampm]], kicker = 'FULL MATCH · STAFF';
const tt = M.day.team, strip = `<div class="rs-strip">${[['td', 'Total distance', 'm'], ['hit', 'HIT > 20', 'm'], ['acc_dec', 'High Acc+Dec', ''], ['srpe', 'sRPE', 'AU'], ['mpm', 'm/min', '']].map(([k, l, u]) => (tt[k]
  ? `<div class="rs-kpi"><span>${l} · team</span><b>${stK(tt[k].v)}<small> ${u}</small></b><em style="color:${stZCol(tt[k].z)}">● z ${stSigned(tt[k].z)} vs usual match</em></div>` : '')).join('')}
  <div class="rs-kpi rs-note"><span>Usual match</span><b>${tt.n || '—'}<small> matches</small></b><em>whole-game players</em></div></div>`;
const note = '<div class="rp-legend"><span>Colour = the player\'s z vs his usual match (per 90\'; the squad\'s usual when he has fewer than 5 matches) · z printed when not usual</span></div>';
const staff = [
  rpHeader(kicker, stitle, smeta) + strip + rpTable(D, D.fullSession, ['time', 'rpe', 'mpm', 'td', 'd15', 'd20', 'd25', 'vmax', 'pmax', 'sprints', 'accdec'], {}, RP_TABLE_H - 73),
  rpHeader(kicker, stitle, smeta) + rsChart(D, C, 'td', 'TOTAL DISTANCE', true) + rsChart(D, C, 'd20', 'DISTANCE >20kmh') + note,
  rpHeader(kicker, stitle, smeta) + rsChart(D, C, 'accdec', 'Acceleration + Deceleration', true) + rsChart(D, C, 'sprints', 'Number of Sprints >25kmh') + note,
].map((p) => `<div class="rp-page rp-staff">${p}</div>`).join('');
// the halves: the first of the match pages of the players' report (1st and 2nd half player by player)
// (two pages when the squad is too big for one; the team total and the one-half tables are left out — his choice)
const hv = rpHalves(D), halves = hv[0].length || hv[1].length ? rpMatchPages(D, stitle).filter((p) => /GAME · 1ST HALF &(amp;)? 2ND HALF/.test(p) && !/TOTAL TEAM/.test(p)).map((p) => `<div class="rp-page">${p}</div>`).join('') : '';
// his order (2026-10-13): staff pages · halves · the match by 10' · players · end of match · peaks · trends · the team's last 5 matches
return staff + halves + page1() + page2() + page3() + pagePeaks() + pageTrend() + pageL5();
}
