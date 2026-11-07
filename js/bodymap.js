/* The body map (his choice, mockup "A · Muscle map", 2026-11-07): one athletic figure, front + back, drawn once (the right half)
 * and mirrored; the injured muscle itself takes the colour of the injury's type (darker + a number when several), the joints
 * (ankle, foot, hip, head) a round mark. Used by Workload › Player (his history), Workload › Injuries (the squad's season) and
 * the injury entry (a tap on the muscle = region + side). Player's right = viewer's left on the front view, viewer's right on
 * the back view. */
const BM_START = [100, 10];
const BM_SEG = [ // cubic segments of the half outline, top of the head → crotch (viewBox 200 × 440, centre x = 100)
  [113, 10, 121, 20, 121, 34], [121, 47, 114, 58, 106, 61], [106, 64, 106, 67, 106, 70], [112, 74, 126, 76, 136, 80], [146, 84, 150, 94, 150, 104],
  [152, 124, 154, 140, 155, 156], [157, 172, 160, 186, 161, 200], [162, 212, 163, 222, 160, 230], [158, 240, 152, 244, 148, 238], [146, 232, 147, 222, 147, 214],
  [146, 200, 144, 186, 141, 172], [139, 158, 138, 140, 136, 126], [135, 120, 134, 116, 133, 114], [132, 136, 128, 156, 126, 170], [128, 184, 132, 196, 133, 210],
  [135, 238, 133, 266, 128, 292], [127, 302, 130, 318, 129, 336], [128, 356, 122, 380, 120, 398], [120, 408, 126, 416, 128, 422], [129, 428, 120, 430, 110, 428],
  [106, 427, 105, 420, 106, 410], [106, 392, 104, 370, 106, 346], [108, 326, 108, 310, 107, 296], [106, 270, 104, 248, 102, 232], [101, 228, 100, 226, 100, 226],
];
const BM_BODY = (() => {
  const mx = (x) => 200 - x, pts = [BM_START, ...BM_SEG.map((s) => [s[4], s[5]])];
  let d = `M${BM_START[0]} ${BM_START[1]}`;
  BM_SEG.forEach((s) => { d += `C${s.join(' ')}`; });
  for (let i = BM_SEG.length - 1; i >= 0; i--) { const s = BM_SEG[i], p = pts[i]; d += `C${mx(s[2])} ${s[3]} ${mx(s[0])} ${s[1]} ${mx(p[0])} ${p[1]}`; }
  return d + 'Z';
})();
/* muscles of the viewer's right half: [shape, centre x, centre y] */
const BM_MUS = {
  F: {
    delt: ['<ellipse cx="140" cy="99" rx="10" ry="14" transform="rotate(-18 140 99)"/>', 140, 99], pec: ['<path d="M103 90C117 84 131 88 134 100C134 112 122 118 104 117Z"/>', 119, 103],
    bic: ['<ellipse cx="145" cy="136" rx="6" ry="17"/>', 145, 136], fore: ['<ellipse cx="153" cy="186" rx="5.5" ry="22"/>', 153, 186],
    abs: ['<rect x="102" y="123" width="13" height="18" rx="5"/><rect x="102" y="144" width="13" height="18" rx="5"/><rect x="102" y="165" width="13" height="18" rx="5"/>', 108, 153],
    obl: ['<path d="M118 124C126 132 128 160 124 184L118 186Z"/>', 122, 155], quad: ['<path d="M108 224C118 212 131 216 132 238C133 262 128 284 120 290C112 284 107 260 108 224Z"/>', 120, 254],
    add: ['<path d="M102 226C107 230 109 250 106 270C103 262 101 244 102 226Z"/>', 105, 247], knee: ['<ellipse cx="117" cy="301" rx="8" ry="7"/>', 117, 301],
    shin: ['<ellipse cx="120" cy="346" rx="6" ry="30"/>', 120, 346],
  },
  B: {
    trap: ['<path d="M101 66C108 72 124 78 135 82C126 96 112 108 101 118Z"/>', 112, 90], rdelt: ['<ellipse cx="140" cy="99" rx="10" ry="13" transform="rotate(18 140 99)"/>', 140, 99],
    lat: ['<path d="M104 120C118 110 132 112 134 126C132 150 124 168 106 176Z"/>', 120, 140], tri: ['<ellipse cx="146" cy="136" rx="6" ry="17"/>', 146, 136],
    fore: ['<ellipse cx="153" cy="186" rx="5.5" ry="22"/>', 153, 186], low: ['<rect x="101" y="172" width="13" height="26" rx="5"/>', 107, 185],
    glute: ['<path d="M101 200C114 194 132 198 134 214C134 230 120 238 102 236Z"/>', 118, 217], ham: ['<path d="M104 242C116 236 130 240 131 256C132 276 126 292 118 298C110 292 104 270 104 242Z"/>', 118, 266],
    calf: ['<path d="M108 316C118 308 130 318 129 338C128 356 120 366 113 368C107 356 106 334 108 316Z"/>', 118, 340], ach: ['<rect x="110" y="370" width="6" height="28" rx="3"/>', 113, 384],
  },
};
/* the regions the staff choose from: muscles of each view, or a joint mark [view, dx, y] (dx 0 = on the centre line) */
const BM_REGIONS = [
  ['Hamstring', { B: ['ham'] }], ['Quadriceps', { F: ['quad'] }], ['Adductor / groin', { F: ['add'] }], ['Calf', { B: ['calf'] }], ['Achilles', { B: ['ach'] }],
  ['Shin', { F: ['shin'] }], ['Knee', { F: ['knee'] }], ['Glute', { B: ['glute'] }], ['Lower back', { B: ['low'] }], ['Upper back / neck', { B: ['trap', 'lat'] }],
  ['Abdominal', { F: ['abs', 'obl'] }], ['Chest', { F: ['pec'] }], ['Shoulder', { F: ['delt'], B: ['rdelt'] }], ['Arm', { F: ['bic', 'fore'], B: ['tri', 'fore'] }],
  ['Ankle', { j: ['F', 13, 400] }], ['Foot', { j: ['F', 16, 424] }], ['Hip', { j: ['F', 27, 210] }], ['Head', { j: ['F', 0, 30] }],
];
const BM_OF = Object.fromEntries(BM_REGIONS);
const BM_CENTRAL = ['Lower back', 'Abdominal', 'Head']; // drawn on the centre line: no side to choose
const BM_TYPE = { Muscle: '#d03b3b', Tendon: '#8b5cf6', 'Ligament / sprain': '#f29d0b', Bone: '#2a78d6', Contusion: '#8e8e93', Other: '#8e8e93' };
const bmCol = (type) => BM_TYPE[type] || '#d03b3b';

/** Injuries (each { region, side 'R'/'L'/'B'/'', type }) → { 'Region|R': { n, type } } — 'B' or no side counts on both sides. */
function bodyMapMarks(list) {
  const m = {};
  (list || []).forEach((x) => {
    if (!x || !BM_OF[x.region]) return;
    const sides = BM_CENTRAL.includes(x.region) ? ['C'] : x.side === 'R' || x.side === 'L' ? [x.side] : ['R', 'L'];
    sides.forEach((sd) => { const k = `${x.region}|${sd}`; m[k] = m[k] || { n: 0, type: x.type }; m[k].n += 1; m[k].type = m[k].type || x.type; });
  });
  return m;
}
/** One view ('F' / 'B') as SVG. marks: bodyMapMarks(); pick: { region, side } chosen in the entry; picking: every zone clickable. */
function bodyMapSvg(view, marks = {}, pick = null, picking = false) {
  const rightHalf = view === 'F' ? 'mirror' : 'plain'; // the drawn half that is the player's right side
  let s = `<path d="${BM_BODY}" class="bm-body"/>`;
  const badges = [];
  const zone = (region, side) => {
    const sd = BM_CENTRAL.includes(region) ? 'C' : side, mk = marks[`${region}|${sd}`], on = pick && pick.region === region && (sd === 'C' || pick.side === side);
    return { mk, on, attrs: `data-r="${escapeHtml(region)}" data-s="${sd === 'C' ? '' : side}"`, fill: on ? 'var(--bm-pick)' : mk ? bmCol(mk.type) : '', op: on ? 1 : mk ? (mk.n > 1 ? 0.95 : 0.6) : 1 };
  };
  const regionOfKey = {};
  BM_REGIONS.forEach(([r, v]) => (v[view] || []).forEach((k) => { regionOfKey[k] = r; }));
  Object.entries(BM_MUS[view]).forEach(([k, [shape, cx, cy]]) => {
    const region = regionOfKey[k];
    ['plain', 'mirror'].forEach((half) => {
      const side = half === rightHalf ? 'R' : 'L', z = region ? zone(region, side) : null;
      const tr = half === 'mirror' ? ' transform="translate(200 0) scale(-1 1)"' : '';
      const cls = `bm-mus${region && picking ? ' bm-hit' : ''}`;
      s += `<g class="${cls}"${tr}${z ? ` ${z.attrs}` : ''}${z && z.fill ? ` style="fill:${z.fill};fill-opacity:${z.op}"` : ''}>${shape}</g>`;
      if (z && z.mk && z.mk.n > 1 && !badges.some((b) => b.key === `${region}|${side}`) && (BM_OF[region][view] || [])[0] === k) {
        badges.push({ key: `${region}|${side}`, x: half === 'mirror' ? 200 - cx : cx, y: cy, n: z.mk.n });
      }
    });
  });
  BM_REGIONS.forEach(([region, v]) => {
    if (!v.j || v.j[0] !== view) return;
    const [, dx, y] = v.j, sides = dx === 0 ? ['C'] : ['R', 'L'];
    sides.forEach((side) => {
      const z = zone(region, side === 'C' ? 'R' : side), x = side === 'C' ? 100 : 100 + (view === 'F' ? (side === 'R' ? -dx : dx) : (side === 'R' ? dx : -dx));
      if (!z.mk && !z.on && !picking) return;
      s += `<circle cx="${x}" cy="${y}" r="${z.mk && z.mk.n > 1 ? 12 : 10}" class="bm-joint${picking ? ' bm-hit' : ''}" ${z.attrs}${z.fill ? ` style="fill:${z.fill};fill-opacity:${z.op}"` : ''}/>`;
      if (z.mk && z.mk.n > 1) badges.push({ x, y, n: z.mk.n });
    });
  });
  badges.forEach((b) => { s += `<text x="${b.x}" y="${b.y + 4}" class="bm-n">${b.n}</text>`; });
  return `<svg viewBox="0 0 200 440" role="img" aria-label="${view === 'F' ? 'front' : 'back'}">${s}</svg>`;
}
/** Front + back side by side, with their captions. */
function bodyMapHtml(marks, opts = {}) {
  return `<div class="bm${opts.picking ? ' bm-picking' : ''}" style="--bm-w:${opts.w || 120}px"><figure>${bodyMapSvg('F', marks, opts.pick, opts.picking)}<figcaption>front</figcaption></figure>`
    + `<figure>${bodyMapSvg('B', marks, opts.pick, opts.picking)}<figcaption>back</figcaption></figure></div>`;
}
function bodyMapLegend() {
  return `<div class="bm-leg">${[['Muscle', 'Muscle'], ['Ligament / sprain', 'Ligament'], ['Tendon', 'Tendon'], ['Bone', 'Bone'], ['Contusion', 'Contusion']]
    .map(([t, l]) => `<span><i style="background:${bmCol(t)}"></i>${l}</span>`).join('')}<span class="muted">darker + number = several</span></div>`;
}
