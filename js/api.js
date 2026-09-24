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
async function callApi(action, mockData) {
  if (AUTH.demo) return Promise.resolve(structuredClone(mockData));
  let json;
  const delays = [600, 1500, 3000]; // backoff between attempts (cold start can take a few seconds)
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const resp = await fetch(window.APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS pre-flight against Apps Script
      body: JSON.stringify({ action, token: AUTH.token }),
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
  cacheSet(action, json.data);
  return json.data;
}
function fetchHome() { return callApi('home', MOCK_HOME); }
function fetchWellness() { return callApi('wellness', MOCK_WELLNESS); }
function fetchWellnessHistory() { return callApi('wellness_history', MOCK_WELLNESS_HISTORY); }
