/**
 * Small SVG chart kit shared by every page: one y-axis only, sized to the container's real width
 * (no stretched text), hover / touch crosshair with a tooltip.
 */
const CH_PAD = { l: 40, r: 12, t: 12, b: 26 };

function chNiceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) || step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

function chFmt(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  if (a >= 100 || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(a < 10 ? 2 : 1).replace(/0$/, '');
}

/** Tooltip + crosshair behaviour shared by the charts. `pick(relX, relY)` → {x, y, html} or null. */
function chHover(mount, svg, top, bottom, pick) {
  const cross = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  cross.setAttribute('class', 'ch-cross');
  cross.setAttribute('y1', top); cross.setAttribute('y2', bottom);
  cross.style.display = 'none';
  svg.appendChild(cross);
  const tip = document.createElement('div');
  tip.className = 'ch-tip';
  tip.style.display = 'none';
  mount.appendChild(tip);
  const show = (e) => {
    const r = svg.getBoundingClientRect();
    const hit = pick(e.clientX - r.left, e.clientY - r.top);
    if (!hit) return hide();
    if (hit.cross !== false) { cross.setAttribute('x1', hit.x); cross.setAttribute('x2', hit.x); cross.style.display = ''; }
    tip.innerHTML = hit.html;
    tip.style.display = '';
    const w = tip.offsetWidth;
    tip.style.left = Math.max(w / 2 + 2, Math.min(r.width - w / 2 - 2, hit.x)) + 'px';
    tip.style.top = Math.max(0, (hit.y ?? top) - tip.offsetHeight - 10) + 'px';
  };
  const hide = () => { cross.style.display = 'none'; tip.style.display = 'none'; };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
}

/**
 * Category-x chart (dates or labels, evenly spaced) with optional bars behind lines, sharing ONE y scale.
 * o = { x:[...], height, yMin, yMax, yTicks, yFmt, bars:{values, color:(v,i)=>css},
 *       lines:[{values, color, width, dash, dots:(v,i)=>css|null}], bands:[{from,to,color,alpha}],
 *       refs:[{y,color,dash}], tick:(x,i)=>label|null, tip:(i)=>html, onClick:(i)=>void }
 */
function chXY(mount, o) {
  const W = Math.max(280, Math.round(mount.clientWidth)), H = o.height || 240, P = CH_PAD;
  const n = o.x.length, iw = W - P.l - P.r, ih = H - P.t - P.b;
  if (!n) { mount.innerHTML = '<div class="empty">No data for this period.</div>'; return; }
  const all = [];
  (o.bars ? [o.bars.values] : []).concat((o.lines || []).map((l) => l.values)).forEach((arr) => arr.forEach((v) => { if (v != null) all.push(v); }));
  let yMin = o.yMin ?? Math.min(0, ...all), yMax = o.yMax ?? Math.max(...all, 0) * 1.08;
  if (yMax <= yMin) yMax = yMin + 1;
  const ticks = o.yTicks || chNiceTicks(yMin, yMax);
  const step = iw / n;
  const xAt = (i) => P.l + step * (i + 0.5);
  const yAt = (v) => P.t + ih * (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin));
  const fmt = o.yFmt || chFmt;
  let s = '';
  (o.bands || []).forEach((b) => {
    const y1 = yAt(Math.min(b.to, yMax)), y0 = yAt(Math.max(b.from, yMin));
    if (y0 > y1) s += `<rect x="${P.l}" y="${y1}" width="${iw}" height="${y0 - y1}" style="fill:${b.color}" opacity="${b.alpha ?? 0.08}"/>`;
  });
  ticks.forEach((t) => {
    s += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${yAt(t)}" y2="${yAt(t)}"/><text class="ch-axis" x="${P.l - 6}" y="${yAt(t) + 3.5}" text-anchor="end">${fmt(t)}</text>`;
  });
  (o.refs || []).forEach((r) => {
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${yAt(r.y)}" y2="${yAt(r.y)}" style="stroke:${r.color || 'var(--ink-muted)'}" stroke-width="1" ${r.dash ? 'stroke-dasharray="4 3"' : ''}/>`;
  });
  if (o.bars) {
    const bw = Math.max(1, Math.min(22, step * 0.72)), base = yAt(Math.max(0, yMin));
    o.bars.values.forEach((v, i) => {
      if (v == null || v === 0) return;
      const y = yAt(v), h = Math.max(1, base - y), x = xAt(i) - bw / 2, rr = Math.min(3, bw / 2, h);
      s += `<path d="M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + bw - rr}Q${x + bw},${y} ${x + bw},${y + rr}V${base}Z" style="fill:${o.bars.color ? o.bars.color(v, i) : 'var(--accent)'}"/>`;
    });
  }
  (o.lines || []).forEach((l) => {
    let d = '', pen = false;
    l.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    if (d) s += `<path d="${d}" style="fill:none;stroke:${l.color}" stroke-width="${l.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''}/>`;
    if (l.dots) l.values.forEach((v, i) => {
      const c = v == null ? null : l.dots(v, i);
      if (c) s += `<circle class="ch-dot" cx="${xAt(i)}" cy="${yAt(v)}" r="${n > 60 ? 2.4 : 3.4}" style="fill:${c}"/>`;
    });
  });
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  o.x.forEach((x, i) => {
    if ((n - 1 - i) % every) return;
    const lab = o.tick ? o.tick(x, i) : x;
    if (lab == null) return;
    const anchor = i === n - 1 && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle';
    const tx = anchor === 'end' ? Math.min(W - P.r, xAt(i) + step / 2) : anchor === 'start' ? Math.max(P.l, xAt(i) - step / 2) : xAt(i);
    s += `<text class="ch-axis" x="${tx}" y="${H - 8}" text-anchor="${anchor}">${lab}</text>`;
  });
  mount.innerHTML = `<svg class="ch-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
  const svg = mount.querySelector('svg');
  if (o.tip) chHover(mount, svg, P.t, H - P.b, (rx) => {
    const i = Math.floor((rx - P.l) / step);
    if (i < 0 || i >= n) return null;
    const firstLine = (o.lines || []).find((l) => l.values[i] != null);
    const yv = firstLine ? firstLine.values[i] : o.bars ? o.bars.values[i] : null;
    return { x: xAt(i), y: yv != null ? yAt(yv) : P.t, html: o.tip(i) };
  });
  if (o.onClick) svg.addEventListener('click', (e) => {
    const i = Math.floor((e.clientX - svg.getBoundingClientRect().left - P.l) / step);
    if (i >= 0 && i < n) o.onClick(i);
  });
}

/**
 * Scatter with ratio rays through the origin (e.g. acute vs chronic load, rays at ACWR 0.8 / 1.3 / 1.5).
 * o = { points:[{x,y,color,label,showLabel,id}], height, xMax, yMax, rays:[{r,color,label}], zone:{from,to,color},
 *       xLabel, yLabel, tip:(p)=>html, onClick:(p)=>void }
 */
function chScatter(mount, o) {
  const W = Math.max(280, Math.round(mount.clientWidth)), H = o.height || 300, P = { l: 46, r: 16, t: 14, b: 36 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const pts = o.points.filter((p) => p.x != null && p.y != null);
  if (!pts.length) { mount.innerHTML = '<div class="empty">No data.</div>'; return; }
  const xMax = o.xMax || Math.max(...pts.map((p) => p.x)) * 1.1 || 1;
  const yMax = o.yMax || Math.max(...pts.map((p) => p.y), xMax * 1.6) * 1.05 || 1;
  const xAt = (v) => P.l + iw * v / xMax, yAt = (v) => P.t + ih * (1 - v / yMax);
  let s = '';
  if (o.zone) {  // wedge between rays y = from·x and y = to·x, clipped to the plot box
    const f = o.zone.from, t = o.zone.to, poly = [[0, 0]];
    const xa = Math.min(xMax, yMax / f);
    poly.push([xa, f * xa]);
    if (xa === xMax) poly.push(t * xMax <= yMax ? [xMax, t * xMax] : [xMax, yMax]);
    if (t * xMax > yMax) poly.push([yMax / t, yMax]);
    s += `<path d="M${poly.map(([x, y]) => `${xAt(x)},${yAt(y)}`).join('L')}Z" style="fill:${o.zone.color}" opacity="0.09"/>`;
  }
  chNiceTicks(0, yMax).forEach((t) => { s += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${yAt(t)}" y2="${yAt(t)}"/><text class="ch-axis" x="${P.l - 6}" y="${yAt(t) + 3.5}" text-anchor="end">${chFmt(t)}</text>`; });
  chNiceTicks(0, xMax).forEach((t) => { s += `<text class="ch-axis" x="${xAt(t)}" y="${H - 18}" text-anchor="middle">${chFmt(t)}</text>`; });
  (o.rays || []).forEach((ray) => {
    const x2 = Math.min(xMax, yMax / ray.r), y2 = ray.r * x2;
    s += `<line x1="${xAt(0)}" y1="${yAt(0)}" x2="${xAt(x2)}" y2="${yAt(y2)}" style="stroke:${ray.color}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    s += `<text class="ch-axis" x="${xAt(x2) - 4}" y="${yAt(y2) + 12}" text-anchor="end" style="fill:${ray.color}">${ray.label}</text>`;
  });
  if (o.xLabel) s += `<text class="ch-axis" x="${P.l + iw / 2}" y="${H - 3}" text-anchor="middle">${o.xLabel}</text>`;
  if (o.yLabel) s += `<text class="ch-axis" x="12" y="${P.t + ih / 2}" text-anchor="middle" transform="rotate(-90 12 ${P.t + ih / 2})">${o.yLabel}</text>`;
  pts.forEach((p) => {
    s += `<circle class="ch-dot" cx="${xAt(p.x)}" cy="${yAt(p.y)}" r="5" style="fill:${p.color}${o.onClick ? ';cursor:pointer' : ''}"/>`;
    if (p.showLabel) s += `<text class="ch-label" x="${xAt(p.x) + 8}" y="${yAt(p.y) + 4}">${escapeHtml(p.label)}</text>`;
  });
  mount.innerHTML = `<svg class="ch-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
  const svg = mount.querySelector('svg');
  const nearest = (rx, ry) => {
    let best = null, bd = 400;
    pts.forEach((p) => { const d = (xAt(p.x) - rx) ** 2 + (yAt(p.y) - ry) ** 2; if (d < bd) { bd = d; best = p; } });
    return best;
  };
  if (o.tip) chHover(mount, svg, P.t, H - P.b, (rx, ry) => {
    const p = nearest(rx, ry);
    return p ? { x: xAt(p.x), y: yAt(p.y), html: o.tip(p), cross: false } : null;
  });
  if (o.onClick) svg.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect();
    const p = nearest(e.clientX - r.left, e.clientY - r.top);
    if (p) o.onClick(p);
  });
}
