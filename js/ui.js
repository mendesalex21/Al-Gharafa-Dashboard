/** Shared UI helpers for the data pages (formatting, zones, avatars, segmented controls, tables). */
const STATUS_COL = { green: '#34c759', orange: '#ff9f0a', red: '#ff3b30', na: '#aeaeb2' };
const METRIC_KEYS = ['td', 'hit', 'spr', 'acc_dec', 'srpe'];
const METRIC_SHORT = { td: 'TD', hit: 'HIT', spr: 'Sprint', acc_dec: 'Acc+Dec', srpe: 'sRPE' };
const METRIC_LONG = { td: 'Total distance', hit: 'HIT distance', spr: 'Sprint distance', acc_dec: 'HIT Acc + Dec', srpe: 'sRPE load' };
const METRIC_UNIT = { td: 'm', hit: 'm', spr: 'm', acc_dec: '', srpe: 'AU' };
const CAT_INFO = {
  m: ['Match', '#1d1d1f'], b: ['B-team match', '#48484a'], t: ['Training', '#2a78d6'], p: ['Partial', '#7fb0ea'],
  c: ['Compensatory', '#64d2ff'], i: ['Individual / gym', '#b4d4f7'], r: ['Rehab', '#bf5af2'], x: ['Injury', '#ff3b30'],
  s: ['Sick', '#ff9f0a'], n: ['National team', '#8e8e93'], a: ['Absent / not selected', '#d1d1d6'], o: ['Off', '#ececf0'], '-': ['No record', 'transparent'],
};

function fmtN(v, d = 0) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSigned(v, d = 1) { return v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d); }
function dateOf(iso) { return new Date(iso + 'T00:00:00Z'); }
function fmtDay(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return iso ? dateOf(iso).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }) : '—';
}
function addDays(iso, n) { return new Date(dateOf(iso).getTime() + n * 86400000).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((dateOf(b) - dateOf(a)) / 86400000); }
function fmtUpdated(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return 'Updated ' + d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** ACWR zone: >1.5 red · 1.3–1.5 orange · 0.8–1.3 green · <0.8 low (underload). */
function acwrLevel(v) {
  if (v == null) return null;
  return v > 1.5 ? 'red' : v > 1.3 ? 'orange' : v >= 0.8 ? 'green' : 'low';
}
function acwrChip(v) {
  const lv = acwrLevel(v);
  if (!lv) return '<span class="chip-v na">—</span>';
  return `<span class="chip-v ${lv}">${v.toFixed(2)}</span>`;
}
const ACWR_BANDS = [
  { from: 0, to: 0.8, color: STATUS_COL.orange, alpha: 0.06 },
  { from: 0.8, to: 1.3, color: STATUS_COL.green, alpha: 0.09 },
  { from: 1.3, to: 1.5, color: STATUS_COL.orange, alpha: 0.10 },
  { from: 1.5, to: 9, color: STATUS_COL.red, alpha: 0.08 },
];

/** Diverging tint for neutral z-scores (above / below the squad): blue below, burnt orange above. */
function zTint(z) {
  if (z == null) return '';
  const a = Math.min(Math.abs(z), 2.5) / 2.5 * 0.34;
  if (a < 0.04) return '';
  return `background:${z > 0 ? `rgba(200,88,26,${a})` : `rgba(42,120,214,${a})`}`;
}
/** Tint for "better / worse than the squad" (tests): green better, red worse. */
function perfTint(zAdj) {
  if (zAdj == null) return '';
  const a = Math.min(Math.abs(zAdj), 2.5) / 2.5 * 0.30;
  if (a < 0.05) return '';
  return `background:${zAdj > 0 ? `rgba(52,199,89,${a})` : `rgba(255,59,48,${a})`}`;
}

function initialsOf(name) { return (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
/** Round avatar: initials underneath, photo on top once (and only if) it loads. */
function avatarHtml(id, name, size = 28) {
  const photo = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id];
  return `<span class="pav" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px"><span>${escapeHtml(initialsOf(name))}</span>${photo ? `<img src="${photo}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}
function playerCell(id, name, sub) {
  return `<span class="pcell">${avatarHtml(id, name)}<span><b>${escapeHtml(name)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</span></span>`;
}

function segHtml(id, options, active) {
  return `<div class="seg" id="${id}" role="group">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === active ? 'active' : ''}">${l}</button>`).join('')}</div>`;
}
function bindSeg(id, onChange) {
  const el = document.getElementById(id);
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    onChange(b.dataset.v);
  }));
}

function pageHead(eyebrow, title, subId, right = '') {
  return `<div class="pg-head"><div><div class="pg-eyebrow">${eyebrow}</div><h1 class="pg-title">${title}</h1><p class="pg-sub" id="${subId}"></p></div><div class="pg-tools">${right}</div></div>`;
}
function emptyState(msg) { return `<div class="empty">${escapeHtml(msg)}</div>`; }
function loadError(err) { return `<div class="panel"><div class="empty">Couldn't load data — ${escapeHtml(err.message || String(err))}</div></div>`; }

/** Makes a table's headers sortable. `rows` = array of {cells: html[], keys: sortValue[]} ; `head` = [{label, cls}]. */
function sortableTable(mount, head, rows, initial = { col: 0, dir: 1 }, rowAttrs = () => '', foot = '') {
  let st = { ...initial };
  const draw = () => {
    const sorted = rows.slice().sort((a, b) => {
      const x = a.keys[st.col], y = b.keys[st.col];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * st.dir;
    });
    mount.innerHTML = `<table class="dtable"><thead><tr>${head.map((h, i) => `<th class="${h.cls || ''} ${i === st.col ? 'sorted' : ''}" data-i="${i}">${h.label}${i === st.col ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map((r) => `<tr ${rowAttrs(r)}>${r.cells.map((c, i) => `<td class="${head[i].cls || ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
    mount.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
      const i = +th.dataset.i;
      st = { col: i, dir: st.col === i ? -st.dir : (head[i].desc ? -1 : 1) };
      draw();
    }));
  };
  draw();
}

/** Paint from the local copy of a payload immediately, then again when the fresh copy arrives. */
async function withData(action, onData, onError) {
  const cached = !AUTH.demo && cacheGet(action);
  if (cached) onData(cached, true);
  try {
    onData(await loadData(action), false);
  } catch (err) {
    if (!cached) onError(err);
  }
}
