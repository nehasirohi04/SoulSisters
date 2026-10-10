// ElevenLabs voice agent for the family call. Owner: Person 4.
// The browser asks GET /api/voice-agent before a call:
//   - private agent (recommended): we use the API key here on the server to get a one-time
//     conversation token, so the key never reaches the browser
//   - public agent: we just pass the agent ID
//   - nothing configured: { enabled: false } and the app uses its built-in voice instead

async function handle({ req, url, send }) {
  if (url.pathname !== '/api/voice-agent' || req.method !== 'GET') return false;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;

  if (!agentId) { send(200, { enabled: false }); return true; }
  if (!key) { send(200, { enabled: true, agentId }); return true; }

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': key },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.token) throw new Error(data?.detail?.message || data?.detail || `ElevenLabs returned ${r.status}`);
    send(200, { enabled: true, conversationToken: data.token });
  } catch (err) {
    console.error('ElevenLabs token error:', err.message);
    send(200, { enabled: false, error: 'Could not reach ElevenLabs, using the built-in voice.' });
  }
  return true;
}

module.exports = { handle };