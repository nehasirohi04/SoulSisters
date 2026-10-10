// public/js/auth-guard.js
// Add this as the FIRST script in index.html:
//   <script src="/js/auth-guard.js"></script>
// It sends anyone who is not signed in to the sign-in screen,
// and gives the rest of the app two helpers:
//   SSAuth.user()        -> the signed-in user, or null
//   SSAuth.fetch(url, o) -> fetch that adds the sign-in token
//   SSAuth.signOut()     -> signs out and goes back to sign in

(function () {
  const TOKEN_KEY = 'ss_token';
  const USER_KEY = 'ss_user';
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const del = (k) => { try { localStorage.removeItem(k); } catch {} };

  function goToSignIn() {
    del(TOKEN_KEY);
    del(USER_KEY);
    location.replace('/auth.html');
  }

  const token = get(TOKEN_KEY);
  let user = null;
  try { user = JSON.parse(get(USER_KEY) || 'null'); } catch {}

  if (!token || !user || !user.verified) { goToSignIn(); return; }

  // Check the session is still valid. Sessions are kept in memory,
  // so a server restart signs everyone out.
  fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => { if (r.status === 401) goToSignIn(); })
    .catch(() => { /* offline: keep the app usable, SOS must still work */ });

  window.SSAuth = {
    user: () => user,
    fetch: (url, opts = {}) => fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token }
    }),
    signOut: async () => {
      try { await fetch('/api/auth/sign-out', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch {}
      goToSignIn();
    }
  };
})();
