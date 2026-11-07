/**
 * The injuries' medical details entered on Workload › Injuries (body map + chips), in the club's own database (D1 binding
 * KIOSK, table "injuries" — schema in kiosk.sql). Health data: read and written by the medical staff and the admin only
 * (roles MED_ROLES), every change kept with who / when; the online build reads them with the upload key.
 *   GET    /api/injuries                       → { ok, injuries: [{ pid, date, days, type, region, side, onset, mechanism, where, severity, recur, by, ts }] }
 *   POST   /api/injuries  { pid, date, … }     → saves one (same player + day = replaced)
 *   DELETE /api/injuries?pid=…&date=…          → removes one
 */
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const MED_ROLES = ['admin', 'medical', 'staff', 'tactical']; // released to the staff 2026-11-07 (his call)
const LISTS = {
  type: ['Muscle', 'Tendon', 'Ligament / sprain', 'Bone', 'Contusion', 'Other'],
  side: ['R', 'L', 'B', ''], onset: ['Sudden', 'Gradual', ''], mechanism: ['Contact', 'Non-contact', ''], where: ['Training', 'Match', 'Other', ''],
  severity: ['≤ 1 week', '1–3 weeks', '3–6 weeks', '> 6 weeks', ''], recur: ['new', 'recurrence', ''],
};
const COLS = ['pid', 'date', 'days', 'type', 'region', 'side', 'onset', 'mechanism', 'place', 'severity', 'recur', 'by', 'ts'];
const out = (r) => ({ ...Object.fromEntries(COLS.filter((c) => c !== 'place').map((c) => [c, r[c] ?? ''])), where: r.place ?? '' });

export async function medicalList(env) {
  if (!env.KIOSK) return [];
  const r = await env.KIOSK.prepare('SELECT * FROM injuries ORDER BY date DESC').all();
  return (r.results || []).map(out);
}

export async function medicalRoute(req, env, user) {
  if (!env.KIOSK) return json({ ok: false, error: 'no_database' }, 503);
  if (!MED_ROLES.includes(user.role)) return json({ ok: false, error: 'forbidden' }, 403);
  if (req.method === 'GET') return json({ ok: true, injuries: await medicalList(env) });
  if (req.method === 'DELETE') {
    const q = new URL(req.url).searchParams;
    await env.KIOSK.prepare('DELETE FROM injuries WHERE pid = ? AND date = ?').bind(String(q.get('pid') || ''), String(q.get('date') || '')).run();
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'not_found' }, 404);
  const b = await req.json().catch(() => ({}));
  const pid = String(b.pid || '').trim().slice(0, 60), date = String(b.date || ''), region = String(b.region || '').trim().slice(0, 40);
  if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !region) return json({ ok: false, error: 'bad_request' }, 400);
  const v = {};
  for (const [k, list] of Object.entries(LISTS)) {
    const x = String(b[k] ?? '');
    if (!list.includes(x)) return json({ ok: false, error: `bad_${k}` }, 400);
    v[k] = x;
  }
  const days = b.days === '' || b.days == null ? null : Math.max(0, Math.min(400, Math.round(Number(b.days)) || 0));
  await env.KIOSK.prepare(`INSERT OR REPLACE INTO injuries (pid, date, days, type, region, side, onset, mechanism, place, severity, recur, by, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(pid, date, days, v.type, region, v.side, v.onset, v.mechanism, v.where, v.severity, v.recur,
    String(user.email || '').slice(0, 80), new Date().toISOString()).run();
  return json({ ok: true, saved: `${pid} · ${date} · ${region}` });
}
