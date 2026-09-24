const VIEWS = {}; // view -> already rendered?
const VIEW_SECTION = {
  wellness: 'wellness', longitudinal: 'wellness', sessions: 'training', objectives: 'training',
  squad: 'workload', player: 'workload', testing: 'testing', calendar: 'calendar',
};
const VIEW_RENDER = {
  wellness: () => renderWellness(), longitudinal: () => renderLongitudinal(),
  sessions: (o) => renderSessions(o), objectives: () => renderObjectives(), squad: () => renderSquad(),
  player: (o) => renderPlayerLoad(o), testing: (o) => renderTesting(o), calendar: (o) => renderCalendar(o),
};
const VIEW_REDRAW = {
  longitudinal: () => drawLongitudinal(), sessions: (o) => drawSessions(o), objectives: () => drawObjectives(),
  squad: () => drawSquad(), player: (o) => drawPlayerLoad(o), testing: (o) => drawTesting(o), calendar: () => drawCalendar(),
};
let CURRENT_VIEW = null;

/** `opts` lets one page open another on a given item, e.g. switchView('player', {player: 'ounas'}). */
function switchView(view, opts) {
  const section = VIEW_SECTION[view];
  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    if (btn.dataset.section === section) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.flyout-link').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  Object.keys(VIEW_RENDER).forEach((v) => { document.getElementById('view-' + v).hidden = v !== view; });
  window.scrollTo(0, 0);
  CURRENT_VIEW = view;
  if (!VIEWS[view]) { VIEWS[view] = true; VIEW_RENDER[view](opts); }
  else if (VIEW_REDRAW[view]) VIEW_REDRAW[view](opts); // widths may have changed while hidden
}

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
    panel.querySelectorAll('.flyout-link').forEach((link) => link.addEventListener('click', () => { close(); switchView(link.dataset.view); }));
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
  document.getElementById('avatar').addEventListener('click', () => {
    if (!AUTH.demo && confirm('Sign out?')) signOut();
  });
  initAuth(() => switchView('wellness'));
});
