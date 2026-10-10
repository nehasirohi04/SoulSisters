// Trips, live location, viewers, SOS and arrival. Owner: Person 3.
// Stored in memory: restarting the server clears everything (fine for a hackathon).
const crypto = require('crypto');
const trips = new Map();
const clean = (s, n = 60) => String(s || '').trim().slice(0, n);

async function handle({ req, url, body, send }) {
  if (url.pathname === '/api/trips' && req.method === 'POST') {
    if (!body.from || !body.to) { send(400, { error: 'from and to are required' }); return true; }
    const trip = {
      id: crypto.randomBytes(4).toString('hex'),
      name: clean(body.name) || 'Your friend',
      from: clean(body.from), to: clean(body.to), time: clean(body.time, 5),
      status: 'active',      // active | arrived | stopped
      location: null, path: [], updatedAt: null,
      companion: null,       // { name, meetAt } once she picks someone
      viewers: {},           // { "Mummy": lastSeenTimestamp }
      sos: null,             // { at, reason, seenBy: [] }
      createdAt: Date.now(),
    };
    trips.set(trip.id, trip);
    send(201, { trip });
    return true;
  }

  const m = url.pathname.match(/^\/api\/trips\/([a-f0-9]+)(?:\/(location|sos|safe|arrive|stop|companion))?$/);
  if (!m) return false;
  const trip = trips.get(m[1]);
  if (!trip) { send(404, { error: 'Trip not found. It may have ended, or the server restarted.' }); return true; }
  const action = m[2];

  // GET: the tracker page polls this. ?v=<name> marks that contact as watching.
  if (!action && req.method === 'GET') {
    const viewer = clean(url.searchParams.get('v'), 30);
    if (viewer) {
      trip.viewers[viewer] = Date.now();
      if (trip.sos && !trip.sos.seenBy.includes(viewer)) trip.sos.seenBy.push(viewer);
    }
    send(200, { trip });
    return true;
  }
  if (req.method !== 'POST' || !action) return false;

  if (action === 'location') {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { send(400, { error: 'lat and lng must be numbers' }); return true; }
    trip.location = { lat, lng };
    trip.updatedAt = Date.now();
    trip.status = 'active';
    trip.path.push([lat, lng]);
    if (trip.path.length > 500) trip.path.shift();
  } else if (action === 'sos') {
    if (!trip.sos) trip.sos = { at: Date.now(), reason: clean(body.reason, 80) || 'SOS button', seenBy: [] };
  } else if (action === 'safe') {
    trip.sos = null;
  } else if (action === 'arrive') {
    trip.status = 'arrived';
    trip.sos = null;
  } else if (action === 'stop') {
    trip.status = 'stopped';
  } else if (action === 'companion') {
    trip.companion = { name: clean(body.name, 30), meetAt: clean(body.meetAt, 80) };
  }
  send(200, { trip });
  return true;
}

module.exports = { handle };
