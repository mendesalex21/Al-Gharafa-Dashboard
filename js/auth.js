/**
 * Connexion Google restreinte au staff. Sans GOOGLE_CLIENT_ID configuré, le site s'ouvre en
 * mode démonstration (données fictives) pour pouvoir valider le design avant le déploiement final.
 */
const AUTH = { token: null, demo: !window.APP_CONFIG.GOOGLE_CLIENT_ID, user: null };

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
  if (saved) { AUTH.token = saved; gate.classList.add('hidden'); onReady(); return; }

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
      callback: (resp) => {
        AUTH.token = resp.credential;
        sessionStorage.setItem('id_token', resp.credential);
        gate.classList.add('hidden');
        onReady();
      },
    });
    google.accounts.id.renderButton(document.getElementById('g_id_signin_container'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
  };
  document.head.appendChild(script);
}

function signOut() {
  sessionStorage.removeItem('id_token');
  AUTH.token = null;
  location.reload();
}
