const VIEWS = {}; // view -> already rendered?
const VIEW_SECTION = { home: 'home', wellness: 'wellness', longitudinal: 'wellness' };
const VIEW_RENDER = { home: () => renderHome(), wellness: () => renderWellness(), longitudinal: () => renderLongitudinal() };

function switchView(view) {
  const section = VIEW_SECTION[view];
  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    if (btn.dataset.section === section) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.flyout-link').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  Object.keys(VIEW_RENDER).forEach((v) => { document.getElementById('view-' + v).hidden = v !== view; });
  window.scrollTo(0, 0);
  if (!VIEWS[view]) { VIEWS[view] = true; VIEW_RENDER[view](); }
  else if (view === 'longitudinal') drawLongitudinal(); // width may have changed while hidden
}

/** Apple-style flyout under "Wellness": opens on mouse hover, on tap (iPad) or keyboard. */
function initFlyout() {
  const trigger = document.querySelector('.nav-item[data-flyout="wellness"]');
  const panel = document.getElementById('flyout-wellness');
  const backdrop = document.getElementById('flyout-backdrop');
  let closeTimer = null;
  let lastPointer = 'mouse';

  const isOpen = () => panel.classList.contains('open');
  const open = () => {
    clearTimeout(closeTimer);
    // align the menu text with the "Wellness" label, like apple.com
    panel.querySelector('.flyout-inner').style.paddingLeft = (trigger.getBoundingClientRect().left + 12) + 'px';
    panel.classList.add('open'); backdrop.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    clearTimeout(closeTimer);
    panel.classList.remove('open'); backdrop.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  };
  const closeSoon = () => { clearTimeout(closeTimer); closeTimer = setTimeout(close, 180); };

  [trigger, panel].forEach((el) => {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
  });
  trigger.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  trigger.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') lastPointer = 'keyboard'; });
  trigger.addEventListener('click', () => {
    if (lastPointer === 'mouse') { close(); switchView('wellness'); return; }
    if (isOpen()) { close(); return; }
    open();
    if (lastPointer === 'keyboard') panel.querySelector('.flyout-link').focus();
  });
  panel.querySelectorAll('.flyout-link').forEach((link) => {
    link.addEventListener('click', () => { close(); switchView(link.dataset.view); });
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { close(); trigger.focus(); } });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !trigger.contains(e.target)) close();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  initFlyout();
  document.getElementById('avatar').addEventListener('click', () => {
    if (!AUTH.demo && confirm('Sign out?')) signOut();
  });
  initAuth(() => switchView('wellness'));
});
