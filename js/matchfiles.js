/**
 * Match files (his ask, 2026-10-20) — the admin only: drop the provider's XML and the optical tracking (.txt, 10 fps) of
 * each match; the browser reads the XML's match sheet (teams, date, competition) and gzips every file before sending it
 * (a 38 MB tracking file goes as ~10 MB). The server keeps them in R2 (worker/index.js matchFiles); the online calculation
 * reads them from there (the calendar, the Game 10min report, then the coach's report and the 2D clips).
 */
const MF = { list: null, busy: {} };

function renderMatchFiles() {
  const root = document.getElementById('view-matchfiles');
  root.innerHTML = `${pageHead('Admin', 'Match files', 'mf-sub')}
    <section class="panel mf-drop" id="mf-drop" tabindex="0"><div class="mf-dz"><div class="mf-ic">⬆</div><b>Drop the XML and tracking files here</b><span>or <label class="mf-pick">choose files<input type="file" id="mf-input" multiple accept=".xml,.txt,.TXT,.XML" hidden></label> · several matches at once is fine</span>
      <small>XML: Match_HOME-AWAY-ddmmyy_EVENT_&lt;id&gt;.xml · tracking: SOCCER_RAW_GAME_OPT_TGV_10FPS$&lt;id&gt;.TXT (10 fps is enough: 25 fps is the same data, 2.5× bigger)</small></div>
      <div id="mf-queue"></div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title small">The matches on the server</h2><span class="panel-note" id="mf-note">only you can see this page</span></div><div id="mf-list"><div class="empty">Loading…</div></div></section>`;
  const drop = document.getElementById('mf-drop'), input = document.getElementById('mf-input');
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => mfAdd([...ev.dataTransfer.files]));
  input.addEventListener('change', () => { mfAdd([...input.files]); input.value = ''; });
  mfLoad();
}
function drawMatchFiles() { if (MF.list) mfDrawList(); }

async function mfLoad() {
  try {
    const r = await fetch('/api/match-files', { headers: cfHeaders() }), j = await r.json();
    if (!r.ok) throw new Error(j.error === 'storage_not_ready' ? 'The file storage (Cloudflare R2) is not switched on yet.' : j.error === 'forbidden' ? 'This page is for the admin only.' : j.error || r.status);
    MF.list = j.matches || {};
    mfDrawList();
  } catch (e) { document.getElementById('mf-list').innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

/** What a file is: XML (its match id, teams and date from the name) or tracking (fps, match id). */
function mfKind(name) {
  let m = /^Match_([A-Z0-9]+)-([A-Z0-9]+)-(\d{2})(\d{2})(\d{2})_EVENT_(\d+)\.xml$/i.exec(name);
  if (m) return { kind: 'xml', match: m[6], date: `20${m[5]}-${m[4]}-${m[3]}`, codes: [m[1], m[2]] };
  m = /^SOCCER_RAW_GAME_OPT_TGV_(\d+)FPS\$(\d+)\.txt$/i.exec(name);
  if (m) return { kind: `tracking ${m[1]} fps`, match: m[2], fps: Number(m[1]) };
  return null;
}
/** The match sheet of an XML (UTF-16 or UTF-8): home, away, date, competition, round. */
async function mfXmlMeta(file) {
  const buf = await file.slice(0, 600000).arrayBuffer(), b = new Uint8Array(buf);
  const text = new TextDecoder(b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8').decode(buf);
  const attr = (tag, name) => { const m = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i').exec(text); return m ? m[1] : ''; };
  const team = (type) => { const m = new RegExp(`<Team\\b[^>]*Type="${type}"[^>]*>`, 'i').exec(text); const n = m && /Name="([^"]*)"/.exec(m[0]); return n ? n[1] : ''; };
  const dt = attr('Match', 'DateAndTime'), d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(dt);
  return { home: team('HomeTeam'), away: team('AwayTeam'), competition: attr('Match', 'CompetitionName'), round: attr('Match', 'MatchDay'), date: d ? `${d[3]}-${d[2]}-${d[1]}` : '' };
}

async function mfAdd(files) {
  for (const f of files) {
    const k = mfKind(f.name), id = 'q' + Math.random().toString(36).slice(2, 8);
    const row = document.createElement('div');
    row.className = 'mf-q'; row.id = id;
    row.innerHTML = `<b>${escapeHtml(f.name)}</b><span>${(f.size / 1e6).toFixed(1)} MB</span><em>${k ? 'waiting' : 'not a match file (XML or 10 fps tracking)'}</em><i><u style="width:0"></u></i>`;
    document.getElementById('mf-queue').prepend(row);
    if (!k) { row.classList.add('bad'); continue; }
    mfSend(f, k, row).catch((e) => { row.classList.add('bad'); row.querySelector('em').textContent = 'failed: ' + e.message; });
  }
}
async function mfSend(f, k, row) {
  const st = (t, p) => { row.querySelector('em').textContent = t; if (p != null) row.querySelector('u').style.width = p + '%'; };
  const meta = k.kind === 'xml' ? await mfXmlMeta(f) : {};
  st('compressing…', 15);
  const gz = await new Response(f.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  st(`sending ${(gz.size / 1e6).toFixed(1)} MB…`, 55);
  const url = `/api/match-files?name=${encodeURIComponent(f.name)}&match=${k.match}&kind=${encodeURIComponent(k.kind)}`;
  const r = await fetch(url, { method: 'PUT', body: gz, headers: { ...cfHeaders(), 'Content-Type': 'application/gzip', 'X-Raw-Size': String(f.size), 'X-Meta': encodeURIComponent(JSON.stringify(meta)) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || r.status);
  st(`on the server · ${(gz.size / 1e6).toFixed(1)} MB`, 100);
  row.classList.add('ok');
  mfLoad();
}

function mfDrawList() {
  const L = MF.list, ids = Object.keys(L).sort((a, b) => ((L[b].date || '') > (L[a].date || '') ? 1 : -1));
  document.getElementById('mf-sub').textContent = `${ids.length} match${ids.length === 1 ? '' : 'es'} on the server · the XML and the tracking of each match`;
  if (!ids.length) { document.getElementById('mf-list').innerHTML = '<div class="empty">No match file yet — drop the first ones above.</div>'; return; }
  const has = (m, re) => Object.entries(m.files).find(([n, x]) => re.test(x.kind || n));
  const cell = (id, m, re, label) => { const f = has(m, re);
    return f ? `<span class="mf-ok">✓ ${label}<small>${((f[1].raw || f[1].size) / 1e6).toFixed(1)} MB · ${fmtDay(f[1].at.slice(0, 10), { day: 'numeric', month: 'short' })}</small><button class="mf-del" data-m="${id}" data-n="${escapeHtml(f[0])}" title="Delete this file">×</button></span>` : `<span class="mf-no">no ${label}</span>`; };
  document.getElementById('mf-list').innerHTML = `<table class="mf-t"><thead><tr><th class="l">Date</th><th class="l">Match</th><th class="l">Competition</th><th class="l">XML</th><th class="l">Tracking</th><th class="l">Match id</th></tr></thead><tbody>
    ${ids.map((id) => { const m = L[id];
      return `<tr><td class="l">${m.date ? fmtDay(m.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td><td class="l"><b>${escapeHtml(m.home || '?')}</b> v <b>${escapeHtml(m.away || '?')}</b></td><td class="l">${escapeHtml(m.competition || '')}${m.round ? ` · ${escapeHtml(m.round)}` : ''}</td>
        <td class="l">${cell(id, m, /xml/i, 'XML')}</td><td class="l">${cell(id, m, /track|\.txt$/i, 'tracking')}</td><td class="l muted">${id}</td></tr>`; }).join('')}</tbody></table>`;
  document.querySelectorAll('.mf-del').forEach((b) => { b.onclick = async () => {
    if (!confirm(`Delete ${b.dataset.n}?`)) return;
    await fetch(`/api/match-files?name=${encodeURIComponent(b.dataset.n)}&match=${b.dataset.m}`, { method: 'DELETE', headers: cfHeaders() });
    mfLoad();
  }; });
}

/** The admin's link (nav): shown only when the server says this staff member is the admin. */
async function mfShowLink() {
  if (!cfOn()) return;
  try {
    const r = await fetch('/api/me', { headers: cfHeaders() }), j = await r.json();
    if (j.ok && j.user && j.user.role === 'admin') document.getElementById('nav-matchfiles').hidden = false;
  } catch (e) { /* not shown */ }
}
