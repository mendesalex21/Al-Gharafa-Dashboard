/**
 * Anneau à 3 segments façon "anneaux Apple Watch" : un cercle unique divisé en 3 arcs égaux,
 * un par indicateur (GPS, RPE, Wellness). Position fixe par segment pour que le staff apprenne
 * à lire l'anneau d'un coup d'œil, sans légende répétée sur chaque carte.
 */
const RING_COLORS = { green: 'var(--good)', orange: 'var(--warning)', red: 'var(--critical)', na: 'var(--na)', none: 'var(--na)' };
const RING_LABELS = { green: 'healthy', orange: 'attention', red: 'alert', na: 'unavailable', none: 'no data' };

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx, cy, r, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * @param {[{status:'green'|'orange'|'red'|'na'|'none', name:string, detail?:string}]} segments exactement 3, dans l'ordre GPS/RPE/Wellness
 */
function ringSVG(segments, { size = 92, stroke = 10 } = {}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - stroke / 2 - 1;
  const arc = 114, gap = 6; // 3 * 114 + 3 * 6 = 360
  let start = -90;
  const parts = segments.map((seg) => {
    const end = start + arc;
    const d = arcPath(cx, cy, r, start, end);
    const color = RING_COLORS[seg.status] || RING_COLORS.none;
    start = end + gap;
    const title = `${seg.name}: ${RING_LABELS[seg.status] || 'unknown'}${seg.detail ? ' — ' + seg.detail : ''}`;
    return `<path d="${d}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" fill="none"><title>${escapeHtml(title)}</title></path>`;
  });
  return `<svg class="ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${segments.map(s => RING_LABELS[s.status]).join(', ')}">${parts.join('')}</svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Anneau simple à un seul arc (page Wellness) : la charge va de 0 à `frac` (0..1), départ en haut, sens horaire. */
function progressRingSVG(frac, color, { size = 96, stroke = 8 } = {}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - stroke / 2 - 1;
  const track = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--hairline)" stroke-width="${stroke}" fill="none"/>`;
  let arc = '';
  if (frac > 0) {
    const end = -90 + Math.min(frac, 0.999) * 360;
    arc = `<path d="${arcPath(cx, cy, r, -90, end)}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${track}${arc}</svg>`;
}

/**
 * Niveau (couleur) d'une note 1-5, entière (réponse d'un joueur) ou continue (moyenne d'équipe).
 * v < 4 couvre "orange" jusqu'à 4 exclu : pour des entiers c'est équivalent à v <= 3, et ça fait aussi
 * apparaître en orange une moyenne comme 3.3 ou 3.4 (jamais 4 pile), comme sur l'ancien dashboard.
 */
function itemLevel(v) { return v == null ? 'none' : v <= 2 ? 'red' : v < 4 ? 'orange' : 'green'; }

/** Rond photo (ou initiales) entouré de l'anneau de progression, avec le pourcentage en médaillon — façon ancien kiosk wellness. */
function playerRingHTML(p, { size = 92, stroke = 8 } = {}) {
  // La couleur de l'anneau suit le score pondéré (ring_level), pas l'alerte personnalisée ("level")
  // qui sert uniquement à décider qui apparaît dans la liste "Joueurs en alerte".
  const color = RING_COLORS[p.ring_level] || RING_COLORS.none;
  const frac = p.has_checkin ? p.pct / 100 : 0;
  const photo = p.photo_url
    ? `<img src="${escapeHtml(p.photo_url)}" alt="" class="wring-photo" style="width:${size - stroke * 2 - 4}px;height:${size - stroke * 2 - 4}px">`
    : `<div class="wring-photo wring-initials" style="width:${size - stroke * 2 - 4}px;height:${size - stroke * 2 - 4}px">${escapeHtml((p.name || '?').slice(0, 1))}</div>`;
  const pill = p.has_checkin ? `<span class="wring-pill">${p.pct}%</span>` : '';
  return `<div class="wring" style="width:${size}px;height:${size}px">${progressRingSVG(frac, color, { size, stroke })}${photo}${pill}</div>`;
}
