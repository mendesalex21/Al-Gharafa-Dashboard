/**
 * Rendu des anneaux — copié tel quel depuis l'ancien dashboard wellness (mêmes fonctions,
 * mêmes couleurs, mêmes dimensions). Ne pas "améliorer" sans revérifier contre l'original.
 */
var WCOLORS = { green: "#34c759", orange: "#ff9f0a", red: "#ff3b30", gray: "#d2d2d7" };

function wInitials(name) {
  return (name || "?").split(" ").map(function (w) { return w[0]; }).join("").substring(0, 2).toUpperCase();
}

function wTint(hex, amt) {
  var c = hex.replace("#", "");
  var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
  return "rgb(" + r + "," + g + "," + b + ")";
}

/** Anneau SVG d'un joueur (carte). status=null,frac=null => anneau gris vide ("pas de check-in"). */
function scoreRingSvg(status, frac) {
  var D = 160, SW = 14, cx = D / 2, cy = D / 2, r = (D - SW) / 2;
  var track = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="' + WCOLORS.gray + '" stroke-opacity="0.35" stroke-width="' + SW + '" fill="none"/>';
  if (frac == null) return '<svg viewBox="0 0 ' + D + ' ' + D + '" width="' + D + '" height="' + D + '">' + track + '</svg>';
  var C = 2 * Math.PI * r;
  var dash = C * Math.max(0, Math.min(1, frac));
  var col = WCOLORS[status] || WCOLORS.gray;
  var arc = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="' + col + '" stroke-width="' + SW + '" fill="none" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
  return '<svg viewBox="0 0 ' + D + ' ' + D + '" width="' + D + '" height="' + D + '">' + track + arc + '</svg>';
}

/** Fond conic-gradient pour l'anneau d'équipe et les mini-anneaux par question. */
function progressRingBackground(status, frac) {
  if (status == null || frac == null) return WCOLORS.gray;
  var pct = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1);
  var col = WCOLORS[status] || WCOLORS.gray;
  return "conic-gradient(" + col + " " + pct + "%, " + WCOLORS.gray + " " + pct + "% 100%)";
}

/** Baromètre "vs habitude" : deadband de ±3 points (pas de simple signe). */
function diffLabel(d) {
  if (d == null) return { cls: "flat", html: "—" };
  var arrow = d > 3 ? "▲ " : d < -3 ? "▼ " : "— ";
  var cls = d > 3 ? "up" : d < -3 ? "down" : "flat";
  var txt = (d > 0 ? "+" : "") + d + "% vs average";
  return { cls: cls, html: arrow + txt };
}

/**
 * Carte joueur (photo + anneau + score). `p` = {id, name}. `info` = le payload du backend pour ce
 * joueur : {today, score, status, diff, alert, worst}. Structure HTML et classes CSS identiques à
 * l'original (p-ring, p-ring-photo, p-ring-score, pname, psub, pdiff, pworst, alert-dot, card inactive).
 */
function playerCardHtml(p, info) {
  var photo = PHOTO_DATA[p.id];
  var imgHtml = photo ? ('<img src="' + photo + '" alt="">') : ('<div class="w-initials">' + wInitials(p.name) + '</div>');
  var hasToday = info && info.today;
  var cardClass = hasToday ? "w-card" : "w-card inactive";
  if (!hasToday) {
    return '<div class="' + cardClass + '">' +
      '<div class="w-p-ring">' + scoreRingSvg(null, null) + '<div class="w-p-ring-photo">' + imgHtml + '</div></div>' +
      '<div class="w-pname">' + escapeHtml(p.name) + '</div>' +
      '<div class="w-psub">No check-in</div>' +
      '</div>';
  }
  var d = diffLabel(info.diff);
  var alertBadge = info.alert ? '<div class="w-alert-dot" title="Below personal baseline"></div>' : "";
  var worstHtml = "";
  if (info.worst && info.status !== "green") {
    worstHtml = '<div class="w-pworst" style="background:' + wTint(WCOLORS[info.status], 0.85) + ';color:' + WCOLORS[info.status] + ';">↓ ' + escapeHtml(info.worst.label) + ' (' + info.worst.value + '/5)</div>';
  }
  return '<div class="' + cardClass + '">' +
    '<div class="w-p-ring">' + scoreRingSvg(info.status, info.score / 100) +
    '<div class="w-p-ring-photo">' + imgHtml + '</div>' + alertBadge +
    '<div class="w-p-ring-score" style="color:' + WCOLORS[info.status] + ';">' + info.score + '%</div>' +
    '</div>' +
    '<div class="w-pname">' + escapeHtml(p.name) + ' — <b>' + info.score + '</b>%</div>' +
    '<div class="w-pdiff ' + d.cls + '">' + d.html + '</div>' +
    worstHtml +
    '</div>';
}

/** Mini-anneau par question dans le bandeau d'équipe. Seuils propres à cette vue : 3.5 / 2.5 (pas 70/50). */
function themeRingHtml(label, val) {
  var frac = val == null ? null : Math.max(0, Math.min(1, val / 5));
  var status = val == null ? null : (val >= 3.5 ? "green" : val >= 2.5 ? "orange" : "red");
  var bg = progressRingBackground(status, frac);
  var display = val == null ? "—" : val.toFixed(1);
  var col = status ? WCOLORS[status] : WCOLORS.gray;
  return '<div class="w-theme-ring-item">' +
    '<div class="w-theme-ring" style="background:' + bg + ';">' +
    '<div class="w-inner"><span class="w-theme-ring-value" style="color:' + col + ';">' + display + '</span></div>' +
    '</div>' +
    '<div class="w-theme-ring-name">' + escapeHtml(label) + '</div>' +
    '</div>';
}
