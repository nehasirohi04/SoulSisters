// Step 2: live map + trusted circle watching + "Are you okay?" check-in. Owner: Person 3.
import { state, register, go, on, settings, refreshTrip, triggerSOS, trackUrl, toast, esc,
  avatarClass, initial, joinNames, area, shortName, whatsapp } from './core.js';
import { sharing, startSharing, stopAndTell, routePoints, metres } from './sharing.js';

const $ = (id) => document.getElementById(id);
const STILL_DEMO_MS = 15000;   // simulated trip: ask after 15s without moving
const STILL_REAL_MS = 180000;  // real GPS: ask after 3 minutes without moving
const REPLY_SECONDS = 30;

let map, meMarker, doneLine, mapTripId, pollTimer, tickTimer, countdown = null;

register('watch', {
  onShow() {
    startSharing();
    setupMap();
    render();
    refreshTrip().then(render).catch(() => {});
    pollTimer = setInterval(() => refreshTrip().then(render).catch(() => {}), 4000);
    tickTimer = setInterval(checkStill, 1000);
  },
  onHide() { clearInterval(pollTimer); clearInterval(tickTimer); },
});

// ---------- Map ----------
function setupMap() {
  if (!window.L) { $('map').textContent = ''; return; }
  if (!map) {
    map = L.map('map', { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
  }
  if (mapTripId !== state.trip.id) {
    mapTripId = state.trip.id;
    map.eachLayer((l) => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    const pts = routePoints();
    L.polyline(pts, { color: '#0F5C55', weight: 5, opacity: 0.35 }).addTo(map);
    doneLine = L.polyline([], { color: '#0F5C55', weight: 5 }).addTo(map);
    const dest = area(state.trip.to);
    L.marker([dest.lat, dest.lng], { icon: L.divIcon({ className: '', html: '<div class="end-dot"></div>', iconSize: [18, 18] }) }).addTo(map);
    meMarker = null;
    // Leave room at the bottom for the sheet.
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 150], paddingBottomRight: [40, 380] });
  }
  setTimeout(() => map.invalidateSize(), 60);
}

on('move', (pos) => {
  if (!map) return;
  if (!meMarker) meMarker = L.marker(pos, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }) }).addTo(map);
  else meMarker.setLatLng(pos);
  doneLine.addLatLng(pos);
  if (state.screen === 'watch') renderEta();
});

// ---------- Text, chips, ETA ----------
function renderEta() {
  const t = state.trip;
  if (t.status === 'arrived') { $('routeStatus').textContent = `Reached ${shortName(t.to)} safely`; return; }
  if (t.status === 'stopped' && !sharing.on) { $('routeStatus').textContent = 'Sharing stopped'; return; }
  const dest = area(t.to), start = area(t.from);
  const tripMins = (a, b) => Math.max(2, Math.round(((metres(a, b) / 1000) * 1.3 / 45) * 60)); // roads ~1.3x straight line, ~45 km/h at night
  let eta;
  if (sharing.on && !sharing.simulated && sharing.pos) {
    eta = new Date(Date.now() + tripMins(sharing.pos, [dest.lat, dest.lng]) * 60000); // real GPS: from where she is now
  } else {
    const d = new Date(); const [h, m] = t.time.split(':'); d.setHours(h, m, 0, 0);    // demo: from the planned time
    eta = new Date(d.getTime() + tripMins([start.lat, start.lng], [dest.lat, dest.lng]) * 60000);
  }
  eta.setMinutes(Math.ceil(eta.getMinutes() / 5) * 5);
  $('routeStatus').textContent = `On route · Arriving around ${eta.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}`;
}

function render() {
  if (state.screen !== 'watch') return;
  const t = state.trip;
  const { contacts } = settings();
  const watching = contacts.filter((c) => Date.now() - (t.viewers?.[c.name] || 0) < 15000).map((c) => c.name);

  $('watchTitle').textContent = watching.length
    ? `${joinNames(watching)} can see you live`
    : contacts.length ? 'Send your live link to your circle' : 'Add someone to your circle';
  $('withLine').hidden = !t.companion;
  if (t.companion) $('withLine').textContent = `Travelling with ${t.companion.name}${t.companion.meetAt ? `, meeting at ${t.companion.meetAt}` : ''}.`;

  $('watchChips').innerHTML = contacts.map((c, i) => {
    const on = watching.includes(c.name);
    return `<button type="button" class="chip ${on ? '' : 'waiting'}" data-send="${i}" aria-label="${on ? `${esc(c.name)} is watching` : `Send live link to ${esc(c.name)}`}">
      <span class="avatar ${avatarClass(i)}">${initial(c.name)}</span>${on ? 'Watching' : 'Send link'}</button>`;
  }).join('') + '<button type="button" class="chip plain waiting" data-copy>Copy link</button>';
  renderEta();
}

const shareText = (viewer) =>
  `I'm travelling from ${shortName(state.trip.from)} to ${shortName(state.trip.to)}. Watch my live location on SoulSisters: ${trackUrl(viewer)}`;

$('watchChips').addEventListener('click', async (e) => {
  const send = e.target.closest('[data-send]');
  if (send) {
    const c = settings().contacts[send.dataset.send];
    whatsapp(c.phone, shareText(c.name));
    return;
  }
  if (e.target.closest('[data-copy]')) {
    const url = trackUrl();
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { window.prompt('Copy this link:', url); }
  }
});

$('stopShare').addEventListener('click', async () => {
  try { await stopAndTell(); toast('Sharing stopped. Your circle can see you stopped.'); go('home'); }
  catch (err) { toast(err.message); }
});

on('arrived', () => { toast(`You reached ${shortName(state.trip.to)}. Your circle has been told.`, 5000); hideCheckin(); render(); });

// ---------- "Are you okay?" check-in ----------
function checkStill() {
  if (!sharing.on || state.sosActive || countdown !== null) return;
  const limit = sharing.simulated ? STILL_DEMO_MS : STILL_REAL_MS;
  if (Date.now() - sharing.lastMoveAt > limit) showCheckin();
}
function showCheckin() {
  countdown = REPLY_SECONDS;
  $('checkinCount').textContent = countdown;
  $('checkin').hidden = false;
  navigator.vibrate?.([300, 150, 300]);
  countdown = setInterval(async () => {
    const left = Number($('checkinCount').textContent) - 1;
    $('checkinCount').textContent = left;
    if (left > 0) return;
    hideCheckin();
    try { await triggerSOS('No reply to "Are you okay?"'); go('sos'); } catch (err) { toast(err.message); }
  }, 1000);
}
function hideCheckin() {
  clearInterval(countdown);
  countdown = null;
  $('checkin').hidden = true;
}
$('imOkay').addEventListener('click', () => { hideCheckin(); sharing.lastMoveAt = Date.now(); toast('Glad you are okay.'); });
document.querySelector('#checkin [data-call]').addEventListener('click', hideCheckin);
