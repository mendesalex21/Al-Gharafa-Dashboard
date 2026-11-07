const VIEWS = {}; // view -> already rendered?
const VIEW_SECTION = {
  home: 'home', wellness: 'wellness', longitudinal: 'wellness', sessions: 'training', objectives: 'training', intensity: 'training',
  team: 'workload', squad: 'workload', player: 'workload', injuries: 'workload', readiness: 'workload', testing: 'testing', calendar: 'calendar', reports: 'reports', roster: 'roster', plan: 'plan', matchfiles: 'matchfiles', tactical: 'tactical', tactical2: 'tactical',
};
const VIEW_RENDER = {
  home: () => renderHome(), wellness: () => renderWellness(), longitudinal: () => renderLongitudinal(),
  sessions: (o) => renderSessions(o), objectives: (o) => renderObjectives(o), intensity: () => renderIntensity(), team: () => renderTeam(), squad: () => renderSquad(),
  player: (o) => renderPlayerLoad(o), injuries: (o) => renderInjuries(o), readiness: () => renderReadiness(), testing: (o) => renderTesting(o), calendar: (o) => renderCalendar(o),
  reports: (o) => renderReports(o), roster: (o) => renderRoster(o), plan: () => renderPlan(), matchfiles: () => renderMatchFiles(), tactical2: () => renderTactical2(),
};
const VIEW_REDRAW = {
  home: () => { hoLoadPlans(); drawHome(); }, longitudinal: () => drawLongitudinal(), sessions: (o) => drawSessions(o), objectives: () => drawObjectives(), intensity: () => drawIntensity(),
  team: () => drawTeam(), squad: () => drawSquad(), player: (o) => drawPlayerLoad(o), injuries: (o) => drawInjuries(o), readiness: () => drawReadiness(), testing: (o) => drawTesting(o), calendar: (o) => { calSetMode(o); drawCalendar(); }, reports: () => rpFit(), roster: (o) => { roSetMode(o); drawRoster(); }, plan: () => splDraw(), matchfiles: () => drawMatchFiles(), tactical2: () => drawTactical2(),
};
let CURRENT_VIEW = null;
/** Pages taken out of the menu (2026-10-26, his call — already shown elsewhere): old links open where it now lives. */
const VIEW_GONE = { longitudinal: 'wellness', objectives: 'sessions', readiness: 'squad', tactical: 'tactical2' }; // the old Tactical (2026-11-06): all in the new one

/** `opts` lets one page open another on a given item, e.g. switchView('player', {player: 'ounas'}). */
function switchView(view, opts) {
  if (VIEW_GONE[view]) view = VIEW_GONE[view];
  const section = VIEW_SECTION[view];
  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    if (btn.dataset.section === section) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  Object.keys(VIEW_RENDER).forEach((v) => { document.getElementById('view-' + v).hidden = v !== view; });
  window.scrollTo(0, 0);
  CURRENT_VIEW = view;
  if (location.hash.slice(1).split('/')[0] !== view) history.pushState(null, '', '#' + view); // bookmarkable address + browser back
  if (!VIEWS[view]) { VIEWS[view] = true; VIEW_RENDER[view](opts); }
  else if (VIEW_REDRAW[view]) VIEW_REDRAW[view](opts); // widths may have changed while hidden
  flyoutActive();
}
/** The menu line of the page on screen; pages with two layouts (Squad, Calendar) have one line each (data-mode). */
const VIEW_MODE = { roster: () => RO.view, calendar: () => CAL.mode };
function flyoutActive() {
  const mode = VIEW_MODE[CURRENT_VIEW] ? VIEW_MODE[CURRENT_VIEW]() : null;
  document.querySelectorAll('.flyout-link').forEach((a) => a.classList.toggle('active', a.dataset.view === CURRENT_VIEW && (!a.dataset.mode || a.dataset.mode === mode)));
  subnavSync();
}

/** Each menu's pages as buttons on the page, in the eyebrow line above the title (his ask, 2026-11-07): Training ›
 * Sessions · Intensity, Workload › Team · Squad · Player · Injuries, Squad › By position · List, Calendar › Calendar ·
 * Games. The same links as the menu's flyout. Released to the staff 2026-11-07. */
function subnavSync() {
  const main = CURRENT_VIEW && document.getElementById('view-' + CURRENT_VIEW), eb = main && main.querySelector('.pg-head .pg-eyebrow');
  if (!eb) return;
  const panel = document.getElementById('flyout-' + VIEW_SECTION[CURRENT_VIEW]);
  const links = panel ? [...panel.querySelectorAll('.flyout-link')].filter((a) => !a.hidden) : [];
  let nav = eb.querySelector('.pg-subnav');
  if (links.length < 2) { if (nav) nav.remove(); return; }
  const mode = VIEW_MODE[CURRENT_VIEW] ? VIEW_MODE[CURRENT_VIEW]() : null;
  const on = (a) => a.dataset.view === CURRENT_VIEW && (!a.dataset.mode || a.dataset.mode === mode);
  const key = links.map((a) => `${a.dataset.view}${a.dataset.mode || ''}${on(a) ? '*' : ''}`).join('|');
  if (nav && nav.dataset.key === key) return;
  if (!nav) { nav = document.createElement('span'); nav.className = 'seg pg-subnav'; nav.setAttribute('role', 'group'); eb.appendChild(nav); }
  nav.dataset.key = key;
  nav.innerHTML = links.map((a, i) => `<button type="button" data-i="${i}" class="${on(a) ? 'active' : ''}">${escapeHtml(String(a.childNodes[0].textContent).trim())}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => { b.onclick = () => { const a = links[+b.dataset.i]; if (!on(a)) switchView(a.dataset.view, a.dataset.mode ? { mode: a.dataset.mode } : undefined); }; });
}
/** Pages draw their title when their data arrives: the buttons follow (one check per frame at most). */
let SUBNAV_RAF = 0;
new MutationObserver(() => { if (!SUBNAV_RAF) SUBNAV_RAF = requestAnimationFrame(() => { SUBNAV_RAF = 0; subnavSync(); }); })
  .observe(document.body, { childList: true, subtree: true });

/** Apple-style flyouts under nav items: open on mouse hover, on tap (iPad) or keyboard. */
function initFlyouts() {
  const backdrop = document.getElementById('flyout-backdrop');
  const triggers = Array.from(document.querySelectorAll('.nav-item[data-flyout]'));
  let openKey = null, closeTimer = null, lastPointer = 'mouse';
  const panelOf = (key) => document.getElementById('flyout-' + key);

  const close = () => {
    clearTimeout(closeTimer);
    if (!openKey) return;
    panelOf(openKey).classList.remove('open');
    triggers.forEach((t) => t.setAttribute('aria-expanded', 'false'));
    backdrop.classList.remove('open');
    openKey = null;
  };
  const open = (key) => {
    clearTimeout(closeTimer);
    if (openKey && openKey !== key) panelOf(openKey).classList.remove('open');
    const trigger = triggers.find((t) => t.dataset.flyout === key);
    const panel = panelOf(key);
    panel.querySelector('.flyout-inner').style.paddingLeft = (trigger.getBoundingClientRect().left + 12) + 'px'; // text lines up with the nav label
    panel.classList.add('open');
    backdrop.classList.add('open');
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(t === trigger)));
    openKey = key;
  };
  const closeSoon = () => { clearTimeout(closeTimer); closeTimer = setTimeout(close, 180); };

  triggers.forEach((trigger) => {
    const key = trigger.dataset.flyout, panel = panelOf(key);
    [trigger, panel].forEach((el) => {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(key); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
    });
    trigger.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    trigger.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') lastPointer = 'keyboard'; });
    trigger.addEventListener('click', () => {
      if (lastPointer === 'mouse') { close(); switchView(panel.dataset.default); return; }
      if (openKey === key) { close(); return; }
      open(key);
      if (lastPointer === 'keyboard') panel.querySelector('.flyout-link').focus();
    });
    panel.querySelectorAll('.flyout-link').forEach((link) => link.addEventListener('click', () => { close(); switchView(link.dataset.view, link.dataset.mode ? { mode: link.dataset.mode } : undefined); }));
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('pointerdown', (e) => {
    if (openKey && !panelOf(openKey).contains(e.target) && !triggers.some((t) => t.contains(e.target))) close();
  });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (CURRENT_VIEW && VIEWS[CURRENT_VIEW] && VIEW_REDRAW[CURRENT_VIEW]) VIEW_REDRAW[CURRENT_VIEW](); }, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  initFlyouts();
  document.getElementById('brand-home').addEventListener('click', () => switchView('home')); // the club logo = home
  document.getElementById('avatar').addEventListener('click', () => {
    if (!AUTH.demo && confirm('Sign out?')) signOut();
  });
  const parts = decodeURIComponent(location.hash.slice(1)).split('/'); // e.g. #sessions/2026-09-04[/dame], #player/ounas
  if (parts[0] === 'downloads') parts[0] = 'reports'; // the Reports tab is now called Downloads
  if (parts[0] === 'week') parts[0] = 'squad'; // Training › Week load is gone: its charts are in Workload › Squad
  if (VIEW_GONE[parts[0]]) parts[0] = VIEW_GONE[parts[0]];
  const [start, arg, arg2] = parts;
  const opts = arg ? { sessions: { date: arg, player: arg2 }, player: { player: arg }, testing: { athlete: arg, tab: 'profile' }, objectives: { cycle: arg }, reports: { date: arg, version: arg2 }, calendar: { mode: arg }, injuries: { player: arg }, roster: { mode: arg } }[start] : undefined;
  initAuth(async () => {
    // photos: once per device, then from the browser's storage (a few ms) — wait that long so pages draw with them
    await Promise.race([loadPlayerPhotos(), new Promise((ok) => setTimeout(ok, 400))]);
    switchView(VIEW_RENDER[start] ? start : 'home', opts); // the home page (the club logo) is the landing page
    mfShowLink(); // the admin's Match files link
    setTimeout(() => { if (typeof splPrefetch === 'function') splPrefetch(); }, 1500); // Session Plan's saved plans (slow Google script), ready before the click
    window.addEventListener('hashchange', () => { const h = location.hash.slice(1), v = h === 'downloads' ? 'reports' : VIEW_GONE[h] || h; if (VIEW_RENDER[v] && v !== CURRENT_VIEW) switchView(v); });
  });
});
