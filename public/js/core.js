// Shared helpers used by every screen. Owner: Person 1.
// Everyone imports this file, so agree on changes as a team.

export const state = {
  areas: [],          // [{ name, short, lat, lng }] from /api/areas
  trip: null,         // latest trip object from the server
  screen: 'home',
  prevScreen: 'home',
  sosActive: false,
};

// ---------- API ----------
export async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Settings saved on this phone ----------
const KEY = 'soulsisters.settings';
const DEFAULTS = {
  name: 'Priya',
  contacts: [{ name: 'Mummy', phone: '' }, { name: 'Riya', phone: '' }],
  codeWord: 'I forgot my charger',
  pin: '1234',
  simulate: true,
};
export function settings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: keep in memory only */ }
  emit('settings', next);
  return next;
}

// ---------- Tiny event bus so screens can react to each other ----------
const listeners = {};
export const on = (evt, fn) => { (listeners[evt] ||= []).push(fn); };
export const emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));

// ---------- Screens ----------
const screens = {};
export function register(name, hooks = {}) { screens[name] = hooks; }

const STEP_OF = { home: 1, companions: 1, watch: 2, call: 3 };
export function go(name) {
  if (name === state.screen) { screens[name]?.onShow?.(); return; }
  screens[state.screen]?.onHide?.();
  if (state.screen !== 'call') state.prevScreen = state.screen;
  state.screen = name;
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
  document.querySelectorAll('.steps').forEach((nav) => {
    nav.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-current', Number(b.dataset.step) === STEP_OF[name] ? 'step' : 'false');
    });
  });
  document.querySelector('meta[name=theme-color]').content = name === 'call' ? '#14201C' : name === 'sos' ? '#C2410C' : '#F4F6F5';
  window.scrollTo({ top: 0 });
  screens[name]?.onShow?.();
}

// ---------- Trip ----------
export const area = (name) => state.areas.find((a) => a.name.toLowerCase() === String(name).trim().toLowerCase());
export const shortName = (name) => area(name)?.short || name;

// Read the plan-trip form and make sure a trip exists on the server for it.
export async function ensureTrip() {
  const form = document.getElementById('tripForm');
  const from = area(form.from.value), to = area(form.to.value), time = form.time.value || '23:30';
  if (!from || !to) throw new Error('Pick both places from the list.');
  if (from.name === to.name) throw new Error('Pick different start and end places.');
  const t = state.trip;
  if (t && t.from === from.name && t.to === to.name && t.time === time && t.status !== 'stopped' && t.status !== 'arrived') return t;
  const { trip } = await api('/api/trips', { name: settings().name, from: from.name, to: to.name, time });
  state.trip = trip;
  emit('trip', trip);
  return trip;
}

export async function refreshTrip() {
  if (!state.trip) return null;
  const { trip } = await api(`/api/trips/${state.trip.id}`);
  state.trip = trip;
  emit('trip', trip);
  return trip;
}

export const trackUrl = (viewer) =>
  `${location.origin}/track.html?trip=${state.trip.id}${viewer ? `&v=${encodeURIComponent(viewer)}` : ''}`;

// Raise an SOS. quiet = no visible change (code word, keypad).
export async function triggerSOS(reason = 'SOS button') {
  await ensureTrip();
  const { trip } = await api(`/api/trips/${state.trip.id}/sos`, { reason });
  state.trip = trip;
  state.sosActive = true;
  navigator.vibrate?.(150);
  emit('sos', trip);
  return trip;
}

// ---------- Small UI helpers ----------
let toastTimer;
export function toast(msg, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const avatarClass = (i) => ['', 'c1', 'c2'][i % 3];
export const initial = (name) => esc(String(name).trim()[0] || '?').toUpperCase();
export const joinNames = (names) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
export function timeLabel(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function whatsapp(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export const ICON = {
  verified: '<svg viewBox="0 0 24 24" role="img" aria-label="Verified"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  done: '<svg viewBox="0 0 24 24" role="img" aria-label="Done"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  wait: '<svg viewBox="0 0 24 24" role="img" aria-label="In progress"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};
