/**
 * Club crests (img/clubs/<slug>.png — trimmed, transparent, from the logos sent by the staff) and a neutral
 * initials badge for clubs without one yet. A new logo: add the PNG there and its slug below.
 */
const CLUB_LOGOS = new Set(['al-ahli', 'al-ahli-saudi', 'al-arabi', 'al-duhail', 'al-gharafa', 'al-hilal', 'al-ittihad', 'al-nassr',
  'al-rayyan', 'al-sadd', 'al-sailiya', 'al-shahania', 'al-shamal', 'al-wakrah', 'lusail', 'qatar-sc', 'umm-salal']);
const CLUB_ALIAS = { 'al-wakra': 'al-wakrah', 'al-shahaniya': 'al-shahania', 'qatar': 'qatar-sc', 'qatar-sports-club': 'qatar-sc',
  'al-gharafa-sc': 'al-gharafa', 'al-sadd-sc': 'al-sadd', 'al-ahli-sc': 'al-ahli', 'al-ahli-jeddah': 'al-ahli-saudi', 'ittihad': 'al-ittihad', 'al-ettifaq': 'al-ettifaq' };

function clubSlug(name) {
  const s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return CLUB_ALIAS[s] || s;
}
function clubInitials(name) { return String(name || '?').replace(/^al[\s-]+/i, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '?'; }

/** <img> of the crest, or a grey badge with the club's initials. */
function crestHtml(name, size = 26) {
  const s = clubSlug(name);
  return CLUB_LOGOS.has(s)
    ? `<img class="crest" src="img/clubs/${s}.png" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="crest crest-0" style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size * 0.32))}px">${escapeHtml(clubInitials(name))}</span>`;
}
