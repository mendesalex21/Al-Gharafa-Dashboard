/**
 * Session Plan — before training: the drills (club library, planned minutes) and each player's status (carried over
 * from the last session), with the team load they forecast vs the usual for that MD. After training: drop the two
 * StatSports exports (S##_Full.csv, S##_Drills.csv) → the rows are built in the club's Excel format (sp-convert.js),
 * checked, then published to the season (added by the next update) or downloaded as Excel.
 * Data: plan_lib (sync/build.py → build_plan_lib) + calendar + the plans saved by the staff (API "plans").
 */
const SPL = { lib: null, cal: null, events: null, matches: [], saved: null, week: null, date: null, view: 'plan', files: {}, timer: null, state: '', show: 'full' };
const SPL_STATUS = [['ProTraining', 'Team session', '#34c759'], ['Partial', 'Partial', '#7ac142'], ['INDIVIDUAL', 'Individual', '#a463f2'], ['Rehab', 'Rehab', '#ff9f0a'],
  ['Injury', 'Injured', '#e5484d'], ['Injury_no_muscular', 'Injured (not muscular)', '#ef7d80'], ['Sick', 'Sick', '#8e5bd6'], ['NT', 'National team', '#2a78d6'],
  ['Compensatory', 'Compensatory', '#30b0c7'], ['Recovery', 'Recovery', '#5ac8fa'], ['Game_B', 'B-team game', '#8e1b4f'], ['Training_TeamB', 'B-team training', '#b5577f'],
  ['GYM', 'Gym', '#8e8e93'], ['Authorized', 'Authorized absence', '#aeaeb2'], ['Unauthorized', 'Unauthorized absence', '#aeaeb2'], ['Day_Off', 'Day off', '#c7c7cc']];
const SPL_KEEP = new Set(['Injury', 'Injury_no_muscular', 'Rehab', 'NT', 'Sick']); // statuses carried over to the next session
const SPL_IN_SESSION = new Set(['ProTraining', 'Partial', 'ProTraining+ExtraWork']); // expected in the GPS file
const SPL_NOT_TEAM = /^(INDIVIDUAL|Individual|Rehab|GYM|STRENGTH)$/; // drills that are not the team's (left out of the forecast)
const SPL_DAY = (iso, o) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const splNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');
const splName = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function renderPlan() {
  const root = document.getElementById('view-plan');
  root.innerHTML = `
    ${pageHead('Plan · import · publish', 'Session Plan', 'spl-sub', `<div class="stepper"><button type="button" id="spl-prev" aria-label="Previous week">‹</button><span class="month-label" id="spl-wk"></span><button type="button" id="spl-next" aria-label="Next week">›</button></div>
      <button type="button" class="btn-light" id="spl-today">This week</button>`)}
    <div class="sp-week" id="spl-week"></div>
    <section class="panel sp-panel" id="spl-main"><div class="empty">Loading…</div></section>`;
  document.getElementById('spl-prev').onclick = () => splGoWeek(-7);
  document.getElementById('spl-next').onclick = () => splGoWeek(7);
  document.getElementById('spl-today').onclick = () => { SPL.week = null; SPL.date = null; splDraw(); };
  document.getElementById('spl-main').addEventListener('click', splClick);
  document.getElementById('spl-main').addEventListener('change', splChange);
  document.getElementById('spl-main').addEventListener('input', splInput);
  withData('plan_lib', (d) => { SPL.lib = d; splDraw(); }, (err) => { document.getElementById('spl-main').innerHTML = loadError(err); });
  withData('calendar', (d) => { SPL.cal = d; SPL.events = applyCalendarEdits(d); splMatches(); splDraw(); }, () => { SPL.cal = { events: [], match_days: [] }; SPL.events = []; splDraw(); });
  splLoadSaved().then(() => splDraw()).catch((err) => { SPL.saved = { plans: {}, titles: {}, published: {} }; SPL.state = 'Plans not loaded: ' + (err.message || err); splDraw(); });
}

// ------------------------------------------------------------------ saved plans (API, or this browser in the local demo)
async function splLoadSaved() {
  if (AUTH.demo) { try { SPL.saved = JSON.parse(localStorage.getItem('demo_plans')) || null; } catch (e) { SPL.saved = null; } SPL.saved = SPL.saved || { plans: {}, titles: {}, published: {} }; return; }
  SPL.saved = await callApi('plans', null, {});
}
function splDemoStore() { try { localStorage.setItem('demo_plans', JSON.stringify(SPL.saved)); } catch (e) { /* private mode */ } }
async function splSavePlan(date) {
  const plan = SPL.saved.plans[date];
  SPL.state = 'Saving…'; splStateLine();
  try {
    if (AUTH.demo) splDemoStore(); else await callApi('plan_save', null, { date, plan: { ...plan, _by: undefined, _at: undefined } });
    SPL.state = 'Saved ✓';
  } catch (err) { SPL.state = 'Not saved — ' + (err.message || err); }
  splStateLine();
}
function splTouch(date) { clearTimeout(SPL.timer); SPL.state = 'Editing…'; splStateLine(); SPL.timer = setTimeout(() => splSavePlan(date), 700); }
function splStateLine() { const el = document.getElementById('spl-state'); if (el) el.textContent = SPL.state || 'Filled in from the calendar · saved as you type'; }

// ------------------------------------------------------------------ calendar rules: MD tag, label, week, session number
function splMatches() {
  SPL.matches = (SPL.events || []).filter((e) => e.kind === 'match' && e.gharafa === 'yes').map((e) => ({ date: e.played_date || e.confirmed_date || e.start, e }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
function splTag(date) {
  const r = SPL.lib.recent[date];
  if (r && r.md && r.md !== '/') return r.md;
  const md = SPL.cal ? gharafaMatchDates(SPL.cal, SPL.events || []) : [];
  return md.includes(date) ? 'MD' : computedTag(date, md.filter((x) => x < date).pop(), md.find((x) => x > date)) || '';
}
function splCycleType(date) {
  const md = SPL.cal ? gharafaMatchDates(SPL.cal, SPL.events || []) : [], prev = md.filter((x) => x < date).pop(), next = md.find((x) => x >= date);
  const t = prev && next ? cycleType(daysBetween(prev, next)) : null;
  return t || (/^MD-[1-6]$/.test(splTag(date)) ? 'normal' : null); // a match week after a long break: a normal microcycle
}
function splLabel(date) {
  const r = SPL.lib.recent[date];
  if (r && r.label && r.label !== '/') return r.label;
  const tag = splTag(date), next = !tag || tag === 'MD' || tag.startsWith('MD-');
  const m = next ? SPL.matches.find((x) => x.date >= date) : SPL.matches.filter((x) => x.date < date).pop();
  if (!m) return '/';
  const code = SPL.lib.comps[m.e.competition] || String(m.e.competition || '').replace(/[^A-Za-z]/g, '');
  const opp = SPL.lib.opponents[splNorm(m.e.opponent)] || String(m.e.opponent || '').split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return `${code}_${opp}`;
}
function splWeekNo(date) { const n = Math.floor(daysBetween(SPL.lib.week1, date) / 7) + 1; return n >= 1 ? 'W' + String(n).padStart(2, '0') : 'W00'; }
function splMatchOn(date) { return SPL.matches.find((x) => x.date === date); }
function splSid(date) {
  const r = SPL.lib.recent[date], p = (SPL.saved.plans || {})[date];
  if (r && /^S\d+$/.test(r.sid)) return r.sid;
  if (p && p.sid) return p.sid;
  const before = Object.keys(SPL.saved.plans || {}).filter((d) => d > SPL.lib.last_date && d < date && (SPL.saved.plans[d].drills || []).length && !splMatchOn(d)).length;
  return 'S' + (SPL.lib.last_sid + 1 + before);
}

/** The plan of a date: saved, else a new one (statuses carried over from the last session before it). */
function splPlan(date) {
  const plans = SPL.saved.plans || (SPL.saved.plans = {});
  if (plans[date]) return plans[date];
  const last = Object.keys(SPL.lib.recent).filter((d) => d < date).sort().pop(), types = last ? SPL.lib.recent[last].types : {};
  const status = {};
  SPL.lib.players.forEach((p) => { const t = types[p.id] || p.type; status[p.id] = SPL_KEEP.has(t) ? t : 'ProTraining'; });
  return { ampm: 'PM', drills: [], status, rpe: {}, fresh: true };
}
function splEnsure(date) { const p = splPlan(date); if (p.fresh) { delete p.fresh; SPL.saved.plans[date] = p; } return p; }

// ------------------------------------------------------------------ page
function splGoWeek(n) { SPL.week = addDays(SPL.week, n); SPL.date = null; SPL.view = 'plan'; splDraw(); }
function splDraw() {
  if (!SPL.lib || !SPL.saved || !document.getElementById('spl-main')) return;
  const today = todayIso();
  if (!SPL.week) SPL.week = addDays(today, -new Date(today + 'T12:00:00Z').getUTCDay());
  if (!SPL.date || SPL.date < SPL.week || SPL.date > addDays(SPL.week, 6)) {
    const days = [...Array(7)].map((_, i) => addDays(SPL.week, i));
    SPL.date = days.find((d) => d >= today && !splMatchOn(d)) || days[0];
  }
  document.getElementById('spl-wk').textContent = `${splWeekNo(SPL.week)} · ${SPL_DAY(SPL.week, { day: 'numeric', month: 'short' })} – ${SPL_DAY(addDays(SPL.week, 6), { day: 'numeric', month: 'short' })}`;
  document.getElementById('spl-sub').textContent = `Plan before training · drop the two StatSports files after it · data up to ${SPL_DAY(SPL.lib.last_date, { day: 'numeric', month: 'short' })} (${'S' + SPL.lib.last_sid})`;
  splDrawWeek();
  document.getElementById('spl-main').innerHTML = SPL.view === 'import' && SPL.files.full ? splImportHtml() : splPlanHtml();
}
function splDrawWeek() {
  const el = document.getElementById('spl-week');
  el.innerHTML = [...Array(7)].map((_, i) => {
    const d = addDays(SPL.week, i), tag = splTag(d), m = splMatchOn(d), r = SPL.lib.recent[d], p = (SPL.saved.plans || {})[d];
    const pub = Object.values(SPL.saved.published || {}).some((x) => x.date === d);
    const badge = r && /^S\d+$/.test(r.sid) ? `<span class="sp-b done">${r.sid} · ${r.pub ? 'published' : 'in the data'} ✓</span>` : pub ? '<span class="sp-b done">Published ✓</span>'
      : m ? `<span class="sp-b match">${crestHtml(m.e.opponent, 16)}${escapeHtml([m.e.round || m.e.competition, m.e.opponent].filter(Boolean).join(' · '))}</span>`
        : p && (p.drills || []).length ? '<span class="sp-b plan">Planned</span>' : '<span class="sp-b none">+ Plan</span>';
    return `<button type="button" class="sp-day${d === SPL.date ? ' on' : ''}${m ? ' m' : ''}" data-day="${d}"><b>${SPL_DAY(d, { weekday: 'short', day: 'numeric' })}</b>${tag ? `<span class="sp-md${tag === 'MD' ? ' mdm' : ''}">${tag}</span>` : '<span class="sp-md off">—</span>'}${badge}</button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-day]'); if (b) { SPL.date = b.dataset.day; SPL.view = 'plan'; SPL.files = {}; splDraw(); } };
}

function splHead(date, step) {
  const p = splPlan(date), m = splMatchOn(date), next = SPL.matches.find((x) => x.date > date);
  const dd = next ? daysBetween(date, next.date) : null;
  return `<div class="sp-head"><div class="sp-id"><span class="sp-k">Session</span><b><input class="sp-sid" data-f="sid" value="${escapeHtml(p.sid || splSid(date))}" aria-label="Session number"> · ${SPL_DAY(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
    <div class="sp-auto"><span><small>Week</small>${splWeekNo(date)}</span><span><small>MD</small>${splTag(date) || '—'}</span><span><small>Week MD session</small><input class="sp-lbl" data-f="label" value="${escapeHtml(p.label || splLabel(date))}" aria-label="Week MD session"></span>
      ${m ? `<span><small>Match</small>${escapeHtml(m.e.opponent || '')}</span>` : next ? `<span><small>Next match</small>${SPL_DAY(next.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${dd === 1 ? 'tomorrow' : `in ${dd} days`}</span>` : ''}</div>
    <div class="seg sp-ampm">${['AM', 'PM'].map((v) => `<button type="button" data-ampm="${v}" class="${(p.ampm || 'PM') === v ? 'active' : ''}">${v}</button>`).join('')}</div></div>
    <div class="sp-steps">${['Plan', 'After the session', 'Published'].map((l, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}"><i>${i < step ? '✓' : i + 1}</i>${l}</span>`).join('<u></u>')}<em id="spl-state">${escapeHtml(SPL.state || 'Filled in from the calendar · saved as you type')}</em></div>`;
}

// ------------------------------------------------------------------ step 1: plan
const SPL_COL = ['#8e8e93', '#5b9bd5', '#34a853', '#2a78d6', '#ff9500', '#e5484d', '#a463f2', '#c7a600', '#30b0c7', '#8e1b4f'];
function splColor(name) { const lib = SPL.lib.library, i = lib.findIndex((x) => splName(x.name) === splName(name)); return SPL_NOT_TEAM.test(splName(name)) ? '#a463f2' : SPL_COL[(i < 0 ? 9 : i) % SPL_COL.length]; }
function splPlanHtml() {
  const date = SPL.date, p = splPlan(date), lib = SPL.lib.library, tag = splTag(date);
  // in the data from the Excel files: nothing to do. Published from this page: can be published again (it replaces) or removed
  const r = SPL.lib.recent[date], pub = Object.values(SPL.saved.published || {}).find((x) => x.date === date);
  const inData = !!(r && /^S\d+$/.test(r.sid) && !r.pub), live = !!(r && r.pub);
  const team = p.drills.filter((d) => !SPL_NOT_TEAM.test(splName(d.name))), tot = team.reduce((a, d) => a + (Number(d.min) || 0), 0);
  const titleOf = {}; Object.entries({ ...SPL.lib.titles, ...SPL.saved.titles }).forEach(([t, n]) => { if (!titleOf[splName(n)]) titleOf[splName(n)] = t; });
  const opts = (cur) => `<option value="">Choose a drill…</option>${lib.map((x) => `<option ${splName(x.name) === splName(cur) ? 'selected' : ''}>${escapeHtml(splName(x.name))}</option>`).join('')}${cur && !lib.some((x) => splName(x.name) === splName(cur)) ? `<option selected>${escapeHtml(cur)}</option>` : ''}`;
  const rows = p.drills.map((d, i) => { const l = lib.find((x) => splName(x.name) === splName(d.name));
    return `<div class="sp-dr"><span class="sp-ord"><button type="button" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-down="${i}" ${i < p.drills.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span><span class="no" style="background:${splColor(d.name)}">${i + 1}</span>
      <span class="nm"><select data-drill="${i}">${opts(d.name)}</select><small>${titleOf[splName(d.name)] ? 'StatSports: ' + escapeHtml(titleOf[splName(d.name)]) : SPL_NOT_TEAM.test(splName(d.name)) ? 'individual / rehab work' : 'new name'}</small></span>
      <span class="sp-min"><button type="button" data-min="${i}" data-step="-1">−</button><input type="number" min="1" max="120" value="${d.min || ''}" data-mins="${i}" aria-label="Minutes"><button type="button" data-min="${i}" data-step="1">+</button></span>
      <span class="sp-int">${l && l.td ? `≈ ${Math.round(l.td)} m/min` : ''}</span><button type="button" class="x" data-del="${i}" aria-label="Remove">×</button></div>`; }).join('');
  const last = Object.keys(SPL.lib.recent).filter((d) => d < date && SPL.lib.recent[d].md === tag && SPL.lib.recent[d].drills.length).sort().pop();
  const sugg = lib.filter((x) => x.md.includes(tag) && !p.drills.some((d) => splName(d.name) === splName(x.name))).slice(0, 4);
  const line = team.map((d) => `<i style="flex:${d.min || 1};background:${splColor(d.name)}" title="${escapeHtml(d.name)}"><b>${d.min || ''}'</b></i>`).join('');
  return `${splHead(date, inData || pub ? 2 : 0)}
    ${inData ? `<p class="sp-banner ok">This session is already in the data (${r.sid}, from the Excel files). Nothing to import.</p>` : pub ? `<p class="sp-banner ok">Published ✓ ${escapeHtml(pub.rows || '')} · by ${escapeHtml(String(pub.by || '').split('@')[0])} — ${live ? 'in the dashboard' : 'added to the dashboard at the next update'}. To correct it, drop the files again and publish: the new version replaces it at the next update. <button type="button" class="linkbtn" data-unpub="${escapeHtml(date + '_' + pub.sid)}">Unpublish</button></p>` : live ? `<p class="sp-banner warn">Unpublished — ${escapeHtml(r.sid)} leaves the dashboard at the next update.</p>` : ''}
    <div class="sp-two"><div class="sp-col">
      <div class="sp-h3">Drills <small>${tot}' of team work${p.drills.length ? ' · ▲▼ to reorder' : ''}</small>${last ? `<button type="button" class="btn-light sp-copy" data-copy="${last}">⟲ Copy last ${tag} · ${SPL_DAY(last, { weekday: 'short', day: 'numeric', month: 'short' })}</button>` : ''}</div>
      ${team.length ? `<div class="sp-line">${line}</div>` : ''}${rows || '<p class="sp-note">No drill yet — copy the last session of this MD or add drills below.</p>'}
      <div class="sp-add"><select data-add aria-label="Add a drill"><option value="">+ Add a drill…</option>${lib.map((x) => `<option>${escapeHtml(splName(x.name))}</option>`).join('')}<option value="__other">Other (new name)…</option></select>${sugg.length ? `<small>Often on ${tag}:</small>${sugg.map((x) => `<button type="button" data-sugg="${escapeHtml(splName(x.name))}">${escapeHtml(splName(x.name))} <small>${x.min}'</small></button>`).join('')}` : ''}</div>
      ${splLoadHtml(date, p)}</div>
      ${splPlayersHtml(p)}</div>
    ${inData ? '' : `<label class="sp-drop mini" id="spl-drop"><input type="file" accept=".csv,text/csv" multiple hidden data-files><b>After the session</b><span>Drop <code>${escapeHtml(p.sid || splSid(date))}_Full.csv</code> and <code>${escapeHtml(p.sid || splSid(date))}_Drills.csv</code> here, or click to choose — the rows are built from this plan</span></label>`}`;
}
function splLoadHtml(date, p) {
  const c = SPL.lib.calib || {}, rate = (n, k) => { const l = SPL.lib.library.find((x) => splName(x.name) === splName(n)); return l ? l[k] || 0 : 0; };
  const team = p.drills.filter((d) => !SPL_NOT_TEAM.test(splName(d.name)) && d.min);
  if (!team.length) return '';
  const pred = (k) => team.reduce((a, d) => a + rate(d.name, k) * d.min, 0) * ((c[k] || {}).k || 1);
  const typ = splCycleType(date), ref = ((SPL.lib.usual[typ] || {})[splTag(date)]) || null;
  const bar = (k, label, unit) => {
    const v = pred(k), u = ref ? ref[k] : null, max = Math.max(v, u ? u[2] : 0, u ? u[0] : 0) * 1.25 || 1, pc = (x) => Math.min(100, (x || 0) / max * 100);
    const lv = !u ? 'na' : v < u[1] * 0.95 ? 'lo' : v > u[2] * 1.05 ? 'hi' : 'ok';
    return `<div class="sp-lr"><span class="l">${label}</span><span class="sp-lt">${u ? `<i class="band" style="left:${pc(u[1])}%;width:${pc(u[2]) - pc(u[1])}%"></i><i class="mean" style="left:${pc(u[0])}%"></i>` : ''}<i class="dot ${lv}" style="left:${pc(v)}%"></i></span>
      <b>${k === 'td' ? (v / 1000).toFixed(1) + 'k' : Math.round(v)}<small> ${unit}</small></b><em class="${lv}">${lv === 'ok' ? 'usual ✓' : lv === 'lo' ? 'lighter' : lv === 'hi' ? 'heavier' : '—'}</em><small class="sp-acc">${(c[k] || {}).err != null ? (k === 'hit' ? 'indicative' : `±${c[k].err} %`) : ''}</small></div>`;
  };
  return `<div class="sp-load"><div class="sp-h3">Planned team load <small>each drill's usual per-minute load × its planned minutes${ref ? ` · grey = usual ${splTag(date)} of a ${typ} microcycle (p25–p75, ${ref.n} sessions), line = average` : ' · no usual reference for this day'}</small></div>
    ${bar('td', 'Total distance', 'm')}${bar('acc_dec', 'Acc + Dec', '')}${bar('hit', '> 20 km/h', 'm')}</div>`;
}
function splPlayersHtml(p) {
  const known = new Set(SPL_STATUS.map(([k]) => k)), extra = (SPL.lib.types || []).filter((t) => !known.has(t) && !/^(Game|Friendly_Game|Game\+Compensatory|NC|Private)$/.test(t));
  const status = [...SPL_STATUS, ...extra.map((t) => [t, t, '#aeaeb2'])], col = Object.fromEntries(status.map(([k, , c]) => [k, c])), lab = Object.fromEntries(status.map(([k, l]) => [k, l]));
  const cnt = {}; SPL.lib.players.forEach((q) => { const t = p.status[q.id] || 'ProTraining'; cnt[t] = (cnt[t] || 0) + 1; });
  const order = ['GK', 'CD', 'WD', 'CM', 'WM', 'FW'], label = { GK: 'Goalkeepers', CD: 'Centre-backs', WD: 'Full-backs', CM: 'Midfielders', WM: 'Wingers', FW: 'Forwards' };
  const groups = [...order, ''].filter((g) => SPL.lib.players.some((q) => (order.includes(q.pos) ? q.pos : '') === g));
  const face = (id) => { const ph = typeof PHOTO_DATA !== 'undefined' && PHOTO_DATA[id]; return `<span class="sp-face"${ph ? ` style="background-image:url('${ph}')"` : ''}></span>`; };
  return `<div class="sp-col"><div class="sp-h3">Players <small>${SPL.lib.players.length} · carried over from the last session · change only what is new</small></div>
    <div class="sp-sum">${status.filter(([k]) => cnt[k]).map(([k, l, c]) => `<span><i style="background:${c}"></i>${cnt[k]} ${l.toLowerCase()}</span>`).join('')}</div>
    <div class="sp-pl">${groups.map((g) => `<div class="sp-g">${g || '—'}<small>${label[g] || 'No position'}</small></div>` + SPL.lib.players.filter((q) => (order.includes(q.pos) ? q.pos : '') === g)
      .sort((a, b) => ((p.status[a.id] || 'ProTraining') === 'ProTraining' ? 0 : 1) - ((p.status[b.id] || 'ProTraining') === 'ProTraining' ? 0 : 1) || a.name.localeCompare(b.name)).map((q) => {
        const t = p.status[q.id] || 'ProTraining';
        return `<div class="sp-p${t === 'ProTraining' ? '' : ' out'}">${face(q.id)}<b>${escapeHtml(q.name)}</b><select class="sp-st" style="--c:${col[t] || '#aeaeb2'}" data-status="${escapeHtml(q.id)}">${status.map(([k, l]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}${known.has(t) || extra.includes(t) ? '' : `<option selected>${escapeHtml(t)}</option>`}</select></div>`;
      }).join('')).join('')}</div></div>`;
}

// ------------------------------------------------------------------ step 2: the files → rows
async function splReadFiles(list) {
  for (const f of list) {
    const text = await f.text();
    const head = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    if (!/Player First Name/.test(head)) { SPL.state = `${f.name}: not a StatSports export`; continue; }
    SPL.files[/Drill Title/.test(head) ? 'drills' : 'full'] = { name: f.name, text };
  }
  if (SPL.files.full) { SPL.view = 'import'; SPL.state = ''; }
  splDraw();
}
function splBuild() {
  const date = SPL.date, p = splEnsure(date), lib = SPL.lib;
  const fullRows = spParseCsv(SPL.files.full.text), drillRows = SPL.files.drills ? spParseCsv(SPL.files.drills.text) : [];
  const fileDate = spIsoDate((fullRows[0] || {})['Session Date']);
  const byGps = Object.fromEntries(lib.players.map((q) => [q.gps, q])), inGps = new Set(fullRows.map((r) => spName(r['Player First Name'])));
  const st = (q) => p.status[q.id] || 'ProTraining';
  const players = {};
  inGps.forEach((g) => { const q = byGps[g]; players[g] = q ? { name: q.gps, pos: q.pos, type: st(q) } : { name: g, pos: '', type: 'ProTraining' }; });
  const extra = lib.players.filter((q) => !inGps.has(q.gps) && !SPL_IN_SESSION.has(st(q))).map((q) => ({ name: q.gps, pos: q.pos, type: st(q) }));
  const missing = lib.players.filter((q) => !inGps.has(q.gps) && SPL_IN_SESSION.has(st(q)));
  const titles = { ...lib.titles, ...SPL.saved.titles }, map = p.titlemap || {};
  const plan = p.drills.map((d, i) => ({ no: i + 1, name: splName(d.name), min: Number(d.min) || 0, own: SPL_NOT_TEAM.test(splName(d.name)) }));
  const seen = [...new Set(drillRows.map((r) => String(r['Drill Title'] || '').trim()).filter(Boolean))];
  const drills = {}, mapping = [];
  seen.forEach((t) => {
    const name = splName(map[t] || titles[t] || '');
    const d = plan.find((x) => x.name === name) || (/individual|rehab/i.test(t) && plan.find((x) => SPL_NOT_TEAM.test(x.name))) || null;
    if (d) drills[t] = d;
    mapping.push({ title: t, d, n: drillRows.filter((r) => String(r['Drill Title'] || '').trim() === t).length, min: Math.max(...drillRows.filter((r) => String(r['Drill Title'] || '').trim() === t).map((r) => spNum(r['Total Time']))) });
  });
  const sessionTime = Number(p.time) || spSessionTime(fullRows);
  const out = spBuildRows(SPL.files.full.text, SPL.files.drills ? SPL.files.drills.text : '', {
    date, sid: p.sid || splSid(date), week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM', sessionTime, players, extra, rpe: p.rpe || {}, drills,
    drillName: (pn, d) => (SPL_NOT_TEAM.test(d.name) && players[pn] && players[pn].type === 'Rehab' ? 'Rehab' : d.name),
  });
  return { ...out, fileDate, missing, mapping, sessionTime, unknown: [...inGps].filter((g) => !byGps[g]), plan };
}
function splImportHtml() {
  const date = SPL.date, p = splEnsure(date), b = splBuild();
  const gpsRows = b.full.filter((r) => r.Time > 0 || r.DT != null), unmapped = b.mapping.filter((m) => !m.d);
  const drillOpts = (t, cur) => `<select data-map="${escapeHtml(t)}"><option value="">Which drill of the plan?</option>${b.plan.map((d) => `<option value="${escapeHtml(d.name)}" ${cur && cur.name === d.name ? 'selected' : ''}>${d.no} · ${escapeHtml(d.name)}</option>`).join('')}</select>`;
  const mapRows = b.mapping.map((m) => `<div class="sp-mr${m.d ? '' : ' warn'}"><code title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</code><span class="arr">→</span><span class="tg">${m.d ? `<b style="--c:${splColor(m.d.name)}">${m.d.no} · ${escapeHtml(m.d.name)}</b><small>${m.d.min}' planned (GPS ${m.min.toFixed(1)}') · ${m.n} player${m.n > 1 ? 's' : ''}</small>` : drillOpts(m.title, null)}</span><span class="ok">${m.d ? '✓' : '!'}</span></div>`).join('');
  const rpeGrid = gpsRows.map((r) => { const g = spName(r.Players); return `<label class="${p.rpe && p.rpe[g] != null && p.rpe[g] !== '' ? '' : 'miss'}">${escapeHtml(r.Players)}<input type="number" min="0" max="10" step="0.5" value="${p.rpe && p.rpe[g] != null ? p.rpe[g] : ''}" data-rpe="${escapeHtml(g)}"></label>`; }).join('');
  const nRpe = gpsRows.filter((r) => p.rpe && p.rpe[spName(r.Players)] != null && p.rpe[spName(r.Players)] !== '').length;
  const rows = SPL.show === 'drills' ? b.drills : b.full, cols = SPL.show === 'drills' ? SP_DRILL_COLS : SP_FULL_COLS;
  const auto = new Set(['Date', 'N° Session', 'Week', 'WeeK MD Session', 'MD Session', 'Position', 'Type', 'N°Exercice', 'AMPM', 'Carga RPE', 'RPE', 'Time']);
  const fmtv = (v) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(2)) : escapeHtml(v));
  const ready = !unmapped.length && b.fileDate === date;
  return `${splHead(date, 1)}
    ${b.fileDate && b.fileDate !== date ? `<p class="sp-banner warn">These files are from ${SPL_DAY(b.fileDate, { weekday: 'long', day: 'numeric', month: 'long' })}, not from this day. <button type="button" class="linkbtn" data-goto="${b.fileDate}">Open ${SPL_DAY(b.fileDate, { weekday: 'short', day: 'numeric', month: 'short' })}</button></p>` : ''}
    <div class="sp-files"><div class="sp-file ok"><span class="ic">CSV</span><div><b>${escapeHtml(SPL.files.full.name)}</b><small>${gpsRows.length} players · ${b.fileDate ? SPL_DAY(b.fileDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'no date'} · session ${b.sessionTime}'</small></div></div>
      <div class="sp-file ${SPL.files.drills ? 'ok' : 'miss'}"><span class="ic">CSV</span><div><b>${SPL.files.drills ? escapeHtml(SPL.files.drills.name) : 'Drills file missing'}</b><small>${SPL.files.drills ? `${b.mapping.length} drills · ${b.drills.length} rows` : 'drop S##_Drills.csv too'}</small></div></div>
      <label class="sp-drop small"><input type="file" accept=".csv,text/csv" multiple hidden data-files>Drop other files to replace</label></div>
    <div class="sp-three">
      <div class="sp-chk"><div class="sp-h3"><i class="n">1</i>Drills <small>StatSports title → the drill of the plan</small></div>${mapRows || '<p class="sp-note">No drills file yet.</p>'}
        <p class="sp-note">Time = the planned minutes (a 2 × 10' game is 20', not the 22' of the GPS). A title you name once is remembered.</p></div>
      <div class="sp-chk"><div class="sp-h3"><i class="n">2</i>Players <small>${gpsRows.length} in the GPS file${b.unknown.length ? ` · ${b.unknown.length} unknown` : ' · all recognised ✓'}</small></div>
        ${b.unknown.length ? `<p class="sp-note warn">Not in the squad list (kept with their GPS name): ${b.unknown.map(escapeHtml).join(', ')} — add them in Squad.</p>` : ''}
        ${b.missing.length ? `<p class="sp-note warn">In the session in the plan but not in the GPS file: ${b.missing.map((q) => escapeHtml(q.name)).join(', ')} — change their status if they did not train.</p>` : ''}
        <p class="sp-note">Added from the plan, without GPS:</p><div class="sp-ngs">${b.full.filter((r) => !r.Time && r.DT == null).map((r) => `<span class="sp-ng">${escapeHtml(r.Players)}<small>${escapeHtml(r.Type)}</small></span>`).join('') || '<span class="sp-note">nobody</span>'}</div>
        <label class="sp-time">Session time <input type="number" min="1" max="200" value="${b.sessionTime}" data-f="time"> min <small>for the team-session players (the GPS's usual time)</small></label></div>
      <div class="sp-chk"><div class="sp-h3"><i class="n">3</i>RPE <small>${nRpe} / ${gpsRows.length} · Carga RPE = RPE × time</small></div><div class="sp-rpe">${rpeGrid}</div><p class="sp-note">Later: read from the wellness kiosk.</p></div>
    </div>
    <div class="sp-h3">Preview <span class="seg sp-show"><button type="button" data-show="full" class="${SPL.show === 'full' ? 'active' : ''}">Data_Full · ${b.full.length}</button><button type="button" data-show="drills" class="${SPL.show === 'drills' ? 'active' : ''}">Data_Drills · ${b.drills.length}</button></span><small>same columns and order as your Excel · blue = from the plan</small></div>
    <div class="sp-tw"><table class="sp-tbl"><thead><tr>${cols.map((c) => `<th class="${auto.has(c) ? 'a' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${auto.has(c) ? 'a' : ''}">${fmtv(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${b.issues.length ? `<p class="sp-note warn">${b.issues.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="sp-actions"><button type="button" class="btn-primary" data-publish ${ready ? '' : 'disabled'}>Publish ${escapeHtml(p.sid || splSid(date))}</button><button type="button" class="btn-light" data-xlsx>Download Excel · Full + Drills</button><button type="button" class="btn-light" data-back>Back to the plan</button>
      <span>${ready ? 'Publishing adds the rows to the season: the dashboard and the staff e-mail follow at the next update.' : unmapped.length ? 'Name every drill first.' : 'The files are not from this day.'}</span></div>`;
}

async function splPublish() {
  const date = SPL.date, p = splEnsure(date), b = splBuild(), sid = p.sid || splSid(date);
  const body = { date, sid, cols_full: SP_FULL_COLS, full: b.full.map((r) => SP_FULL_COLS.map((c) => r[c])), cols_drills: SP_DRILL_COLS, drills: b.drills.map((r) => SP_DRILL_COLS.map((c) => r[c])) };
  SPL.state = 'Publishing…'; splStateLine();
  try {
    if (AUTH.demo) { SPL.saved.published[`${date}_${sid}`] = { date, sid, rows: `${body.full.length} full · ${body.drills.length} drills`, by: 'demo', at: new Date().toISOString() }; splDemoStore(); }
    else { await callApi('session_publish', null, body); await splLoadSaved(); }
    p.sid = sid; await splSavePlan(date);
    SPL.state = 'Published ✓'; SPL.view = 'plan'; SPL.files = {}; splDraw();
  } catch (err) { SPL.state = 'Not published — ' + (err.message || err); splStateLine(); }
}
async function splXlsx() {
  const date = SPL.date, p = splEnsure(date), b = splBuild(), sid = p.sid || splSid(date);
  await rpScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const sheet = (cols, rows) => window.XLSX.utils.aoa_to_sheet([cols, ...rows.map((r) => cols.map((c) => (c === 'Date' && r[c] ? new Date(r[c] + 'T00:00:00') : r[c])))], { cellDates: true, dateNF: 'dd/mm/yyyy' });
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, sheet(SP_FULL_COLS, b.full), 'Data_Full');
  window.XLSX.utils.book_append_sheet(wb, sheet(SP_DRILL_COLS, b.drills), 'Data_Drills');
  window.XLSX.writeFile(wb, `${sid}_${date}_formatted.xlsx`);
}

// ------------------------------------------------------------------ events
function splClick(e) {
  const t = e.target.closest('button, [data-goto]');
  if (!t || !SPL.date) return;
  const date = SPL.date, p = () => splEnsure(date);
  if (t.dataset.ampm) { p().ampm = t.dataset.ampm; splTouch(date); splDraw(); return; }
  if (t.dataset.up != null || t.dataset.down != null) { const i = Number(t.dataset.up ?? t.dataset.down), j = t.dataset.up != null ? i - 1 : i + 1, d = p().drills; [d[i], d[j]] = [d[j], d[i]]; splTouch(date); splDraw(); return; }
  if (t.dataset.del != null) { p().drills.splice(Number(t.dataset.del), 1); splTouch(date); splDraw(); return; }
  if (t.dataset.min != null) { const d = p().drills[Number(t.dataset.min)]; d.min = Math.max(1, (Number(d.min) || 0) + Number(t.dataset.step)); splTouch(date); splDraw(); return; }
  if (t.dataset.copy) { const r = SPL.lib.recent[t.dataset.copy]; const used = {}; p().drills = r.drills.filter((d) => { const k = d.no; if (used[k] && SPL_NOT_TEAM.test(d.name)) return false; used[k] = 1; return d.name !== 'Rehab'; }).map((d) => ({ name: d.name, min: d.min })); splTouch(date); splDraw(); return; }
  if (t.dataset.sugg) { const l = SPL.lib.library.find((x) => splName(x.name) === t.dataset.sugg); p().drills.push({ name: t.dataset.sugg, min: l ? l.min : 10 }); splTouch(date); splDraw(); return; }
  if (t.dataset.show) { SPL.show = t.dataset.show; splDraw(); return; }
  if (t.dataset.back != null) { SPL.view = 'plan'; splDraw(); return; }
  if (t.dataset.goto) { SPL.week = addDays(t.dataset.goto, -new Date(t.dataset.goto + 'T12:00:00Z').getUTCDay()); SPL.date = t.dataset.goto; splDraw(); return; }
  if (t.dataset.publish != null) { splPublish(); return; }
  if (t.dataset.xlsx != null) { splXlsx().catch((err) => alert('Excel not created: ' + (err.message || err))); return; }
  if (t.dataset.unpub) { if (confirm('Remove this published session? The rows leave the dashboard at the next update.')) splUnpublish(t.dataset.unpub); }
}
async function splUnpublish(key) {
  try { if (AUTH.demo) { delete SPL.saved.published[key]; splDemoStore(); } else { await callApi('session_unpublish', null, { key }); await splLoadSaved(); } SPL.state = 'Unpublished'; splDraw(); }
  catch (err) { alert('Not removed: ' + (err.message || err)); }
}
function splChange(e) {
  const t = e.target, date = SPL.date;
  if (t.dataset.files != null) { splReadFiles([...t.files]); return; }
  const p = splEnsure(date);
  if (t.dataset.drill != null) { p.drills[Number(t.dataset.drill)].name = t.value; splTouch(date); splDraw(); return; }
  if (t.dataset.add != null) {
    let name = t.value;
    if (name === '__other') name = (prompt('Name of the new drill (as in your files):') || '').trim();
    if (name) { const l = SPL.lib.library.find((x) => splName(x.name) === name); p.drills.push({ name, min: l ? l.min : 10 }); splTouch(date); }
    splDraw(); return;
  }
  if (t.dataset.status) { p.status[t.dataset.status] = t.value; splTouch(date); splDraw(); return; }
  if (t.dataset.map) {
    p.titlemap = { ...(p.titlemap || {}), [t.dataset.map]: t.value };
    if (t.value) { SPL.saved.titles[t.dataset.map] = t.value; if (!AUTH.demo) callApi('title_save', null, { title: t.dataset.map, name: t.value }).catch(() => { /* kept in the plan */ }); else splDemoStore(); }
    splTouch(date); splDraw(); return;
  }
  if (t.dataset.mins != null) { splDraw(); return; } // minutes typed: refresh the line and the forecast when done
  if (t.dataset.f) { p[t.dataset.f] = t.value.trim(); splTouch(date); if (t.dataset.f === 'time') splDraw(); }
}
function splInput(e) {
  const t = e.target, date = SPL.date;
  if (t.dataset.mins != null) { splEnsure(date).drills[Number(t.dataset.mins)].min = Number(t.value) || ''; splTouch(date); }
  if (t.dataset.rpe != null) { const p = splEnsure(date); p.rpe = { ...(p.rpe || {}), [t.dataset.rpe]: t.value === '' ? null : Number(t.value) }; t.closest('label').classList.toggle('miss', t.value === ''); splTouch(date); }
}
document.addEventListener('dragover', (e) => { if (CURRENT_VIEW === 'plan' && e.target.closest && e.target.closest('#spl-main')) { e.preventDefault(); const z = e.target.closest('.sp-drop'); if (z) z.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('.sp-drop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', (e) => { if (CURRENT_VIEW === 'plan' && e.target.closest && e.target.closest('#spl-main')) { e.preventDefault(); splReadFiles([...e.dataTransfer.files]); } });
