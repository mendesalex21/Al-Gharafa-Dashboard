const VIEWS = {}; // vue -> déjà chargée ?

function switchView(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    const active = btn.dataset.view === view;
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.getElementById('view-home').hidden = view !== 'home';
  document.getElementById('view-wellness').hidden = view !== 'wellness';
  if (!VIEWS[view]) {
    VIEWS[view] = true;
    if (view === 'home') renderHome();
    if (view === 'wellness') renderWellness();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('avatar').addEventListener('click', () => {
    if (!AUTH.demo && confirm('Sign out?')) signOut();
  });
  initAuth(() => switchView('wellness'));
});
