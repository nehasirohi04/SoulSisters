// Vercel version of /api/voice-agent. Owner: Person 4.
module.exports = async (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId) return res.status(200).json({ enabled: false });
  if (!key) return res.status(200).json({ enabled: true, agentId });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': key },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.token) throw new Error(`ElevenLabs returned ${r.status}`);
    res.status(200).json({ enabled: true, conversationToken: data.token });
  } catch (err) {
    console.error('ElevenLabs token error:', err.message);
    res.status(200).json({ enabled: false, error: 'Could not reach ElevenLabs, using the built-in voice.' });
  }
};