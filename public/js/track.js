// The page a trusted contact opens from the shared link. Owner: Person 3.
// ?v=<name> tells the traveller's app that this person is watching.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tripId = params.get('trip'), viewer = params.get('v') || '';
let map, marker, line, fitted = false, short = {};

function setupMap() {
  if (!window.L) { $('map').textContent = 'The map could not load.'; return; }
  map = L.map('map', { zoomControl: false }).setView([12.9716, 77.5946], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);
  line = L.polyline([], { color: '#0F5C55', weight: 5 }).addTo(map);
}

async function poll() {
  try {
    const res = await fetch(`/api/trips/${tripId}?v=${encodeURIComponent(viewer)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const t = data.trip;
    const name = t.name || 'She';
    $('who').textContent = t.sos ? `${name} needs help` : t.status === 'arrived' ? `${name} has reached` : `${name} is travelling`;
    $('route').textContent = `${short[t.from] || t.from} to ${short[t.to] || t.to}${t.companion ? `, with ${t.companion.name}` : ''}`;
    $('sosBanner').hidden = !t.sos;
    $('call112').hidden = !t.sos;
    $('okBanner').hidden = t.status !== 'arrived';
    document.title = t.sos ? `SOS: ${name} needs help` : `SoulSisters: ${name}'s trip`;

    if (t.location && map) {
      const ll = [t.location.lat, t.location.lng];
      if (!marker) marker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }) }).addTo(map);
      marker.setLatLng(ll);
      line.setLatLngs(t.path);
      if (!fitted) { map.setView(ll, 13); fitted = true; } else if (t.sos) map.panTo(ll);
      $('mapsLink').href = `https://www.google.com/maps?q=${t.location.lat},${t.location.lng}`;
      $('mapsLink').hidden = false;
    }

    const status = $('status');
    status.classList.remove('stale');
    if (t.status === 'stopped') status.textContent = 'She stopped sharing her location.';
    else if (t.status === 'arrived') status.textContent = 'Trip finished.';
    else if (!t.updatedAt) status.textContent = 'Waiting for her to start sharing.';
    else {
      const mins = Math.floor((Date.now() - t.updatedAt) / 60000);
      if (mins >= 2) { status.textContent = `No update for ${mins} minutes. Consider calling her.`; status.classList.add('stale'); }
      else status.textContent = `Live. Updated ${new Date(t.updatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
    }
  } catch (err) {
    $('who').textContent = 'Trip not available';
    $('status').textContent = err.message;
  }
}

async function start() {
  if (!tripId) { $('who').textContent = 'No trip in this link'; return; }
  try { const { areas } = await (await fetch('/api/areas')).json(); areas.forEach((a) => { short[a.name] = a.short; }); } catch { /* names stay long */ }
  setupMap();
  poll();
  setInterval(poll, 3000);
}
start();
