/** Last-known-good payload per action, so a repeat visit can paint instantly while a fresh copy loads behind it. */
function cacheGet(action) {
  try { const raw = localStorage.getItem('cache_' + action); return raw ? JSON.parse(raw) : null; } catch (err) { return null; }
}
function cacheSet(action, data) {
  try { localStorage.setItem('cache_' + action, JSON.stringify(data)); } catch (err) { /* storage full/disabled: skip caching, not fatal */ }
}

/**
 * Apps Script API call. In demo mode, returns the sample data directly.
 * Retries once on a bad (non-JSON) response — Apps Script's Web App occasionally returns an HTML
 * "starting up" page on its very first request after being idle ("cold start").
 */
async function callApi(action, mockData, extra = null) {
  if (AUTH.demo && mockData == null && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    // local development only: real data built by sync/build.py, read from disk (outside the published site/)
    const r = await fetch(`../sync/out/${action}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`No local ${action}.json — run sync/build.py --no-upload`);
    const data = await r.json();
    if (action === 'calendar') data.edits = demoEdits();
    if (action === 'squad') data.profiles = applyDemoSquad(data.profiles || []);
    return data;
  }
  if (AUTH.demo) return Promise.resolve(structuredClone(mockData));
  if (tokenExpired()) { renewSignIn(); throw new Error('Signing you back in…'); }
  let json;
  const delays = [600, 1500, 3000]; // backoff between attempts (cold start can take a few seconds)
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const resp = await fetch(window.APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS pre-flight against Apps Script
      body: JSON.stringify({ action, token: AUTH.token, ...(extra || {}) }),
    });
    try {
      json = await resp.json();
      break;
    } catch (err) {
      if (attempt === delays.length) throw new Error('The server is starting up — please try again in a moment.');
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  if (!json.ok) {
    if (json.error === 'forbidden') throw new Error('This Google account isn’t authorized on this site.');
    if (json.error === 'unauthenticated' || json.error === 'invalid_token') { sessionStorage.removeItem('id_token'); location.reload(); }
    throw new Error(json.error || 'Unknown error');
  }
  AUTH.user = json.user;
  if (json.edits) json.data.edits = json.edits; // staff calendar edits travel with the calendar payload
  if (!extra) cacheSet(action, json.data); // one-off requests (e.g. photos for a PDF) are not kept
  return json.data;
}
function fetchWellness() { return callApi('wellness', MOCK_WELLNESS); }

/**
 * Player photos: downloaded once per device (private `player_photos` payload: the Drive photos copied by build.py +
 * photos uploaded in the Squad tab) and kept in Cache Storage, then used by every page (wellness, sessions, reports,
 * PDF) instead of the Drive links. On each visit a tiny version check (`photos_v`) tells whether they changed (new
 * build, photo replaced on the site); only then are they downloaded again. Until they are in, the Drive links work.
 */
const PHOTOS_STORE = 'player-photos';
const PHOTOS_KEY = '/photos/current';
let PHOTOS_READY = null;
const PHOTO_DATA_SRC = typeof PHOTO_DATA !== 'undefined' ? { ...PHOTO_DATA } : {}; // the Drive links, before photos are swapped in
function applyPhotos(map) {
  if (typeof PHOTO_DATA === 'undefined' || !map) return;
  const swap = {};
  for (const [pid, uri] of Object.entries(map)) {
    if (!uri) continue;
    if (PHOTO_DATA[pid]) swap[PHOTO_DATA[pid]] = uri;
    if (PHOTO_DATA_SRC[pid]) swap[PHOTO_DATA_SRC[pid]] = uri;
    PHOTO_DATA[pid] = uri; // also players added on the site (no Drive link)
  }
  // photos already on screen (page drawn before they arrived): switch them too
  document.querySelectorAll('img').forEach((im) => { const u = swap[im.getAttribute('src')]; if (u) im.src = u; });
  document.querySelectorAll('.rp-face[style], .ro-ph[style]').forEach((el) => {
    const m = el.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/), u = m && swap[m[1]];
    if (u) el.style.backgroundImage = `url('${u}')`;
  });
}
function loadPlayerPhotos() {
  if (PHOTOS_READY) return PHOTOS_READY;
  PHOTOS_READY = (async () => {
    let box = null, cached = null;
    try { box = window.caches ? await caches.open(PHOTOS_STORE) : null; } catch (err) { /* private mode */ }
    if (box) { const hit = await box.match(PHOTOS_KEY).catch(() => null); if (hit) cached = await hit.json().catch(() => null); }
    const fetchAll = async () => {
      const data = await callApi('player_photos', null, {}); // {} = not copied into localStorage (too big for it)
      applyPhotos(data.photos);
      if (box) {
        try {
          for (const old of await box.keys()) await box.delete(old);
          await box.put(PHOTOS_KEY, new Response(JSON.stringify({ v: data.v || '', photos: data.photos }), { headers: { 'Content-Type': 'application/json' } }));
        } catch (err) { /* not kept: downloaded again next visit */ }
      }
    };
    if (!cached || !cached.photos) { await fetchAll(); return true; }
    applyPhotos(cached.photos);
    if (!AUTH.demo) callApi('photos_v', null, {}).then((r) => (r && r.v && r.v !== cached.v ? fetchAll() : null)).catch(() => { /* next visit */ });
    return true;
  })().catch((err) => { PHOTOS_READY = null; return false; });
  return PHOTOS_READY;
}

/** Squad tab: save a player profile ({saved, profiles}) and upload his photo. Local demo: kept in this browser. */
function demoSquad() { try { return JSON.parse(localStorage.getItem('demo_squad') || '{}'); } catch (err) { return {}; } }
function applyDemoSquad(profiles) {
  const o = demoSquad(), out = profiles.map((p) => (o[p.player_id] ? { ...p, ...o[p.player_id] } : p));
  Object.values(o).forEach((p) => { if (!out.some((x) => x.player_id === p.player_id)) out.push(p); });
  return out;
}
async function saveSquadProfile(data) {
  if (AUTH.demo) {
    const o = demoSquad(), pid = data.player_id || String(data.display_name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    o[pid] = { ...(o[pid] || {}), ...data, player_id: pid, shirt_no: data.shirt_no === '' ? null : Number(data.shirt_no) || null,
      height: Number(data.height) || null, weight: Number(data.weight) || null, status: data.status || (o[pid] && o[pid].status) || 'active', by: 'demo', at: new Date().toISOString() };
    try { localStorage.setItem('demo_squad', JSON.stringify(o)); } catch (err) { /* private mode */ }
    return { saved: pid, profiles: applyDemoSquad((RO.data && RO.data.profiles) || []) };
  }
  return callApi('squad_save', null, { data });
}
async function uploadPlayerPhoto(pid, dataUri) {
  if (AUTH.demo) return { player_id: pid };
  return callApi('squad_photo', null, { player_id: pid, data: dataUri });
}

/** One network fetch per payload per page load, shared by every page that needs it. */
const DATA_PROMISES = {};
const DATA_MOCKS = { wellness: () => MOCK_WELLNESS, wellness_history: () => MOCK_WELLNESS_HISTORY };
function loadData(action) {
  if (!DATA_PROMISES[action]) {
    DATA_PROMISES[action] = callApi(action, DATA_MOCKS[action] ? DATA_MOCKS[action]() : null)
      .catch((err) => { delete DATA_PROMISES[action]; throw err; });
  }
  return DATA_PROMISES[action];
}

/** Calendar edits (local demo: kept in this browser only). */
function demoEdits() { try { return JSON.parse(localStorage.getItem('demo_cal_edits') || '[]'); } catch (err) { return []; } }
async function saveCalendarEdit(id, data) {
  if (AUTH.demo) {
    const list = demoEdits().filter((e) => e.id !== id);
    if (data) list.push({ id, data, by: 'demo', at: new Date().toISOString() });
    try { localStorage.setItem('demo_cal_edits', JSON.stringify(list)); } catch (err) { /* private mode */ }
    return list;
  }
  const resp = await fetch(window.APP_CONFIG.API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'calendar_edit', token: AUTH.token, id, data }),
  });
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error === 'forbidden' ? 'This Google account isn’t authorized to edit.' : json.error || 'Save failed');
  return json.edits;
}
