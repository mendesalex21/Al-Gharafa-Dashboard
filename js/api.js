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
