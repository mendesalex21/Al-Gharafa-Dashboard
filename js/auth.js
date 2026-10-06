/**
 * Connexion Google restreinte au staff. Sans GOOGLE_CLIENT_ID configuré, le site s'ouvre en
 * mode démonstration (données fictives) pour pouvoir valider le design avant le déploiement final.
 */
const LOCAL_DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('demo'); // local testing only
const AUTH = { token: null, session: null, demo: !window.APP_CONFIG.GOOGLE_CLIENT_ID || LOCAL_DEMO, user: null };
const SESSION_KEY = 'staff_session'; // the 30-day staff session, kept on this device (Sign out removes it)

/** Expiry (ms) of a sign-in: a Google ID token (one hour) or a staff session "s1.<payload>.<sig>" (30 days). */
function tokenExpiry(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (String(t).startsWith('s1.') ? p.x : p.exp) * 1000;
  } catch (e) { return 0; }
}
function tokenExpired(t = AUTH.token) { return !t || tokenExpiry(t) < Date.now() + 60000; }
function forgetSignIn() {
  sessionStorage.removeItem('id_token');
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* private mode */ }
  AUTH.token = null; AUTH.session = null;
}
/** Expired sign-in: forget it and reload — Google signs the staff member back in (automatically or one click). */
function renewSignIn() { forgetSignIn(); location.reload(); }
/** After a Google sign-in: the 30-day staff session from the Google script, so this device is not asked again for a month.
 * If it fails, the Google sign-in keeps working for its hour and the next visit tries again. */
async function startSession(idToken) {
  for (let i = 0; i < 3 && !AUTH.session; i++) {
    try {
      const r = await fetch(window.APP_CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'session', token: idToken }) });
      const j = await r.json();
      if (j.ok && j.session) {
        AUTH.session = j.session; AUTH.token = j.session; AUTH.user = j.user;
        try { localStorage.setItem(SESSION_KEY, j.session); } catch (e) { /* private mode: asked again next visit */ }
      } else if (j.error === 'forbidden' || j.error === 'invalid_token') return;
    } catch (e) { await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); } // the script's cold start
  }
}

function initAuth(onReady) {
  const gate = document.getElementById('signin-gate');
  const demoBanner = document.getElementById('demo-banner');

  if (AUTH.demo) {
    gate.classList.add('hidden');
    demoBanner.classList.remove('hidden');
    onReady();
    return;
  }

  let sess = null;
  try { sess = localStorage.getItem(SESSION_KEY); } catch (e) { /* private mode */ }
  if (sess && !tokenExpired(sess)) { AUTH.session = sess; AUTH.token = sess; gate.classList.add('hidden'); onReady(); return; }
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* private mode */ }
  const saved = sessionStorage.getItem('id_token');
  if (saved && !tokenExpired(saved)) { AUTH.token = saved; gate.classList.add('hidden'); onReady(); startSession(saved); return; }
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
        startSession(resp.credential);
      },
    });
    google.accounts.id.renderButton(document.getElementById('g_id_signin_container'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
    google.accounts.id.prompt();
  };
  document.head.appendChild(script);
}

function signOut() {
  forgetSignIn();
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* not loaded */ }
  location.reload();
}
