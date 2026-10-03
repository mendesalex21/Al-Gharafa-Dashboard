/**
 * Squad tab (Football-Manager-like): every current player with his profile — shirt number, age, nationality, height,
 * foot, position — from the "Squad" sheet (edited here, read by sync/build.py) and his season numbers
 * (build.py → squad_stats). Two views: By position (default: who is available today; unavailable players at the end
 * of each position) and List. The player sheet adds or edits a player (this also updates the wellness kiosk list)
 * and replaces his photo (kept exactly as uploaded).
 */
const RO = { data: null, view: 'pos', sort: null, showLeft: false, sheet: null, photo: null };
const RO_LINES = [['Goalkeepers', ['GK']], ['Defenders', ['CD', 'WD']], ['Midfielders', ['CM', 'WM']], ['Forwards', ['FW']]];
const RO_POS = { GK: 'Goalkeeper', CD: 'Centre-back', WD: 'Full-back', CM: 'Central midfielder', WM: 'Wide midfielder', FW: 'Forward' };
const RO_COLS = [['GK', 'Goalkeepers'], ['CD', 'Centre-backs'], ['WD', 'Full-backs'], ['CM', 'Central mid.'], ['WM', 'Wide mid.'], ['FW', 'Forwards']];
const RO_STATUS = { available: ['Available', '#34c759'], injured: ['Injured', '#e5484d'], rehab: ['Rehab', '#ff9f0a'], sick: ['Sick', '#a463f2'], 'national team': ['National team', '#2a78d6'] };

// ------------------------------------------------------------------ flags (small inline drawings, no external service)
const RO_COUNTRIES = {
  Qatar: 'QA', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', Kuwait: 'KW', Bahrain: 'BH', Oman: 'OM', Iraq: 'IQ', Iran: 'IR',
  Jordan: 'JO', Syria: 'SY', Lebanon: 'LB', Palestine: 'PS', Yemen: 'YE', Egypt: 'EG', Sudan: 'SD', Libya: 'LY', Tunisia: 'TN',
  Algeria: 'DZ', Morocco: 'MA', Senegal: 'SN', Mali: 'ML', Guinea: 'GN', 'Ivory Coast': 'CI', Ghana: 'GH', Nigeria: 'NG',
  Cameroon: 'CM', 'Burkina Faso': 'BF', 'South Africa': 'ZA', France: 'FR', Spain: 'ES', Portugal: 'PT', Italy: 'IT', Germany: 'DE',
  Netherlands: 'NL', Belgium: 'BE', England: 'ENG', Scotland: 'SCO', Wales: 'WAL', Ireland: 'IE', Croatia: 'HR', Serbia: 'RS',
  Romania: 'RO', Poland: 'PL', Turkey: 'TR', Greece: 'GR', Iceland: 'IS', Norway: 'NO', Sweden: 'SE', Denmark: 'DK',
  Switzerland: 'CH', Austria: 'AT', Ukraine: 'UA', Brazil: 'BR', Argentina: 'AR', Uruguay: 'UY', Colombia: 'CO', Chile: 'CL',
  Paraguay: 'PY', Venezuela: 'VE', Mexico: 'MX', 'United States': 'US', Canada: 'CA', Jamaica: 'JM', Japan: 'JP', 'South Korea': 'KR',
  China: 'CN', Australia: 'AU', Indonesia: 'ID', Uzbekistan: 'UZ',
};
function roStar(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}
const roV3 = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
const roH3 = (a, b, c) => `<rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.67" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`;
const RO_FLAGS = {
  QA: () => { let d = 'M0 0H9'; for (let i = 0; i < 9; i++) d += `L12 ${(i * 20 / 9 + 10 / 9).toFixed(2)}L9 ${((i + 1) * 20 / 9).toFixed(2)}`; return `<rect width="30" height="20" fill="#8d1b3d"/><path d="${d}H0Z" fill="#fff"/>`; },
  KR: () => `<rect width="30" height="20" fill="#fff"/><path d="M10 10a5 5 0 0 1 10 0z" fill="#cd2e3a"/><path d="M10 10a5 5 0 0 0 10 0z" fill="#0047a0"/>`
    + [[5.2, 4.6, -56], [24.8, 4.6, 56], [5.2, 15.4, 56], [24.8, 15.4, -56]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${[-1.3, 0, 1.3].map((dy) => `<rect x="-2.6" y="${dy - 0.35}" width="5.2" height="0.7" fill="#111"/>`).join('')}</g>`).join(''),
  SN: () => roV3('#00853f', '#fdef42', '#e31b23') + roStar(15, 10, 2.8, '#00853f'),
  UY: () => `<rect width="30" height="20" fill="#fff"/>${[1, 3, 5, 7].map((i) => `<rect y="${(i * 20 / 9).toFixed(2)}" width="30" height="${(20 / 9).toFixed(2)}" fill="#0038a8"/>`).join('')}<rect width="11" height="11.1" fill="#fff"/><circle cx="5.5" cy="5.5" r="2.9" fill="#fcd116"/>`,
  DZ: () => `<rect width="15" height="20" fill="#006233"/><rect x="15" width="15" height="20" fill="#fff"/><circle cx="15.6" cy="10" r="4.6" fill="#d21034"/><circle cx="16.9" cy="10" r="3.7" fill="#fff"/>${roStar(18.4, 10, 2, '#d21034')}`,
  CM: () => roV3('#007a5e', '#ce1126', '#fcd116') + roStar(15, 10, 2.8, '#fcd116'),
  RO: () => roV3('#002b7f', '#fcd116', '#ce1126'),
  PS: () => roH3('#000', '#fff', '#007a3d') + '<path d="M0 0L11 10L0 20Z" fill="#ce1126"/>',
  ENG: () => '<rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#ce1124"/><rect y="8" width="30" height="4" fill="#ce1124"/>',
  TN: () => `<rect width="30" height="20" fill="#e70013"/><circle cx="15" cy="10" r="5.2" fill="#fff"/><circle cx="15.6" cy="10" r="3.8" fill="#e70013"/><circle cx="16.6" cy="10" r="3.1" fill="#fff"/>${roStar(16.4, 10, 2, '#e70013')}`,
  FR: () => roV3('#0055a4', '#fff', '#ef4135'), IT: () => roV3('#009246', '#fff', '#ce2b37'), BE: () => roV3('#000', '#fdda24', '#ef3340'),
  IE: () => roV3('#169b62', '#fff', '#ff883e'), CI: () => roV3('#f77f00', '#fff', '#009e60'), ML: () => roV3('#14b53a', '#fcd116', '#ce1126'),
  GN: () => roV3('#ce1126', '#fcd116', '#009460'), NG: () => roV3('#008751', '#fff', '#008751'),
  DE: () => roH3('#000', '#dd0000', '#ffce00'), NL: () => roH3('#ae1c28', '#fff', '#21468b'), YE: () => roH3('#ce1126', '#fff', '#000'),
  EG: () => roH3('#ce1126', '#fff', '#000'), IQ: () => roH3('#ce1126', '#fff', '#000'), SY: () => roH3('#ce1126', '#fff', '#000'),
  MA: () => `<rect width="30" height="20" fill="#c1272d"/>${roStar(15, 10.4, 4, 'none').replace('fill="none"', 'fill="none" stroke="#006233" stroke-width="0.9"')}`,
  ES: () => '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  PT: () => '<rect width="30" height="20" fill="#da291c"/><rect width="12" height="20" fill="#046a38"/><circle cx="12" cy="10" r="3" fill="#ffe900"/>',
  SA: () => '<rect width="30" height="20" fill="#006c35"/><rect x="8" y="13" width="14" height="1.2" fill="#fff"/>',
  AR: () => roH3('#74acdf', '#fff', '#74acdf') + '<circle cx="15" cy="10" r="1.8" fill="#f6b40e"/>',
  BR: () => '<rect width="30" height="20" fill="#009c3b"/><path d="M15 3L27 10L15 17L3 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="3.6" fill="#002776"/>',
  JP: () => '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#bc002d"/>',
  JM: () => '<rect width="30" height="20" fill="#009b3a"/><path d="M0 0L15 10L0 20ZM30 0L15 10L30 20Z" fill="#000"/><path d="M0 0L30 20M30 0L0 20" stroke="#fed100" stroke-width="3"/>',
};
function flagHtml(country) {
  if (!country) return '';
  const code = RO_COUNTRIES[country], f = code && RO_FLAGS[code];
  return f ? `<svg class="flag" viewBox="0 0 30 20" aria-label="${escapeHtml(country)}">${f()}</svg>` : `<span class="flag flag-0">${escapeHtml(code || country.slice(0, 3).toUpperCase())}</span>`;
}

// ------------------------------------------------------------------ data
function roAge(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return null;
  const [y, m, d] = dob.split('-').map(Number), t = new Date();
  return t.getFullYear() - y - (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d) ? 1 : 0);
}
/** Profiles (live) + season numbers; `avail` = status on the last day of data, `squad` = active / left. */
function roPlayers() {
  const d = RO.data || {}, st = (d.stats && d.stats.players) || {}, al = d.aliases || {};
  return (d.profiles || []).filter((p) => (RO.showLeft ? p.status === 'left' : p.status !== 'left')).map((p) => {
    const s = st[p.player_id] || {};
    return { ...p, id: p.player_id, name: p.display_name || p.full_name || p.player_id, age: roAge(p.dob), s,
      avail: s.status || 'available', squad: p.status || 'active', kiosk: p.kiosk_id || (al[p.player_id] || {}).kiosk || '' };
  });
}
const roOut = (p) => p.avail !== 'available';
function roPhoto(id, size) { const ph = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id]; return `<span class="ro-ph" style="width:${size}px;height:${size}px;${ph ? `background-image:url('${ph}')` : ''}"></span>`; }

// ------------------------------------------------------------------ page
function renderRoster() {
  const root = document.getElementById('view-roster');
  root.innerHTML = `
    ${pageHead('Season 2026/27', 'Squad', 'ro-sub', `<div class="seg" id="ro-view"><button type="button" data-v="pos" class="active">By position</button><button type="button" data-v="list">List</button></div>
      <button type="button" class="btn-primary" id="ro-add">+ Add player</button>`)}
    <div class="ro-summary" id="ro-summary"></div>
    <div id="ro-body"><div class="panel"><div class="empty">Loading…</div></div></div>
    <p class="ro-foot"><button type="button" class="linkbtn" id="ro-left"></button></p>
    <div class="sheet-backdrop" id="ro-bg" hidden></div>
    <aside class="sheet ro-sheet" id="ro-sheet" hidden aria-modal="true" role="dialog"></aside>`;
  root.querySelectorAll('#ro-view button').forEach((b) => { b.onclick = () => { RO.view = b.dataset.v; RO.showLeft = false; drawRoster(); }; });
  document.getElementById('ro-add').onclick = () => roOpen(null);
  document.getElementById('ro-left').onclick = () => { RO.showLeft = !RO.showLeft; RO.view = 'list'; drawRoster(); };
  document.getElementById('ro-bg').onclick = roClose;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && RO.sheet !== null) roClose(); });
  withData('squad', (d) => { RO.data = d; drawRoster(); }, (err) => { document.getElementById('ro-body').innerHTML = loadError(err); });
}

function drawRoster() {
  const body = document.getElementById('ro-body');
  if (!body || !RO.data) return;
  document.querySelectorAll('#ro-view button').forEach((b) => b.classList.toggle('active', b.dataset.v === RO.view && !RO.showLeft));
  const all = (RO.data.profiles || []), left = all.filter((p) => p.status === 'left').length;
  document.getElementById('ro-left').textContent = RO.showLeft ? '‹ Back to the squad' : left ? `Players who left (${left})` : '';
  const ps = roPlayers();
  const asOf = RO.data.stats && RO.data.stats.as_of;
  document.getElementById('ro-sub').textContent = RO.showLeft ? `${ps.length} players who left the club — open one to bring him back`
    : `${ps.length} players · status on ${asOf ? fmtDay(asOf, { day: 'numeric', month: 'short' }) : '—'} · season numbers: competitive matches`;
  const counts = {};
  ps.forEach((p) => { counts[p.avail] = (counts[p.avail] || 0) + 1; });
  document.getElementById('ro-summary').innerHTML = RO.showLeft ? '' : `<span>${ps.length} players</span>${Object.keys(RO_STATUS).filter((k) => counts[k]).map((k) => `<span><i style="background:${RO_STATUS[k][1]}"></i>${counts[k]} ${RO_STATUS[k][0].toLowerCase()}</span>`).join('')}`;
  body.innerHTML = RO.view === 'pos' && !RO.showLeft ? roPositionsHtml(ps) : roListHtml(ps);
  body.querySelectorAll('[data-pid]').forEach((el) => { el.onclick = () => roOpen(el.dataset.pid); });
  body.querySelectorAll('[data-sort]').forEach((th) => { th.onclick = (e) => {
    e.stopPropagation();
    const k = th.dataset.sort;
    RO.sort = k === 'no' ? null : RO.sort && RO.sort.k === k ? { k, dir: -RO.sort.dir } : { k, dir: k === 'name' ? 1 : -1 };
    drawRoster();
  }; });
  if (RO.sheet !== null) roDrawSheet();
}

const RO_SORT = { no: (p) => p.shirt_no, name: (p) => (p.full_name || p.name).toLowerCase(), age: (p) => p.age, ht: (p) => p.height, apps: (p) => p.s.apps,
  g60: (p) => p.s.g60, min: (p) => p.s.min, vmax: (p) => p.s.vmax, acwr: (p) => p.s.acwr };

function roListHtml(ps) {
  const maxMin = Math.max(1, ...ps.map((p) => p.s.min || 0));
  const th = (k, label, cls = '', title = '') => `<th class="${cls}${RO.sort && RO.sort.k === k ? ' sorted' : ''}" ${RO_SORT[k] ? `data-sort="${k}"` : ''} ${title ? `title="${title}"` : ''}>${label}${RO.sort && RO.sort.k === k ? (RO.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  const dash = '<span class="muted">—</span>';
  const row = (p) => {
    const [bg, fg] = roAcwrCol(p.s.acwr);
    return `<tr class="${roOut(p) ? 'out' : ''}" data-pid="${escapeHtml(p.id)}"><td class="c"><span class="ro-no">${p.shirt_no ?? dash}</span></td>
      <td><span class="ro-name">${roPhoto(p.id, 34)}<span><b>${escapeHtml(p.full_name || p.name)}${p.u23 ? '<span class="ro-u23">U23</span>' : ''}</b><small>${RO_POS[p.position] || ''}</small></span></span></td>
      <td class="c"><span class="ro-pos p-${p.position}">${p.position || '—'}</span></td><td class="c" title="${escapeHtml(p.dob ? fmtDay(p.dob) : '')}">${p.age ?? dash}</td>
      <td class="ro-nat">${flagHtml(p.nationality)}<span>${escapeHtml(p.nationality || '')}</span></td>
      <td class="n hm">${p.height ? p.height + ' cm' : dash}</td><td class="c hm">${p.foot || dash}</td>
      <td>${roStatusHtml(p)}</td><td class="n">${p.s.apps ?? 0}</td><td class="n hm">${p.s.g60 ?? 0}</td>
      <td class="n"><span class="ro-minbar">${(p.s.min || 0).toLocaleString('en-US')}<u><i style="width:${((p.s.min || 0) / maxMin * 100).toFixed(0)}%"></i></u></span></td>
      <td class="n hm">${p.s.vmax != null ? p.s.vmax.toFixed(1) : dash}</td><td class="c"><span class="ro-acwr" style="background:${bg};color:${fg}">${p.s.acwr != null ? p.s.acwr.toFixed(2) : '—'}</span></td></tr>`;
  };
  let rows = '';
  if (RO.sort) {
    const f = RO_SORT[RO.sort.k];
    rows = ps.slice().sort((a, b) => { const x = f(a), y = f(b); return x == null ? 1 : y == null ? -1 : (x > y ? 1 : x < y ? -1 : 0) * RO.sort.dir; }).map(row).join('');
  } else {
    for (const [line, poss] of RO_LINES) {
      const g = ps.filter((p) => poss.includes(p.position)).sort((a, b) => (a.shirt_no ?? 999) - (b.shirt_no ?? 999) || a.name.localeCompare(b.name));
      if (g.length) rows += `<tr class="grp"><td colspan="13">${line} · ${g.length}</td></tr>` + g.map(row).join('');
    }
    const other = ps.filter((p) => !RO_POS[p.position]);
    if (other.length) rows += `<tr class="grp"><td colspan="13">No position · ${other.length}</td></tr>` + other.map(row).join('');
  }
  return `<section class="panel ro-panel"><div class="ro-scroll"><table class="ro-tbl"><thead><tr>${th('no', 'No.', 'c')}${th('name', 'Player')}<th class="c">Pos</th>${th('age', 'Age', 'c')}<th>Nat.</th>
    ${th('ht', 'Height', 'n hm')}<th class="c hm">Foot</th><th>Status</th>${th('apps', 'Apps', 'n', 'Competitive matches played')}${th('g60', "60'+", 'n hm', 'Competitive matches with 60 minutes or more')}
    ${th('min', 'Minutes', 'n')}${th('vmax', 'Top speed', 'n hm', 'km/h, this season')}${th('acwr', 'A:C TD', 'c', '7:28, total distance')}</tr></thead><tbody>${rows || `<tr><td colspan="13">${emptyState('No player.')}</td></tr>`}</tbody></table></div></section>`;
}

function roStatusHtml(p) {
  if (p.squad === 'left') return '<span class="ro-st"><i style="background:#c3c2b7"></i>Left the club</span>';
  const [l, c] = RO_STATUS[p.avail] || RO_STATUS.available;
  return `<span class="ro-st"><i style="background:${c}"></i>${l}</span>`;
}
function roAcwrCol(v) { return v == null ? ['#f2f2ef', '#898781'] : v < 0.5 ? ['#e3f0fb', '#2a6fb5'] : v < 0.78 ? ['#cfe2f7', '#1f4f8f'] : v <= 1.37 ? ['#dcf3dc', '#1f6b1f'] : v <= 1.5 ? ['#fbefcc', '#8a5a00'] : ['#fbdcdc', '#9b1c1c']; }

/** By position: total available on top, then one column per position (unavailable players last). */
function roPositionsHtml(ps) {
  const avail = ps.filter((p) => !roOut(p)).length;
  const tops = RO_COLS.map(([pos, lab]) => {
    const g = ps.filter((p) => p.position === pos), av = g.filter((p) => !roOut(p)).length;
    // available first, unavailable (grey) at the end — as in the columns below
    return `<div class="ro-pc"><div class="l">${lab}<b>${av}<small>/${g.length}</small></b></div><div class="ro-dots">${'<i></i>'.repeat(av)}${'<i class="o"></i>'.repeat(g.length - av)}</div></div>`;
  }).join('');
  const chip = (p) => `<div class="ro-chip${roOut(p) ? ' out' : ''}" data-pid="${escapeHtml(p.id)}" style="--ring:${roOut(p) ? RO_STATUS[p.avail][1] : 'transparent'}">${roPhoto(p.id, 30)}<span><b>${escapeHtml(p.name)}</b><small>${roOut(p) ? RO_STATUS[p.avail][0] : `${p.shirt_no ? '#' + p.shirt_no + ' · ' : ''}${p.s.min || 0} min`}</small></span></div>`;
  const cols = RO_COLS.map(([pos]) => {
    const g = ps.filter((p) => p.position === pos).sort((a, b) => (b.s.min || 0) - (a.s.min || 0) || a.name.localeCompare(b.name));
    const av = g.filter((p) => !roOut(p)), un = g.filter(roOut);
    return `<div class="ro-col">${av.map(chip).join('')}${un.length ? `<div class="ro-sep">Unavailable · ${un.length}</div>${un.map(chip).join('')}` : ''}</div>`;
  }).join('');
  return `<div class="ro-top"><div class="ro-tot"><b>${avail}<small> / ${ps.length}</small></b><span>players available today</span></div>${tops}</div>
    <div class="ro-depth"><div class="ro-legend"><b>Rings</b>${Object.entries(RO_STATUS).filter(([k]) => k !== 'available').map(([, [l, c]]) => `<span><i style="--c:${c}"></i>${l}</span>`).join('')}</div>${cols}</div>`;
}

// ------------------------------------------------------------------ player sheet (add / edit)
function roOpen(pid) { RO.sheet = pid || ''; RO.photo = null; document.getElementById('ro-sheet').hidden = false; document.getElementById('ro-bg').hidden = false; roDrawSheet(); }
function roClose() { RO.sheet = null; RO.photo = null; document.getElementById('ro-sheet').hidden = true; document.getElementById('ro-bg').hidden = true; }

function roDrawSheet() {
  const el = document.getElementById('ro-sheet');
  const p = RO.sheet ? (RO.data.profiles || []).find((x) => x.player_id === RO.sheet) : null;
  if (RO.sheet && !p) { roClose(); return; }
  const v = (k) => escapeHtml(p && p[k] != null ? String(p[k]) : '');
  const al = (RO.data.aliases || {})[RO.sheet] || {};
  const photo = RO.photo || (p && typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[p.player_id]);
  const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([val, lab]) => `<option value="${val}" ${String(cur ?? '') === val ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
  el.innerHTML = `
    <div class="sheet-head"><div><div class="pg-eyebrow">${p ? (p.status === 'left' ? 'Left the club' : 'Player') : 'New player'}</div><h2>${p ? escapeHtml(p.full_name || p.display_name) : 'Add a player'}</h2></div><button type="button" class="sheet-x" aria-label="Close">×</button></div>
    <form class="cal-form ro-form" id="ro-form" autocomplete="off">
      <div class="ro-up"><span class="ro-ph" id="ro-prev" style="width:76px;height:76px;${photo ? `background-image:url('${photo}')` : ''}"></span>
        <div><small>Photo · PNG with a transparent background is best · kept exactly as uploaded</small><br>
        <button type="button" class="btn-light" id="ro-pick">${photo ? 'Replace photo…' : 'Add a photo…'}</button><input type="file" id="ro-file" accept="image/png,image/jpeg,image/webp" hidden></div></div>
      <div class="f2"><label>Full name<input name="full_name" value="${v('full_name')}" placeholder="e.g. Hyun Soo Jang"></label><label>Short name <small>(used on the site)</small><input name="display_name" value="${v('display_name')}" required placeholder="e.g. Jang"></label></div>
      <div class="f3"><label>Shirt number<input type="number" name="shirt_no" min="1" max="99" value="${v('shirt_no')}"></label>
        <label>Position${sel('position', [['', '—'], ...Object.entries(RO_POS).map(([k, l]) => [k, `${k} · ${l}`])], p && p.position)}</label>
        <label>Foot${sel('foot', [['', '—'], ['R', 'Right'], ['L', 'Left'], ['L/R', 'Both']], p && p.foot)}</label></div>
      <div class="f3"><label>Date of birth<input type="date" name="dob" value="${v('dob')}"></label><label>Age<input value="${p && roAge(p.dob) != null ? roAge(p.dob) : ''}" disabled></label>
        <label>Nationality<input name="nationality" list="ro-countries" value="${v('nationality')}" placeholder="Choose…"></label></div>
      <div class="f3"><label>Height <small>cm</small><input type="number" name="height" min="140" max="220" value="${v('height')}"></label>
        <label>Weight <small>kg</small><input type="number" name="weight" min="40" max="140" step="0.1" value="${v('weight')}"></label>
        <label class="ro-check"><span>U23</span><input type="checkbox" name="u23" ${p && p.u23 ? 'checked' : ''}></label></div>
      <div class="f3"><label>Name in StatSports<input name="gps_name" value="${v('gps_name')}" placeholder="as in the GPS export"></label>
        <label>Name(s) in VALD<input name="vald_names" value="${v('vald_names')}" placeholder="separate with ;"></label>
        <label>Wellness kiosk ID<input name="kiosk_id" value="${escapeHtml((p && p.kiosk_id) || al.kiosk || '')}" placeholder="e.g. jang"></label></div>
      <datalist id="ro-countries">${Object.keys(RO_COUNTRIES).map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="f-actions"><button type="submit" class="btn-primary">Save</button><button type="button" class="btn-light" id="ro-cancel">Cancel</button>
        ${p ? (p.status === 'left' ? '<button type="button" class="btn-light" id="ro-back">Back in the squad</button>' : '<button type="button" class="btn-danger" id="ro-leave">Mark as left</button>') : ''}</div>
      <p class="f-msg" id="ro-msg"></p>
      ${p ? `<p class="note">Saved in the Squad sheet (Google Sheet); the wellness kiosk list follows. Last change: ${escapeHtml(String(p.by || '').split('@')[0] || '—')}${p.at ? ' · ' + fmtDay(p.at.slice(0, 10), { day: 'numeric', month: 'short' }) : ''}.</p>` : '<p class="note">A new player is recognised in the GPS and VALD files from the next data update (names as they appear there).</p>'}
    </form>`;
  el.querySelector('.sheet-x').onclick = roClose;
  el.querySelector('#ro-cancel').onclick = roClose;
  const file = el.querySelector('#ro-file'), msg = el.querySelector('#ro-msg');
  el.querySelector('#ro-pick').onclick = () => file.click();
  file.onchange = () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 2900000) { msg.textContent = 'Use a PNG, JPG or WebP image under 3 MB.'; return; }
    const rd = new FileReader();
    rd.onload = () => { RO.photo = String(rd.result); el.querySelector('#ro-prev').style.backgroundImage = `url('${RO.photo}')`; msg.textContent = 'New photo ready — it is uploaded when you save.'; };
    rd.readAsDataURL(f);
  };
  const form = el.querySelector('#ro-form');
  form.onsubmit = (e) => { e.preventDefault(); roSave(form, p, {}); };
  const leave = el.querySelector('#ro-leave'), back = el.querySelector('#ro-back');
  if (leave) leave.onclick = () => { if (confirm(`Mark ${p.display_name} as having left the club? His history is kept.`)) roSave(form, p, { status: 'left' }); };
  if (back) back.onclick = () => roSave(form, p, { status: 'active' });
}

async function roSave(form, p, extra) {
  const msg = form.querySelector('#ro-msg'), fd = new FormData(form);
  const g = (k) => String(fd.get(k) ?? '').trim();
  const data = { full_name: g('full_name'), display_name: g('display_name'), shirt_no: g('shirt_no'), position: g('position'), foot: g('foot'), dob: g('dob'),
    nationality: g('nationality'), height: g('height'), weight: g('weight'), u23: fd.get('u23') === 'on', gps_name: g('gps_name'), vald_names: g('vald_names'), kiosk_id: g('kiosk_id'), ...extra };
  if (p) data.player_id = p.player_id;
  if (!data.display_name) { msg.textContent = 'The short name is needed.'; return; }
  form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  msg.textContent = 'Saving…';
  try {
    const res = await saveSquadProfile(data);
    RO.data.profiles = res.profiles;
    if (RO.photo) {
      msg.textContent = 'Uploading the photo…';
      await uploadPlayerPhoto(res.saved, RO.photo);
      if (typeof PHOTO_DATA !== 'undefined') PHOTO_DATA[res.saved] = RO.photo;
    }
    if (!AUTH.demo) cacheSet('squad', RO.data);
    roClose();
    drawRoster();
  } catch (err) {
    msg.textContent = err.message || String(err);
    form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
}
