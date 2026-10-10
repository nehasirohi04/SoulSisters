// Live location: real GPS or a simulated journey for demos. Owner: Person 3.
// Other files listen with on('move', ...) and on('arrived', ...).
import { state, api, settings, area, emit, refreshTrip } from './core.js';

let watchId = null, simTimer = null, lastPush = 0, lastFix = null;
export const sharing = { on: false, simulated: false, lastMoveAt: 0, pos: null };

const metres = (a, b) => {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export { metres };

// A gentle curve between start and end, so the route looks like a road rather than a ruler.
export function routePoints(n = 80) {
  const a = area(state.trip.from), b = area(state.trip.to);
  const mid = [(a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.18, (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.18];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * a.lat + 2 * u * t * mid[0] + t * t * b.lat, u * u * a.lng + 2 * u * t * mid[1] + t * t * b.lng];
  });
}

async function push(lat, lng) {
  const now = Date.now();
  if (!lastFix || metres(lastFix, [lat, lng]) > 25) { sharing.lastMoveAt = now; lastFix = [lat, lng]; }
  sharing.pos = [lat, lng];
  emit('move', sharing.pos);
  if (now - lastPush < 2500) return; // send at most every 2.5s
  lastPush = now;
  try { await api(`/api/trips/${state.trip.id}/location`, { lat, lng }); } catch { /* keep trying on the next fix */ }
  const dest = area(state.trip.to);
  if (metres([lat, lng], [dest.lat, dest.lng]) < 150) arrive();
}

function startSim() {
  sharing.simulated = true;
  const pts = routePoints(90);
  let i = 0, pausedFor = 0;
  simTimer = setInterval(() => {
    // Pause about a third of the way, so the "Are you okay?" check-in shows up in demos.
    if (i === 30 && pausedFor < 12) { pausedFor++; push(...pts[i]); return; }
    i = Math.min(i + 1, pts.length - 1);
    push(...pts[i]);
  }, 2000);
}

export function startSharing() {
  if (sharing.on || !state.trip) return;
  sharing.on = true;
  sharing.lastMoveAt = Date.now();
  lastFix = null;
  const useSim = settings().simulate || !navigator.geolocation || !window.isSecureContext;
  if (useSim) { startSim(); }
  else {
    sharing.simulated = false;
    watchId = navigator.geolocation.watchPosition(
      (p) => push(p.coords.latitude, p.coords.longitude),
      () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; startSim(); },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
  emit('sharing', true);
}

export function stopSharing() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  clearInterval(simTimer);
  watchId = null; simTimer = null;
  sharing.on = false;
  emit('sharing', false);
}

export async function stopAndTell() {
  stopSharing();
  if (state.trip) { await api(`/api/trips/${state.trip.id}/stop`, {}); await refreshTrip(); }
}

async function arrive() {
  stopSharing();
  try { await api(`/api/trips/${state.trip.id}/arrive`, {}); await refreshTrip(); } catch { /* ignore */ }
  state.sosActive = false;
  emit('arrived');
}
