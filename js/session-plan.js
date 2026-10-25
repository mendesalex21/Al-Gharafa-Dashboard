/**
 * Session Plan — before training: the drills (club library, planned minutes) and each player's status (carried over
 * from the last session), with the team load they forecast vs the usual for that MD. After training: drop the two
 * StatSports exports (S##_Full.csv, S##_Drills.csv) → the rows are built in the club's Excel format (sp-convert.js),
 * checked, then published to the season (added by the next update) or downloaded as Excel.
 * Before publishing, GPS times far from the session, from the plan or from the teammates are flagged (one-click fixes),
 * and the minutes written for each drill can be set to what it really lasted. Drill cards: a drill created here (its
 * exact name, optional pitch and players) is shared by the staff; until it has data, its forecast borrows another drill's.
 * A session in the data (Excel or published) can be corrected: status, time, RPE per player; the corrected cells replace
 * the Excel's at each update (build.py apply_corrections) — the Excel file is never written.
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
// a team day off: what a player on StatSports did (one click to switch; Day off = not counted, e.g. a pod left on)
const SPL_OFF_TYPES = ['Training_TeamB', 'INDIVIDUAL', 'Rehab', 'Compensatory', 'Day_Off'];
const splHalf = (t) => /^Game_(1st|2nd)Half$/.test(splGameTitle(t)); // a match's halves on StatSports: a B-team game on a day without a club match
// before publishing: a team-session player this far from the session time, a drill this far from its planned minutes,
// a player this far from his teammates in the same drill (this season: about one session in five has one)
const SPL_CHECK = { sessMin: 5, sessPct: 0.1, drillMin: 2, cutMin: 2, cutPct: 0.2 };
const splKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); // a drill name, case / accents / punctuation ignored
const splMedian = (xs) => { const a = xs.filter((x) => x > 0).sort((p, q) => p - q), m = a.length >> 1; return !a.length ? 0 : a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
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
  splLoadSaved().then(() => splDraw()).catch((err) => { if (!SPL.saved) SPL.saved = { plans: {}, titles: {}, published: {}, drills: {} }; SPL.state = 'Plans not loaded: ' + (err.message || err); splDraw(); });
}

// ------------------------------------------------------------------ saved plans (API, or this browser in the local demo)
// The saved plans come from the Google script (about 4 s): this browser keeps the last copy to draw the page at once,
// the site fetches them in the background after signing in, and the fresh copy replaces the old one when it comes —
// unless something was typed meanwhile (it is being saved). His ask, 2026-10-21: no wait on opening Session Plan.
function splFetchSaved() {
  if (!SPL.fetching) {
    SPL.fetching = callApi('plans', null, {}).then((d) => { d.drills = d.drills || {}; cacheSet('plans', d); SPL.fetchedAt = Date.now(); return d; })
      .finally(() => { SPL.fetching = null; });
  }
  return SPL.fetching;
}
function splPrefetch() {
  if (AUTH.demo || SPL.saved || SPL.fetching) return;
  splFetchSaved().then((d) => { if (!SPL.saved) SPL.saved = d; }).catch(() => { /* fetched again when the page opens */ });
}
async function splLoadSaved(force) { // force: after a save or a publish, the copy that includes it
  if (AUTH.demo) { try { SPL.saved = JSON.parse(localStorage.getItem('demo_plans')) || null; } catch (e) { SPL.saved = null; } SPL.saved = SPL.saved || { plans: {}, titles: {}, published: {} }; SPL.saved.drills = SPL.saved.drills || {}; return; }
  if (!SPL.saved) { const c = cacheGet('plans'); if (c && c.plans) { SPL.saved = { ...c, drills: c.drills || {} }; splDraw(); } }
  if (!force && SPL.saved && SPL.fetchedAt && Date.now() - SPL.fetchedAt < 60000) return; // fetched a moment ago (in the background)
  if (force && SPL.fetching) await SPL.fetching.catch(() => {}); // a read started before the save would not include it
  const t0 = Date.now(), fresh = await splFetchSaved();
  if (!SPL.saved || !(SPL.edited > t0)) SPL.saved = fresh;
}
function splDemoStore() { try { localStorage.setItem('demo_plans', JSON.stringify(SPL.saved)); } catch (e) { /* private mode */ } }
async function splSavePlan(date) {
  const plan = SPL.saved.plans[date];
  SPL.state = 'Saving…'; splStateLine();
  try {
    if (AUTH.demo) splDemoStore(); else await callApi('plan_save', null, { date, plan: { ...plan, _by: undefined, _at: undefined } });
    SPL.state = 'Saved ✓';
    if (!AUTH.demo) cacheSet('plans', SPL.saved); // this browser's copy follows
  } catch (err) { SPL.state = 'Not saved — ' + (err.message || err); }
  splStateLine();
}
function splTouch(date) { SPL.edited = Date.now(); clearTimeout(SPL.timer); SPL.state = 'Editing…'; splStateLine(); SPL.timer = setTimeout(() => splSavePlan(date), 700); }
function splStateLine() { const el = document.getElementById('spl-state'); if (el) el.textContent = SPL.state || 'Filled in from the calendar · saved as you type'; }

// ------------------------------------------------------------------ calendar rules: MD tag, label, week, session number
function splMatches() {
  SPL.matches = (SPL.events || []).filter((e) => e.kind === 'match' && e.gharafa === 'yes').map((e) => ({ date: e.played_date || e.confirmed_date || e.start, e }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
function splTag(date) {
  const r = SPL.lib.recent[date];
  if (DAY_MD[date] && !splMatchOn(date)) return DAY_MD[date]; // his choice for that day (the header's MD list, or the Calendar)
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
  if (p && p.off) return '/'; // a team day off: no session number, as in his Excel
  if (p && p.sid) return p.sid;
  const before = Object.keys(SPL.saved.plans || {}).filter((d) => d > SPL.lib.last_date && d < date && (SPL.saved.plans[d].drills || []).length && !SPL.saved.plans[d].off && !splMatchOn(d)).length;
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
function splGoWeek(n) { SPL.week = addDays(SPL.week, n); SPL.date = null; SPL.view = 'plan'; SPL.card = null; splDraw(); }
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
  if (SPL.view === 'correct' && !splCorrKey(SPL.date)) SPL.view = 'plan'; // nothing to correct on that day
  document.getElementById('spl-main').innerHTML = SPL.view === 'correct' ? splCorrectHtml() : SPL.view === 'import' && SPL.files.full ? splImportHtml() : splPlanHtml();
}
function splDrawWeek() {
  const el = document.getElementById('spl-week');
  el.innerHTML = [...Array(7)].map((_, i) => {
    const d = addDays(SPL.week, i), tag = splTag(d), m = splMatchOn(d), r = SPL.lib.recent[d], p = (SPL.saved.plans || {})[d];
    const pub = Object.values(SPL.saved.published || {}).some((x) => x.date === d && x.sid !== 'NT');
    const corr = r && (SPL.saved.corrections || {})[`${d}_${r.sid}`];
    const badge = r && /^S\d+$/.test(r.sid) ? `<span class="sp-b done">${r.sid} · ${r.pub ? 'published' : 'in the data'} ✓${corr ? ' · ✎' : ''}</span>` : pub ? '<span class="sp-b done">Published ✓</span>'
      : m ? `<span class="sp-b match">${crestHtml(m.e.opponent, 16)}${escapeHtml([m.e.round || m.e.competition, m.e.opponent].filter(Boolean).join(' · '))}</span>`
        : p && p.off ? '<span class="sp-b plan">Day off</span>' : p && (p.drills || []).length ? '<span class="sp-b plan">Planned</span>' : '<span class="sp-b none">+ Plan</span>';
    return `<button type="button" class="sp-day${d === SPL.date ? ' on' : ''}${m ? ' m' : ''}" data-day="${d}"><b>${SPL_DAY(d, { weekday: 'short', day: 'numeric' })}</b>${tag ? `<span class="sp-md${tag === 'MD' ? ' mdm' : ''}">${tag}</span>` : '<span class="sp-md off">—</span>'}${badge}</button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-day]'); if (b) { SPL.date = b.dataset.day; SPL.view = 'plan'; SPL.files = {}; SPL.card = null; splDraw(); } };
}

function splHead(date, step) {
  const p = splPlan(date), m = splMatchOn(date), next = SPL.matches.find((x) => x.date > date), r = SPL.lib.recent[date];
  const dd = next ? daysBetween(date, next.date) : null, canOff = !m && !(r && /^S\d+$/.test(r.sid)); // a club match or a session in the data: never a day off
  return `<div class="sp-head"><div class="sp-id"><span class="sp-k">${p.off ? 'Team day off' : 'Session'}</span><b>${p.off ? '<input class="sp-sid" value="/" disabled aria-label="No session number">' : `<input class="sp-sid" data-f="sid" value="${escapeHtml(p.sid || splSid(date))}" aria-label="Session number">`} · ${SPL_DAY(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
    <div class="sp-auto"><span><small>Week</small>${splWeekNo(date)}</span><span><small>MD</small>${m ? 'MD' : `<select class="sp-md" data-md aria-label="MD of this day"><option value="">${DAY_MD[date] ? 'Automatic' : splTag(date) || '—'}</option>${DAY_MD_TAGS.map((t) => `<option ${DAY_MD[date] === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`}</span><span><small>Week MD session</small><input class="sp-lbl" data-f="label" value="${escapeHtml(p.label || splLabel(date))}" aria-label="Week MD session"></span>
      ${m ? `<span><small>Match</small>${escapeHtml(m.e.opponent || '')}</span>` : next ? `<span><small>Next match</small>${SPL_DAY(next.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${dd === 1 ? 'tomorrow' : `in ${dd} days`}</span>` : ''}</div>
    ${canOff ? `<div class="seg sp-ampm"><button type="button" data-off class="${p.off ? 'active' : ''}" aria-pressed="${!!p.off}" title="No team session: the players who worked (B team, individual, rehab) are written on their own, everyone else Day off">Team day off</button></div>` : ''}
    ${p.off ? '' : `<div class="seg sp-ampm">${['AM', 'PM'].map((v) => `<button type="button" data-ampm="${v}" class="${(p.ampm || 'PM') === v ? 'active' : ''}">${v}</button>`).join('')}</div>`}</div>
    <div class="sp-steps">${['Plan', 'After the session', 'Published'].map((l, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}"><i>${i < step ? '✓' : i + 1}</i>${l}</span>`).join('<u></u>')}<em id="spl-state">${escapeHtml(SPL.state || 'Filled in from the calendar · saved as you type')}</em></div>`;
}

// ------------------------------------------------------------------ step 1: plan
const SPL_COL = ['#8e8e93', '#5b9bd5', '#34a853', '#2a78d6', '#ff9500', '#e5484d', '#a463f2', '#c7a600', '#30b0c7', '#8e1b4f'];
function splColor(name) { const lib = SPL.lib.library, i = lib.findIndex((x) => splName(x.name) === splName(name)); return SPL_NOT_TEAM.test(splName(name)) ? '#a463f2' : SPL_COL[(i < 0 ? 9 : i) % SPL_COL.length]; }

// ------------------------------------------------------------------ drill cards (created here: exact name, optional pitch and players)
function splDefs() { return (SPL.saved && SPL.saved.drills) || {}; }
function splDef(name) { const k = splKey(name); return k ? Object.values(splDefs()).find((x) => splKey(x.name) === k) || null : null; }
/** The drill's card as the "Drill info" cell of Data_Drills, after its name: "4vs1 · 40x30 m" (his ask, 2026-10-07). */
function splDrillInfo(name) {
  const d = splDef(name);
  if (!d) return null;
  const dim = Number(d.length) && Number(d.width) ? `${Math.round(Number(d.length))}x${Math.round(Number(d.width))} m` : '';
  return [d.players == null ? '' : String(d.players).trim(), dim].filter(Boolean).join(' · ') || null;
}
function splLibOf(name) {
  const k = splKey(name), f = (n) => SPL.lib.library.find((x) => splKey(x.name) === splKey(n)) || null;
  if (!k) return null;
  const a = (SPL.lib.alias || {})[String(name).split(/\s+/).join(' ').trim().toUpperCase()]; // a merged name (an old plan) → the drill kept (2026-10-24)
  return f(name) || (a ? f(a) : null);
}
/** The drill categories (his ask, 2026-10-24 — sync/drill_cats.py): every drill is forecast from its category's per-minute
 * load; the possessions in his three styles (small up to 5v5, medium 6v6–8v8, large 9v9 and more). */
/** A drill's (or category's) profile as on the physical coach's site: sprint m/10', top speed, % of the match per minute. */
const splPctMatch = (l) => { const m = SPL.lib.match_ref || {}; return l && l.td && m.td ? Math.round(l.td / m.td * 100) : null; };
function splProfTip(l) {
  const m = SPL.lib.match_ref || {}, pc = (k) => (l[k] != null && m[k] ? ` (${Math.round(l[k] / m[k] * 100)} % of a match)` : '');
  return [`${Math.round(l.td)} m/min${pc('td')}`, l.hit != null ? `> 20 km/h ${l.hit.toFixed(1)} m/min${pc('hit')}` : '', l.spr != null ? `sprint ${(l.spr * 10).toFixed(1)} m/10'${pc('spr')}` : '',
    l.acc_dec != null ? `Acc+Dec ${(l.acc_dec * 10).toFixed(1)} /10'${pc('acc_dec')}` : '', l.vmax ? `top speed ${l.vmax} km/h (median)` : ''].filter(Boolean).join(' · ');
}
const splCats = () => Object.fromEntries((SPL.lib.categories || []).map((c) => [c.key, c]));
const splCatShort = (k) => { const c = splCats()[k]; return c ? c.label.replace(/\s*\(.*$/, '') : k === 'other' ? 'Not a team drill' : k; };
const splSide = (t) => { const m = /(\d+)\s*vs?\s*(\d+)/i.exec(String(t || '')); return m ? Math.max(Number(m[1]), Number(m[2])) : 0; };
/** A drill's category: the library's (or its "forecast like" drill's); a possession drill takes its style from the players
 * written in its name or card (4v4+2 → small, 7v7 → medium, 9v9 → large). */
function splCatOf(name) {
  const l = splLibOf(name), d = splDef(name);
  let ck = l ? l.cat : null;
  if (!ck && d && d.like) { const ll = splLibOf(d.like); ck = ll ? ll.cat : null; }
  if (ck && /^poss_/.test(ck) && !(l && l.style)) { const sd = splSide(`${name} ${d ? d.players || '' : ''}`); if (sd) ck = sd <= 5 ? 'poss_s' : sd <= 8 ? 'poss_m' : 'poss_l'; }
  return ck;
}
/** The per-minute load the forecast uses: its category's; without categories (an older payload), the drill's own history,
 * else the drill its card borrows from. */
function splRateOf(name) {
  const own = splLibOf(name), ck = splCatOf(name), c = ck && ck !== 'other' ? splCats()[ck] : null;
  if (c) return { l: { ...c, name: splCatShort(ck), min: own ? own.min : c.min }, own: false, cat: ck };
  if (own) return { l: own, own: true };
  const d = splDef(name), like = d && d.like ? splLibOf(d.like) : null;
  return like ? { l: like, own: false } : null;
}
/** The drills to choose from: the library (drills with data), then the drills created here that have no data yet. */
function splChoices() {
  const names = SPL.lib.library.map((x) => splName(x.name)), seen = new Set(names.map(splKey));
  return { names, extra: Object.values(splDefs()).map((x) => splName(x.name)).filter((n) => !seen.has(splKey(n))).sort((a, b) => a.localeCompare(b)) };
}
/** Players in a free "players" text, for the area per player: 4vs1 → 5, 3vs0 → 3, 4v4+2 → 10, 10 → 10. */
function splNPlayers(v) { const ns = String(v ?? '').match(/\d+/g), n = ns ? ns.reduce((a, x) => a + Number(x), 0) : 0; return n >= 1 && n <= 60 ? n : null; }
function splArea(d) { const n = d && splNPlayers(d.players); return d && d.length && d.width && n ? Math.round(d.length * d.width / n) : null; }
const splDim = (c) => (Number(c.length) && Number(c.width) ? `${Math.round(Number(c.length))}x${Math.round(Number(c.width))}` : ''); // the pitch as written in a name
/** True when `part` (the players or the pitch) is written in the drill's name: the drill is compared with that format only. */
function splInName(name, part) { const k = splKey(part); return !!k && (' ' + splKey(name) + ' ').includes(' ' + k + ' '); }
/** A new drill's name in Data_Drills — what its history is matched on: the name, + the players and / or the pitch when it is
 * compared with that format only (cmp 'p', 'd' or 'pd'). */
function splCardName(c) { const pl = splName(c.players); return splName([c.name, /p/.test(c.cmp || '') && pl ? pl : '', /d/.test(c.cmp || '') ? splDim(c) : ''].join(' ')); }
function splDefTxt(d) {
  if (!d) return '';
  const a = splArea(d), pl = d.players == null ? '' : String(d.players).trim(), dim = d.length && d.width ? `${d.length}x${d.width}` : '';
  return [dim && !splInName(d.name, dim) ? `${d.length} × ${d.width} m` : '', pl && !splInName(d.name, pl) ? (/^\d+$/.test(pl) ? `${pl} players` : pl) : '', a ? `${a} m²/player` : ''].filter(Boolean).join(' · ');
}
/** "Forecast like" proposed for a new drill: the same drill without its players / pitch when that one has data (RONDO 4vs1 → RONDO), else a guess. */
function splLikeFor(c) { const base = splLibOf(c.name), full = splCardName(c); return base && splKey(base.name) !== splKey(full) ? splName(base.name) : splGuessLike(full, c.players); }
/** The library drill a new one is probably like (changed in the card if wrong): the drill the club's StatSports titles of
 * the same kind were named (same family and format: "Poss 5v5" → BOX RONDO), else from its words or number of players. */
function splGuessLike(name, players) {
  const toks = (s) => splKey(s).split(' ').filter(Boolean), mine = toks(name), fam = mine[0], fmt = mine.find((w) => /^\d+vs?\d+$/.test(w));
  let best = '', score = 0;
  Object.entries({ ...SPL.lib.titles, ...((SPL.saved && SPL.saved.titles) || {}) }).forEach(([t, nm]) => {
    const tt = toks(t), l = splLibOf(nm);
    if (!fam || !l || SPL_NOT_TEAM.test(splName(l.name))) return;
    const s = (tt[0] === fam ? 3 : 0) + (fmt && tt.includes(fmt) ? 3 : 0) + mine.filter((w) => w !== fam && w !== fmt && tt.includes(w)).length;
    if (s > score) { score = s; best = splName(l.name); }
  });
  if (score >= 3) return best;
  const n = splKey(name), find = (re) => { const x = SPL.lib.library.find((y) => re.test(y.name)); return x ? splName(x.name) : ''; };
  const v = /(\d+) ?vs? ?(\d+)/.exec(`${n} ${splKey(players)}`), np = splNPlayers(players), side = v ? Math.max(Number(v[1]), Number(v[2])) : np ? Math.ceil(np / 2) : 0;
  if (/warm|echauf/.test(n)) return find(/^WARM-UP$/i);
  if (/rondo/.test(n)) return find(/RONDO/i);
  if (/finish|cross|shoot|frappe/.test(n)) return find(/^FINISHING AND CROSSING$/i);
  if (/set piece|corner|free kick|coup franc/.test(n)) return find(/^SET PIECES$/i);
  if (/speed|sprint|vitesse/.test(n)) return find(/^SPEED$/i);
  if (/endurance|running|interval|fractionne/.test(n)) return find(/^ENDURANCE$/i);
  if (/possess|positional|conservation/.test(n)) return find(/^POSITIONAL PLAY POSSESSION & TRANSITION$/i);
  if (side) return find(side <= 5 ? /^SMALL SIDED/i : side <= 8 ? /^MEDIUM SIDED/i : /^LARGE GAME/i);
  if (/\bssg\b|small/.test(n)) return find(/^SMALL SIDED/i);
  if (/\bmsg\b|medium/.test(n)) return find(/^MEDIUM SIDED/i);
  if (/\blsg\b|large|game|match/.test(n)) return find(/^LARGE GAME/i);
  if (/pass/.test(n)) return find(/^PASSING DRILL$/i);
  if (/tactic|transition|attack|defen/.test(n)) return find(/^AT-DEF & TRANSITION$/i);
  return '';
}
/** The card under the drills: a new drill, or the pitch / players of one already in the plan. */
function splCardHtml() {
  const c = SPL.card;
  if (!c) return '';
  const isNew = c.edit == null, hasData = !isNew && !!splLibOf(c.name), area = splArea({ length: Number(c.length), width: Number(c.width), players: c.players });
  const lockP = !isNew && splInName(c.name, c.players), lockD = !isNew && splInName(c.name, splDim(c)); // written in its name: fixed
  return `<div class="sp-card"><div class="sp-h3">${isNew ? 'New drill' : escapeHtml(c.name)} <small>${isNew ? 'players and pitch are optional · add them to its name to compare it with that format only' : 'players and pitch are optional'}</small></div>
    ${isNew ? `<label class="sp-f"><span>Name</span><input data-card="name" value="${escapeHtml(c.name)}" maxlength="50" placeholder="e.g. RONDO, SSG + GK" autocomplete="off"></label>` : ''}
    <div class="sp-fr"><label class="sp-f"><span>Players</span><input data-card="players" value="${escapeHtml(c.players)}" maxlength="15" placeholder="e.g. 4vs1, 3vs0, 10" autocomplete="off"${lockP ? ' readonly title="Written in its name"' : ''}></label>
      <label class="sp-f"><span>Pitch (m)</span><span class="sp-xy"><input type="number" min="5" max="150" data-card="length" value="${c.length}" placeholder="length" aria-label="Pitch length"${lockD ? ' readonly' : ''}>×<input type="number" min="5" max="150" data-card="width" value="${c.width}" placeholder="width" aria-label="Pitch width"${lockD ? ' readonly' : ''}></span></label>
      <span class="sp-area">${area ? `${area} m² per player` : ''}</span>
      <label class="sp-f"><span>Repetitions</span><input data-card="reps" value="${escapeHtml(c.reps || '')}" maxlength="15" placeholder="e.g. 4 × 3'" autocomplete="off" style="width:96px"></label></div>
    <div class="sp-dyn">${splCardDyn()}</div>
    ${splCardWcs()}
    <div class="sp-card-a"><button type="button" class="btn-primary" data-card-save>${isNew ? 'Create and add' : 'Save'}</button><button type="button" class="btn-light" data-card-cancel>Cancel</button><em class="sp-card-msg"></em>${!isNew && !hasData && splDef(c.name) ? '<button type="button" class="linkbtn sp-del" data-card-del>Delete this drill</button>' : ''}</div></div>`;
}
/** The part of the card that follows what is typed: what a new drill is compared with (its name in Data_Drills) and the
 * drill the forecast borrows from until it has data of its own. */
function splCardDyn() {
  const c = SPL.card, isNew = c.edit == null, base = splName(c.name), pl = splName(c.players), dim = splDim(c);
  const opts = isNew && base ? [['', base], ...(pl ? [['p', `${base} ${pl}`]] : []), ...(dim ? [['d', `${base} ${dim}`]] : []), ...(pl && dim ? [['pd', `${base} ${pl} ${dim}`]] : [])] : [];
  if (isNew && !opts.some(([k]) => k === (c.cmp || ''))) c.cmp = '';
  const full = isNew ? splCardName(c) : c.name, hasData = !!splLibOf(full);
  const lib = SPL.lib.library.filter((x) => !SPL_NOT_TEAM.test(splName(x.name)) && !/^(Game|TEST$)/i.test(splName(x.name))); // a team drill to borrow from
  const hist = (nm) => { const l = splLibOf(nm); return l ? `${l.n} session${l.n > 1 ? 's' : ''}` : splDef(nm) ? 'created · no data yet' : 'new · no data yet'; };
  const what = { '': `every ${base}`, p: 'same players only', d: 'same pitch only', pd: 'same players and pitch only' };
  return `${opts.length > 1 ? `<div class="sp-f"><span>Compared with <small>its history = the sessions with exactly this name in Data_Drills</small></span><div class="sp-cmps">${opts.map(([k, nm]) => `<label class="sp-cmp${(c.cmp || '') === k ? ' on' : ''}"><input type="radio" name="sp-cmp" data-card="cmp" value="${k}"${(c.cmp || '') === k ? ' checked' : ''}><b>${escapeHtml(nm)}</b><small>${escapeHtml(what[k])} · ${hist(nm)}</small></label>`).join('')}</div></div>` : ''}
    ${hasData ? '' : `<label class="sp-f"><span>Forecast like <small>until it has data of its own (after its first session)</small></span><select data-card="like"><option value="">— not in the forecast —</option>${lib.map((x) => `<option ${splKey(x.name) === splKey(c.like) ? 'selected' : ''}>${escapeHtml(splName(x.name))}</option>`).join('')}</select></label>`}`;
}
/** The WCS window the staff report compares the drill with (his physical coach's rules, 2026-10-15): speed / acc-dec /
 * duels → 1 min, 8 a side or more → 5 min, other games → 3 min, warm-up / strength → not judged (sync/wcs.py auto_window). */
function splAutoWin(name, players) {
  const t = `${name || ''} ${players || ''}`;
  if (/individual/i.test(t)) return 0; // individual work: his best minute (2026-10-16)
  if (/warm|strength|gym|activation|rehab/i.test(t)) return null;
  if (/speed|sprint|velocid|\bacc|\bdec|agil/i.test(t)) return 0;
  const m = /(\d+)\s*vs?\s*(\d+)/i.exec(t), side = m ? Math.max(Number(m[1]), Number(m[2])) : 0;
  return side >= 8 ? 2 : side && side <= 2 ? 0 : 1;
}
const SPL_WIN = ['1 min', '3 min', '5 min'];
/** The drill's WCS window as written in the plan: "WCS 3′" (chosen in its card) or "WCS 3′ · auto". */
function splWcsTxt(name) {
  const d = splDef(name) || {}, w = { 1: 0, 3: 1, 5: 2 }[d.wcs];
  if (d.wcs === 'off') return 'WCS: not judged';
  if (w != null) return `WCS ${SPL_WIN[w].replace(' min', '′')}`;
  const a = splAutoWin(name, d.players);
  return a == null ? 'WCS: not judged · auto' : `WCS ${SPL_WIN[a].replace(' min', '′')} · auto`;
}
/** The card's "compared with the match" choice: automatic (the rule), 1, 3 or 5 min, or not judged. */
function splCardWcs() {
  const c = SPL.card, a = splAutoWin(c.name, c.players), cur = c.wcs || '';
  const opts = [['', `Automatic · ${a == null ? 'not judged' : SPL_WIN[a]}`, 'from its name and players'], ['1', '1 min', 'speed · acc / dec · duels · repetitions under 3′'],
    ['3', '3 min', 'small-sided games'], ['5', '5 min', 'larger games (8 a side +)'], ['off', 'Not judged', 'warm-up · strength']];
  return `<div class="sp-f"><span>Compared with the match (WCS) <small>his best passage of this length in the drill vs his match WCS of the same length · the peaks always use the 1-min WCS</small></span>
    <div class="sp-cmps">${opts.map(([v, b, sm]) => `<label class="sp-cmp${cur === v ? ' on' : ''}"><input type="radio" name="sp-wcs" data-card="wcs" value="${v}"${cur === v ? ' checked' : ''}><b>${escapeHtml(b)}</b><small>${escapeHtml(sm)}</small></label>`).join('')}</div></div>`;
}
/** As the card is typed in: the area per player, what it can be compared with and the guessed "forecast like". */
function splCardRefresh() {
  const c = SPL.card, isNew = c.edit == null;
  if (c.auto && !splLibOf(isNew ? splCardName(c) : c.name)) c.like = isNew ? splLikeFor(c) : splGuessLike(c.name, c.players);
  const a = splArea({ length: Number(c.length), width: Number(c.width), players: c.players }), el = document.querySelector('.sp-area'), dyn = document.querySelector('.sp-dyn');
  if (el) el.textContent = a ? `${a} m² per player` : '';
  if (dyn) dyn.innerHTML = splCardDyn();
}
async function splCardSave() {
  const c = SPL.card, date = SPL.date, name = c.edit == null ? splCardName(c) : splName(c.name); // a new drill: + its players / pitch if compared with them only
  if (!splName(c.name)) { const el = document.querySelector('.sp-card-msg'); if (el) el.textContent = 'Write the name of the drill.'; return; }
  const num = (v, lo, hi) => { const x = Math.round(Number(v)); return v === '' || v == null || !Number.isFinite(x) || !x ? null : Math.max(lo, Math.min(hi, x)); };
  const prev = splDef(name), inLib = splLibOf(name), key = prev ? prev.name : inLib ? splName(inLib.name) : name; // one card per drill, whatever the spelling
  const def = { name: key, length: num(c.length, 1, 150), width: num(c.width, 1, 150), players: splName(c.players).slice(0, 15) || null, like: inLib ? '' : c.like || '',
    wcs: ['1', '3', '5', 'off'].includes(c.wcs) ? c.wcs : '', reps: splName(c.reps).slice(0, 15) };
  SPL.saved.drills = { ...splDefs(), [key]: def };
  if (c.edit == null) { const r8 = splRateOf(key); splEnsure(date).drills.push({ name: key, min: r8 ? r8.l.min : 10 }); splTouch(date); }
  SPL.card = null; splDraw();
  try { if (AUTH.demo) splDemoStore(); else await callApi('drill_save', null, def); SPL.state = `Drill card “${key}” saved ✓`; } catch (err) { SPL.state = 'Drill card not saved — ' + (err.message || err); }
  splStateLine();
}
async function splCardDelete() {
  const def = splDef(SPL.card.name);
  SPL.card = null;
  if (!def) { splDraw(); return; }
  const all = { ...splDefs() };
  delete all[def.name];
  SPL.saved.drills = all; splDraw();
  try { if (AUTH.demo) splDemoStore(); else await callApi('drill_delete', null, { name: def.name }); SPL.state = 'Drill deleted'; } catch (err) { SPL.state = 'Not deleted — ' + (err.message || err); }
  splStateLine();
}
function splPlanHtml() {
  const date = SPL.date, p = splPlan(date), lib = SPL.lib.library, tag = splTag(date);
  // in the data from the Excel files: nothing to do. Published from this page: can be published again (it replaces) or removed
  const r = SPL.lib.recent[date], pubs = Object.values(SPL.saved.published || {}).filter((x) => x.date === date && x.sid !== 'NT'), pub = pubs[0];
  const inData = !!(r && /^S\d+$/.test(r.sid) && !r.pub), live = !!(r && r.pub);
  const pubWhat = (x) => `${x.sid === 'OFF' ? 'day off · B team (session “/”)' : escapeHtml(x.sid)} · ${escapeHtml(x.rows || '')} <button type="button" class="linkbtn" data-unpub="${escapeHtml(date + '_' + x.sid)}">Unpublish</button>`;
  const team = p.drills.filter((d) => !SPL_NOT_TEAM.test(splName(d.name))), tot = team.reduce((a, d) => a + (Number(d.min) || 0), 0);
  const titleOf = {}; Object.entries({ ...SPL.lib.titles, ...SPL.saved.titles }).forEach(([t, n]) => { if (!titleOf[splName(n)]) titleOf[splName(n)] = t; });
  const ch = splChoices(), opt = (n, cur) => `<option ${splKey(n) === splKey(cur) ? 'selected' : ''}>${escapeHtml(n)}</option>`;
  // the drills under the physical coach's five families (Activation, Technical-tactical, Possession, Games, Physical — his
  // site), by category inside a family, the most used first
  const cats = SPL.lib.categories || [], fams = SPL.lib.families || [], famOf = Object.fromEntries(cats.map((c) => [c.key, c.family || 'other'])), catIdx = Object.fromEntries(cats.map((c, i) => [c.key, i])), byFam = {};
  SPL.lib.library.slice().sort((a, b) => (catIdx[a.cat] ?? 99) - (catIdx[b.cat] ?? 99) || b.n - a.n).forEach((x) => { const f = famOf[x.cat] || 'other'; (byFam[f] = byFam[f] || []).push(splName(x.name)); });
  const grouped = (cur) => (fams.length ? fams : [['other', 'Drills']]).filter(([k]) => byFam[k]).map(([k, l]) => `<optgroup label="${escapeHtml(l)}">${byFam[k].map((n) => opt(n, cur)).join('')}</optgroup>`).join('')
    + (fams.length ? '' : Object.keys(byFam).filter((k) => k !== 'other').map((k) => byFam[k].map((n) => opt(n, cur)).join('')).join(''));
  const list = (cur) => (cats.length ? grouped(cur) : ch.names.map((n) => opt(n, cur)).join('')) + (ch.extra.length ? `<optgroup label="Created here · no data yet">${ch.extra.map((n) => opt(n, cur)).join('')}</optgroup>` : '');
  const opts = (cur) => `<option value="">Choose a drill…</option>${list(cur)}${cur && ![...ch.names, ...ch.extra].some((n) => splKey(n) === splKey(cur)) ? `<option selected>${escapeHtml(cur)}</option>` : ''}`;
  const rows = p.drills.map((d, i) => { const r8 = splRateOf(d.name), own = SPL_NOT_TEAM.test(splName(d.name)), ss = titleOf[splName(d.name)];
    const cap = own ? 'individual / rehab work' : [ss ? 'StatSports: ' + escapeHtml(ss) : '', escapeHtml(splDefTxt(splDef(d.name))), escapeHtml(splWcsTxt(d.name)),
      !r8 ? '<span class="sp-warn">no data yet — not in the forecast</span>' : r8.cat ? `forecast: ${escapeHtml(r8.l.name)}` : r8.own ? '' : `forecast like ${escapeHtml(splName(r8.l.name))}`].filter(Boolean).join(' · ');
    return `<div class="sp-dr"><span class="sp-ord"><button type="button" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-down="${i}" ${i < p.drills.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span><span class="no" style="background:${splColor(d.name)}">${i + 1}</span>
      <span class="nm"><select data-drill="${i}">${opts(d.name)}</select><small>${cap}${own ? '' : `<button type="button" class="sp-ed" data-card-edit="${i}">${splDef(d.name) ? '✎ card' : '+ pitch / players'}</button>`}</small></span>
      <span class="sp-min"><button type="button" data-min="${i}" data-step="-1">−</button><input type="number" min="1" max="120" value="${d.min || ''}" data-mins="${i}" aria-label="Minutes"><button type="button" data-min="${i}" data-step="1">+</button></span>
      <span class="sp-int"${r8 ? ` title="${escapeHtml(splProfTip(r8.l))}"` : ''}>${r8 && r8.l.td ? `≈ ${Math.round(r8.l.td)} m/min${splPctMatch(r8.l) != null ? ` · <b>${splPctMatch(r8.l)} %</b> of a match` : ''}` : ''}</span><button type="button" class="x" data-del="${i}" aria-label="Remove">×</button></div>`; }).join('');
  const last = Object.keys(SPL.lib.recent).filter((d) => d < date && SPL.lib.recent[d].md === tag && SPL.lib.recent[d].drills.length).sort().pop();
  const sugg = lib.filter((x) => x.md.includes(tag) && !p.drills.some((d) => splName(d.name) === splName(x.name))).slice(0, 4);
  const line = team.map((d) => `<i style="flex:${d.min || 1};background:${splColor(d.name)}" title="${escapeHtml(d.name)}"><b>${d.min || ''}'</b></i>`).join('');
  return `${splHead(date, inData || pub ? 2 : 0)}
    ${inData ? `<p class="sp-banner ok">This session is already in the data (${r.sid}, from the Excel files). Nothing to import.</p>` : pub ? `<p class="sp-banner ok">Published ✓ ${pubs.map(pubWhat).join(' · ')} · by ${escapeHtml(String(pub.by || '').split('@')[0])} — ${live || p.off ? 'in the dashboard (or in a few minutes)' : 'added to the dashboard in a few minutes'}. To correct it, get the session again and publish: the new version replaces it a few minutes later.</p>` : live ? `<p class="sp-banner warn">Unpublished — ${escapeHtml(r.sid)} leaves the dashboard at the next update.</p>` : ''}
    ${inData || live ? splCorrLineHtml(date) : ''}
    ${splNoRpeHtml(date)}
    <div class="sp-two">${p.off ? splOffCardHtml(date, p) : `<div class="sp-col">
      <div class="sp-h3">Drills <small>${tot}' of team work${p.drills.length ? ' · ▲▼ to reorder' : ''}</small>${last ? `<button type="button" class="btn-light sp-copy" data-copy="${last}">⟲ Copy last ${tag} · ${SPL_DAY(last, { weekday: 'short', day: 'numeric', month: 'short' })}</button>` : ''}</div>
      ${team.length ? `<div class="sp-line">${line}</div>` : ''}${rows || '<p class="sp-note">No drill yet — copy the last session of this MD or add drills below.</p>'}
      <div class="sp-add"><select data-add aria-label="Add a drill"><option value="">+ Add a drill…</option>${list('')}<option value="__new">+ Create a new drill…</option></select>${sugg.length ? `<small>Often on ${tag}:</small>${sugg.map((x) => `<button type="button" data-sugg="${escapeHtml(splName(x.name))}">${escapeHtml(splName(x.name))} <small>${x.min}'</small></button>`).join('')}` : ''}</div>
      ${splCardHtml()}
      ${splLoadHtml(date, p)}</div>`}
      ${splPlayersHtml(p)}</div>
    ${inData ? '' : `<div class="sp-after">${typeof cfOn === 'function' && cfOn() ? `<button type="button" class="btn-primary sp-api" data-statsports><b>After the ${p.off ? 'day' : 'session'}</b>⇣ Get it from StatSports</button>` : ''}${p.off ? '<button type="button" class="btn-light" data-nogps>Nobody worked — publish the day off as it is</button>' : ''}<label class="sp-drop mini" id="spl-drop"><input type="file" accept=".csv,text/csv" multiple hidden data-files>${typeof cfOn === 'function' && cfOn() ? '' : '<b>After the session</b>'}<span>${typeof cfOn === 'function' && cfOn() ? 'or drop' : 'Drop'} ${p.off ? 'the day’s StatSports exports (Full and Drills) here, or click to choose' : `<code>${escapeHtml(p.sid || splSid(date))}_Full.csv</code> and <code>${escapeHtml(p.sid || splSid(date))}_Drills.csv</code> here, or click to choose — the rows are built from this plan`}</span></label></div>`}
    ${splNtHtml()}`;
}
/** A team day off, in place of the drills: what the import will write (his MD+1 days off in the Excel). */
function splOffCardHtml(date, p) {
  const md = splTag(date) || '/', label = p.label || splLabel(date);
  return `<div class="sp-col"><div class="sp-h3">Team day off <small>no team session · no session number (“/”) · ${escapeHtml(md)} · ${escapeHtml(label)}</small></div>
    <div class="sp-offcard"><p><b>After the day</b>, “Get it from StatSports” reads every recording of the day:</p>
      <ul><li>each player on StatSports: <b>B-team training</b> by default — one click to switch to individual, rehab or compensatory (or not counted);</li>
        <li>a player with the halves of a match: <b>B-team game</b> (Game_B, MD, his two halves);</li>
        <li>everyone else: <b>Day off</b>, or his status (injured, national team…), 0 min.</li></ul>
      <p class="sp-note">Written as on your MD+1 days off: session “/”, his own minutes, one drill row with his status. No staff report or e-mail — each player's work counts in his week and his A:C. Set the players you already know (B-team training, rehab…) on the right.</p></div></div>`;
}
/** A session in the data: its players still without an RPE — the answers given since on the RPE page, or a value typed
 * here (saved like a player's answer); both are added to the data at the next update, a value there is never replaced. */
function splNoRpeHtml(date) {
  const r = SPL.lib.recent[date], ids = (r && r.norpe) || [];
  if (!ids.length) return '';
  const day = ((SPL.saved && SPL.saved.rpe) || {})[date] || {};
  const name = (id) => (SPL.lib.players.find((q) => q.id === id) || {}).name || ((SPL.lib.roster || {})[id] || {}).name || id;
  const val = (id) => { const a = day[id]; return a && a.length ? a[a.length - 1][0] : null; };
  const ready = ids.filter((id) => val(id) != null).length;
  const cells = ids.map((id) => { const v = val(id), st = (r.types || {})[id];
    return `<label class="${v != null ? 'k' : 'miss'}" title="${v != null ? 'Ready: added in a few minutes' : 'No RPE yet'}">${escapeHtml(name(id))}${st && st !== 'ProTraining' ? ` <small>${escapeHtml(st)}</small>` : ''}<input type="number" min="0" max="10" step="0.5" value="${v ?? ''}" data-norpe="${escapeHtml(id)}" aria-label="RPE of ${escapeHtml(name(id))}"></label>`; }).join('');
  return `<div class="sp-norpe"><div class="sp-h3">RPE missing <small id="spl-norpe-n">${ids.length} player${ids.length > 1 ? 's' : ''} without an RPE in the data${ready ? ` · ${ready} ready, added in a few minutes` : ''}</small></div>
    <div class="sp-rpe">${cells}</div>
    <p class="sp-note"><span class="sp-key k"></span>answered since on the RPE page, or typed here · <span class="sp-key miss"></span>still missing. Type a value and leave the box: it is saved like the player's answer and added to the data a few minutes later (a value already in the data is never replaced).</p></div>`;
}
async function splSaveNoRpe(date, id, input) {
  const v = input.value === '' ? null : Number(input.value), l = input.closest('label');
  if (v == null || !(v >= 0 && v <= 10)) return;
  const name = (SPL.lib.players.find((q) => q.id === id) || {}).name || ((SPL.lib.roster || {})[id] || {}).name || id;
  SPL.state = `Saving the RPE of ${name}…`; splStateLine();
  try {
    if (AUTH.demo) splDemoStore(); else await callApi('rpe_add', null, { date, player_id: id, player_name: name, rpe: v });
    const rp = SPL.saved.rpe || (SPL.saved.rpe = {}); (rp[date] || (rp[date] = {}))[id] = [[v, '']];
    if (AUTH.demo) splDemoStore();
    if (l) { l.classList.remove('miss'); l.classList.add('k'); l.title = 'Ready: added in a few minutes'; }
    const ids = (SPL.lib.recent[date] || {}).norpe || [], ready = ids.filter((x) => ((rp[date] || {})[x] || []).length).length, el = document.getElementById('spl-norpe-n');
    if (el) el.textContent = `${ids.length} player${ids.length > 1 ? 's' : ''} without an RPE in the data · ${ready} ready, added in a few minutes`;
    SPL.state = `RPE of ${name}: ${v} saved ✓ — added to the data at the next update`;
    splStateLine(); splRebuilt(); return;
  } catch (err) { SPL.state = 'RPE not saved — ' + (err.message || err); }
  splStateLine();
}
function splLoadHtml(date, p) {
  const c = SPL.lib.calib || {}, rate = (n, k) => { const r8 = splRateOf(n); return r8 ? r8.l[k] || 0 : 0; };
  const team = p.drills.filter((d) => !SPL_NOT_TEAM.test(splName(d.name)) && d.min);
  if (!team.length) return '';
  const none = [...new Set(team.filter((d) => !splRateOf(d.name)).map((d) => splName(d.name)))]; // created drills with no data and no "forecast like"
  const pred = (k) => team.reduce((a, d) => a + rate(d.name, k) * d.min, 0) * ((c[k] || {}).k || 1);
  const typ = splCycleType(date), ref = ((SPL.lib.usual[typ] || {})[splTag(date)]) || null;
  const bar = (k, label, unit) => {
    const v = pred(k), u = ref ? ref[k] : null, max = Math.max(v, u ? u[2] : 0, u ? u[0] : 0) * 1.25 || 1, pc = (x) => Math.min(100, (x || 0) / max * 100);
    const lv = !u ? 'na' : v < u[1] * 0.95 ? 'lo' : v > u[2] * 1.05 ? 'hi' : 'ok';
    return `<div class="sp-lr"><span class="l">${label}</span><span class="sp-lt">${u ? `<i class="band" style="left:${pc(u[1])}%;width:${pc(u[2]) - pc(u[1])}%"></i><i class="mean" style="left:${pc(u[0])}%"></i>` : ''}<i class="dot ${lv}" style="left:${pc(v)}%"></i></span>
      <b>${k === 'td' ? (v / 1000).toFixed(1) + 'k' : Math.round(v)}<small> ${unit}</small></b><em class="${lv}">${lv === 'ok' ? 'usual ✓' : lv === 'lo' ? 'lighter' : lv === 'hi' ? 'heavier' : '—'}</em><small class="sp-acc">${(c[k] || {}).err != null ? (k === 'hit' ? 'indicative' : `±${c[k].err} %`) : ''}</small></div>`;
  };
  return `<div class="sp-load"><div class="sp-h3">Planned team load <small>${(SPL.lib.categories || []).length ? 'each drill\'s category (its usual per-minute load)' : 'each drill\'s usual per-minute load'} × its planned minutes${ref ? ` · grey = usual ${splTag(date)} of a ${typ} microcycle (p25–p75, ${ref.n} sessions), line = average` : ' · no usual reference for this day'}</small></div>
    ${bar('td', 'Total distance', 'm')}${bar('acc_dec', 'Acc + Dec', '')}${bar('hit', '> 20 km/h', 'm')}
    ${none.length ? `<p class="sp-note warn">Not in the forecast (no data yet): ${none.map(escapeHtml).join(', ')} — open its card (+ pitch / players) and choose “Forecast like”.</p>` : ''}</div>`;
}
/** The statuses to choose from: the usual ones, then the other types found in the files (matches left out). */
function splStatusList() {
  const known = new Set(SPL_STATUS.map(([k]) => k)), extra = (SPL.lib.types || []).filter((t) => !known.has(t) && !/^(Game|Friendly_Game|Game\+Compensatory|NC|Private)$/.test(t));
  return [...SPL_STATUS, ...extra.map((t) => [t, t, '#aeaeb2'])];
}
function splPlayersHtml(p) {
  const known = new Set(SPL_STATUS.map(([k]) => k)), extra = (SPL.lib.types || []).filter((t) => !known.has(t) && !/^(Game|Friendly_Game|Game\+Compensatory|NC|Private)$/.test(t));
  const status = splStatusList(), col = Object.fromEntries(status.map(([k, , c]) => [k, c])), lab = Object.fromEntries(status.map(([k, l]) => [k, l]));
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

// ------------------------------------------------------------------ correct a session in the data (option A)
/** The key (date_sid) of the session of a day that can be corrected here: in the data, with its rows (last 30 days). */
function splCorrKey(date) { const r = SPL.lib && SPL.lib.recent[date]; return r && r.rows && r.rows.length && /^S\d+$/.test(r.sid) ? `${date}_${r.sid}` : null; }
/** Opens the correction of a day — from this page, or from the Sessions page. */
function splOpenCorrection(date) {
  SPL.week = addDays(date, -new Date(date + 'T12:00:00Z').getUTCDay()); SPL.date = date; SPL.view = 'correct'; SPL.files = {}; SPL.card = null; SPL.corr = null;
  if (CURRENT_VIEW === 'plan') splDraw(); else switchView('plan');
}
/** The correction being edited: {player key: {type?, time?, rpe?}} — only the values that differ from the Excel's. */
function splCorrDraft(date) {
  const key = splCorrKey(date);
  if (!SPL.corr || SPL.corr.key !== key) SPL.corr = { key, ch: JSON.parse(JSON.stringify((((SPL.saved.corrections || {})[key]) || {}).changes || {})) };
  return SPL.corr.ch;
}
function splPName(id, k) { return (SPL.lib.players.find((q) => q.id === id) || {}).name || ((SPL.lib.roster || {})[id] || {}).name || String(k).split('#')[0]; }
/** Each player row: the Excel's values (before any correction), the values shown (the correction, else the Excel's). */
function splCorrRows(date) {
  const r = SPL.lib.recent[date], orig = r.orig || {}, ch = splCorrDraft(date);
  return r.rows.map(([k, id, pos, type, time, rpe, td, hit, nd, drpe, rehab, indiv]) => {
    const xl = { type, time, rpe, ...(orig[k] || {}) }, c = ch[k] || {}, val = (f) => (f in c ? c[f] : xl[f]);
    return { k, id, pos, td, hit, nd, drpe, rehab, indiv, xl, now: { type: val('type'), time: val('time'), rpe: val('rpe') }, chg: (f) => f in c && c[f] !== xl[f] };
  });
}
const splF0 = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-GB'));
const splMpm = (x, t) => (x.td != null && t ? x.td / t : null), splCarga = (rp, t) => (rp != null && t != null ? rp * t : null);
function splCorrDrills(x) {
  const s = (n) => `${n} drill row${n > 1 ? 's' : ''}`;
  if (!x.nd) return '<span class="dim">—</span>';
  if (x.rehab && x.xl.type === 'Rehab' && x.now.type !== 'Rehab') return `<b>Rehab → INDIVIDUAL</b> <small>${s(x.nd)}</small>`;
  if (x.indiv && x.xl.type !== 'Rehab' && x.now.type === 'Rehab') return `<b>INDIVIDUAL → Rehab</b> <small>${s(x.nd)}</small>`;
  if (x.chg('rpe') && x.drpe) return `<b>RPE ${x.now.rpe ?? '—'} on ${s(x.drpe)}</b>`;
  return s(x.nd);
}
function splCorrSummary(rows) {
  const lab = Object.fromEntries(splStatusList().map(([k, l]) => [k, l])), L = (t) => lab[t] || t;
  const ch = rows.filter((x) => ['type', 'time', 'rpe'].some((f) => x.chg(f)));
  if (!ch.length) return '<span class="dim">No change yet — change a status, a time or an RPE above.</span>';
  return `<b>${ch.length} player${ch.length > 1 ? 's' : ''} changed</b><ul>${ch.map((x) => {
    const p = [];
    if (x.chg('type')) p.push(`${escapeHtml(L(x.xl.type))} → ${escapeHtml(L(x.now.type))}`);
    if (x.chg('time')) p.push(`time ${x.xl.time ?? '—'}' → ${x.now.time ?? '—'}'`, ...(x.td != null ? [`m/min ${splF0(splMpm(x, x.xl.time))} → ${splF0(splMpm(x, x.now.time))}`] : []));
    if (x.chg('rpe')) p.push(`RPE ${x.xl.rpe ?? '—'} → ${x.now.rpe ?? '—'}`);
    if (x.chg('time') || x.chg('rpe')) p.push(`Carga RPE ${splF0(splCarga(x.xl.rpe, x.xl.time))} → ${splF0(splCarga(x.now.rpe, x.now.time))}`);
    if (x.rehab && x.xl.type === 'Rehab' && x.now.type !== 'Rehab') p.push('his drill “Rehab” becomes “INDIVIDUAL”');
    if (x.indiv && x.xl.type !== 'Rehab' && x.now.type === 'Rehab') p.push('his drill “INDIVIDUAL” becomes “Rehab”');
    if (x.chg('rpe') && x.drpe) p.push(`RPE ${x.now.rpe ?? '—'} on his ${x.drpe} drill row${x.drpe > 1 ? 's' : ''} too`);
    return `<li><b>${escapeHtml(splPName(x.id, x.k))}</b> · ${p.join(' · ')}</li>`;
  }).join('')}</ul>`;
}
function splCorrRowHtml(x, status) {
  const lab = Object.fromEntries(status.map(([k, l]) => [k, l])), ct = x.chg('type'), cm = x.chg('time'), cr = x.chg('rpe');
  const opts = status.map(([k, l]) => `<option value="${escapeHtml(k)}" ${k === x.now.type ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('') + (lab[x.now.type] ? '' : `<option selected>${escapeHtml(x.now.type)}</option>`);
  return `<tr data-ck="${escapeHtml(x.k)}"><td><b>${escapeHtml(splPName(x.id, x.k))}</b><span class="pos">${escapeHtml(x.pos)}</span></td>
    <td><select class="${ct ? 'c' : ''}" data-cf="type" aria-label="Status">${opts}</select><span class="was" data-was="type">${ct ? escapeHtml(lab[x.xl.type] || x.xl.type) : ''}</span></td>
    <td><input type="number" min="0" max="300" class="${cm ? 'c' : ''}" data-cf="time" value="${x.now.time ?? ''}" aria-label="Time"><span class="was" data-was="time">${cm ? `${x.xl.time ?? '—'}'` : ''}</span></td>
    <td><input type="number" min="0" max="10" step="0.5" class="${cr ? 'c' : ''}" data-cf="rpe" value="${x.now.rpe ?? ''}" aria-label="RPE"><span class="was" data-was="rpe">${cr ? x.xl.rpe ?? '—' : ''}</span></td>
    <td class="r">${splF0(x.td)}</td><td class="r${cm ? ' c' : ''}" data-cc="mpm">${splCorrCell(x, 'mpm')}</td><td class="r${cm || cr ? ' c' : ''}" data-cc="cg">${splCorrCell(x, 'cg')}</td><td data-cc="dr">${splCorrDrills(x)}</td></tr>`;
}
function splCorrCell(x, c) {
  if (c === 'mpm') return `${splF0(splMpm(x, x.now.time))}${x.chg('time') ? `<span class="was">${splF0(splMpm(x, x.xl.time))}</span>` : ''}`;
  return `${splF0(splCarga(x.now.rpe, x.now.time))}${x.chg('time') || x.chg('rpe') ? `<span class="was">${splF0(splCarga(x.xl.rpe, x.xl.time))}</span>` : ''}`;
}
/** Changed against the published correction (or the data, when there is none)? */
function splCorrDirty(date) { const key = splCorrKey(date); return JSON.stringify(splCorrDraft(date)) !== JSON.stringify((((SPL.saved.corrections || {})[key]) || {}).changes || {}); }
function splCorrectHtml() {
  const date = SPL.date, r = SPL.lib.recent[date], key = splCorrKey(date), saved = (SPL.saved.corrections || {})[key];
  const rows = splCorrRows(date), status = splStatusList();
  return `${splHead(date, 2)}
    <div class="sp-corr"><div class="sp-h3">Correct ${escapeHtml(r.sid)} <small>Change a status, a time or an RPE: the other columns follow. Yellow = changed (the old value struck through).</small></div>
      <div class="sp-tw"><table class="sp-ctbl"><thead><tr><th>Player</th><th>Status</th><th>Time</th><th>RPE</th><th class="r">DT</th><th class="r">m/min</th><th class="r">Carga RPE</th><th>Drills</th></tr></thead>
        <tbody>${rows.map((x) => splCorrRowHtml(x, status)).join('')}</tbody></table></div>
      <div class="sp-csum" id="spl-csum">${splCorrSummary(rows)}</div>
      <div class="sp-actions"><button type="button" class="btn-primary" data-corr-pub ${splCorrDirty(date) ? '' : 'disabled'}>Publish the correction</button><button type="button" class="btn-light" data-corr-cancel>Cancel</button>
        ${saved ? '<button type="button" class="linkbtn sp-del" data-corr-del>Remove the correction</button>' : ''}
        <span>Your Excel file isn't touched: at each update the corrected cells replace those of ${escapeHtml(r.sid)} — site, reports, Google Sheet / Power BI. Everything else still comes from the Excel.</span></div></div>`;
}
/** One cell changed: that row's columns, the summary and the publish button follow (the inputs stay, the focus too). */
function splCorrEdit(t) {
  const date = SPL.date, tr = t.closest('tr[data-ck]'), k = tr.dataset.ck, f = t.dataset.cf, ch = splCorrDraft(date);
  const x0 = splCorrRows(date).find((y) => y.k === k);
  const v = f === 'type' ? t.value : t.value === '' ? null : Number(t.value);
  if (f !== 'type' && v != null && (!Number.isFinite(v) || v < 0 || v > (f === 'rpe' ? 10 : 300))) { t.value = x0.now[f] ?? ''; return; }
  const c = ch[k] || (ch[k] = {});
  if (v === x0.xl[f]) delete c[f]; else c[f] = v;
  if (!Object.keys(c).length) delete ch[k];
  const rows = splCorrRows(date), x = rows.find((y) => y.k === k), lab = Object.fromEntries(splStatusList().map(([a, l]) => [a, l]));
  ['type', 'time', 'rpe'].forEach((g) => {
    const el = tr.querySelector(`[data-cf="${g}"]`), w = tr.querySelector(`[data-was="${g}"]`);
    if (el) el.classList.toggle('c', x.chg(g));
    if (w) w.textContent = !x.chg(g) ? '' : g === 'type' ? lab[x.xl.type] || x.xl.type : g === 'time' ? `${x.xl.time ?? '—'}'` : String(x.xl.rpe ?? '—');
  });
  const mp = tr.querySelector('[data-cc="mpm"]'), cg = tr.querySelector('[data-cc="cg"]'), dr = tr.querySelector('[data-cc="dr"]');
  mp.innerHTML = splCorrCell(x, 'mpm'); mp.classList.toggle('c', x.chg('time'));
  cg.innerHTML = splCorrCell(x, 'cg'); cg.classList.toggle('c', x.chg('time') || x.chg('rpe'));
  dr.innerHTML = splCorrDrills(x);
  document.getElementById('spl-csum').innerHTML = splCorrSummary(rows);
  document.querySelector('[data-corr-pub]').disabled = !splCorrDirty(date);
}
async function splCorrPublish(remove) {
  const date = SPL.date, r = SPL.lib.recent[date], key = splCorrKey(date), ch = remove ? {} : splCorrDraft(date), n = Object.keys(ch).length;
  SPL.state = remove ? 'Removing the correction…' : 'Publishing the correction…'; splStateLine();
  try {
    if (AUTH.demo) {
      SPL.saved.corrections = SPL.saved.corrections || {};
      if (n) SPL.saved.corrections[key] = { date, sid: r.sid, changes: JSON.parse(JSON.stringify(ch)), by: 'demo', at: new Date().toISOString() }; else delete SPL.saved.corrections[key];
      splDemoStore();
    } else { await callApi('correction_save', null, { date, sid: r.sid, changes: ch }); await splLoadSaved(true); }
    SPL.state = n ? `Correction of ${r.sid} published ✓ — applied at the next update` : `Correction of ${r.sid} removed — the Excel values come back at the next update`;
    SPL.view = 'plan'; SPL.corr = null; splDraw(); splRebuilt();
  } catch (err) { SPL.state = 'Not published — ' + (err.message || err); splStateLine(); }
}
/** Plan view of a session in the data: "✎ Correct this session", or the state of its correction. */
function splCorrLineHtml(date) {
  const key = splCorrKey(date);
  if (!key) return '';
  const r = SPL.lib.recent[date], c = (SPL.saved.corrections || {})[key];
  if (!c) return `<p class="sp-corrline"><button type="button" class="btn-light" data-corr-open>✎ Correct this session</button><span>a status, a time or an RPE that is wrong — your Excel file isn't touched</span></p>`;
  const col = { type: 3, time: 4, rpe: 5 }, n = Object.keys(c.changes || {}).length;
  const applied = Object.entries(c.changes || {}).every(([k, ch]) => { const row = r.rows.find((x) => x[0] === k); return row && Object.entries(ch).every(([f, v]) => row[col[f]] === v); });
  return `<p class="sp-corrline on"><button type="button" class="btn-light" data-corr-open>✎ Edit the correction</button><span>Corrected on the site${c.by ? ' by ' + escapeHtml(String(c.by).split('@')[0]) : ''} · ${n} player${n > 1 ? 's' : ''} · ${applied ? 'in the dashboard ✓' : 'applied at the next update'}</span></p>`;
}

/** After a change on this page: the online calculation rebuilds the dashboard (and sends the staff e-mail) on its own. */
function splRebuilt(started) {
  if (typeof cfRebuild !== 'function') return;
  const st = SPL.state;
  (started || cfRebuild()).then((ok) => {
    if (!ok || SPL.state !== st) return;
    SPL.state = st.replace(/ — [^—]*next update.*$/, '') + ' — the dashboard updates itself in a few minutes';
    splStateLine();
  });
}
// ------------------------------------------------------------------ national team (NT): the Qatar NT export from Sonra
/** The squad player of a name in the NT export: same GPS name, or the one chosen once for it (kept like a drill title). */
function splNtPlayer(pn) {
  const gps = (SPL.saved.titles || {})['NT:' + pn] || pn;
  return SPL.lib.players.find((q) => q.gps === gps) || null;
}
/** A national-team file from another GPS system (Sassi's Tunisia file, 2026-10-07: one row per day — Name, Date, Total
 * Duration, Total Distance (m), V HID 20-25 km/h, HSR +25 km/h, sprints, max velocity…) → StatSports export rows for the
 * file's player (named after the file: SASSI.csv → SASSI). What it does not measure the same way (its accelerations count
 * 4–5 × StatSports' HIT Acc + Dec), or not at all (> 15 km/h, heart rate), is left empty (SPL_NT_NA). */
function splNtOther(rows, file) {
  const pn = spName(String(file || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).toUpperCase();
  const mins = (t) => { const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(t || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : spNum(t); };
  const col = (r, re) => { const k = Object.keys(r).find((x) => re.test(x)); return k ? r[k] : ''; };
  return rows.filter((r) => spIsoDate(r.Date)).map((r) => ({
    'Player First Name': pn, 'Session Date': r.Date, 'Drill Title': r.Name || 'NT', 'Total Time': mins(col(r, /duration/i)),
    'Total Distance': spNum(col(r, /^total distance/i)), 'Distance Zone 5 (Absolute)': spNum(col(r, /20\s*-\s*25/)),
    'Distance Zone 6 (Absolute)': spNum(col(r, /\+\s*25|>\s*25/)), 'Entries Zone 6 (Absolute)': spNum(col(r, /sprint/i)),
    'Max Speed': spNum(col(r, /max.*(velocity|speed)/i)), _other: 1,
  }));
}
const SPL_NT_NA = ['HIT count', 'HIT Acc', 'HIT Dec', 'Acc 3-4.5', 'Acc 2.5-4', 'Dec 2.5-4', 'HIT Acc - HIT Dec', 'Acc 2.5-4 - Dec 2.5-4', 'BodyLoad',
  'AVG Heart Rate', 'MAX Heart Rate', 'Time HR over 85%', 'Time HR over 85% Session', 'Running DT >10kmh', 'Speed AVG', 'MED Acc', 'MED Dec',
  'Total Metabolic Power', 'HIT > 15', 'HIT/min > 15', 'Max Acc', 'Max Dec', 'DSL', 'DT zone5 Relative', 'DT zone6 Relative', 'DT zone5+6 Relative',
  'Count Zone5 Relative', 'Count zone6 Relative'];
/** One or several dates in the file(s): per day and player, the whole-session row ("Entire Session", "session [training]",
 * else the longest one). A file from another GPS system: splNtOther. */
async function splReadNtFiles(list) {
  const byDate = {}, names = [];
  let other = false;
  for (const f of list) {
    let rows = spParseCsv(await f.text());
    const alt = rows.length && !('Player First Name' in rows[0]) && 'Date' in rows[0] && Object.keys(rows[0]).some((k) => /^total distance/i.test(k));
    if (alt) { rows = splNtOther(rows, f.name); other = true; }
    if (!rows.length || !('Player First Name' in rows[0]) || !('Session Date' in rows[0])) { SPL.state = `${f.name}: not a GPS export`; continue; }
    names.push(f.name);
    rows.forEach((r) => {
      const date = spIsoDate(r['Session Date']), pn = spName(r['Player First Name']);
      if (!date || !pn) return;
      const day = byDate[date] || (byDate[date] = {}), old = day[pn], whole = (x) => /entire session|^session\b/i.test(String(x['Drill Title'] || ''));
      if (!old || (whole(r) && !whole(old)) || (whole(r) === whole(old) && spNum(r['Total Time']) > spNum(old['Total Time']))) day[pn] = r;
    });
  }
  SPL.nt = Object.keys(byDate).length ? { byDate: Object.fromEntries(Object.entries(byDate).map(([d, o]) => [d, Object.values(o)])), files: names, other } : null;
  splDraw();
  const el = document.getElementById('spl-nt');
  if (el) el.scrollIntoView({ block: 'nearest' });
}
/** A day's NT rows, as typed in the Excel: session "/", MD "/", label "/", Type NT, his own minutes, one "NT" drill row. */
function splNtRows(date, rows) {
  const players = {}, mine = rows.filter((r) => splNtPlayer(spName(r['Player First Name'])));
  mine.forEach((r) => { const pn = spName(r['Player First Name']), q = splNtPlayer(pn); players[pn] = { name: q.gps, pos: q.pos, type: 'NT' }; });
  const titles = Object.fromEntries([...new Set(mine.map((r) => String(r['Drill Title'] || '').trim()))].map((t) => [t, { no: 1, name: 'NT', min: 0, own: true }]));
  const csv = spToCsv(mine), typed = (SPL.nt && SPL.nt.rpe) || {}, rpe = {};
  mine.forEach((r) => { const pn = spName(r['Player First Name']), v = typed[date + '|' + pn]; if (v != null && v !== '') rpe[pn] = Number(v); }); // his RPE, typed in the box
  const out = spBuildRows(csv, csv, { date, sid: '/', week: splWeekNo(date), label: '/', md: '/', ampm: 'PM', players, extra: [], rpe, drills: titles, drillName: () => 'NT' });
  const other = new Set(mine.filter((r) => r._other).map((r) => splNtPlayer(spName(r['Player First Name'])).gps)); // another GPS system
  if (other.size) [...out.full, ...out.drills].forEach((r) => { if (other.has(r.Players)) SPL_NT_NA.forEach((c) => { r[c] = null; }); });
  return out;
}
function splNtMap(pn, gps) {
  SPL.saved.titles = { ...(SPL.saved.titles || {}), ['NT:' + pn]: gps };
  if (AUTH.demo) splDemoStore(); else callApi('title_save', null, { title: 'NT:' + pn, name: gps }).catch(() => { /* asked again next time */ });
  splDraw();
}
function splNtHtml() {
  const done = Object.values(SPL.saved.published || {}).filter((x) => x.sid === 'NT').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const day = (d) => SPL_DAY(d, { weekday: 'short', day: 'numeric', month: 'short' }), n = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-US'));
  let body = '';
  if (SPL.nt) {
    const opts = (cur) => '<option value="">Which player?</option>' + SPL.lib.players.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((q) => `<option value="${escapeHtml(q.gps)}" ${q.gps === cur ? 'selected' : ''}>${escapeHtml(q.name)}</option>`).join('');
    const days = Object.entries(SPL.nt.byDate).sort(([a], [b]) => (a < b ? -1 : 1));
    let total = 0;
    const blocks = days.map(([d, rows]) => {
      const b = splNtRows(d, rows), byName = Object.fromEntries(b.full.map((r) => [r.Players, r]));
      total += b.full.length;
      const lines = rows.map((r) => {
        const pn = spName(r['Player First Name']), q = splNtPlayer(pn), x = q ? byName[q.gps] : null;
        return `<div class="sp-nt-r">${q ? `<b>${escapeHtml(q.name)}</b>` : `<span class="sp-warn">${escapeHtml(pn)}</span> <select data-ntmap="${escapeHtml(pn)}">${opts('')}</select>`}
          ${x ? `<span>${x.Time}′ · ${n(x.DT)} m · > 20 km/h ${n(x['HIT DT'])} m · max ${x['Speed Max (km.h)'] != null ? Number(x['Speed Max (km.h)']).toFixed(1) : '–'} km/h</span>
            <label class="sp-nt-rpe">RPE <input type="number" min="0" max="10" step="0.5" data-ntrpe="${escapeHtml(d + '|' + pn)}" value="${escapeHtml(((SPL.nt.rpe || {})[d + '|' + pn]) ?? '')}" aria-label="RPE"></label>` : '<span class="muted">not in the squad list — choose the player</span>'}</div>`;
      }).join('');
      return `<div class="sp-nt-d"><div class="sp-nt-h">${day(d)}${Object.values(SPL.saved.published || {}).some((x) => x.sid === 'NT' && x.date === d) ? ' <small>· published already: replaced</small>' : ''}</div>${lines}</div>`;
    }).join('');
    body = `${SPL.nt.other ? '<p class="sp-note">Another GPS system: distance, &gt; 20 / &gt; 25 km/h, sprints, top speed and minutes are taken; its accelerations (counted differently), &gt; 15 km/h and heart rate stay empty.</p>' : ''}<div class="sp-nt-prev">${blocks}</div>
      <div class="sp-card-a"><button type="button" class="btn-primary" data-nt-publish ${total ? '' : 'disabled'}>Publish ${days.length} NT day${days.length > 1 ? 's' : ''}</button><button type="button" class="btn-light" data-nt-cancel>Cancel</button>
        <em class="sp-card-msg">Written as in your Excel: session “/”, Type NT, his own minutes, his RPE if typed (Carga RPE = RPE × time), one “NT” drill. They replace his NT rows of that day in the Excel a few minutes after publishing.</em></div>`;
  }
  return `<section class="sp-nt" id="spl-nt"><div class="sp-h3">National team (NT) <small>the Qatar NT export from Sonra, or another GPS file (one row per day, named after the player, e.g. SASSI.csv) — one or several dates</small></div>
    ${body || `<label class="sp-drop small"><input type="file" accept=".csv,text/csv" multiple hidden data-ntfiles>Drop the NT export here, or click to choose</label>`}
    ${done.length ? `<div class="sp-nt-done">Published: ${done.map((x) => `<span>${day(x.date)} <small>${escapeHtml(x.rows || '')}</small> <button type="button" class="linkbtn" data-unpub="${escapeHtml(x.date + '_NT')}">remove</button></span>`).join('')}</div>` : ''}</section>`;
}
async function splNtPublish() {
  const days = Object.entries((SPL.nt || {}).byDate || {});
  SPL.state = 'Publishing the NT days…'; splStateLine();
  try {
    let n = 0;
    for (const [date, rows] of days) {
      const b = splNtRows(date, rows);
      if (!b.full.length) continue;
      const body = { date, sid: 'NT', cols_full: SP_FULL_COLS, full: b.full.map((r) => SP_FULL_COLS.map((c) => r[c])), cols_drills: SP_DRILL_COLS, drills: b.drills.map((r) => SP_DRILL_COLS.map((c) => r[c])) };
      if (AUTH.demo) SPL.saved.published[`${date}_NT`] = { date, sid: 'NT', rows: `${body.full.length} full · ${body.drills.length} drills`, by: 'demo', at: new Date().toISOString() };
      else await callApi('session_publish', null, body);
      n++;
    }
    if (AUTH.demo) splDemoStore(); else await splLoadSaved(true);
    SPL.nt = null;
    SPL.state = `${n} NT day${n > 1 ? 's' : ''} published ✓ — in the dashboard at the next update`;
    splDraw(); splRebuilt();
  } catch (err) { SPL.state = 'NT not published — ' + (err.message || err); splStateLine(); }
}

// ------------------------------------------------------------------ step 2: the files → rows
/** "Get it from StatSports": this day's session from the StatSports API (through the Cloudflare server, which keeps the
 * key), in the two exports' columns (sp-convert.js spFromStatsports) → the same import screen as the dropped files. */
async function splFromStatsports(btn) {
  const date = SPL.date, p = splEnsure(date), label = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Getting the session from StatSports… (about 20 s)';
  try {
    const r = await fetch(`/api/statsports?date=${date}`, { headers: cfHeaders() });
    if (!r.ok) throw new Error(r.status === 401 ? 'sign in again' : `StatSports did not answer (${r.status}) — try again, or drop the files`);
    const out = spFromStatsports(await r.json(), p.ampm || 'PM', { match: !!splMatchOn(date), all: !!p.off }); // a day off: every recording of the day
    if (!out) throw new Error('no session on StatSports for this day yet');
    const tag = `StatSports · ${out.start.slice(11, 16)} · ${out.players} players${out.recordings > 1 ? ` · ${out.recordings} recordings` : ''}`;
    SPL.files = { full: { name: `${tag} · full session`, text: out.full }, drills: { name: `${tag} · drills`, text: out.drills } };
    SPL.view = 'import';
    SPL.state = [out.live ? '' : 'No “Entire Session - Live” on StatSports for this day: the whole recording is used — check the times',
      out.others.length ? `Also on StatSports this day, not imported: ${out.others.join(', ')}` : ''].filter(Boolean).join(' · ');
    splDraw();
  } catch (err) {
    SPL.state = 'Not fetched: ' + (err.message || err);
    btn.disabled = false; btn.innerHTML = label;
    splStateLine();
  }
}
/** Full session or drills file: its name (S75_Full / S75_Drills), else its rows. A full export can have a "Drill Title"
 * column too ("Entire Session - Live", one row per player — S75); a drills export has the drills' own titles. */
function splFileKind(name, text) {
  if (/drill/i.test(name)) return 'drills';
  if (/full/i.test(name)) return 'full';
  const rows = spParseCsv(text);
  if (!rows.length || !('Drill Title' in rows[0])) return 'full';
  const per = {};
  rows.forEach((r) => { per[r['Player First Name']] = (per[r['Player First Name']] || 0) + 1; });
  return Object.values(per).some((n) => n > 1) || rows.some((r) => !/^entire session/i.test(String(r['Drill Title'] || '').trim())) ? 'drills' : 'full';
}
async function splReadFiles(list) {
  for (const f of list) {
    const text = await f.text();
    const head = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    if (!/Player First Name/.test(head)) { SPL.state = `${f.name}: not a StatSports export`; continue; }
    SPL.files[splFileKind(f.name, text)] = { name: f.name, text };
  }
  if (!SPL.files.full && SPL.files.drills) SPL.state = 'Drills file read — drop the Full file too (S##_Full.csv)';
  if (SPL.files.full) { SPL.view = 'import'; SPL.state = ''; }
  splDraw();
}
/** The kiosk's RPE of a session, by player id: his latest answer of the day (AM session: before 15:00, PM: from 15:00). */
function splKioskRpe(date, ampm) {
  const day = ((SPL.saved && SPL.saved.rpe) || {})[date] || {}, out = {};
  Object.entries(day).forEach(([pid, answers]) => {
    const win = answers.filter(([, t]) => !t || (ampm === 'AM' ? t < '15:00' : t >= '15:00'));
    const last = (win.length ? win : answers)[(win.length ? win : answers).length - 1];
    if (last && last[0] != null) out[pid] = last[0];
  });
  return out;
}
async function splRefreshRpe() {
  if (AUTH.demo) return;
  SPL.state = 'Reading the kiosk…'; splStateLine();
  try { const r = await callApi('plans', null, {}); SPL.saved.rpe = r.rpe || {}; SPL.state = 'Kiosk RPE up to date ✓'; splDraw(); }
  catch (err) { SPL.state = 'Kiosk not read — ' + (err.message || err); splStateLine(); }
}
/** A match day's drills (his Excel: the halves 1 and 2, the individual work 3), then the 15-minute periods. */
const SPL_GAME_DRILLS = ['Game_1stHalf', 'Game_2ndHalf', 'INDIVIDUAL', 'Game_0-15', 'Game_15-30', 'Game_30-45', 'Game_45-60', 'Game_60-75', 'Game_75-90'];
/** A match's StatSports titles: "Match STATSports-1st H" → Game_1stHalf, "15-30" → Game_15-30, "Session-[Training]" → INDIVIDUAL. */
function splGameTitle(t) {
  if (/1st\s*h|first\s*half|half\s*1\b/i.test(t)) return 'Game_1stHalf';
  if (/2nd\s*h|second\s*half|half\s*2\b/i.test(t)) return 'Game_2ndHalf';
  const m = /(\d{1,3})\s*[-–]\s*(\d{1,3})/.exec(t), per = m ? `Game_${Number(m[1])}-${Number(m[2])}` : '';
  if (SPL_GAME_DRILLS.includes(per)) return per;
  return /individual|rehab|session-?\s*\[training\]/i.test(t) ? 'INDIVIDUAL' : '';
}
/** Data recorded under the wrong player on StatSports (13 Oct: Rayan Al Ali's session under the athlete "RAYYAN HANI"):
 * the export's rows renamed, as set in the import (p.swap = {name in the file: GPS name of the player it belongs to};
 * two players exchanged = two corrections). */
function splSwapText(text, swap) {
  if (!text || !swap || !Object.keys(swap).length) return text;
  return spToCsv(spParseCsv(text).map((r) => { const g = spName(r['Player First Name']); return swap[g] ? { ...r, 'Player First Name': swap[g] } : r; }));
}
/** The import's "recorded under the wrong player" line: the corrections set, and a new one. */
function splSwapHtml(p) {
  const swap = p.swap || {}, inFile = [...new Set([SPL.files.full, SPL.files.drills].filter(Boolean).flatMap((f) => spParseCsv(f.text).map((r) => spName(r['Player First Name']))).filter(Boolean))].sort();
  if (!inFile.length) return '';
  const name = (g) => (SPL.lib.players.find((q) => q.gps === g) || {}).name || g;
  const both = Object.entries(swap).filter(([, to]) => inFile.includes(to) && !swap[to]); // the other player is in the file too: exchanged?
  return `<div class="sp-swap"><span class="sp-note">Recorded under the wrong player?</span>
    ${Object.entries(swap).map(([from, to]) => `<span class="sp-ng">recorded as ${escapeHtml(name(from))} → <b>${escapeHtml(name(to))}</b><button type="button" class="linkbtn" data-unswap="${escapeHtml(from)}" aria-label="Remove">✕</button></span>`).join('')}
    <select id="spl-swap-from" aria-label="Name in the file"><option value="">Recorded as…</option>${inFile.filter((g) => !swap[g]).map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(name(g))}</option>`).join('')}</select>
    <span>is in fact</span><select id="spl-swap-to" aria-label="The player it belongs to"><option value="">Player…</option>${SPL.lib.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map((q) => `<option value="${escapeHtml(q.gps)}">${escapeHtml(q.name)}</option>`).join('')}</select>
    <button type="button" class="btn-light" data-swap>Correct</button>
    ${both.length ? `<p class="sp-note warn">${both.map(([, to]) => escapeHtml(name(to))).join(', ')} also in the file under his own name — if the two were exchanged, correct the other one too.</p>` : ''}</div>`;
}
/** The RPE of the day's rows: the players' kiosk answers, unless one was typed here. */
function splRpe(date, p) {
  const kiosk = splKioskRpe(date, p.ampm || 'PM'), rpe = {}, fromKiosk = new Set();
  SPL.lib.players.forEach((q) => { if (kiosk[q.id] != null) { rpe[q.gps] = kiosk[q.id]; fromKiosk.add(q.gps); } });
  Object.entries(p.rpe || {}).forEach(([g, v]) => { if (v != null && v !== '') { rpe[g] = v; fromKiosk.delete(g); } });
  return { rpe, fromKiosk };
}
/** Each player's halves of a match in the drills export (a B-team game on a day without a club match): {GPS: {h1, h2}}. */
function splHalves(drillRows) {
  const out = {};
  drillRows.forEach((r) => {
    const g = spName(r['Player First Name']), t = String(r['Drill Title'] || '').trim();
    if (g && splHalf(t)) (out[g] = out[g] || {})[splGameTitle(t) === 'Game_1stHalf' ? 'h1' : 'h2'] = r;
  });
  return out;
}
/**
 * A team day off (his MD+1 days off, 2026): every recording of the day — each player on StatSports with his work (B-team
 * training by default, individual, rehab…; "Day off" = not counted), a B-team game from its halves, everyone else Day off.
 * Rows "/" as in his Excel (sp-convert.js spOffDay); published apart from the club sessions (key date_OFF).
 */
function splBuildOff(date, p) {
  const lib = SPL.lib, fullRows = spParseCsv(splSwapText(SPL.files.full.text, p.swap)), drillRows = SPL.files.drills ? spParseCsv(splSwapText(SPL.files.drills.text, p.swap)) : [];
  const fileDate = spIsoDate((fullRows[0] || drillRows[0] || {})['Session Date']);
  const byGps = Object.fromEntries(lib.players.map((q) => [q.gps, q])), st = (q) => p.status[q.id] || 'Day_Off', chosen = p.offType || {};
  const halves = splHalves(drillRows), rows = {};
  // one row per player: the live recording, else the session's total, else the whole recording (the longest of two)
  const rank = (r) => { const t = String(r['Drill Title'] || ''); return /live/i.test(t) ? 3 : SP_SESSION_TOTAL.test(t) ? 2 : 1; };
  fullRows.forEach((r) => {
    const g = spName(r['Player First Name']), o = rows[g];
    if (g && !halves[g] && (!o || rank(r) > rank(o) || (rank(r) === rank(o) && spNum(r['Total Time']) > spNum(o['Total Time'])))) rows[g] = r;
  });
  // what he did: his choice here, else his status of the plan when it is work, else B-team training
  const typeOf = (g) => { const q = byGps[g], s = q ? st(q) : ''; return chosen[g] || (SPL_OFF_TYPES.includes(s) && s !== 'Day_Off' ? s : 'Training_TeamB'); };
  const work = {}, types = {}, list = [];
  Object.entries(rows).forEach(([g, r]) => {
    const type = typeOf(g), q = byGps[g];
    list.push({ g, id: q ? q.id : null, name: q ? q.name : g, type, t: spNum(r['Total Time']), whole: rank(r) === 1 });
    if (type !== 'Day_Off') { work[g] = r; types[g] = type; }
  });
  const games = Object.entries(halves).map(([g, h]) => ({ g, name: (byGps[g] || {}).name || g, t: spNum((h.h1 || {})['Total Time']) + spNum((h.h2 || {})['Total Time']), n: (h.h1 ? 1 : 0) + (h.h2 ? 1 : 0) }));
  // the rest of the list: his status (injured, national team, B-team training without a pod…), Day off when he was
  // planned in a team session or not counted here
  const rest = lib.players.filter((q) => !work[q.gps] && !halves[q.gps]).map((q) => ({ name: q.gps, pos: q.pos, type: SPL_IN_SESSION.has(st(q)) || chosen[q.gps] === 'Day_Off' ? 'Day_Off' : st(q) }));
  const { rpe, fromKiosk } = splRpe(date, p);
  const out = spOffDay({ work, types, halves, rest, rpe, pos: Object.fromEntries(lib.players.map((q) => [q.gps, q.pos])),
    ctx: { date, week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM' } });
  const seen = new Set([...Object.keys(rows), ...Object.keys(halves)]);
  return { ...out, fileDate, off: { list: list.sort((a, b) => a.name.localeCompare(b.name)), games }, missing: [], mapping: [], sessionTime: 0, unknown: [...seen].filter((g) => g && !byGps[g]),
    plan: [], fromKiosk, checks: { time: [], drill: [], cut: [], left: 0 }, match: false, halfInfo: {}, squad: null };
}
function splBuild() {
  const date = SPL.date, p = splEnsure(date), lib = SPL.lib;
  if (p.off) return splBuildOff(date, p);
  const fullTxt = splSwapText(SPL.files.full.text, p.swap), drillTxt = SPL.files.drills ? splSwapText(SPL.files.drills.text, p.swap) : ''; // recorded under the wrong player
  const allFull = spParseCsv(fullTxt), allDrills = spParseCsv(drillTxt);
  const fileDate = spIsoDate((allFull[0] || {})['Session Date']);
  const match = !!splMatchOn(date); // a match day (calendar): each player's halves add up to his match, his own minutes
  // a B-team game on a day without a club match (9 Oct: Chalpan's halves in the recording of the compensatory session):
  // those players are written apart, as in his Excel (Game_B, session "/", MD), and published with the session (date_OFF)
  const bHalves = match ? {} : splHalves(allDrills), hasB = Object.keys(bHalves).length > 0, notB = (r) => !bHalves[spName(r['Player First Name'])];
  const fullRows = allFull.filter(notB), drillRows = allDrills.filter(notB);
  const st = (q) => p.status[q.id] || 'ProTraining';
  const filled = splFillGps(p, lib, fullRows, drillRows, st); // a player whose unit failed: his teammates' average (his ask, 2026-10-25)
  const byGps = Object.fromEntries(lib.players.map((q) => [q.gps, q])), inGps = new Set(fullRows.map((r) => spName(r['Player First Name'])));
  const players = {};
  inGps.forEach((g) => { const q = byGps[g]; players[g] = q ? { name: q.gps, pos: q.pos, type: st(q) } : { name: g, pos: '', type: 'ProTraining' }; });
  const extra = lib.players.filter((q) => !inGps.has(q.gps) && !bHalves[q.gps] && !SPL_IN_SESSION.has(st(q))).map((q) => ({ name: q.gps, pos: q.pos, type: st(q) }));
  const missing = lib.players.filter((q) => !inGps.has(q.gps) && !bHalves[q.gps] && SPL_IN_SESSION.has(st(q)));
  const titles = { ...lib.titles, ...SPL.saved.titles }, map = p.titlemap || {};
  // minutes written in the rows: the planned ones, or the ones set after the session (the drill really lasted longer)
  const plan = p.drills.map((d, i) => ({ i, no: i + 1, name: splName(d.name), planned: Number(d.min) || 0, min: Number(d.act) || Number(d.min) || 0, chk: !!d.chk, own: SPL_NOT_TEAM.test(splName(d.name)) }));
  const titleOfRow = (r) => String(r['Drill Title'] || '').trim();
  if (match) plan.splice(0, plan.length, ...SPL_GAME_DRILLS.map((name, k) => ({ i: -1, no: k + 1, name, planned: 0, min: 0, chk: false, own: true })));
  // individual work in the export ("Individual-Training") but none in the plan: an INDIVIDUAL drill after the team drills,
  // each player's own minutes (his Excel: INDIVIDUAL, or Rehab for a player in rehab, numbered after the team drills)
  if (!plan.some((d) => d.own) && drillRows.some((r) => /individual|rehab/i.test(titleOfRow(r)))) plan.push({ i: -1, no: plan.length + 1, name: 'INDIVIDUAL', planned: 0, min: 0, chk: false, own: true });
  const seen = [...new Set(drillRows.map(titleOfRow).filter(Boolean))];
  const drills = {}, mapping = [], skipped = new Set();
  seen.forEach((t) => {
    // his choice for this session or a title he named before, then (a match) the match's own titles, then what was learned
    // "Session-[Training]" on a training day is the session's total, never a drill (a dropped drills file can carry it)
    const name = !match && SP_SESSION_TOTAL.test(t) ? '__skip'
      : splName(map[t] || (SPL.saved.titles || {})[t] || (match ? splGameTitle(t) || (/^MSH\s+(FTD|FND)\b/i.test(t) ? '__skip' : '') : '') || titles[t] || '');
    if (name === '__skip') { // a StatSports title not used (e.g. old 10-minute cuts)
      skipped.add(t);
      mapping.push({ title: t, d: null, skip: true, n: drillRows.filter((r) => titleOfRow(r) === t).length, times: [], min: 0, med: 0 });
      return;
    }
    // a title named once, or written exactly like a drill of the plan, is recognised
    const d = (name && plan.find((x) => x.name === name)) || plan.find((x) => splKey(x.name) === splKey(t)) || (/individual|rehab/i.test(t) && plan.find((x) => SPL_NOT_TEAM.test(x.name))) || null;
    if (d) drills[t] = d;
    const times = drillRows.filter((r) => titleOfRow(r) === t).map((r) => ({ g: spName(r['Player First Name']), t: spNum(r['Total Time']) })).filter((x) => x.g);
    mapping.push({ title: t, d, n: times.length, times, min: Math.max(0, ...times.map((x) => x.t)), med: splMedian(times.map((x) => x.t)) });
  });
  [...new Set(allDrills.filter((r) => !notB(r) && splHalf(titleOfRow(r))).map(titleOfRow))].forEach((t) => { // the B-team game's halves: recognised
    const h1 = splGameTitle(t) === 'Game_1stHalf';
    mapping.push({ title: t, d: { no: h1 ? 1 : 2, name: `B-team game · ${h1 ? '1st' : '2nd'} half`, own: true }, b: true, n: allDrills.filter((r) => titleOfRow(r) === t).length, times: [], min: 0, med: 0 });
  });
  const sessionTime = Number(p.time) || spSessionTime(fullRows);
  // RPE: the players' kiosk answers, unless one was typed here
  const { rpe, fromKiosk } = splRpe(date, p);
  // before publishing: GPS times far from the session, from the plan, or from the teammates in the same drill
  const fix = p.fix || {}, fixT = fix.t || {}, fixC = fix.c || {}, checks = { time: [], drill: [], cut: [] }, gpsTime = {};
  fullRows.forEach((r) => { const g = spName(r['Player First Name']); if (g) gpsTime[g] = spNum(r['Total Time']); });
  Object.entries(players).forEach(([g, pl]) => {
    const t = gpsTime[g], dev = Math.abs(t - sessionTime);
    if (!match && SP_SESSION_TYPES.has(pl.type) && sessionTime && t > 0 && dev >= SPL_CHECK.sessMin && dev >= SPL_CHECK.sessPct * sessionTime)
      checks.time.push({ g, name: (byGps[g] || {}).name || pl.name, pid: (byGps[g] || {}).id || null, t, own: Math.floor(t + 1e-9), fix: fixT[g] || null });
  });
  plan.filter((d) => !d.own).forEach((d) => {
    const ts = mapping.filter((m) => m.d === d).flatMap((m) => m.times.map((x) => x.t)), med = splMedian(ts);
    if (ts.length >= 3 && Math.abs(med - d.planned) >= SPL_CHECK.drillMin)
      checks.drill.push({ i: d.i, no: d.no, name: d.name, planned: d.planned, used: d.min, med, gps: Math.round(med), done: d.chk || Math.abs(med - d.min) < SPL_CHECK.drillMin });
  });
  mapping.filter((m) => m.d && !m.d.own && m.times.length >= 4).forEach((m) => m.times.forEach((x) => {
    const dev = Math.abs(x.t - m.med), key = m.title + '\u0001' + x.g;
    if (dev >= SPL_CHECK.cutMin && dev >= SPL_CHECK.cutPct * m.med)
      checks.cut.push({ key, title: m.title, g: x.g, name: (byGps[x.g] || {}).name || x.g, no: m.d.no, drill: m.d.name, t: x.t, med: m.med, own: Math.floor(x.t + 1e-9), used: m.d.min, fix: fixC[key] || null });
  }));
  checks.left = checks.time.filter((x) => !x.fix).length + checks.drill.filter((x) => !x.done).length + checks.cut.filter((x) => !x.fix).length;
  const ownTime = new Set(Object.keys(fixT).filter((g) => fixT[g] === 'own')), cutOwn = new Set(Object.keys(fixC).filter((k) => fixC[k] === 'own'));
  let fullText = hasB || filled.length ? spToCsv(fullRows) : fullTxt, drillText = hasB || filled.length ? spToCsv(drillRows) : drillTxt;
  const halfInfo = {}; // a match: the halves' minutes written (shown in the drills column)
  if (skipped.size) drillText = spToCsv(drillRows.filter((r) => !skipped.has(titleOfRow(r))));
  let day = null; // a match day's rows (sp-convert.js spMatchDay)
  if (match) {
    // each player's match row (Game: his two halves added up, or 0 min in the squad — NC when not called) and, when he
    // trained that day, a second row with that work (Jang: Game 0′ + INDIVIDUAL 5′) — as in his Excel
    const kind = (want) => new Set(Object.keys(drills).filter((t) => want(drills[t].name)));
    const halves = kind((n) => /^Game_(1st|2nd)Half$/.test(n)), solo = kind((n) => SPL_NOT_TEAM.test(n));
    const add = (set) => { const sum = {}; drillRows.filter((r) => set.has(titleOfRow(r))).forEach((r) => { const g = spName(r['Player First Name']); if (g) sum[g] = spAddRows(sum[g], r); }); return sum; };
    const played = add(halves), alone = add(solo);
    // not called by default: his work was in another recording than the match's, or lasted 30 min and more
    const gameStart = (drillRows.find((r) => halves.has(titleOfRow(r))) || {})['Session Start'] || '';
    const apart = new Set(Object.keys(alone).filter((g) => spNum(alone[g]['Total Time']) >= 30
      || (gameStart && drillRows.some((r) => solo.has(titleOfRow(r)) && spName(r['Player First Name']) === g && (r['Session Start'] || gameStart) !== gameStart))));
    day = spMatchDay({ played, alone, apart, squad: p.squad || {}, rpe, roster: lib.players.map((q) => ({ gps: q.gps, id: q.id, name: q.name, pos: q.pos, status: st(q) })),
      ctx: { date, sid: p.sid || splSid(date), week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM', sessionTime } });
    Object.keys(players).forEach((g) => { delete players[g]; });
    Object.assign(players, day.players);
    fullText = '';
    // the halves' minutes written, as for a training drill: the GPS by default (46.26 → 46), or his choice (45); a player
    // who came on or went off during the half (2′ or more under the full half) keeps his own minutes
    Object.entries(drills).forEach(([t, d]) => {
      if (!/^Game_(1st|2nd)Half$/.test(d.name)) return;
      const m = mapping.find((x) => x.title === t), top = Math.max(0, ...m.times.map((x) => x.t)), gps = Math.floor(top + 1e-9);
      const written = Number((p.half || {})[d.name]) || gps, subs = m.times.filter((x) => x.t < top - 2);
      subs.forEach((x) => cutOwn.add(t + '\u0001' + x.g));
      drills[t] = { ...d, own: false, min: written, planned: gps };
      halfInfo[t] = { name: d.name, written, gps: top, n: m.times.length, subs: subs.length };
    });
  }
  const out = spBuildRows(fullText, drillText, {
    date, sid: p.sid || splSid(date), week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM', sessionTime, players, extra, rpe, drills, ownTime, cutOwn,
    drillName: (pn, d) => (SPL_NOT_TEAM.test(d.name) && players[pn] && players[pn].type === 'Rehab' ? 'Rehab' : d.name),
  });
  out.drills.forEach((r) => { r['Drill info'] = splDrillInfo(r.Type); }); // the drill card, after its name in Data_Drills
  if (day) out.full = day.full;
  let bList = null;
  if (hasB) { // the B-team game, apart: session "/", Game_B, MD, his two halves (sp-convert.js spOffDay)
    const bo = spOffDay({ halves: bHalves, rpe, pos: Object.fromEntries(lib.players.map((q) => [q.gps, q.pos])),
      ctx: { date, week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM' } });
    out.full.push(...bo.full); out.drills.push(...bo.drills);
    bList = bo.full.map((r) => ({ name: (byGps[r.Players] || {}).name || r.Players, t: r.Time }));
  }
  const missLeft = day ? 0 : missing.filter((q) => !(p.noGpsOk || {})[q.id]).length; // planned in the session, no GPS, not answered yet
  return { ...out, fileDate, missLeft, missing: day ? [] : missing, filled, mapping, sessionTime, unknown: [...inGps].filter((g) => !byGps[g]), plan, fromKiosk, checks, match, halfInfo, squad: day ? day.squad : null, bList };
}
/** The checks above the three columns: each flagged time with its one-click fixes (the chosen one stays highlighted). */
function splChecksHtml(b) {
  const c = b.checks, n = c.time.length + c.drill.length + c.cut.length;
  if (!n) return `<p class="sp-allok">✓ Times checked — every team-session player within ${SPL_CHECK.sessMin}' of the session, every drill within ${SPL_CHECK.drillMin}' of its planned minutes, no player far from his teammates in a drill.</p>`;
  const btn = (attr, label, on) => `<button type="button" class="sp-fx${on ? ' on' : ''}" ${attr}>${label}</button>`, f1 = (v) => v.toFixed(1);
  const rows = [];
  if (c.time.length) {
    rows.push(`<div class="sp-cg">Session time<small>team-session players get ${b.sessionTime}'</small>${c.time.length > 2 ? `<span>${btn('data-fix-all="own"', `Use each one's GPS time (${c.time.length})`)}${btn('data-fix-all="keep"', `Keep ${b.sessionTime}' for all`)}</span>` : ''}</div>`);
    c.time.forEach((x, i) => rows.push(`<div class="sp-ci${x.fix ? ' done' : ''}"><b>${escapeHtml(x.name)}</b><span>${f1(x.t)}' on the GPS · session ${b.sessionTime}' — arrived late, left early, extra work — or individual / rehab?</span><span class="sp-cb">${btn(`data-fix-t="${i}" data-v="own"`, `Use his ${x.own}'`, x.fix === 'own')}${x.pid ? [['Partial', 'Partial'], ['INDIVIDUAL', 'Individual'], ['Rehab', 'Rehab']].map(([v, l]) => btn(`data-setst="${escapeHtml(x.pid)}" data-v="${v}"`, l)).join('') : ''}${btn(`data-fix-t="${i}" data-v="keep"`, `Keep ${b.sessionTime}'`, x.fix === 'keep')}</span></div>`));
  }
  if (c.drill.length) {
    rows.push(`<div class="sp-cg">Drill time<small>planned minutes vs the GPS (median of the players) · a game in halves includes its break</small></div>`);
    c.drill.forEach((x) => rows.push(`<div class="sp-ci${x.done ? ' done' : ''}"><b>${x.no} · ${escapeHtml(x.name)}</b><span>planned ${x.planned}' · ${f1(x.med)}' on the GPS${x.used !== x.planned ? ` · ${x.used}' written` : ''}</span><span class="sp-cb">${btn(`data-act="${x.i}" data-v="${x.gps}"`, `Use ${x.gps}'`, x.done && x.used === x.gps && x.gps !== x.planned)}${btn(`data-act="${x.i}" data-v="${x.planned}"`, `Keep ${x.planned}'`, x.done && x.used === x.planned)}</span></div>`));
  }
  if (c.cut.length) {
    rows.push(`<div class="sp-cg">Drill cuts<small>a player far from his teammates in the same drill — a bad cut? correct it in StatSports and drop the files again</small></div>`);
    const groups = {};
    c.cut.forEach((x, i) => { (groups[x.title] = groups[x.title] || []).push([x, i]); });
    Object.values(groups).forEach((g) => {
      const x0 = g[0][0];
      if (g.length >= 4) { // a whole group on another duration (two groups in one drill?): one line for all of them
        const set = g.every(([x]) => x.fix === g[0][0].fix) ? x0.fix : null;
        rows.push(`<div class="sp-ci${g.every(([x]) => x.fix) ? ' done' : ''}"><b>${g.length} players</b><span>${x0.no} · ${escapeHtml(x0.drill)} — about ${f1(splMedian(g.map(([x]) => x.t)))}' vs ${f1(x0.med)}' for the others: ${g.map(([x]) => escapeHtml(x.name)).join(', ')}</span><span class="sp-cb">${btn(`data-fix-cg="${encodeURIComponent(x0.title)}" data-v="own"`, 'Use their own times', set === 'own')}${btn(`data-fix-cg="${encodeURIComponent(x0.title)}" data-v="keep"`, `Keep ${x0.used}'`, set === 'keep')}</span></div>`);
        return;
      }
      g.forEach(([x, i]) => rows.push(`<div class="sp-ci${x.fix ? ' done' : ''}"><b>${escapeHtml(x.name)}</b><span>${x.no} · ${escapeHtml(x.drill)} — ${f1(x.t)}' vs ${f1(x.med)}' for the others</span><span class="sp-cb">${btn(`data-fix-c="${i}" data-v="own"`, `Use his ${x.own}'`, x.fix === 'own')}${btn(`data-fix-c="${i}" data-v="keep"`, `Keep ${x.used}'`, x.fix === 'keep')}</span></div>`));
    });
  }
  return `<div class="sp-checks${c.left ? '' : ' clear'}"><div class="sp-h3">${c.left ? `To check before publishing <small>${c.left} left · times far from the session, from the plan or from the teammates</small>` : `✓ Times checked <small>${n} looked at · the preview shows what is written</small>`}</div>${rows.join('')}</div>`;
}
/** A team-session player with no GPS (his unit off or failed): rows made from his teammates of the day — the average of
 * the team-session players of his position ('pos', the whole team when fewer than 2 there) or of the whole team ('team'),
 * drill by drill (each StatSports title), numbers averaged, the rest copied; his own RPE stays his. Added to the raw rows,
 * so he goes through the import as any player. → [{id, name, how, n}] */
function splFillGps(p, lib, fullRows, drillRows, st) {
  const want = p.noGpsAvg || {}, out = [];
  const inGps = new Set(fullRows.map((r) => spName(r['Player First Name'])));
  const num = (v) => /^-?\d+([.,]\d+)?$/.test(String(v ?? '').trim());
  const avg = (rows, gps) => { const r0 = rows[0], o = {};
    Object.keys(r0).forEach((c) => { o[c] = rows.every((r) => num(r[c])) ? String(Math.round(rows.reduce((a, r) => a + spNum(r[c]), 0) / rows.length * 100) / 100) : (/^Player/i.test(c) ? '' : r0[c]); });
    o['Player First Name'] = gps; return o; };
  lib.players.forEach((q) => {
    const how = want[q.id];
    if (!how || inGps.has(q.gps) || !SPL_IN_SESSION.has(st(q))) return;
    const onGps = lib.players.filter((x) => x.id !== q.id && x.pos !== 'GK' && inGps.has(x.gps)), inTeam = onGps.filter((x) => SPL_IN_SESSION.has(st(x)));
    const mates = inTeam.length >= 3 ? inTeam : onGps; // the team-session players (or everyone on the GPS when the plan's statuses are not set)
    const LINE = { CD: 'defenders', WD: 'defenders', DM: 'midfielders', CM: 'midfielders', AM: 'midfielders', WM: 'wide players and forwards', W: 'wide players and forwards', FW: 'wide players and forwards' };
    const samePos = mates.filter((x) => x.pos === q.pos), sameLine = mates.filter((x) => LINE[x.pos] && LINE[x.pos] === LINE[q.pos]);
    const use = how !== 'pos' ? mates : samePos.length >= 2 ? samePos : sameLine.length >= 2 ? sameLine : mates, g = new Set(use.map((x) => x.gps));
    if (!use.length) return;
    const fr = fullRows.filter((r) => g.has(spName(r['Player First Name'])));
    if (fr.length) fullRows.push(avg(fr, q.gps));
    const titles = [...new Set(drillRows.filter((r) => g.has(spName(r['Player First Name']))).map((r) => String(r['Drill Title'] || '').trim()))];
    titles.forEach((t) => { const dr = drillRows.filter((r) => g.has(spName(r['Player First Name'])) && String(r['Drill Title'] || '').trim() === t && !/individual|rehab/i.test(t)); if (dr.length) drillRows.push(avg(dr, q.gps)); });
    out.push({ id: q.id, name: q.name, how: use === samePos ? `average of the ${use.length} ${q.pos} players` : use === sameLine ? `average of the ${use.length} ${LINE[q.pos]}` : `average of the ${use.length} team-session players`, n: use.length });
  });
  return out;
}
/** Players in the team session in the plan but with no GPS row (forgotten as injured, absent…): a red block at the top
 * of the import, one click per status — the plan and the rows follow (his ask, 2026-10-21). "Trained · GPS missing"
 * = he trained but his unit failed: nothing to write for him, as before (no row without GPS data). */
function splMissingHtml(b, p) {
  const ok = p.noGpsOk || {}, n = b.missLeft;
  const opts = [['Injury', 'Injured'], ['Rehab', 'Rehab'], ['Sick', 'Sick'], ['NT', 'National team'], ['Authorized', 'Authorized absence'], ['Unauthorized', 'Unauthorized absence'], ['Day_Off', 'Day off']];
  const btn = (attr, label, on) => `<button type="button" class="sp-fx${on ? ' on' : ''}" ${attr}>${label}</button>`;
  if (!b.missing.length) return `<div class="sp-checks sp-nogps clear"><div class="sp-h3">✓ GPS filled from the teammates <small>written as his rows in the data</small></div>${(b.filled || []).map((f) => `<div class="sp-ci done"><b>${escapeHtml(f.name)}</b><span>GPS off · his rows = the ${escapeHtml(f.how)}, drill by drill · his own RPE</span><span class="sp-cb"><button type="button" class="sp-fx" data-miss-avg="${escapeHtml(f.id)}" data-v="">Undo</button></span></div>`).join('')}</div>`;
  return `<div class="sp-checks sp-nogps${n ? '' : ' clear'}"><div class="sp-h3">${n ? `⚠ ${n} player${n > 1 ? 's' : ''} in the team session without GPS <small>in the plan as Team session, not in the StatSports file — injured, sick, absent? one click sets his status</small>` : `✓ No GPS for ${b.missing.length} player${b.missing.length > 1 ? 's' : ''} in the session — marked as trained <small>no GPS data: no row for them, as before</small>`}</div>
    ${b.missing.map((q) => `<div class="sp-ci${ok[q.id] ? ' done' : ''}"><b>${escapeHtml(q.name)}</b><span>${escapeHtml(q.pos || '')} · Team session in the plan · no row in the GPS file</span><span class="sp-cb">${opts.map(([v, l]) => btn(`data-miss-st="${escapeHtml(q.id)}" data-v="${v}"`, l)).join('')}${btn(`data-miss-avg="${escapeHtml(q.id)}" data-v="pos"`, 'Trained · position average')}${btn(`data-miss-avg="${escapeHtml(q.id)}" data-v="team"`, 'Trained · team average')}${btn(`data-miss-ok="${escapeHtml(q.id)}"`, 'Trained · GPS missing', ok[q.id])}</span></div>`).join('')}
    ${(b.filled || []).map((f) => `<div class="sp-ci done"><b>${escapeHtml(f.name)}</b><span>GPS off · his rows = the ${escapeHtml(f.how.replace(/^average of the /, 'average of the '))}, drill by drill · his own RPE</span><span class="sp-cb">${btn(`data-miss-avg="${escapeHtml(f.id)}" data-v=""`, 'Undo')}</span></div>`).join('')}</div>`;
}
function splImportHtml() {
  const date = SPL.date, p = splEnsure(date), b = splBuild();
  const gpsRows = b.full.filter((r) => r.Time > 0 || r.DT != null), unmapped = b.mapping.filter((m) => !m.d && !m.skip);
  const drillOpts = (t, cur, skip) => `<select data-map="${escapeHtml(t)}"><option value="">Which drill of the plan?</option>${b.plan.map((d) => `<option value="${escapeHtml(d.name)}" ${cur && cur.name === d.name ? 'selected' : ''}>${d.no} · ${escapeHtml(d.name)}</option>`).join('')}<option value="__skip" ${skip ? 'selected' : ''}>— not used —</option></select>`;
  const mapRows = b.mapping.map((m) => `<div class="sp-mr${m.d || m.skip ? '' : ' warn'}"><code title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</code><span class="arr">→</span><span class="tg">${m.d ? `<b style="--c:${splColor(m.d.name)}">${m.d.no} · ${escapeHtml(m.d.name)}</b><small>${b.halfInfo[m.title] ? ((h) => `<input type="number" class="sp-act" min="1" max="70" value="${h.written}" data-halfmin="${escapeHtml(h.name)}" aria-label="Minutes written">' written for the whole half · GPS ${h.gps.toFixed(1)}' · ${h.n} player${h.n > 1 ? 's' : ''}${h.subs ? ` · ${h.subs} came on or off: their own minutes` : ''}`)(b.halfInfo[m.title])
    : m.d.own ? `each player's own minutes · ${m.n} player${m.n > 1 ? 's' : ''}` : `<input type="number" class="sp-act" min="1" max="120" value="${m.d.min}" data-actmin="${m.d.i}" aria-label="Minutes written">' written · planned ${m.d.planned}' · GPS ${m.med.toFixed(1)}' · ${m.n} player${m.n > 1 ? 's' : ''}`}</small>` : drillOpts(m.title, null, m.skip)}</span><span class="ok">${m.d ? '✓' : m.skip ? '–' : '!'}</span></div>`).join('');
  // green = the player's own answer on the kiosk, white = typed here, orange = no RPE yet
  // a match day: one RPE per player (it is written on his match row, or on his session row when he did not play)
  const rpeRows = b.match ? [...new Set(gpsRows.map((r) => r.Players))].map((n) => gpsRows.find((r) => r.Players === n && r.RPE != null) || gpsRows.find((r) => r.Players === n)) : gpsRows;
  const squadHtml = !b.squad ? '' : `<p class="sp-note">Did not play — <b>in the squad</b> (Game, 0′) or <b>not called</b> (NC)? Click a player to switch:</p>
    <div class="sp-ngs">${b.squad.map((x) => `<button type="button" class="sp-ng" data-squad="${escapeHtml(x.id)}" data-v="${x.v}" style="border:0;cursor:pointer;${x.v === 'Game' ? 'background:#dfe7ff;color:#16269e' : ''}">${escapeHtml(x.name)}<small>${x.v === 'Game' ? 'squad · 0′' : 'NC'}${x.work ? ' + session' : ''}</small></button>`).join('') || '<span class="sp-note">everybody played</span>'}</div>`;
  const rpeGrid = rpeRows.map((r) => { const g = spName(r.Players), k = b.fromKiosk.has(g);
    return `<label class="${r.RPE == null ? 'miss' : k ? 'k' : ''}"${k ? ' title="From the kiosk"' : ''}>${escapeHtml(r.Players)}<input type="number" min="0" max="10" step="0.5" value="${r.RPE ?? ''}" data-rpe="${escapeHtml(g)}"></label>`; }).join('');
  const nRpe = rpeRows.filter((r) => r.RPE != null).length, nKiosk = rpeRows.filter((r) => b.fromKiosk.has(spName(r.Players))).length;
  const rows = SPL.show === 'drills' ? b.drills : b.full, cols = SPL.show === 'drills' ? SP_DRILL_COLS : SP_FULL_COLS;
  const auto = new Set(['Date', 'N° Session', 'Week', 'WeeK MD Session', 'MD Session', 'Position', 'Type', 'N°Exercice', 'AMPM', 'Carga RPE', 'RPE', 'Time']);
  const fmtv = (v) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(2)) : escapeHtml(v));
  const ready = b.off ? !b.fileDate || b.fileDate === date : !unmapped.length && b.fileDate === date;
  const status = splStatusList(), col = Object.fromEntries(status.map(([k, , c]) => [k, c])), lab = Object.fromEntries(status.map(([k, l]) => [k, l]));
  const offCols = !b.off ? '' : `<div class="sp-chk"><div class="sp-h3"><i class="n">1</i>Who worked <small>${b.off.list.filter((x) => x.type !== 'Day_Off').length} on StatSports${b.unknown.length ? ` · ${b.unknown.length} unknown` : ''}</small></div>
      <div class="sp-ngs">${b.off.list.map((x) => { const c = col[x.type] || '#8e8e93', next = SPL_OFF_TYPES[(SPL_OFF_TYPES.indexOf(x.type) + 1) % SPL_OFF_TYPES.length];
        return `<button type="button" class="sp-ng" data-offtype="${escapeHtml(x.g)}" data-v="${x.type}" title="Click: ${escapeHtml(next === 'Day_Off' ? 'not counted' : lab[next] || next)}" style="border:0;cursor:pointer;${x.type === 'Day_Off' ? 'opacity:.6;text-decoration:line-through' : `background:${c}22;color:${c}`}">${escapeHtml(x.name)}<small>${x.type === 'Day_Off' ? 'not counted' : escapeHtml(lab[x.type] || x.type)} · ${Math.floor(x.t + 1e-9)}′${x.whole ? ' · whole recording' : ''}</small></button>`; }).join('') || '<span class="sp-note">nobody on StatSports</span>'}</div>
      <p class="sp-note">Click a player to switch: B-team training → individual → rehab → compensatory → not counted. His own minutes are written.${b.off.list.some((x) => x.whole) ? ' “Whole recording”: no session cut on StatSports, the pod’s whole time — check it, or cut the session in Sonra and get it again.' : ''}</p>
      ${b.unknown.length ? `<p class="sp-note warn">Not in the squad list (kept with their GPS name): ${b.unknown.map(escapeHtml).join(', ')} — add them in Squad.</p>` : ''}
      ${splSwapHtml(p)}</div>
    <div class="sp-chk"><div class="sp-h3"><i class="n">2</i>B-team game · day off <small>${b.off.games.length ? `${b.off.games.length} on a B-team game · ` : ''}everyone else 0′</small></div>
      ${b.off.games.length ? `<div class="sp-ngs">${b.off.games.map((x) => `<span class="sp-ng" style="background:${col.Game_B}22;color:${col.Game_B}">${escapeHtml(x.name)}<small>Game_B · ${Math.floor(x.t + 1e-9)}′ · ${x.n} half${x.n > 1 ? 'ves' : ''}</small></span>`).join('')}</div><p class="sp-note">Game_B, MD, his two halves (Game_1stHalf, Game_2ndHalf) with his own minutes — as on 2 Oct in your Excel.</p>` : ''}
      <div class="sp-ngs">${b.full.filter((r) => !r.Time && r.DT == null).map((r) => `<span class="sp-ng">${escapeHtml(r.Players)}<small>${escapeHtml(lab[r.Type] || r.Type)}</small></span>`).join('') || '<span class="sp-note">nobody</span>'}</div></div>`;
  return `${splHead(date, 1)}
    ${b.off ? `<p class="sp-banner ok">Team day off, as on your MD+1 days off: session “/” (no session number), ${escapeHtml(splTag(date) || '/')}, ${escapeHtml(p.label || splLabel(date))}. Each player who worked: his own minutes and one drill row with his status; a B-team game: Game_B and its halves; everyone else Day off. No staff report or e-mail — the work counts in each player's week and A:C.</p>` : ''}
    ${b.bList ? `<p class="sp-banner ok">B-team game: ${b.bList.map((x) => `${escapeHtml(x.name)} ${x.t}′`).join(', ')} — written apart, as in your Excel (Game_B, session “/”, MD, his two halves) and published with ${escapeHtml(p.sid || splSid(date))}.</p>` : ''}
    ${b.match ? '<p class="sp-banner ok">Match day, as in your Excel: a match row per player (“Game” = his two halves added up, 0′ if he did not come on; “NC” if not called) and a second row for the session he did that day. One RPE per player: on his match row, or on his session row if he did not play. The 10-minute cuts go to Data_10min on their own.</p>' : ''}
    ${b.fileDate && b.fileDate !== date ? `<p class="sp-banner warn">These files are from ${SPL_DAY(b.fileDate, { weekday: 'long', day: 'numeric', month: 'long' })}, not from this day. <button type="button" class="linkbtn" data-goto="${b.fileDate}">Open ${SPL_DAY(b.fileDate, { weekday: 'short', day: 'numeric', month: 'short' })}</button></p>` : ''}
    <div class="sp-files"><div class="sp-file ok"><span class="ic">CSV</span><div><b>${escapeHtml(SPL.files.full.name)}</b><small>${gpsRows.length} players · ${b.fileDate ? SPL_DAY(b.fileDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'no date'}${b.off ? '' : ` · session ${b.sessionTime}'`}</small></div></div>
      ${b.off ? '' : `<div class="sp-file ${SPL.files.drills ? 'ok' : 'miss'}"><span class="ic">CSV</span><div><b>${SPL.files.drills ? escapeHtml(SPL.files.drills.name) : 'Drills file missing'}</b><small>${SPL.files.drills ? `${b.mapping.length} drills · ${b.drills.length} rows` : 'drop S##_Drills.csv too'}</small></div></div>`}
      <label class="sp-drop small"><input type="file" accept=".csv,text/csv" multiple hidden data-files>Drop other files to replace</label></div>
    ${!b.off && (b.missing.length || (b.filled || []).length) ? splMissingHtml(b, p) : ''}
    ${!b.off && (SPL.files.drills || b.checks.time.length) ? splChecksHtml(b) : ''}
    <div class="sp-three">${b.off ? offCols : `
      <div class="sp-chk"><div class="sp-h3"><i class="n">1</i>Drills <small>StatSports title → the drill of the plan</small></div>${mapRows || '<p class="sp-note">No drills file yet.</p>'}
        <p class="sp-note">Minutes written = the planned ones (a 2 × 10' game is 20', not the 22' of the GPS); type the real minutes if the drill lasted longer. A title you name once, or written exactly like the drill, is recognised.</p></div>
      <div class="sp-chk"><div class="sp-h3"><i class="n">2</i>Players <small>${gpsRows.length} in the GPS file${b.unknown.length ? ` · ${b.unknown.length} unknown` : ' · all recognised ✓'}</small></div>
        ${b.unknown.length ? `<p class="sp-note warn">Not in the squad list (kept with their GPS name): ${b.unknown.map(escapeHtml).join(', ')} — add them in Squad.</p>` : ''}
        ${splSwapHtml(p)}
        ${squadHtml}
        <p class="sp-note">${b.match ? 'Out (from the plan):' : 'Added from the plan, without GPS:'}</p><div class="sp-ngs">${b.full.filter((r) => !r.Time && r.DT == null && !(b.match && /^(Game|NC)$/.test(r.Type))).map((r) => `<span class="sp-ng">${escapeHtml(r.Players)}<small>${escapeHtml(r.Type)}</small></span>`).join('') || '<span class="sp-note">nobody</span>'}</div>
        <label class="sp-time">Session time <input type="number" min="1" max="200" value="${b.sessionTime}" data-f="time"> min <small>for the team-session players (the GPS's usual time)</small></label></div>`}
      <div class="sp-chk"><div class="sp-h3"><i class="n">3</i>RPE <small>${nRpe} / ${rpeRows.length} · Carga RPE = RPE × time</small><button type="button" class="linkbtn sp-rpe-ref" data-rpe-refresh>↻ Kiosk</button></div><div class="sp-rpe">${rpeGrid}</div>
        <p class="sp-note">${nKiosk ? `<span class="sp-key k"></span>${nKiosk} from the players' kiosk answers` : 'No kiosk answer yet for this session'}${nRpe < rpeRows.length ? ` · <span class="sp-key miss"></span>${rpeRows.length - nRpe} missing: you can publish now — answers given later on the RPE page are added overnight (or type them: added a few minutes later)` : ''} · type a value to correct it.</p></div>
    </div>
    <div class="sp-h3">Preview <span class="seg sp-show"><button type="button" data-show="full" class="${SPL.show === 'full' ? 'active' : ''}">Data_Full · ${b.full.length}</button><button type="button" data-show="drills" class="${SPL.show === 'drills' ? 'active' : ''}">Data_Drills · ${b.drills.length}</button></span><small>same columns and order as your Excel · blue = from the plan</small></div>
    <div class="sp-tw"><table class="sp-tbl"><thead><tr>${cols.map((c) => `<th class="${auto.has(c) ? 'a' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${auto.has(c) ? 'a' : ''}">${fmtv(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${b.issues.length ? `<p class="sp-note warn">${b.issues.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="sp-actions"><button type="button" class="btn-primary" data-publish ${ready ? '' : 'disabled'}>${b.off ? 'Publish the day off' : `Publish ${escapeHtml(p.sid || splSid(date))}${b.bList ? ' + B-team game' : ''}`}</button><button type="button" class="btn-light" data-xlsx>Download Excel · Full + Drills</button><button type="button" class="btn-light" data-back>Back to the plan</button>
      <span>${ready && b.missLeft ? `<b class="sp-warn">⚠ ${b.missLeft} player${b.missLeft > 1 ? 's' : ''} in the team session without GPS — set their status above.</b> ` : ''}${ready && b.off ? 'Publishing adds the rows to the season: each player’s load and the dashboard follow a few minutes later — no report, no e-mail.' : ready ? (b.checks.left ? `${b.checks.left} time${b.checks.left > 1 ? 's' : ''} not checked above — you can still publish: the preview shows what is written.` : 'Publishing adds the rows to the season: the dashboard, the PDF reports and the staff e-mail (with the players’ report) follow on their own, a few minutes later.') : unmapped.length ? 'Name every drill first.' : 'The files are not from this day.'}</span></div>`;
}

async function splPublish() {
  const date = SPL.date, p = splEnsure(date), b = splBuild(), sid = p.off ? 'OFF' : p.sid || splSid(date);
  const pack = (key, f, d) => ({ date, sid: key, cols_full: SP_FULL_COLS, full: f.map((r) => SP_FULL_COLS.map((c) => r[c])), cols_drills: SP_DRILL_COLS, drills: d.map((r) => SP_DRILL_COLS.map((c) => r[c])) });
  // rows "/" (a day off, a B-team game) are published apart from the club session, under the key date_OFF
  const slash = (r) => r['N° Session'] === '/', team = (r) => !slash(r);
  const bodies = p.off ? [pack('OFF', b.full, b.drills)]
    : [pack(sid, b.full.filter(team), b.drills.filter(team)), ...(b.full.some(slash) ? [pack('OFF', b.full.filter(slash), b.drills.filter(slash))] : [])];
  SPL.state = 'Publishing…'; splStateLine();
  let saved = false, started = null;
  try {
    if (AUTH.demo) { bodies.forEach((x) => { SPL.saved.published[`${date}_${x.sid}`] = { date, sid: x.sid, rows: `${x.full.length} full · ${x.drills.length} drills`, by: 'demo', at: new Date().toISOString() }; }); splDemoStore(); }
    else {
      for (const body of bodies) await callApi('session_publish', null, body);
      saved = true; started = typeof cfRebuild === 'function' ? cfRebuild() : null; // the rows are saved: the online calculation starts now
      SPL.state = 'Published ✓ — saving the plan…'; splStateLine();
      await splLoadSaved(true);
    }
    if (!p.off) p.sid = sid;
    await splSavePlan(date);
    SPL.state = 'Published ✓ — in the dashboard at the next update'; SPL.view = 'plan'; SPL.files = {}; splDraw(); splRebuilt(started);
  } catch (err) { SPL.state = (saved ? 'Published ✓ — but the plan was not refreshed: ' : 'Not published — ') + (err.message || err); splStateLine(); }
}
async function splXlsx() {
  const date = SPL.date, p = splEnsure(date), b = splBuild(), sid = p.off ? 'Day_off' : p.sid || splSid(date);
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
  // a team day off: the players planned in the session go Day off (and come back when it is switched off)
  if (t.dataset.off != null) {
    const pp = p(); pp.off = !pp.off;
    SPL.lib.players.forEach((q) => { const s = pp.status[q.id] || 'ProTraining'; if (pp.off && SPL_IN_SESSION.has(s)) pp.status[q.id] = 'Day_Off'; else if (!pp.off && s === 'Day_Off') pp.status[q.id] = 'ProTraining'; });
    SPL.view = 'plan'; SPL.files = {}; SPL.card = null; splTouch(date); splDraw(); return;
  }
  if (t.dataset.offtype) { // what a player on StatSports did that day: the next one
    const pp = p(), i = SPL_OFF_TYPES.indexOf(t.dataset.v);
    pp.offType = { ...(pp.offType || {}), [t.dataset.offtype]: SPL_OFF_TYPES[(i + 1) % SPL_OFF_TYPES.length] }; splTouch(date); splDraw(); return;
  }
  if (t.dataset.swap != null) { // data recorded under the wrong player on StatSports
    const from = (document.getElementById('spl-swap-from') || {}).value, to = (document.getElementById('spl-swap-to') || {}).value;
    if (from && to && from !== to) { const pp = p(); pp.swap = { ...(pp.swap || {}), [from]: to }; splTouch(date); splDraw(); }
    return;
  }
  if (t.dataset.unswap) { const pp = p(), s = { ...(pp.swap || {}) }; delete s[t.dataset.unswap]; pp.swap = s; splTouch(date); splDraw(); return; }
  // a player of the session without GPS: his status (one click), or kept as trained without GPS (data-miss-*; data-nogps is the day off below)
  if (t.dataset.missSt) { const pp = p(); pp.status[t.dataset.missSt] = t.dataset.v; if (pp.noGpsOk) delete pp.noGpsOk[t.dataset.missSt]; splTouch(date); splDraw(); return; }
  if (t.dataset.missAvg != null) { const pp = p(), m = pp.noGpsAvg || (pp.noGpsAvg = {}); if (t.dataset.v) m[t.dataset.missAvg] = t.dataset.v; else delete m[t.dataset.missAvg]; if (pp.noGpsOk) delete pp.noGpsOk[t.dataset.missAvg]; splTouch(date); splDraw(); return; }
  if (t.dataset.missOk) { const pp = p(), m = pp.noGpsOk || (pp.noGpsOk = {}); if (m[t.dataset.missOk]) delete m[t.dataset.missOk]; else m[t.dataset.missOk] = 1; splTouch(date); splDraw(); return; }
  if (t.dataset.nogps != null) { SPL.files = { full: { name: 'No GPS this day', text: '' } }; SPL.view = 'import'; SPL.state = ''; splDraw(); return; }
  // correct a session in the data
  if (t.dataset.corrOpen != null) { splOpenCorrection(date); return; }
  if (t.dataset.corrCancel != null) { SPL.view = 'plan'; SPL.corr = null; splDraw(); return; }
  if (t.dataset.corrPub != null) { splCorrPublish(false); return; }
  if (t.dataset.corrDel != null) { if (confirm('Remove the correction of this session? The Excel values come back a few minutes later.')) splCorrPublish(true); return; }
  // checks before publishing (the chosen fix again = undone)
  if (t.dataset.fixT != null || t.dataset.fixC != null) {
    const kind = t.dataset.fixT != null ? 't' : 'c', b = splBuild(), x = kind === 't' ? b.checks.time[Number(t.dataset.fixT)] : b.checks.cut[Number(t.dataset.fixC)];
    if (x) { const f = p().fix || (p().fix = {}), m = f[kind] || (f[kind] = {}), id = kind === 't' ? x.g : x.key; if (m[id] === t.dataset.v) delete m[id]; else m[id] = t.dataset.v; }
    splTouch(date); splDraw(); return;
  }
  if (t.dataset.fixAll || t.dataset.fixCg) {
    const b = splBuild(), f = p().fix || (p().fix = {}), title = t.dataset.fixCg ? decodeURIComponent(t.dataset.fixCg) : null;
    if (title == null) { f.t = f.t || {}; b.checks.time.forEach((x) => { f.t[x.g] = t.dataset.fixAll; }); }
    else { f.c = f.c || {}; b.checks.cut.filter((x) => x.title === title).forEach((x) => { f.c[x.key] = t.dataset.v; }); }
    splTouch(date); splDraw(); return;
  }
  if (t.dataset.act != null) {
    const d = p().drills[Number(t.dataset.act)], v = Number(t.dataset.v);
    if (d) { const on = d.chk && (Number(d.act) || Number(d.min)) === v; d.act = on || v === Number(d.min) ? undefined : v; d.chk = !on; }
    splTouch(date); splDraw(); return;
  }
  if (t.dataset.setst) { p().status[t.dataset.setst] = t.dataset.v; splTouch(date); splDraw(); return; } // a time far from the session: Partial, Individual or Rehab
  // drill cards
  if (t.dataset.cardEdit != null) {
    const d = p().drills[Number(t.dataset.cardEdit)], def = splDef(d.name) || {}, inLib = !!splLibOf(d.name);
    const pl = def.players == null ? '' : String(def.players);
    SPL.card = { edit: Number(t.dataset.cardEdit), name: splName(d.name), length: def.length || '', width: def.width || '', players: pl, like: def.like || (inLib ? '' : splGuessLike(d.name, pl)), auto: !def.like, wcs: def.wcs || '', reps: def.reps || '' };
    splDraw(); const el = document.querySelector('.sp-card'); if (el) el.scrollIntoView({ block: 'nearest' }); return;
  }
  if (t.dataset.cardSave != null) { splCardSave(); return; }
  if (t.dataset.cardCancel != null) { SPL.card = null; splDraw(); return; }
  if (t.dataset.cardDel != null) { splCardDelete(); return; }
  if (t.dataset.up != null || t.dataset.down != null) { const i = Number(t.dataset.up ?? t.dataset.down), j = t.dataset.up != null ? i - 1 : i + 1, d = p().drills; [d[i], d[j]] = [d[j], d[i]]; splTouch(date); splDraw(); return; }
  if (t.dataset.del != null) { p().drills.splice(Number(t.dataset.del), 1); splTouch(date); splDraw(); return; }
  if (t.dataset.min != null) { const d = p().drills[Number(t.dataset.min)]; d.min = Math.max(1, (Number(d.min) || 0) + Number(t.dataset.step)); splTouch(date); splDraw(); return; }
  if (t.dataset.copy) { const r = SPL.lib.recent[t.dataset.copy]; const used = {}; p().drills = r.drills.filter((d) => { const k = d.no; if (used[k] && SPL_NOT_TEAM.test(d.name)) return false; used[k] = 1; return d.name !== 'Rehab'; }).map((d) => ({ name: d.name, min: d.min })); splTouch(date); splDraw(); return; }
  if (t.dataset.sugg) { const l = SPL.lib.library.find((x) => splName(x.name) === t.dataset.sugg); p().drills.push({ name: t.dataset.sugg, min: l ? l.min : 10 }); splTouch(date); splDraw(); return; }
  if (t.dataset.show) { SPL.show = t.dataset.show; splDraw(); return; }
  if (t.dataset.rpeRefresh != null) { splRefreshRpe(); return; }
  const sq = t.closest('[data-squad]');
  if (sq) { const p = splEnsure(SPL.date); p.squad = { ...(p.squad || {}), [sq.dataset.squad]: sq.dataset.v === 'Game' ? 'NC' : 'Game' }; splTouch(SPL.date); splDraw(); return; }
  if (t.dataset.back != null) { SPL.view = 'plan'; splDraw(); return; }
  if (t.dataset.goto) { SPL.week = addDays(t.dataset.goto, -new Date(t.dataset.goto + 'T12:00:00Z').getUTCDay()); SPL.date = t.dataset.goto; splDraw(); return; }
  if (t.dataset.publish != null) { splPublish(); return; }
  if (t.dataset.statsports != null) { splFromStatsports(t); return; }
  if (t.dataset.ntPublish != null) { splNtPublish(); return; }
  if (t.dataset.ntCancel != null) { SPL.nt = null; splDraw(); return; }
  if (t.dataset.xlsx != null) { splXlsx().catch((err) => alert('Excel not created: ' + (err.message || err))); return; }
  if (t.dataset.unpub) { if (confirm('Remove this published session? The rows leave the dashboard a few minutes later.')) splUnpublish(t.dataset.unpub); }
}
async function splUnpublish(key) {
  try { if (AUTH.demo) { delete SPL.saved.published[key]; splDemoStore(); } else { await callApi('session_unpublish', null, { key }); await splLoadSaved(true); } SPL.state = 'Unpublished — out of the dashboard at the next update'; splDraw(); splRebuilt(); }
  catch (err) { alert('Not removed: ' + (err.message || err)); }
}
function splChange(e) {
  const t = e.target, date = SPL.date;
  if (t.dataset.files != null) { splReadFiles([...t.files]); return; }
  if (t.dataset.ntfiles != null) { splReadNtFiles([...t.files]); return; }
  if (t.dataset.ntmap) { splNtMap(t.dataset.ntmap, t.value); return; }
  if (t.dataset.ntrpe && SPL.nt) { SPL.nt.rpe = { ...(SPL.nt.rpe || {}), [t.dataset.ntrpe]: t.value }; return; } // used at Publish (RPE × time)
  if (t.dataset.norpe) { splSaveNoRpe(date, t.dataset.norpe, t); return; } // an RPE typed for a session in the data
  if (t.dataset.md != null) { // the day's MD chosen here (also in the Calendar): saved with the calendar edits, the data follows
    const v = t.value;
    SPL.state = 'Saving the MD…'; splStateLine();
    saveCalendarEdit('day:' + date, v ? { md: v } : null).then((edits) => {
      SPL.cal.edits = edits; SPL.events = applyCalendarEdits(SPL.cal); splMatches();
      if (typeof cacheSet === 'function') cacheSet('calendar', SPL.cal);
      SPL.state = `MD ${v || 'automatic'} saved ✓ — the session's data follows at the next update`; splDraw();
    }).catch((err) => { SPL.state = 'MD not saved — ' + (err.message || err); splDraw(); });
    return;
  }
  if (t.dataset.cf) { splCorrEdit(t); return; } // the correction table
  const p = splEnsure(date);
  if (t.dataset.drill != null) { p.drills[Number(t.dataset.drill)].name = t.value; splTouch(date); splDraw(); return; }
  if (t.dataset.add != null) {
    const name = t.value;
    if (name === '__new') { SPL.card = { name: '', length: '', width: '', players: '', like: '', auto: true, cmp: '' }; splDraw(); const el = document.querySelector('[data-card="name"]'); if (el) el.focus(); return; }
    if (name) { const r8 = splRateOf(name); p.drills.push({ name, min: r8 ? r8.l.min : 10 }); splTouch(date); }
    splDraw(); return;
  }
  if (t.dataset.card) {
    if (t.dataset.card === 'like' && SPL.card) { SPL.card.like = t.value; SPL.card.auto = false; }
    if (t.dataset.card === 'cmp' && SPL.card) { SPL.card.cmp = t.value; splCardRefresh(); } // what a new drill is compared with
    if (t.dataset.card === 'wcs' && SPL.card) { SPL.card.wcs = t.value; document.querySelectorAll('[data-card="wcs"]').forEach((x) => x.closest('.sp-cmp').classList.toggle('on', x.checked)); } // its WCS window
    return;
  }
  if (t.dataset.actmin != null) { splDraw(); return; } // minutes written: refresh the checks and the preview when done
  if (t.dataset.halfmin) { const p = splEnsure(date), v = Math.round(Number(t.value)); p.half = { ...(p.half || {}), [t.dataset.halfmin]: v > 0 ? v : undefined }; splTouch(date); splDraw(); return; }
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
  if (t.dataset.card && t.dataset.card !== 'like' && t.dataset.card !== 'cmp' && t.dataset.card !== 'wcs' && SPL.card) { // the card follows what is typed
    SPL.card[t.dataset.card] = t.value;
    splCardRefresh();
    return;
  }
  if (t.dataset.actmin != null) { const d = splEnsure(date).drills[Number(t.dataset.actmin)], v = Number(t.value) || 0; if (d) { d.act = v && v !== Number(d.min) ? v : undefined; d.chk = !!v; } splTouch(date); return; }
  if (t.dataset.mins != null) { splEnsure(date).drills[Number(t.dataset.mins)].min = Number(t.value) || ''; splTouch(date); }
  if (t.dataset.rpe != null) {
    const p = splEnsure(date), l = t.closest('label');
    p.rpe = { ...(p.rpe || {}), [t.dataset.rpe]: t.value === '' ? null : Number(t.value) };
    l.classList.remove('k'); l.removeAttribute('title'); l.classList.toggle('miss', t.value === ''); splTouch(date);
  }
}
document.addEventListener('dragover', (e) => { if (CURRENT_VIEW === 'plan' && e.target.closest && e.target.closest('#spl-main')) { e.preventDefault(); const z = e.target.closest('.sp-drop'); if (z) z.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('.sp-drop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  if (CURRENT_VIEW !== 'plan' || !e.target.closest || !e.target.closest('#spl-main')) return;
  e.preventDefault();
  if (e.target.closest('#spl-nt')) splReadNtFiles([...e.dataTransfer.files]); else splReadFiles([...e.dataTransfer.files]);
});
