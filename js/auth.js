/**
 * Connexion Google restreinte au staff. Sans GOOGLE_CLIENT_ID configuré, le site s'ouvre en
 * mode démonstration (données fictives) pour pouvoir valider le design avant le déploiement final.
 */
const LOCAL_DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('demo'); // local testing only
const AUTH = { token: null, demo: !window.APP_CONFIG.GOOGLE_CLIENT_ID || LOCAL_DEMO, user: null };

/** Expiry (ms) of a Google ID token — they last one hour; phones keep tabs open much longer. */
function tokenExpiry(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; }
}
function tokenExpired(t = AUTH.token) { return !t || tokenExpiry(t) < Date.now() + 60000; }
/** Expired sign-in: forget it and reload — Google signs the staff member back in automatically (auto_select). */
function renewSignIn() { sessionStorage.removeItem('id_token'); AUTH.token = null; location.reload(); }

function initAuth(onReady) {
  const gate = document.getElementById('signin-gate');
  const demoBanner = document.getElementById('demo-banner');

  if (AUTH.demo) {
    gate.classList.add('hidden');
    demoBanner.classList.remove('hidden');
    onReady();
    return;
  }

  const saved = sessionStorage.getItem('id_token');
  if (saved && !tokenExpired(saved)) { AUTH.token = saved; gate.classList.add('hidden'); onReady(); return; }
  sessionStorage.removeItem('id_token');

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
      auto_select: true, // returning staff are signed back in without clicking
      callback: (resp) => {
        AUTH.token = resp.credential;
        sessionStorage.setItem('id_token', resp.credential);
        gate.classList.add('hidden');
        onReady();
      },
    });
    google.accounts.id.renderButton(document.getElementById('g_id_signin_container'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
    google.accounts.id.prompt();
  };
  document.head.appendChild(script);
}

function signOut() {
  sessionStorage.removeItem('id_token');
  AUTH.token = null;
  location.reload();
}
