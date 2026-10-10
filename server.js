// SoulSisters — tiny zero-dependency Node server (Node 18+).
// Serves the app from /public and exposes a small JSON API.
// Owner: Person 1 (app shell). Each API area lives in its own file under /server.

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Load .env without any packages ---------------------------------------
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const matching = require('./server/matching'); // Person 2
const trips = require('./server/trips');       // Person 3
const ai = require('./server/ai');             // Person 4

const voiceAgent = require('./server/voice-agent'); // Person 4
const auth = require('./server/auth');         // Sign-in


const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) { reject(new Error('Request body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Body must be valid JSON')); }
    });
  });
}

function serveStatic(url, res) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const ctx = { req, url, body, send: (status, data) => sendJson(res, status, data) };

      const handled = (await auth.handle(ctx)) || (await matching.handle(ctx)) || (await trips.handle(ctx)) || (await ai.handle(ctx)) || (await voiceAgent.handle(ctx));

      if (!handled) sendJson(res, 404, { error: `No API route for ${req.method} ${url.pathname}` });
      return;
    }
    serveStatic(url, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SoulSisters running at http://localhost:${PORT}`);
  console.log(process.env.AI_API_KEY
    ? `AI companion: live via ${process.env.AI_BASE_URL || 'https://api.routerplus.com'} (model ${process.env.AI_MODEL || 'claude-haiku-4-5'})`
    : 'AI companion: offline demo lines (add AI_API_KEY to .env for live calls)');
  console.log(process.env.ELEVENLABS_AGENT_ID
    ? `Family call: ElevenLabs agent ${process.env.ELEVENLABS_AGENT_ID}${process.env.ELEVENLABS_API_KEY ? ' (private, token from server)' : ' (public)'}`
    : 'Family call: built-in browser voice (add ELEVENLABS_AGENT_ID to .env for ElevenLabs)');
});