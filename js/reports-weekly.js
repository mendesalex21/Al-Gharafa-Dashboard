/**
 * Downloads › Weekly: the weekly player report — his B+ design (2026-10-04, put on the site 2026-10-07): one page per
 * player and week (Sunday → Saturday) — his match vs his top 3 and the team, his last 5 matches, his week vs his usual
 * week, his last weeks, the next match. Data: reports.weekly (sync/build.py build_weekly); pure functions → HTML, so the
 * same page is shown here and printed online (sync/staff_email.py weekly_pdf) for the last complete week.
 */
const RW_W = 892; // the page: 860 px report + 16 px gutters
const RW_POS = { GK: 'Goalkeeper', CD: 'Centre-back', WD: 'Full-back', CM: 'Midfielder', WM: 'Winger', FW: 'Forward' };
const RW_ORDER = ['GK', 'CD', 'WD', 'CM', 'WM', 'FW'];
const RW_FLAG = {
  algeria: 'dz', cameroon: 'cm', jamaica: 'jm', palestine: 'ps', qatar: 'qa', romania: 'ro', senegal: 'sn', 'south korea': 'kr', korea: 'kr',
  tunisia: 'tn', uruguay: 'uy', morocco: 'ma', egypt: 'eg', brazil: 'br', france: 'fr', spain: 'es', portugal: 'pt', argentina: 'ar', ghana: 'gh',
  nigeria: 'ng', 'ivory coast': 'ci', "cote d'ivoire": 'ci', mali: 'ml', iran: 'ir', iraq: 'iq', jordan: 'jo', syria: 'sy', lebanon: 'lb',
  'saudi arabia': 'sa', kuwait: 'kw', oman: 'om', bahrain: 'bh', uae: 'ae', 'united arab emirates': 'ae', japan: 'jp', netherlands: 'nl',
  belgium: 'be', germany: 'de', italy: 'it', england: 'gb-eng', colombia: 'co', venezuela: 've', chile: 'cl', peru: 'pe', ecuador: 'ec',
  paraguay: 'py', sudan: 'sd', libya: 'ly', mauritania: 'mr', guinea: 'gn', 'burkina faso': 'bf', kenya: 'ke', 'south africa': 'za',
  croatia: 'hr', serbia: 'rs', turkey: 'tr', greece: 'gr', sweden: 'se', denmark: 'dk', norway: 'no', poland: 'pl', ukraine: 'ua',
  usa: 'us', 'united states': 'us', canada: 'ca', mexico: 'mx', australia: 'au', china: 'cn', uzbekistan: 'uz', india: 'in', 'cape verde': 'cv',
  comoros: 'km', angola: 'ao', congo: 'cg', 'dr congo': 'cd', gabon: 'ga', togo: 'tg', benin: 'bj', gambia: 'gm', zambia: 'zm', yemen: 'ye',
};
const RW_COL = { td: '#8fb4f5', d20: '#ecc95e', ad: '#94d6a9', spr: '#f2aaa1' };
const rwFmt = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));
const rwKm = (v) => ((v || 0) / 1000).toFixed(1);
const rwAvg = (a) => (a.length ? a.reduce((s, x) => s + (x || 0), 0) / a.length : 0);
const rwEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RW_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], RW_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Thu 1 Oct" / "1 Oct" (the same on every browser: no "Sept"). */
function rwDay(iso, o = {}) { const d = new Date(iso + 'T12:00:00Z'); return `${o.weekday ? RW_WD[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()} ${RW_MON[d.getUTCMonth()]}`; }
function rwRange(a, b) { return `${rwDay(a)} – ${rwDay(b)} ${new Date(b + 'T12:00:00Z').getUTCFullYear()}`; }
function rwChange(v, ref) {
  if (!ref) return '';
  const p = Math.round((v / ref - 1) * 100);
  return `<span class="${p >= 0 ? 'rw-up' : 'rw-down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`;
}
function rwCrestImg(name, x, y, s) { // inside the charts' SVG
  const slug = typeof clubSlug === 'function' ? clubSlug(name) : '';
  return typeof CLUB_LOGOS !== 'undefined' && CLUB_LOGOS.has(slug)
    ? `<image href="img/clubs/${slug}.png" x="${x}" y="${y}" width="${s}" height="${s}"/>`
    : `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="#eef0f6"/><text x="${x + s / 2}" y="${y + s / 2 + 3}" text-anchor="middle" font-size="7" font-weight="800" fill="#767c96">${rwEsc(typeof clubInitials === 'function' ? clubInitials(name) : '')}</text>`;
}
const rwCrest = (name, size) => (typeof crestHtml === 'function' ? crestHtml(name, size) : '');

/** The weeks with a report, newest first. */
function rwWeeks(W) { return (W && W.weeks ? W.weeks.slice().reverse() : []); }
/** The players of a week: GPS data that week or a game in it — by position, then name. */
function rwPlayersOf(W, ws) {
  const wk = W.weeks.find((w) => w.ws === ws);
  if (!wk) return [];
  return Object.entries(W.players).filter(([, p]) => p.weeks.some((w) => w.ws === ws && w.td > 0) || p.games.some((g) => g.d >= wk.ws && g.d <= wk.we))
    .map(([pid, p]) => ({ pid, name: p.name, pos: p.pos }))
    .sort((a, b) => (RW_ORDER.indexOf(a.pos) - RW_ORDER.indexOf(b.pos)) || a.name.localeCompare(b.name));
}
/** File names, shared with the online printing (sync/staff_email.py weekly_pdf). */
function rwFile(W, ws, pid) {
  const wk = W.weeks.find((w) => w.ws === ws), lab = (wk && wk.label) || ws;
  const who = pid ? String(W.players[pid].name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_') : 'All_players';
  return `${lab}_${who}_Weekly_report.pdf`;
}

/** Bar chart drawn to one scale (360 × 150): items {v, x, label?, crest?, under?, bottom?, hi?}. */
function rwBars(items, o) {
  const w = 360, h = 150, under = items.some((i) => i.under), crest = items.some((i) => i.crest != null);
  const padB = 16 + (crest ? 22 : 0) + (under ? 13 : 0), padT = 16;
  const max = Math.max(...items.map((i) => i.v || 0), o.avg || 0) || 1, slot = w / Math.max(1, items.length), bw = Math.min(slot * 0.58, 46);
  const y = (v) => h - padB - (v / max) * (h - padB - padT);
  let s = '';
  if (o.avg) s += `<line x1="0" x2="${w}" y1="${y(o.avg)}" y2="${y(o.avg)}" stroke="#13206b" stroke-opacity=".45" stroke-dasharray="4 4"/>`;
  items.forEach((it, k) => {
    const cx = slot * k + slot / 2, yt = y(it.v || 0);
    s += `<rect x="${cx - bw / 2}" y="${yt}" width="${bw}" height="${Math.max(0, h - padB - yt)}" rx="5" fill="${o.color}"/>`;
    s += `<text x="${cx}" y="${yt - 5}" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="14" fill="#161a33">${it.label ?? rwFmt(it.v)}</text>`;
    if (it.bottom && h - padB - yt >= 18) s += `<text x="${cx}" y="${h - padB - 7}" text-anchor="middle" font-size="11" font-weight="800" fill="#7d2219">${it.bottom}</text>`;
    let yb = h - padB + 4;
    if (it.crest != null) { s += rwCrestImg(it.crest, cx - 9, yb, 18); yb += 22; }
    s += `<text x="${cx}" y="${yb + 9}" text-anchor="middle" font-size="10.5" font-weight="${it.hi ? 800 : 600}" fill="${it.hi ? '#13206b' : '#767c96'}">${rwEsc(it.x)}</text>`;
    if (it.under) s += `<text x="${cx}" y="${yb + 22}" text-anchor="middle" font-size="10" font-weight="700" fill="#8a5f00">${it.under}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${s}</svg>`;
}
const rwChart = (title, avgTxt, svg) => `<div class="rw-chart"><h3>${title}${avgTxt ? ` <small>${avgTxt}</small>` : ''}</h3>${svg}</div>`;

/** One player's page for the week starting `ws` (photo: a data URI or URL). */
function rwPage(W, pid, ws, photo) {
  const P = W.players[pid], wk = W.weeks.find((w) => w.ws === ws);
  if (!P || !wk) return '';
  const nogps = new Set(W.weeks.filter((w) => w.nogps).map((w) => w.ws));
  const games = P.games.filter((g) => g.d <= wk.we), inWeek = games.filter((g) => g.d >= wk.ws);
  const game = (wk.match && inWeek.find((g) => g.d === wk.match.d && !g.b)) || inWeek[inWeek.length - 1] || null;
  const last5 = games.slice(-5), prev = game ? games.filter((g) => g.d < game.d) : games;
  const weeks = P.weeks.filter((w) => w.ws <= ws && !nogps.has(w.ws)).slice(-8);
  const cur = weeks.find((w) => w.ws === ws) || { ws, td: 0, d20: 0, ad: 0, spr: 0, sprd: 0, k: {} };
  const usual = weeks.filter((w) => w.ws !== ws && w.td > 5000), usualOf = (k) => rwAvg(usual.map((w) => w[k]));
  const t3 = P.top3 || {}, short = game && game.min < 75;
  // % of his top-3 games: green from 90 %, orange 80–89 %, red under 80 %; under 75 min not coloured (indicative)
  const ofTop3 = (v, ref) => {
    if (!ref) return '';
    const p = Math.round(v / ref * 100), lv = short ? 'n' : p >= 90 ? 'g' : p >= 80 ? 'o' : 'r';
    return `<b class="rw-lv-${lv}">${p}%</b> of your top 3${short ? ' · indicative' : ''}`;
  };
  const flag = RW_FLAG[String(P.nat || '').trim().toLowerCase()];
  const lab = wk.label || '', num = lab.replace(/^W0?/, '');
  const head = `<header class="rw-head"><div class="rw-photo" style="${photo ? `background-image:url('${photo}')` : ''}"></div>
    <div class="rw-who"><h1>${rwEsc(P.name)}</h1><p>${P.no ? `#${P.no} · ` : ''}${rwEsc(RW_POS[P.pos] || P.pos || '')}${P.nat ? ` · ${flag ? `<img class="rw-flag" src="https://flagcdn.com/w80/${flag}.png" alt="" crossorigin="anonymous">` : ''}${rwEsc(P.nat)}` : ''}</p></div>
    <div class="rw-week"><div><b>Week ${rwEsc(num)}</b><span>${rwRange(wk.ws, wk.we)}</span></div><img src="img/logo.png" alt=""></div></header>`;

  let match;
  if (game) {
    const before4 = last5.filter((g) => g.d < game.d).slice(-4), seasonBest = Math.max(0, ...prev.map((g) => g.spr || 0));
    const kpi = (label, value, unit, note) => `<div class="rw-kpi"><small>${label}</small><b class="rw-num">${value}<i>${unit}</i></b><div class="rw-c">${note}</div></div>`;
    const rk = game.rk, chips = rk ? `<div class="rw-ranks"><span>#${rk.spr} sprints in the team</span><span>#${rk.d20} distance &gt; 20 km/h</span><span>#${rk.td} total distance</span><em>among the ${rk.n} players of the whole game</em></div>` : '';
    match = `<section class="rw-sec"><div class="rw-sec-h"><h2>Your match</h2><p>${rwCrest(game.opp, 24)}${rwEsc([game.comp, game.opp].filter(Boolean).join(' · '))}${game.b ? ' · B team' : ''} · ${rwDay(game.d, { weekday: 'short', day: 'numeric', month: 'short' })} · ${rwFmt(game.min)}'</p></div>
      <div class="rw-kpis">${kpi('Distance', rwFmt(game.td), 'm', ofTop3(game.td, t3.td))}${kpi('&gt; 20 km/h', rwFmt(game.d20), 'm', ofTop3(game.d20, t3.d20))}
        ${kpi('Sprints &gt; 25 km/h', rwFmt(game.spr), '', prev.length && (game.spr || 0) >= seasonBest && game.spr ? '<span class="rw-best">Season best</span>' : before4.length ? `${rwChange(game.spr || 0, rwAvg(before4.map((g) => g.spr)))} vs last ${before4.length}` : '')}
        ${kpi('Top speed', game.vmax != null ? game.vmax.toFixed(1) : '–', 'km/h', game.vb ? `season best ${Number(game.vb).toFixed(1)}` : '')}${kpi('Acc + Dec', rwFmt(game.ad), '', ofTop3(game.ad, t3.ad))}</div>${chips}</section>`;
  } else {
    const m = wk.match;
    match = `<section class="rw-sec"><div class="rw-sec-h"><h2>Your match</h2>${m ? `<p>${rwCrest(m.opp, 24)}${rwEsc([m.comp, m.opp].filter(Boolean).join(' · '))} · ${rwDay(m.d, { weekday: 'short', day: 'numeric', month: 'short' })}</p>` : ''}</div>
      <p class="rw-none">${m ? 'You did not play this match.' : 'No match this week.'}</p></section>`;
  }

  const m5 = (k, extra) => last5.map((g) => ({ v: g[k], x: `${rwFmt(g.min)}'`, crest: g.opp || '', ...(extra ? extra(g) : {}) }));
  const lastMatches = last5.length ? `<section class="rw-sec"><div class="rw-sec-h"><h2>Your last ${last5.length === 1 ? 'match' : `${last5.length} matches`}</h2><p>minutes under each match</p></div><div class="rw-charts">
    ${rwChart('Total distance', `avg ${rwFmt(rwAvg(last5.map((g) => g.td)))} m`, rwBars(m5('td'), { color: RW_COL.td, avg: rwAvg(last5.map((g) => g.td)) }))}
    ${rwChart('Distance &gt; 20 km/h', `avg ${rwFmt(rwAvg(last5.map((g) => g.d20)))} m`, rwBars(m5('d20'), { color: RW_COL.d20, avg: rwAvg(last5.map((g) => g.d20)) }))}
    ${rwChart('Accelerations + Decelerations', `avg ${rwFmt(rwAvg(last5.map((g) => g.ad)))}`, rwBars(m5('ad'), { color: RW_COL.ad, avg: rwAvg(last5.map((g) => g.ad)) }))}
    ${rwChart('Sprints &gt; 25 km/h &amp; max speed (km/h)', '', rwBars(m5('spr', (g) => ({ bottom: g.vmax != null ? g.vmax.toFixed(1) : '' })), { color: RW_COL.spr }))}</div></section>` : '';

  const k = cur.k || {}, kinds = [['session', 'session', 'sessions'], ['match', 'match', 'matches'], ['recovery', 'recovery', 'recovery'], ['rehab', 'rehab day', 'rehab days'], ['national team', 'day with the national team', 'days with the national team'], ['day off', 'day off', 'days off']];
  const comp = kinds.filter(([key]) => k[key]).map(([key, one, many]) => `${k[key]} ${k[key] > 1 ? many : one}`).join(' · ');
  const tot = (label, value, unit, raw, key) => `<div class="rw-tot"><small>${label}</small><b class="rw-num">${value}<i>${unit}</i></b><div class="rw-c">${usual.length ? `${rwChange(raw, usualOf(key))} vs your usual week` : ''}</div></div>`;
  const week = `<section class="rw-sec"><div class="rw-sec-h"><h2>Your week</h2><p>${comp || (cur.td ? '' : 'no GPS data this week')}${wk.done ? '' : `${comp ? ' · ' : ''}so far`}</p></div>
    <div class="rw-tots">${tot('Distance', rwKm(cur.td), 'km', cur.td, 'td')}${tot('&gt; 20 km/h', rwFmt(cur.d20), 'm', cur.d20, 'd20')}${tot('Sprints &gt; 25 km/h', rwFmt(cur.spr), '', cur.spr, 'spr')}${tot('Acc + Dec', rwFmt(cur.ad), '', cur.ad, 'ad')}</div></section>`;

  const wl = (w) => (W.weeks.find((x) => x.ws === w.ws) || {}).label || '';
  const wb = (key, extra) => weeks.map((w) => ({ v: w[key], x: wl(w), hi: w.ws === ws, ...(extra ? extra(w) : {}) }));
  const firstShown = weeks.length ? weeks[0].ws : ws;
  const notes = (W.notes || []).filter((n) => { const s = W.weeks.find((x) => x.label === n.week); return s && s.ws >= firstShown && s.ws <= ws; });
  const note = notes.length ? `<p class="rw-note">${notes.map((n) => `${rwEsc(n.week)} left out for every player: the match at ${rwEsc(n.opp)} (${rwDay(n.d, { day: 'numeric', month: 'short' })}) has no GPS data.`).join(' ')}</p>` : '';
  const lastWeeks = weeks.length ? `<section class="rw-sec"><div class="rw-sec-h"><h2>Your last weeks</h2><p>Sunday → Saturday · ${rwEsc(lab)} = this week</p></div><div class="rw-charts">
    ${rwChart('Total distance', usual.length ? `avg ${rwKm(usualOf('td'))}k` : '', rwBars(wb('td', (w) => ({ label: rwKm(w.td) + 'k' })), { color: RW_COL.td, avg: usualOf('td') }))}
    ${rwChart('Distance &gt; 20 km/h', usual.length ? `avg ${rwFmt(usualOf('d20'))} m` : '', rwBars(wb('d20'), { color: RW_COL.d20, avg: usualOf('d20') }))}
    ${rwChart('Accelerations + Decelerations', usual.length ? `avg ${rwFmt(usualOf('ad'))}` : '', rwBars(wb('ad'), { color: RW_COL.ad, avg: usualOf('ad') }))}
    ${rwChart('Sprints &gt; 25 km/h', usual.length ? `avg ${rwFmt(usualOf('spr'))}` : '', rwBars(wb('spr', (w) => ({ under: w.sprd ? rwFmt(w.sprd) + ' m' : '–' })), { color: RW_COL.spr, avg: usualOf('spr') }))}</div>${note}</section>` : '';

  const nx = wk.next;
  const next = nx ? `<footer class="rw-next">${rwCrest(nx.opp, 30)}<span>Next match</span><b>${rwEsc([nx.comp, nx.opp].filter(Boolean).join(' · '))} · ${rwDay(nx.d, { weekday: 'short', day: 'numeric', month: 'short' })}</b></footer>` : '';
  return `<main class="rw-report">${head}${match}${lastMatches}${week}${lastWeeks}${next}</main>`;
}
