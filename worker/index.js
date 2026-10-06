/**
 * Al-Gharafa staff dashboard: the server part on Cloudflare. The site's data and the ready-made PDF reports come from
 * storage (KV) in a fraction of a second, instead of the few seconds of the Google script.
 *   GET  /api/data/<name>  a payload (staff session)        GET  /api/pdf/<file>  a report prepared by Update dashboard
 *   POST /api/refresh      re-read the wellness, the staff list and the calendar edits from the Google script
 *                          (the site asks when a wellness page opens or after a calendar edit)
 *   GET  /api/statsports?date=yyyy-mm-dd  that day's sessions from the STATSports API (Session Plan import)
 *   POST /api/upload       Update dashboard (sync/build.py) sends the payloads and the PDFs (upload key)
 *   cron, every 15 min     the same re-read as /api/refresh
 * Staff session: "s1.<payload>.<sig>", issued by the Google script after a Google sign-in (30 days, Auth.gs):
 * HMAC-SHA256 with SESSION_SECRET, the same secret on both sides. The e-mail must still be in the Staff list (KV
 * "staff", re-read with the wellness): removing someone there cuts his access within 10 minutes.
 * Anything missing or failing here → an error status: the site then falls back to the Google script.
 */
const UPLOADS = ['workload', 'sessions', 'objectives', 'calendar', 'tests', 'reports', 'staff_report', 'plan_lib', 'squad_stats'];
const FROM_SCRIPT = ['home', 'wellness', 'wellness_history']; // computed by the Google script from the kiosk check-ins
const DATA = [...FROM_SCRIPT, ...UPLOADS];
const enc = new TextEncoder();

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
    try {
      if (path === '/api/upload' && req.method === 'POST') return await upload(req, env);
      const user = await sessionUser(req, env);
      if (user === 'down') return json({ ok: false, error: 'unavailable' }, 503);
      if (!user) return json({ ok: false, error: 'unauthenticated' }, 401);
      if (path.startsWith('/api/data/') && req.method === 'GET') return await data(req, path.slice(10), user, env, ctx);
      if (path.startsWith('/api/pdf/') && req.method === 'GET') return await pdf(decodeURIComponent(path.slice(9)), env);
      if (path === '/api/statsports' && req.method === 'GET') return await statsports(new URL(req.url).searchParams.get('date'), env);
      if (path === '/api/refresh' && req.method === 'POST') { const r = await refresh(env, new URL(req.url).searchParams.get('force') === '1'); return json({ ok: true, changed: r.changed || [] }); }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(refresh(env, true)); },
};

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function same(a, b) { // constant-time string comparison
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
const hash = async (text) => b64u(new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(text))));

/** The staff member of a valid session, null (no / bad / expired session, or not in the Staff list), 'down' (no list). */
async function sessionUser(req, env) {
  const m = /^Bearer (s1)\.([\w-]+)\.([\w-]+)$/.exec(req.headers.get('Authorization') || '');
  if (!m || !env.SESSION_SECRET) return null;
  if (!same(await sign(env.SESSION_SECRET, `${m[1]}.${m[2]}`), m[3])) return null;
  let p;
  try { p = JSON.parse(unb64u(m[2])); } catch (e) { return null; }
  if (!p.e || !(Number(p.x) * 1000 > Date.now())) return null;
  let staff = await env.DATA.get('staff', 'json');
  if (!staff) staff = (await refresh(env, true).catch(() => ({}))).staff || null; // first request ever
  if (!staff) return 'down';
  const email = String(p.e).toLowerCase(), s = staff[email];
  return s ? { email, name: s.name, role: s.role } : null;
}

async function data(req, name, user, env, ctx) {
  if (!DATA.includes(name)) return json({ ok: false, error: 'unknown_action' }, 404);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache', 'X-User': encodeURIComponent(JSON.stringify(user)) };
  if (name === 'calendar') { // + the staff's calendar edits (kept fresh by refresh)
    const [cal, edits] = await Promise.all([env.DATA.get('p:calendar', 'text'), env.DATA.get('edits', 'text')]);
    if (!cal) return json({ ok: false, error: 'no_data_yet' }, 404);
    const c = cal.trim();
    return new Response(c === '{}' ? `{"edits":${edits || '[]'}}` : `{"edits":${edits || '[]'},${c.slice(1)}`, { headers });
  }
  const { value, metadata } = await env.DATA.getWithMetadata('p:' + name, { type: 'stream' });
  if (!value) return json({ ok: false, error: 'no_data_yet' }, 404);
  if (FROM_SCRIPT.includes(name) && Date.now() - ((metadata && metadata.at) || 0) > 15 * 60000) ctx.waitUntil(refresh(env, false).catch(() => null));
  const etag = metadata && metadata.etag ? `"${metadata.etag}"` : '';
  if (etag && (req.headers.get('If-None-Match') || '').replace(/^W\//, '') === etag) {
    await value.cancel();
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } });
  }
  return new Response(value, { headers: etag ? { ...headers, ETag: etag } : headers });
}

async function pdf(file, env) {
  if (!/^[\w.-]+\.pdf$/.test(file)) return json({ ok: false, error: 'bad_name' }, 400);
  const value = await env.DATA.get('pdf:' + file, { type: 'stream' });
  if (!value) return json({ ok: false, error: 'not_ready' }, 404);
  return new Response(value, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'private, no-store' } });
}

/** A day's sessions from the STATSports 3rd Party API (v7), for the Session Plan import. The key (thirdPartyApiId) stays
 * here, as the secret STATSPORTS_KEY; the site turns the answer into the two exports' columns (sp-convert.js). */
async function statsports(date, env) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !env.STATSPORTS_KEY) return json({ ok: false, error: 'bad_request' }, 400);
  const r = await fetch('https://statsportsproseries.com/thirdpartyapi/api/thirdPartyData/getFullSessionsByDateRange', {
    method: 'POST',
    headers: { 'api-version': '7', 'Content-Type': 'application/json' },
    body: JSON.stringify({ thirdPartyApiId: env.STATSPORTS_KEY, sessionStartDate: `${date}T00:00:00`, sessionEndDate: `${date}T23:59:59` }),
  });
  if (!r.ok) return json({ ok: false, error: `statsports ${r.status}` }, 502);
  return new Response(r.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}

/** Update dashboard: a payload (?name=workload…) or a PDF (?name=pdf:S75_2026-10-05_Staff_report.pdf, kept 120 days). */
async function upload(req, env) {
  if (!env.UPLOAD_KEY || !same(req.headers.get('X-Upload-Key') || '', env.UPLOAD_KEY)) return json({ ok: false, error: 'forbidden' }, 403);
  const name = new URL(req.url).searchParams.get('name') || '';
  const meta = { etag: (req.headers.get('X-Etag') || '').replace(/[^\w-]/g, '').slice(0, 64) || String(Date.now()), at: Date.now() };
  if (UPLOADS.includes(name)) await env.DATA.put('p:' + name, req.body, { metadata: meta });
  else if (/^pdf:[\w.-]+\.pdf$/.test(name)) await env.DATA.put(name, req.body, { metadata: meta, expirationTtl: 120 * 86400 });
  else return json({ ok: false, error: 'bad_name' }, 400);
  return json({ ok: true, name });
}

/** Re-read from the Google script what it computes (wellness), the Staff list and the calendar edits. Only what changed is
 * written (KV writes are counted). force = the cron or the first request; otherwise at most once a minute per server. */
let lastPull = 0;
async function refresh(env, force) {
  if (!force && Date.now() - lastPull < 60000) return { skipped: true };
  lastPull = Date.now();
  const tags = (await env.DATA.get('etags', 'json')) || {};
  const r = await fetch(env.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'bundle', key: env.UPLOAD_KEY, v: tags._v || '' }) });
  const text = await r.text();
  if (!text.startsWith('v\t')) throw new Error('bundle: unexpected answer');
  const lines = text.split('\n'), out = { changed: [] };
  if (lines.length === 1) return out; // nothing new since the last re-read
  for (const line of lines.slice(1)) {
    const i = line.indexOf('\t'), name = line.slice(0, i), val = line.slice(i + 1);
    const key = FROM_SCRIPT.includes(name) ? 'p:' + name : name === 'staff' || name === 'edits' ? name : null;
    if (!key || !val || val === 'null') continue;
    if (name === 'staff') out.staff = JSON.parse(val);
    const etag = await hash(val);
    if (tags[key] === etag) continue;
    await env.DATA.put(key, val, { metadata: { etag, at: Date.now() } });
    tags[key] = etag;
    out.changed.push(name);
  }
  tags._v = lines[0].slice(2);
  await env.DATA.put('etags', JSON.stringify(tags));
  return out;
}
