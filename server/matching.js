// Companion matching. Owner: Person 2.
// Rule of thumb: share at least one end of the route AND leave within 45 minutes.
const areas = require('./areas');
const companions = require('../data/companions.json');

const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

function findMatches({ from, to, time }) {
  const t = toMinutes(time);
  return companions
    .map((c) => {
      let diff = Math.abs(toMinutes(c.time) - t);
      diff = Math.min(diff, 1440 - diff);
      let score = 0;
      const reasons = [];
      if (c.from === from && c.to === to) { score += 4; reasons.push('Exact same route'); }
      else if (c.to === to) { score += 2; reasons.push('Same destination'); }
      else if (c.from === from) { score += 2; reasons.push('Starts from the same area'); }
      reasons.push(diff === 0 ? 'Leaving at the same time' : `Leaving ${diff} min apart`);
      score += diff <= 15 ? 2 : diff <= 30 ? 1 : 0;
      return { ...c, score, diff, reasons };
    })
    .filter((m) => m.diff <= 45 && (m.from === from || m.to === to))
    .sort((a, b) => b.score - a.score || a.diff - b.diff);
}

async function handle({ req, url, send }) {
  if (req.method !== 'GET') return false;
  if (url.pathname === '/api/areas') { send(200, { areas }); return true; }
  if (url.pathname === '/api/companions') {
    const q = Object.fromEntries(url.searchParams);
    if (!q.from || !q.to || !q.time) { send(400, { error: 'from, to and time are required' }); return true; }
    send(200, { matches: findMatches(q) });
    return true;
  }
  return false;
}

module.exports = { handle, findMatches };
