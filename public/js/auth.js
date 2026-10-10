// public/js/auth.js
// Sign-in flow: phone -> OTP -> verify identity (demo) -> trusted circle -> app.

(function () {
  const TOKEN_KEY = 'ss_token';
  const USER_KEY = 'ss_user';
  const SETTINGS_KEY = 'soulsisters.settings'; // same key as core.js, so Settings shows this circle

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  let phone = '';
  let stream = null;
  let selfieTaken = false;
  let resendTimer = null;
  function readSettings() {
    try { return JSON.parse(store.get(SETTINGS_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveSettings(patch) {
    store.set(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
  }
  // Start from a circle she already saved on this phone, if any.
  let circle = Array.isArray(readSettings().contacts) ? readSettings().contacts : [];

  function show(step) {
    document.querySelectorAll('.step').forEach((s) => { s.hidden = s.id !== 'step-' + step; });
    const first = $('step-' + step).querySelector('input');
    if (first) first.focus();
  }

  async function api(path, body, method) {
    const headers = { 'Content-Type': 'application/json' };
    const token = store.get(TOKEN_KEY);
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(path, {
      method: method || 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  function busy(btn, on) { btn.disabled = on; }

  // ---------- A. Phone ----------
  $('phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button');
    $('phone-error').textContent = '';
    const digits = $('phone').value.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      $('phone-error').textContent = 'Please enter a valid 10-digit mobile number.';
      return;
    }
    busy(btn, true);
    const r = await api('/api/auth/send-otp', { phone: digits }).catch(() => null);
    busy(btn, false);
    if (!r) { $('phone-error').textContent = 'Could not reach the server. Please try again.'; return; }
    if (!r.ok) { $('phone-error').textContent = r.data.error || 'Something went wrong.'; return; }
    phone = r.data.phone;
    $('otp-phone').textContent = phone;
    $('otp').value = '';
    $('otp-error').textContent = '';
    const demo = $('demo-code');
    if (r.data.demo) { demo.hidden = false; demo.textContent = 'Demo: your code is ' + r.data.demoCode; }
    else demo.hidden = true;
    startResendTimer(r.data.resendIn || 30);
    show('otp');
  });

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

  // ---------- B. OTP ----------
  function startResendTimer(seconds) {
    clearInterval(resendTimer);
    const btn = $('resend');
    let left = seconds;
    btn.disabled = true;
    btn.textContent = 'Resend code in ' + left + 's';
    resendTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = 'Resend code'; }
      else btn.textContent = 'Resend code in ' + left + 's';
    }, 1000);
  }

  $('resend').addEventListener('click', async () => {
    const r = await api('/api/auth/send-otp', { phone }).catch(() => null);
    if (!r || !r.ok) { $('otp-error').textContent = (r && r.data.error) || 'Could not resend.'; return; }
    if (r.data.demo) $('demo-code').textContent = 'Demo: your code is ' + r.data.demoCode;
    startResendTimer(r.data.resendIn || 30);
  });

  $('otp').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('otp-form').requestSubmit();
  });

  $('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    $('otp-error').textContent = '';
    const code = $('otp').value;
    if (code.length !== 6) { $('otp-error').textContent = 'Please enter all 6 digits.'; return; }
    busy(btn, true);
    const r = await api('/api/auth/verify-otp', { phone, code }).catch(() => null);
    busy(btn, false);
    if (!r) { $('otp-error').textContent = 'Could not reach the server. Please try again.'; return; }
    if (!r.ok) { $('otp-error').textContent = r.data.error || 'That code did not work.'; return; }
    clearInterval(resendTimer);
    store.set(TOKEN_KEY, r.data.token);
    store.set(USER_KEY, JSON.stringify(r.data.user));
    if (r.data.user.verified) finish();
    else show('verify');
  });

  // ---------- C. Verify identity (demo) ----------
  $('camera-btn').addEventListener('click', async () => {
    const video = $('video');
    const canvas = $('snap');
    const btn = $('camera-btn');
    $('verify-error').textContent = '';

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      } catch {
        $('verify-error').textContent = 'Camera is blocked. Please allow camera access and try again.';
        return;
      }
      video.srcObject = stream;
      await video.play();
      canvas.hidden = true;
      btn.textContent = 'Take selfie';
      return;
    }

    // Take the picture. It stays on the phone; nothing is uploaded in the demo.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.hidden = false;
    stopCamera();
    selfieTaken = true;
    btn.textContent = 'Retake selfie';
  });

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  $('verify-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    $('verify-error').textContent = '';
    if (!selfieTaken) { $('verify-error').textContent = 'Please take a live selfie first.'; return; }
    busy(btn, true);
    const r = await api('/api/auth/verify-identity', { selfieTaken: true, name: $('name').value.trim() }).catch(() => null);
    busy(btn, false);
    if (!r) { $('verify-error').textContent = 'Could not reach the server. Please try again.'; return; }
    if (r.status === 401) { signOutLocal(); show('phone'); return; }
    if (!r.ok) { $('verify-error').textContent = r.data.error || 'Something went wrong.'; return; }
    store.set(USER_KEY, JSON.stringify(r.data.user));
    if (r.data.user.name) saveSettings({ name: r.data.user.name });
    renderCircle();
    show('circle');
  });

  // ---------- D. Trusted circle ----------
  function renderCircle() {
    const list = $('circle-list');
    list.textContent = '';
    circle.forEach((p, i) => {
      const li = document.createElement('li');
      const av = document.createElement('span');
      av.className = 'av';
      av.textContent = (p.name[0] || '?').toUpperCase();
      const who = document.createElement('span');
      who.className = 'who';
      const b = document.createElement('b');
      b.textContent = p.name;
      who.append(b, document.createTextNode(p.phone ? 'WhatsApp · ' + p.phone : 'No number yet'));
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + p.name);
      rm.textContent = '×';
      rm.addEventListener('click', () => { circle.splice(i, 1); saveCircle(); renderCircle(); });
      li.append(av, who, rm);
      list.append(li);
    });
  }

  function saveCircle() { saveSettings({ contacts: circle }); }

  $('circle-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('circle-error').textContent = '';
    const name = $('c-name').value.trim();
    const digits = $('c-phone').value.replace(/\D/g, '');
    if (!name) { $('circle-error').textContent = 'Please add a name.'; return; }
    if (!/^[6-9]\d{9}$/.test(digits)) { $('circle-error').textContent = 'Please enter a valid 10-digit number.'; return; }
    circle.push({ name, phone: '+91' + digits });
    saveCircle();
    renderCircle();
    $('c-name').value = '';
    $('c-phone').value = '';
    $('c-name').focus();
  });

  $('done-btn').addEventListener('click', () => {
    if (circle.length === 0) {
      $('circle-error').textContent = 'Please add at least one person to your circle.';
      return;
    }
    finish();
  });

  function finish() {
    stopCamera();
    location.replace('/');
  }

  function signOutLocal() {
    store.del(TOKEN_KEY);
    store.del(USER_KEY);
  }

  // If already signed in and verified, skip straight to the app.
  (async function start() {
    if (!store.get(TOKEN_KEY)) { show('phone'); return; }
    const r = await api('/api/auth/me', null, 'GET').catch(() => null);
    if (r && r.ok) {
      store.set(USER_KEY, JSON.stringify(r.data.user));
      if (r.data.user.verified) finish();
      else show('verify');
    } else {
      signOutLocal();
      show('phone');
    }
  })();
})();
