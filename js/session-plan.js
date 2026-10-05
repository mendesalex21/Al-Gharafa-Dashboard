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
  splLoadSaved().then(() => splDraw()).catch((err) => { SPL.saved = { plans: {}, titles: {}, published: {}, drills: {} }; SPL.state = 'Plans not loaded: ' + (err.message || err); splDraw(); });
}

// ------------------------------------------------------------------ saved plans (API, or this browser in the local demo)
async function splLoadSaved() {
  if (AUTH.demo) { try { SPL.saved = JSON.parse(localStorage.getItem('demo_plans')) || null; } catch (e) { SPL.saved = null; } SPL.saved = SPL.saved || { plans: {}, titles: {}, published: {} }; SPL.saved.drills = SPL.saved.drills || {}; return; }
  SPL.saved = await callApi('plans', null, {});
  SPL.saved.drills = SPL.saved.drills || {};
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
    const pub = Object.values(SPL.saved.published || {}).some((x) => x.date === d);
    const corr = r && (SPL.saved.corrections || {})[`${d}_${r.sid}`];
    const badge = r && /^S\d+$/.test(r.sid) ? `<span class="sp-b done">${r.sid} · ${r.pub ? 'published' : 'in the data'} ✓${corr ? ' · ✎' : ''}</span>` : pub ? '<span class="sp-b done">Published ✓</span>'
      : m ? `<span class="sp-b match">${crestHtml(m.e.opponent, 16)}${escapeHtml([m.e.round || m.e.competition, m.e.opponent].filter(Boolean).join(' · '))}</span>`
        : p && (p.drills || []).length ? '<span class="sp-b plan">Planned</span>' : '<span class="sp-b none">+ Plan</span>';
    return `<button type="button" class="sp-day${d === SPL.date ? ' on' : ''}${m ? ' m' : ''}" data-day="${d}"><b>${SPL_DAY(d, { weekday: 'short', day: 'numeric' })}</b>${tag ? `<span class="sp-md${tag === 'MD' ? ' mdm' : ''}">${tag}</span>` : '<span class="sp-md off">—</span>'}${badge}</button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-day]'); if (b) { SPL.date = b.dataset.day; SPL.view = 'plan'; SPL.files = {}; SPL.card = null; splDraw(); } };
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

// ------------------------------------------------------------------ drill cards (created here: exact name, optional pitch and players)
function splDefs() { return (SPL.saved && SPL.saved.drills) || {}; }
function splDef(name) { const k = splKey(name); return k ? Object.values(splDefs()).find((x) => splKey(x.name) === k) || null : null; }
function splLibOf(name) { const k = splKey(name); return k ? SPL.lib.library.find((x) => splKey(x.name) === k) || null : null; }
/** The per-minute load the forecast uses: the drill's own history, else the drill its card borrows from (until it has data). */
function splRateOf(name) {
  const own = splLibOf(name);
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
      <span class="sp-area">${area ? `${area} m² per player` : ''}</span></div>
    <div class="sp-dyn">${splCardDyn()}</div>
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
  const def = { name: key, length: num(c.length, 1, 150), width: num(c.width, 1, 150), players: splName(c.players).slice(0, 15) || null, like: inLib ? '' : c.like || '' };
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
  const r = SPL.lib.recent[date], pub = Object.values(SPL.saved.published || {}).find((x) => x.date === date);
  const inData = !!(r && /^S\d+$/.test(r.sid) && !r.pub), live = !!(r && r.pub);
  const team = p.drills.filter((d) => !SPL_NOT_TEAM.test(splName(d.name))), tot = team.reduce((a, d) => a + (Number(d.min) || 0), 0);
  const titleOf = {}; Object.entries({ ...SPL.lib.titles, ...SPL.saved.titles }).forEach(([t, n]) => { if (!titleOf[splName(n)]) titleOf[splName(n)] = t; });
  const ch = splChoices(), opt = (n, cur) => `<option ${splKey(n) === splKey(cur) ? 'selected' : ''}>${escapeHtml(n)}</option>`;
  const list = (cur) => ch.names.map((n) => opt(n, cur)).join('') + (ch.extra.length ? `<optgroup label="Created here · no data yet">${ch.extra.map((n) => opt(n, cur)).join('')}</optgroup>` : '');
  const opts = (cur) => `<option value="">Choose a drill…</option>${list(cur)}${cur && ![...ch.names, ...ch.extra].some((n) => splKey(n) === splKey(cur)) ? `<option selected>${escapeHtml(cur)}</option>` : ''}`;
  const rows = p.drills.map((d, i) => { const r8 = splRateOf(d.name), own = SPL_NOT_TEAM.test(splName(d.name)), ss = titleOf[splName(d.name)];
    const cap = own ? 'individual / rehab work' : [ss ? 'StatSports: ' + escapeHtml(ss) : '', escapeHtml(splDefTxt(splDef(d.name))),
      !r8 ? '<span class="sp-warn">no data yet — not in the forecast</span>' : r8.own ? '' : `forecast like ${escapeHtml(splName(r8.l.name))}`].filter(Boolean).join(' · ');
    return `<div class="sp-dr"><span class="sp-ord"><button type="button" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-down="${i}" ${i < p.drills.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span><span class="no" style="background:${splColor(d.name)}">${i + 1}</span>
      <span class="nm"><select data-drill="${i}">${opts(d.name)}</select><small>${cap}${own ? '' : `<button type="button" class="sp-ed" data-card-edit="${i}">${splDef(d.name) ? '✎ card' : '+ pitch / players'}</button>`}</small></span>
      <span class="sp-min"><button type="button" data-min="${i}" data-step="-1">−</button><input type="number" min="1" max="120" value="${d.min || ''}" data-mins="${i}" aria-label="Minutes"><button type="button" data-min="${i}" data-step="1">+</button></span>
      <span class="sp-int">${r8 && r8.l.td ? `≈ ${Math.round(r8.l.td)} m/min` : ''}</span><button type="button" class="x" data-del="${i}" aria-label="Remove">×</button></div>`; }).join('');
  const last = Object.keys(SPL.lib.recent).filter((d) => d < date && SPL.lib.recent[d].md === tag && SPL.lib.recent[d].drills.length).sort().pop();
  const sugg = lib.filter((x) => x.md.includes(tag) && !p.drills.some((d) => splName(d.name) === splName(x.name))).slice(0, 4);
  const line = team.map((d) => `<i style="flex:${d.min || 1};background:${splColor(d.name)}" title="${escapeHtml(d.name)}"><b>${d.min || ''}'</b></i>`).join('');
  return `${splHead(date, inData || pub ? 2 : 0)}
    ${inData ? `<p class="sp-banner ok">This session is already in the data (${r.sid}, from the Excel files). Nothing to import.</p>` : pub ? `<p class="sp-banner ok">Published ✓ ${escapeHtml(pub.rows || '')} · by ${escapeHtml(String(pub.by || '').split('@')[0])} — ${live ? 'in the dashboard' : 'added to the dashboard at the next update'}. To correct it, drop the files again and publish: the new version replaces it at the next update. <button type="button" class="linkbtn" data-unpub="${escapeHtml(date + '_' + pub.sid)}">Unpublish</button></p>` : live ? `<p class="sp-banner warn">Unpublished — ${escapeHtml(r.sid)} leaves the dashboard at the next update.</p>` : ''}
    ${inData || live ? splCorrLineHtml(date) : ''}
    ${inData || live ? splNoRpeHtml(date) : ''}
    <div class="sp-two"><div class="sp-col">
      <div class="sp-h3">Drills <small>${tot}' of team work${p.drills.length ? ' · ▲▼ to reorder' : ''}</small>${last ? `<button type="button" class="btn-light sp-copy" data-copy="${last}">⟲ Copy last ${tag} · ${SPL_DAY(last, { weekday: 'short', day: 'numeric', month: 'short' })}</button>` : ''}</div>
      ${team.length ? `<div class="sp-line">${line}</div>` : ''}${rows || '<p class="sp-note">No drill yet — copy the last session of this MD or add drills below.</p>'}
      <div class="sp-add"><select data-add aria-label="Add a drill"><option value="">+ Add a drill…</option>${list('')}<option value="__new">+ Create a new drill…</option></select>${sugg.length ? `<small>Often on ${tag}:</small>${sugg.map((x) => `<button type="button" data-sugg="${escapeHtml(splName(x.name))}">${escapeHtml(splName(x.name))} <small>${x.min}'</small></button>`).join('')}` : ''}</div>
      ${splCardHtml()}
      ${splLoadHtml(date, p)}</div>
      ${splPlayersHtml(p)}</div>
    ${inData ? '' : `<label class="sp-drop mini" id="spl-drop"><input type="file" accept=".csv,text/csv" multiple hidden data-files><b>After the session</b><span>Drop <code>${escapeHtml(p.sid || splSid(date))}_Full.csv</code> and <code>${escapeHtml(p.sid || splSid(date))}_Drills.csv</code> here, or click to choose — the rows are built from this plan</span></label>`}`;
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
    return `<label class="${v != null ? 'k' : 'miss'}" title="${v != null ? 'Ready: added at the next update' : 'No RPE yet'}">${escapeHtml(name(id))}${st && st !== 'ProTraining' ? ` <small>${escapeHtml(st)}</small>` : ''}<input type="number" min="0" max="10" step="0.5" value="${v ?? ''}" data-norpe="${escapeHtml(id)}" aria-label="RPE of ${escapeHtml(name(id))}"></label>`; }).join('');
  return `<div class="sp-norpe"><div class="sp-h3">RPE missing <small id="spl-norpe-n">${ids.length} player${ids.length > 1 ? 's' : ''} without an RPE in the data${ready ? ` · ${ready} ready, added at the next update` : ''}</small></div>
    <div class="sp-rpe">${cells}</div>
    <p class="sp-note"><span class="sp-key k"></span>answered since on the RPE page, or typed here · <span class="sp-key miss"></span>still missing. Type a value and leave the box: it is saved like the player's answer and added to the data at the next update (a value already in the data is never replaced).</p></div>`;
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
    if (l) { l.classList.remove('miss'); l.classList.add('k'); l.title = 'Ready: added at the next update'; }
    const ids = (SPL.lib.recent[date] || {}).norpe || [], ready = ids.filter((x) => ((rp[date] || {})[x] || []).length).length, el = document.getElementById('spl-norpe-n');
    if (el) el.textContent = `${ids.length} player${ids.length > 1 ? 's' : ''} without an RPE in the data · ${ready} ready, added at the next update`;
    SPL.state = `RPE of ${name}: ${v} saved ✓ — added to the data at the next update`;
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
  return `<div class="sp-load"><div class="sp-h3">Planned team load <small>each drill's usual per-minute load × its planned minutes${ref ? ` · grey = usual ${splTag(date)} of a ${typ} microcycle (p25–p75, ${ref.n} sessions), line = average` : ' · no usual reference for this day'}</small></div>
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
    } else { await callApi('correction_save', null, { date, sid: r.sid, changes: ch }); await splLoadSaved(); }
    SPL.state = n ? `Correction of ${r.sid} published ✓ — applied at the next update` : `Correction of ${r.sid} removed — the Excel values come back at the next update`;
    SPL.view = 'plan'; SPL.corr = null; splDraw();
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
  // minutes written in the rows: the planned ones, or the ones set after the session (the drill really lasted longer)
  const plan = p.drills.map((d, i) => ({ i, no: i + 1, name: splName(d.name), planned: Number(d.min) || 0, min: Number(d.act) || Number(d.min) || 0, chk: !!d.chk, own: SPL_NOT_TEAM.test(splName(d.name)) }));
  const titleOfRow = (r) => String(r['Drill Title'] || '').trim();
  const seen = [...new Set(drillRows.map(titleOfRow).filter(Boolean))];
  const drills = {}, mapping = [];
  seen.forEach((t) => {
    const name = splName(map[t] || titles[t] || '');
    // a title named once, or written exactly like a drill of the plan, is recognised
    const d = (name && plan.find((x) => x.name === name)) || plan.find((x) => splKey(x.name) === splKey(t)) || (/individual|rehab/i.test(t) && plan.find((x) => SPL_NOT_TEAM.test(x.name))) || null;
    if (d) drills[t] = d;
    const times = drillRows.filter((r) => titleOfRow(r) === t).map((r) => ({ g: spName(r['Player First Name']), t: spNum(r['Total Time']) })).filter((x) => x.g);
    mapping.push({ title: t, d, n: times.length, times, min: Math.max(0, ...times.map((x) => x.t)), med: splMedian(times.map((x) => x.t)) });
  });
  const sessionTime = Number(p.time) || spSessionTime(fullRows);
  // RPE: the players' kiosk answers, unless one was typed here
  const kiosk = splKioskRpe(date, p.ampm || 'PM'), rpe = {}, fromKiosk = new Set();
  lib.players.forEach((q) => { if (kiosk[q.id] != null) { rpe[q.gps] = kiosk[q.id]; fromKiosk.add(q.gps); } });
  Object.entries(p.rpe || {}).forEach(([g, v]) => { if (v != null && v !== '') { rpe[g] = v; fromKiosk.delete(g); } });
  // before publishing: GPS times far from the session, from the plan, or from the teammates in the same drill
  const fix = p.fix || {}, fixT = fix.t || {}, fixC = fix.c || {}, checks = { time: [], drill: [], cut: [] }, gpsTime = {};
  fullRows.forEach((r) => { const g = spName(r['Player First Name']); if (g) gpsTime[g] = spNum(r['Total Time']); });
  Object.entries(players).forEach(([g, pl]) => {
    const t = gpsTime[g], dev = Math.abs(t - sessionTime);
    if (SP_SESSION_TYPES.has(pl.type) && sessionTime && t > 0 && dev >= SPL_CHECK.sessMin && dev >= SPL_CHECK.sessPct * sessionTime)
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
  const out = spBuildRows(SPL.files.full.text, SPL.files.drills ? SPL.files.drills.text : '', {
    date, sid: p.sid || splSid(date), week: splWeekNo(date), label: p.label || splLabel(date), md: splTag(date) || '/', ampm: p.ampm || 'PM', sessionTime, players, extra, rpe, drills, ownTime, cutOwn,
    drillName: (pn, d) => (SPL_NOT_TEAM.test(d.name) && players[pn] && players[pn].type === 'Rehab' ? 'Rehab' : d.name),
  });
  return { ...out, fileDate, missing, mapping, sessionTime, unknown: [...inGps].filter((g) => !byGps[g]), plan, fromKiosk, checks };
}
/** The checks above the three columns: each flagged time with its one-click fixes (the chosen one stays highlighted). */
function splChecksHtml(b) {
  const c = b.checks, n = c.time.length + c.drill.length + c.cut.length;
  if (!n) return `<p class="sp-allok">✓ Times checked — every team-session player within ${SPL_CHECK.sessMin}' of the session, every drill within ${SPL_CHECK.drillMin}' of its planned minutes, no player far from his teammates in a drill.</p>`;
  const btn = (attr, label, on) => `<button type="button" class="sp-fx${on ? ' on' : ''}" ${attr}>${label}</button>`, f1 = (v) => v.toFixed(1);
  const rows = [];
  if (c.time.length) {
    rows.push(`<div class="sp-cg">Session time<small>team-session players get ${b.sessionTime}'</small>${c.time.length > 2 ? `<span>${btn('data-fix-all="own"', `Use each one's GPS time (${c.time.length})`)}${btn('data-fix-all="keep"', `Keep ${b.sessionTime}' for all`)}</span>` : ''}</div>`);
    c.time.forEach((x, i) => rows.push(`<div class="sp-ci${x.fix ? ' done' : ''}"><b>${escapeHtml(x.name)}</b><span>${f1(x.t)}' on the GPS · session ${b.sessionTime}' — arrived late, left early, or extra work?</span><span class="sp-cb">${btn(`data-fix-t="${i}" data-v="own"`, `Use his ${x.own}'`, x.fix === 'own')}${x.pid ? btn(`data-partial="${escapeHtml(x.pid)}"`, 'Partial') : ''}${btn(`data-fix-t="${i}" data-v="keep"`, `Keep ${b.sessionTime}'`, x.fix === 'keep')}</span></div>`));
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
function splImportHtml() {
  const date = SPL.date, p = splEnsure(date), b = splBuild();
  const gpsRows = b.full.filter((r) => r.Time > 0 || r.DT != null), unmapped = b.mapping.filter((m) => !m.d);
  const drillOpts = (t, cur) => `<select data-map="${escapeHtml(t)}"><option value="">Which drill of the plan?</option>${b.plan.map((d) => `<option value="${escapeHtml(d.name)}" ${cur && cur.name === d.name ? 'selected' : ''}>${d.no} · ${escapeHtml(d.name)}</option>`).join('')}</select>`;
  const mapRows = b.mapping.map((m) => `<div class="sp-mr${m.d ? '' : ' warn'}"><code title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</code><span class="arr">→</span><span class="tg">${m.d ? `<b style="--c:${splColor(m.d.name)}">${m.d.no} · ${escapeHtml(m.d.name)}</b><small>${m.d.own ? `each player's own minutes · ${m.n} player${m.n > 1 ? 's' : ''}` : `<input type="number" class="sp-act" min="1" max="120" value="${m.d.min}" data-actmin="${m.d.i}" aria-label="Minutes written">' written · planned ${m.d.planned}' · GPS ${m.med.toFixed(1)}' · ${m.n} player${m.n > 1 ? 's' : ''}`}</small>` : drillOpts(m.title, null)}</span><span class="ok">${m.d ? '✓' : '!'}</span></div>`).join('');
  // green = the player's own answer on the kiosk, white = typed here, orange = no RPE yet
  const rpeGrid = gpsRows.map((r) => { const g = spName(r.Players), k = b.fromKiosk.has(g);
    return `<label class="${r.RPE == null ? 'miss' : k ? 'k' : ''}"${k ? ' title="From the kiosk"' : ''}>${escapeHtml(r.Players)}<input type="number" min="0" max="10" step="0.5" value="${r.RPE ?? ''}" data-rpe="${escapeHtml(g)}"></label>`; }).join('');
  const nRpe = gpsRows.filter((r) => r.RPE != null).length, nKiosk = gpsRows.filter((r) => b.fromKiosk.has(spName(r.Players))).length;
  const rows = SPL.show === 'drills' ? b.drills : b.full, cols = SPL.show === 'drills' ? SP_DRILL_COLS : SP_FULL_COLS;
  const auto = new Set(['Date', 'N° Session', 'Week', 'WeeK MD Session', 'MD Session', 'Position', 'Type', 'N°Exercice', 'AMPM', 'Carga RPE', 'RPE', 'Time']);
  const fmtv = (v) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(2)) : escapeHtml(v));
  const ready = !unmapped.length && b.fileDate === date;
  return `${splHead(date, 1)}
    ${b.fileDate && b.fileDate !== date ? `<p class="sp-banner warn">These files are from ${SPL_DAY(b.fileDate, { weekday: 'long', day: 'numeric', month: 'long' })}, not from this day. <button type="button" class="linkbtn" data-goto="${b.fileDate}">Open ${SPL_DAY(b.fileDate, { weekday: 'short', day: 'numeric', month: 'short' })}</button></p>` : ''}
    <div class="sp-files"><div class="sp-file ok"><span class="ic">CSV</span><div><b>${escapeHtml(SPL.files.full.name)}</b><small>${gpsRows.length} players · ${b.fileDate ? SPL_DAY(b.fileDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'no date'} · session ${b.sessionTime}'</small></div></div>
      <div class="sp-file ${SPL.files.drills ? 'ok' : 'miss'}"><span class="ic">CSV</span><div><b>${SPL.files.drills ? escapeHtml(SPL.files.drills.name) : 'Drills file missing'}</b><small>${SPL.files.drills ? `${b.mapping.length} drills · ${b.drills.length} rows` : 'drop S##_Drills.csv too'}</small></div></div>
      <label class="sp-drop small"><input type="file" accept=".csv,text/csv" multiple hidden data-files>Drop other files to replace</label></div>
    ${SPL.files.drills || b.checks.time.length ? splChecksHtml(b) : ''}
    <div class="sp-three">
      <div class="sp-chk"><div class="sp-h3"><i class="n">1</i>Drills <small>StatSports title → the drill of the plan</small></div>${mapRows || '<p class="sp-note">No drills file yet.</p>'}
        <p class="sp-note">Minutes written = the planned ones (a 2 × 10' game is 20', not the 22' of the GPS); type the real minutes if the drill lasted longer. A title you name once, or written exactly like the drill, is recognised.</p></div>
      <div class="sp-chk"><div class="sp-h3"><i class="n">2</i>Players <small>${gpsRows.length} in the GPS file${b.unknown.length ? ` · ${b.unknown.length} unknown` : ' · all recognised ✓'}</small></div>
        ${b.unknown.length ? `<p class="sp-note warn">Not in the squad list (kept with their GPS name): ${b.unknown.map(escapeHtml).join(', ')} — add them in Squad.</p>` : ''}
        ${b.missing.length ? `<p class="sp-note warn">In the session in the plan but not in the GPS file: ${b.missing.map((q) => escapeHtml(q.name)).join(', ')} — change their status if they did not train.</p>` : ''}
        <p class="sp-note">Added from the plan, without GPS:</p><div class="sp-ngs">${b.full.filter((r) => !r.Time && r.DT == null).map((r) => `<span class="sp-ng">${escapeHtml(r.Players)}<small>${escapeHtml(r.Type)}</small></span>`).join('') || '<span class="sp-note">nobody</span>'}</div>
        <label class="sp-time">Session time <input type="number" min="1" max="200" value="${b.sessionTime}" data-f="time"> min <small>for the team-session players (the GPS's usual time)</small></label></div>
      <div class="sp-chk"><div class="sp-h3"><i class="n">3</i>RPE <small>${nRpe} / ${gpsRows.length} · Carga RPE = RPE × time</small><button type="button" class="linkbtn sp-rpe-ref" data-rpe-refresh>↻ Kiosk</button></div><div class="sp-rpe">${rpeGrid}</div>
        <p class="sp-note">${nKiosk ? `<span class="sp-key k"></span>${nKiosk} from the players' kiosk answers` : 'No kiosk answer yet for this session'}${nRpe < gpsRows.length ? ` · <span class="sp-key miss"></span>${gpsRows.length - nRpe} missing: you can publish now — answers given later on the RPE page are added at the next updates (or type them)` : ''} · type a value to correct it.</p></div>
    </div>
    <div class="sp-h3">Preview <span class="seg sp-show"><button type="button" data-show="full" class="${SPL.show === 'full' ? 'active' : ''}">Data_Full · ${b.full.length}</button><button type="button" data-show="drills" class="${SPL.show === 'drills' ? 'active' : ''}">Data_Drills · ${b.drills.length}</button></span><small>same columns and order as your Excel · blue = from the plan</small></div>
    <div class="sp-tw"><table class="sp-tbl"><thead><tr>${cols.map((c) => `<th class="${auto.has(c) ? 'a' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${auto.has(c) ? 'a' : ''}">${fmtv(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${b.issues.length ? `<p class="sp-note warn">${b.issues.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="sp-actions"><button type="button" class="btn-primary" data-publish ${ready ? '' : 'disabled'}>Publish ${escapeHtml(p.sid || splSid(date))}</button><button type="button" class="btn-light" data-xlsx>Download Excel · Full + Drills</button><button type="button" class="btn-light" data-back>Back to the plan</button>
      <span>${ready ? (b.checks.left ? `${b.checks.left} time${b.checks.left > 1 ? 's' : ''} not checked above — you can still publish: the preview shows what is written.` : 'Publishing adds the rows to the season: the dashboard and the staff e-mail follow at the next update.') : unmapped.length ? 'Name every drill first.' : 'The files are not from this day.'}</span></div>`;
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
  // correct a session in the data
  if (t.dataset.corrOpen != null) { splOpenCorrection(date); return; }
  if (t.dataset.corrCancel != null) { SPL.view = 'plan'; SPL.corr = null; splDraw(); return; }
  if (t.dataset.corrPub != null) { splCorrPublish(false); return; }
  if (t.dataset.corrDel != null) { if (confirm('Remove the correction of this session? The Excel values come back at the next update.')) splCorrPublish(true); return; }
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
  if (t.dataset.partial) { p().status[t.dataset.partial] = 'Partial'; splTouch(date); splDraw(); return; }
  // drill cards
  if (t.dataset.cardEdit != null) {
    const d = p().drills[Number(t.dataset.cardEdit)], def = splDef(d.name) || {}, inLib = !!splLibOf(d.name);
    const pl = def.players == null ? '' : String(def.players);
    SPL.card = { edit: Number(t.dataset.cardEdit), name: splName(d.name), length: def.length || '', width: def.width || '', players: pl, like: def.like || (inLib ? '' : splGuessLike(d.name, pl)), auto: !def.like };
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
  if (t.dataset.norpe) { splSaveNoRpe(date, t.dataset.norpe, t); return; } // an RPE typed for a session in the data
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
    return;
  }
  if (t.dataset.actmin != null) { splDraw(); return; } // minutes written: refresh the checks and the preview when done
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
  if (t.dataset.card && t.dataset.card !== 'like' && t.dataset.card !== 'cmp' && SPL.card) { // the card follows what is typed
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
document.addEventListener('drop', (e) => { if (CURRENT_VIEW === 'plan' && e.target.closest && e.target.closest('#spl-main')) { e.preventDefault(); splReadFiles([...e.dataTransfer.files]); } });
