// server/auth.js
// Phone + OTP sign-in for SoulSisters. No packages needed.
// Owner: sign-in (new area). Wired into server.js like the other /server files.
//
// DEMO MODE: there is no SMS provider yet, so the OTP is printed in the
// server console and also sent back to the app (marked "Demo").
// Set SMS_PROVIDER in .env later to switch this off.
//
// Data lives in memory, like the rest of the hackathon app, so it resets
// when the server restarts.

const crypto = require('crypto');

const OTP_TTL_MS = 5 * 60 * 1000;      // code works for 5 minutes
const RESEND_WAIT_MS = 30 * 1000;      // wait 30 seconds before asking again
const MAX_TRIES = 5;                   // wrong guesses allowed per code
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // stay signed in 30 days

const DEMO = !process.env.SMS_PROVIDER;

const otps = new Map();      // phone -> { code, expires, tries, sentAt }
const users = new Map();     // phone -> { id, phone, name, verified, createdAt }
const sessions = new Map();  // token -> { phone, expires }

// Keep only Indian mobile numbers: 10 digits starting 6-9.
function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? '+91' + digits : null;
}

function sendOtp(rawPhone) {
  const phone = cleanPhone(rawPhone);
  if (!phone) return { status: 400, body: { error: 'Please enter a valid 10-digit Indian mobile number.' } };

  const old = otps.get(phone);
  if (old && Date.now() - old.sentAt < RESEND_WAIT_MS) {
    const wait = Math.ceil((RESEND_WAIT_MS - (Date.now() - old.sentAt)) / 1000);
    return { status: 429, body: { error: `Please wait ${wait} seconds before asking for a new code.`, wait } };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otps.set(phone, { code, expires: Date.now() + OTP_TTL_MS, tries: 0, sentAt: Date.now() });

  if (DEMO) {
    console.log(`[auth] Demo OTP for ${phone}: ${code}`);
    return { status: 200, body: { ok: true, phone, demo: true, demoCode: code, resendIn: RESEND_WAIT_MS / 1000 } };
  }
  // TODO: send `code` by SMS through your provider here.
  return { status: 200, body: { ok: true, phone, resendIn: RESEND_WAIT_MS / 1000 } };
}

function verifyOtp(rawPhone, rawCode) {
  const phone = cleanPhone(rawPhone);
  const entry = phone && otps.get(phone);
  if (!entry) return { status: 400, body: { error: 'Please ask for a new code.' } };
  if (Date.now() > entry.expires) {
    otps.delete(phone);
    return { status: 400, body: { error: 'This code has expired. Please ask for a new one.' } };
  }
  if (entry.tries >= MAX_TRIES) {
    otps.delete(phone);
    return { status: 429, body: { error: 'Too many wrong tries. Please ask for a new code.' } };
  }

  const given = String(rawCode || '').replace(/\D/g, '');
  const ok = given.length === 6 &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(entry.code));
  if (!ok) {
    entry.tries += 1;
    return { status: 400, body: { error: 'That code is not right.', triesLeft: MAX_TRIES - entry.tries } };
  }

  otps.delete(phone);
  let user = users.get(phone);
  const isNew = !user;
  if (!user) {
    user = { id: crypto.randomUUID(), phone, name: '', verified: false, createdAt: Date.now() };
    users.set(phone, user);
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { phone, expires: Date.now() + SESSION_TTL_MS });
  return { status: 200, body: { ok: true, token, isNew, user } };
}

function userFromRequest(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const s = token && sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return users.get(s.phone) || null;
}

// Identity check. MOCKED for the hackathon: no DigiLocker call and no
// face match yet. It only records that the user finished the steps.
function verifyIdentity(user, body) {
  if (!body || !body.selfieTaken) {
    return { status: 400, body: { error: 'Please take a live selfie first.' } };
  }
  user.verified = true;
  user.verifiedDemo = true;
  if (body.name) user.name = String(body.name).slice(0, 40);
  return { status: 200, body: { ok: true, demo: true, user } };
}

function signOut(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) sessions.delete(header.slice(7));
  return { status: 200, body: { ok: true } };
}

// ---- Route handler (same pattern as the other files in /server) ----
// server.js calls handle(ctx) with ctx = { req, url, body, send }.
// Returns true if this file handled the request.
async function handle({ req, url, body, send }) {
  const p = url.pathname;
  if (!p.startsWith('/api/auth/')) return false;
  const reply = (r) => send(r.status, r.body);

  if (req.method === 'POST' && p === '/api/auth/send-otp') {
    reply(sendOtp(body.phone));
  } else if (req.method === 'POST' && p === '/api/auth/verify-otp') {
    reply(verifyOtp(body.phone, body.code));
  } else if (req.method === 'GET' && p === '/api/auth/me') {
    const user = userFromRequest(req);
    reply(user ? { status: 200, body: { user } } : { status: 401, body: { error: 'Not signed in.' } });
  } else if (req.method === 'POST' && p === '/api/auth/verify-identity') {
    const user = userFromRequest(req);
    reply(user ? verifyIdentity(user, body) : { status: 401, body: { error: 'Not signed in.' } });
  } else if (req.method === 'POST' && p === '/api/auth/sign-out') {
    reply(signOut(req));
  } else {
    return false;
  }
  return true;
}

module.exports = { handle, userFromRequest, cleanPhone };
