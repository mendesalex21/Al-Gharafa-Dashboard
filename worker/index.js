/**
 * Al-Gharafa staff dashboard: the server part on Cloudflare. The site's data and the ready-made PDF reports come from
 * storage (KV) in a fraction of a second, instead of the few seconds of the Google script.
 *   GET  /api/data/<name>  a payload (staff session)        GET  /api/pdf/<file>  a report prepared by Update dashboard
 *   POST /api/refresh      re-read the wellness, the staff list and the calendar edits from the Google script
 *                          (the site asks when a wellness page opens or after a calendar edit)
 *   GET  /api/statsports?date=yyyy-mm-dd  that day's sessions from the STATSports API (Session Plan import)
 *   POST /api/upload       Update dashboard (sync/build.py) sends the payloads, the PDFs and the Excel copies (upload key)
 *   GET  /api/snapshot, /api/payload   the online calculation reads the Excel copies and the payloads it reuses (upload key)
 *   POST /api/rebuild      starts the online calculation (GitHub workflow) after a change on the site (staff session)
 *   GET/PUT/DELETE /api/match-files   the match files (XML + tracking) in R2 — the admin only (staff session)
 *   GET  /api/match-file   the online calculation reads a match file (upload key)
 *   cron, every 15 min     the same re-read as /api/refresh
 * Staff session: "s1.<payload>.<sig>", issued by the Google script after a Google sign-in (30 days, Auth.gs):
 * HMAC-SHA256 with SESSION_SECRET, the same secret on both sides. The e-mail must still be in the Staff list (KV
 * "staff", re-read with the wellness): removing someone there cuts his access within 10 minutes.
 * Anything missing or failing here → an error status: the site then falls back to the Google script.
 */
import { kioskRoute, kioskMirror, kioskCompute } from './kiosk.js'; // the players' wellness / RPE pages (2026-10-22)

const UPLOADS = ['workload', 'sessions', 'objectives', 'calendar', 'tests', 'reports', 'staff_report', 'plan_lib', 'squad_stats', 'match_report', 'intensity'];
const FROM_SCRIPT = ['home', 'wellness', 'wellness_history']; // computed by the Google script from the kiosk check-ins
const DATA = [...FROM_SCRIPT, ...UPLOADS];
const KEY_ONLY = ['player_photos', 'build_status']; // kept for the online calculation, not served here (the site reads the photos from the script); build_status → /api/me (admin)
const SNAPS = ['full', 'drills', 'calendar', 'players', 'config', 'gps', 'pdfs', 'min10', 'peaks', 'wcs']; // Update dashboard's copies (sync/cloud.py SNAPS)
const enc = new TextEncoder();

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
    try {
      if (path.startsWith('/api/kiosk/')) return await kioskRoute(req, env, ctx, path); // public: the players' pages (no sign-in, no score sent back)
      if (path === '/api/upload' && req.method === 'POST') return await upload(req, env);
      if ((path === '/api/snapshot' || path === '/api/payload') && req.method === 'GET') return await keyRead(req, path, env);
      if (path === '/api/match-file' && req.method === 'GET') return await mfRead(req, env); // the online calculation (upload key)
      if (path === '/api/match-files' && req.headers.get('X-Upload-Key')) { // the PC's bulk upload of match files (sync/upload_match_files.py)
        return env.UPLOAD_KEY && same(req.headers.get('X-Upload-Key'), env.UPLOAD_KEY) ? await matchFiles(req, { role: 'admin', email: 'pc upload' }, env) : json({ ok: false, error: 'forbidden' }, 403);
      }
      if (path === '/api/rebuild' && req.method === 'POST' && req.headers.get('X-Upload-Key')) { // the PC (tests); the site uses its staff session below
        return env.UPLOAD_KEY && same(req.headers.get('X-Upload-Key'), env.UPLOAD_KEY) ? await rebuild(env) : json({ ok: false, error: 'forbidden' }, 403);
      }
      const user = await sessionUser(req, env);
      if (user === 'down') return json({ ok: false, error: 'unavailable' }, 503);
      if (!user) return json({ ok: false, error: 'unauthenticated' }, 401);
      if (path.startsWith('/api/data/') && req.method === 'GET') return await data(req, path.slice(10), user, env, ctx);
      if (path.startsWith('/api/pdf/') && req.method === 'GET') return await pdf(decodeURIComponent(path.slice(9)), env);
      if (path === '/api/statsports' && req.method === 'GET') return await statsports(new URL(req.url).searchParams.get('date'), env);
      if (path === '/api/rebuild' && req.method === 'POST') return await rebuild(env);
      if (path === '/api/me' && req.method === 'GET') return json({ ok: true, user, build: user.role === 'admin' ? await env.DATA.get('p:build_status', 'json') : undefined }); // his banner when an online build was not sent
      if (path === '/api/match-files') return await matchFiles(req, user, env);
      if (path === '/api/refresh' && req.method === 'POST') { const r = await refresh(env, new URL(req.url).searchParams.get('force') === '1'); return json({ ok: true, changed: r.changed || [] }); }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.allSettled([refresh(env, true), kioskMirror(env), kioskCompute(env)])); }, // + the answers copied to the sheets, the wellness of the new day
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
  if (!/^[\w.-]+\.(pdf|pptx)$/.test(file)) return json({ ok: false, error: 'bad_name' }, 400);
  const value = await env.DATA.get('pdf:' + file, { type: 'stream' });
  if (!value) return json({ ok: false, error: 'not_ready' }, 404);
  const type = file.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf';
  return new Response(value, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'private, no-store' } });
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

/** The online calculation (upload key): one of Update dashboard's copies (gzip), or a payload it reuses. */
async function keyRead(req, path, env) {
  if (!env.UPLOAD_KEY || !same(req.headers.get('X-Upload-Key') || '', env.UPLOAD_KEY)) return json({ ok: false, error: 'forbidden' }, 403);
  const name = new URL(req.url).searchParams.get('name') || '', snap = path === '/api/snapshot';
  const key = snap ? (SNAPS.includes(name) ? 'snap:' + name : null) : ([...DATA, ...KEY_ONLY].includes(name) ? 'p:' + name : null);
  if (!key) return json({ ok: false, error: 'bad_name' }, 400);
  const v = await env.DATA.get(key, { type: 'stream' });
  if (!v) return json({ ok: false, error: 'not_found' }, 404);
  return new Response(v, { headers: { 'Content-Type': snap ? 'application/octet-stream' : 'application/json', 'Cache-Control': 'no-store' } });
}

/** Starts the online calculation: the workflow build.yml of the private repository GITHUB_REPO (fine-grained token
 * GITHUB_TOKEN, Actions read/write on that repository only). GitHub keeps one run going and one waiting, so several
 * changes in a row make one or two runs. */
async function rebuild(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ ok: false, error: 'not_configured' }, 501);
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'al-gharafa-dashboard' },
    body: JSON.stringify({ ref: 'main' }),
  });
  return r.status === 204 ? json({ ok: true }) : json({ ok: false, error: `github ${r.status}` }, 502);
}

/** The match files (admin only): GET = the list · PUT ?name=&match= (body = the file, gzip) · DELETE ?name=&match=.
 * Kept in R2 under mf/<match id>/<file name>.gz; the list (with what the page read from the XML: teams, date,
 * competition) in KV under mf:index — one KV write per file. */
async function matchFiles(req, user, env) {
  if (!user || user.role !== 'admin') return json({ ok: false, error: 'forbidden' }, 403);
  if (!env.FILES) return json({ ok: false, error: 'storage_not_ready' }, 501);
  const index = (await env.DATA.get('mf:index', 'json')) || {};
  if (req.method === 'GET') return json({ ok: true, matches: index });
  const q = new URL(req.url).searchParams, name = q.get('name') || '', match = (q.get('match') || '').replace(/\D/g, '');
  if (!/^[\w.$ -]{3,120}$/.test(name) || !match) return json({ ok: false, error: 'bad_name' }, 400);
  const key = `mf/${match}/${name}.gz`;
  if (req.method === 'PUT') {
    const obj = await env.FILES.put(key, req.body, { httpMetadata: { contentType: 'application/gzip' } });
    let meta = {};
    try { meta = JSON.parse(decodeURIComponent(req.headers.get('X-Meta') || '{}')); } catch (e) { /* the file name is enough */ }
    const m = index[match] || (index[match] = { files: {} });
    Object.assign(m, Object.fromEntries(Object.entries(meta).filter(([k]) => ['home', 'away', 'date', 'competition', 'round'].includes(k))));
    m.files[name] = { kind: q.get('kind') || '', size: obj.size, raw: Number(req.headers.get('X-Raw-Size')) || null, at: new Date().toISOString(), by: user.email };
    await env.DATA.put('mf:index', JSON.stringify(index));
    return json({ ok: true, match, name, size: obj.size });
  }
  if (req.method === 'DELETE') {
    await env.FILES.delete(key);
    if (index[match]) { delete index[match].files[name]; if (!Object.keys(index[match].files).length) delete index[match]; }
    await env.DATA.put('mf:index', JSON.stringify(index));
    return json({ ok: true });
  }
  return json({ ok: false, error: 'bad_method' }, 405);
}

/** One match file for the online calculation (upload key): ?key=mf/<match>/<name>.gz, or ?key=index for the list. */
async function mfRead(req, env) {
  if (!env.UPLOAD_KEY || !same(req.headers.get('X-Upload-Key') || '', env.UPLOAD_KEY)) return json({ ok: false, error: 'forbidden' }, 403);
  const key = new URL(req.url).searchParams.get('key') || '';
  if (key === 'index') return json({ ok: true, matches: (await env.DATA.get('mf:index', 'json')) || {} });
  if (!env.FILES || !/^mf\/\d+\/[\w.$ -]+\.gz$/.test(key)) return json({ ok: false, error: 'bad_key' }, 400);
  const obj = await env.FILES.get(key);
  return obj ? new Response(obj.body, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-store' } }) : json({ ok: false, error: 'not_found' }, 404);
}

/** Update dashboard: a payload (?name=workload…) or a PDF (?name=pdf:S75_2026-10-05_Staff_report.pdf, kept 120 days). */
async function upload(req, env) {
  if (!env.UPLOAD_KEY || !same(req.headers.get('X-Upload-Key') || '', env.UPLOAD_KEY)) return json({ ok: false, error: 'forbidden' }, 403);
  const name = new URL(req.url).searchParams.get('name') || '';
  const meta = { etag: (req.headers.get('X-Etag') || '').replace(/[^\w-]/g, '').slice(0, 64) || String(Date.now()), at: Date.now() };
  const pdf = /^pdf:[\w.-]+\.(pdf|pptx)$/.test(name);
  const key = UPLOADS.includes(name) || KEY_ONLY.includes(name) ? 'p:' + name : (name.startsWith('snap:') && SNAPS.includes(name.slice(5))) || pdf ? name : null;
  if (!key) return json({ ok: false, error: 'bad_name' }, 400);
  // the same content already there → not written again (the free plan allows 1,000 KV writes a day; reads are plenty)
  const old = await env.DATA.getWithMetadata(key, { type: 'stream' });
  if (old.value) await old.value.cancel();
  if (old.metadata && old.metadata.etag === meta.etag) return json({ ok: true, name, unchanged: true });
  await env.DATA.put(key, req.body, pdf ? { metadata: meta, expirationTtl: 120 * 86400 } : { metadata: meta });
  return json({ ok: true, name });
}

/** Re-read from the Google script what it computes (wellness), the Staff list and the calendar edits. Only what changed is
 * written (KV writes are counted): the script recomputes every 30 min and stamps a new generated_at even when no
 * check-in came, so the fingerprint leaves generated_at out, and "etags" is written only with a changed payload (the
 * script's own fingerprint is also kept in memory). force = the cron or the first request; otherwise at most once a
 * minute per server. */
let lastPull = 0, lastV = '';
async function refresh(env, force) {
  if (!force && Date.now() - lastPull < 60000) return { skipped: true };
  lastPull = Date.now();
  const tags = (await env.DATA.get('etags', 'json')) || {};
  const r = await fetch(env.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'bundle', key: env.UPLOAD_KEY, v: lastV || tags._v || '' }) });
  const text = await r.text();
  if (!text.startsWith('v\t')) throw new Error('bundle: unexpected answer');
  const lines = text.split('\n'), out = { changed: [] };
  if (lines.length === 1) return out; // nothing new since the last re-read
  for (const line of lines.slice(1)) {
    const i = line.indexOf('\t'), name = line.slice(0, i), val = line.slice(i + 1);
    const key = name === 'players' ? 'kiosk:players' : FROM_SCRIPT.includes(name) && !(env.KIOSK_LIVE === '1' && /^wellness/.test(name)) ? 'p:' + name : name === 'staff' || name === 'edits' ? name : null; // once live, the wellness is computed here (kiosk.js)
    if (!key || !val || val === 'null') continue;
    if (name === 'staff') out.staff = JSON.parse(val);
    const etag = await hash(val.replace(/"generated_at":"[^"]*"/, ''));
    if (tags[key] === etag) continue;
    await env.DATA.put(key, val, { metadata: { etag, at: Date.now() } });
    tags[key] = etag;
    out.changed.push(name);
  }
  lastV = lines[0].slice(2);
  if (out.changed.length) { tags._v = lastV; await env.DATA.put('etags', JSON.stringify(tags)); }
  return out;
}
