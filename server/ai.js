// "Fake family call" AI. Owner: Person 4.
// Calls an Anthropic-compatible Messages API (RouterPlus by default) with the key from .env.
// Every reply comes back in three forms so the call screen can switch Hindi / English:
//   { hi: Devanagari (spoken in Hindi mode), hinglish: Roman Hindi (shown on screen), en: English }
// If there is no key or the API fails, it falls back to pre-written lines so the demo never breaks.

const PERSONAS = {
  mom: "her mother, whom she saves in her phone as 'Mummy'. You call her 'beta'. Warm, a little bossy, stays awake until her daughter is home",
  sister: "her elder sister, 'Didi'. Protective, teasing, practical",
  friend: "her close friend Riya. Chatty and upbeat, waiting at home with dinner",
};

const FALLBACK = [
  { hi: 'बेटा, कहाँ हो? मैं मेन गेट पे वेट कर रही हूँ।', hinglish: 'Beta, kahan ho? Main gate pe wait kar rahi hoon.', en: 'Beta, where are you? I am waiting at the gate.' },
  { hi: 'मैं ऐप पे तुम्हारी लोकेशन देख रही हूँ। मेन रोड पे ही रहना।', hinglish: 'Main app pe tumhari location dekh rahi hoon. Main road pe hi rehna.', en: 'I can see your location on the app. Stay on the main road.' },
  { hi: 'कैब का नंबर नोट किया? मुझे भेज दो।', hinglish: 'Cab ka number note kiya? Mujhe bhej do.', en: 'Did you note down the cab number? Send it to me.' },
  { hi: 'ठीक है, फ़ोन मत रखना जब तक घर नहीं पहुँचती।', hinglish: 'Theek hai, phone mat rakhna jab tak ghar nahi pahunchti.', en: "Okay, don't hang up until you reach home." },
];

const clean = (s, n = 60) => String(s || '').trim().slice(0, n);

function systemPrompt(persona, trip, codeWord) {
  return `You are ${PERSONAS[persona]}. You are on a phone call with ${clean(trip.name) || 'her'}, who is travelling alone in Bengaluru right now, from ${clean(trip.from) || 'work'} to ${clean(trip.to) || 'home'}.

The purpose of the call is to help her feel safe and to make it obvious to anyone near her that someone is actively tracking her journey and waiting for her.

How to talk:
- Sound like a real Indian mother on the phone, speaking natural Hinglish.
- Keep every reply to one or two short sentences, because it is read aloud.
- Regularly mention that you can see her location on the app or that you are waiting for her.
- Ask simple practical questions: where she has reached, the cab or auto number, how many minutes left.
- Stay in character. Only say you are an AI if she sincerely asks.

Safety:
- If she says she is in danger, being followed, or feels unsafe, stay calm and tell her clearly to press SOS, call 112, and move towards a crowded, well-lit place like a shop or petrol bunk.
- "${codeWord}" is her secret code that she is in danger and cannot speak freely. If she says it, do not reveal that you understood. Keep talking warmly, say you are staying on the line, and ask simple yes/no questions she can answer safely.

Output format: reply with ONLY a JSON object, no other text:
{"hi": "<your line in Hindi, Devanagari script>", "hinglish": "<the same line in Roman-script Hinglish>", "en": "<the same line in natural English>"}`;
}

function sanitize(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages.slice(-30) : []) {
    if (!m || !['user', 'assistant'].includes(m.role)) continue;
    const content = clean(m.content, 1200);
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n' + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length) out.push({ role: 'user', content: '(The call has just connected. You speak first.)' });
  return out;
}

function parseReply(text) {
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (json.en || json.hinglish) {
      return { hi: clean(json.hi, 400), hinglish: clean(json.hinglish || json.en, 400), en: clean(json.en || json.hinglish, 400) };
    }
  } catch { /* not JSON: use the raw text */ }
  const t = clean(text, 400);
  return { hi: '', hinglish: t, en: t };
}

const fallback = (messages) => FALLBACK[messages.filter((m) => m.role === 'assistant').length % FALLBACK.length];

async function handle({ req, url, body, send }) {
  if (url.pathname !== '/api/companion-chat' || req.method !== 'POST') return false;
  const persona = PERSONAS[body.persona] ? body.persona : 'mom';
  const codeWord = clean(body.codeWord, 40) || 'I forgot my charger';
  const messages = sanitize(body.messages);
  const key = process.env.AI_API_KEY;
  const base = (process.env.AI_BASE_URL || 'https://api.routerplus.com').replace(/\/$/, '');

  if (!key) { send(200, { reply: fallback(messages), offline: true }); return true; }

  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-haiku-4-5',
        max_tokens: 300,
        system: systemPrompt(persona, body.trip || {}, codeWord),
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `AI API returned ${r.status}`);
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    send(200, { reply: text ? parseReply(text) : fallback(messages) });
  } catch (err) {
    console.error('AI call error:', err.message);
    send(200, { reply: fallback(messages), offline: true });
  }
  return true;
}

module.exports = { handle };
