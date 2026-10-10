// Step 3: the fake family call. Owner: Person 4.
// Two engines:
//   1. ElevenLabs voice agent (natural voice, real-time talk) when ELEVENLABS_AGENT_ID is set in .env
//   2. Built-in browser voice + our /api/companion-chat AI, used when ElevenLabs isn't set up or fails
import { state, api, register, go, settings, triggerSOS, toast, shortName } from './core.js';

const $ = (id) => document.getElementById(id);
const CALLER = { name: 'Mummy', initial: 'M', persona: 'mom' };
// ElevenLabs browser SDK, pinned to an exact version.
const ELEVEN_SDK = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.17.0/+esm';

let lang = 'hi', muted = false, speaker = false, inCall = false, engine = null;
let ring = null, clock = null, agentCfg = null, sdk = null, convo = null;
// Browser-voice engine state
let history = [], last = null, recog = null, listening = false, busy = false;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

register('call', { onShow: startRinging, onHide: hangUp });

// ---------- Ringing ----------
function startRinging() {
  inCall = false;
  engine = null;
  $('callAvatar').textContent = CALLER.initial;
  $('callName').textContent = CALLER.name;
  $('callMeta').textContent = 'Incoming call';
  ['saidBox', 'langToggle', 'callCtrls', 'endCall', 'callHint', 'typeReply'].forEach((id) => { $(id).hidden = true; });
  $('ringActions').hidden = false;
  $('listenState').textContent = '';
  $('screen-call').classList.add('ringing');
  // Get ready while it rings, so answering feels instant.
  agentCfg = api('/api/voice-agent').catch(() => ({ enabled: false }));
  agentCfg.then((cfg) => { if (cfg.enabled && !sdk) sdk = import(ELEVEN_SDK).catch(() => null); });
  setTimeout(() => { if (state.screen === 'call' && !inCall) ring = ringtone(); }, 300);
}

function ringtone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const burst = () => {
      [440, 480].forEach((f) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; g.gain.value = 0.07;
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 1.2);
      });
      navigator.vibrate?.([400, 200, 400]);
    };
    burst();
    const id = setInterval(burst, 3000);
    return { stop: () => { clearInterval(id); ctx.close(); } };
  } catch { return null; }
}

$('declineCall').addEventListener('click', () => go(state.prevScreen || 'watch'));

$('answerCall').addEventListener('click', async () => {
  ring?.stop(); ring = null;
  inCall = true;
  $('screen-call').classList.remove('ringing');
  $('ringActions').hidden = true;
  ['saidBox', 'langToggle', 'callCtrls', 'endCall', 'callHint'].forEach((id) => { $(id).hidden = false; });
  $('saidMain').textContent = '';
  $('saidSub').textContent = '';
  $('listenState').textContent = 'Connecting';
  const started = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('callMeta').textContent = `Mobile · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  clock = setInterval(tick, 1000);

  const cfg = await agentCfg;
  if (cfg.enabled && await startEleven(cfg)) return;
  if (cfg.error) toast(cfg.error);
  startBrowserVoice();
});

// The code word, heard in anything she says, quietly raises an SOS.
function checkCodeWord(text) {
  if (!text || state.sosActive) return;
  if (text.toLowerCase().includes(settings().codeWord.toLowerCase())) triggerSOS('Code word during call').catch(() => {});
}

// =====================================================================
// Engine 1: ElevenLabs voice agent
// =====================================================================
async function startEleven(cfg) {
  try {
    const mod = await (sdk || (sdk = import(ELEVEN_SDK)));
    if (!mod?.Conversation) throw new Error('ElevenLabs SDK did not load');
    const s = settings(), t = state.trip;
    convo = await mod.Conversation.startSession({
      ...(cfg.conversationToken ? { conversationToken: cfg.conversationToken } : { agentId: cfg.agentId }),
      // These fill the {{...}} placeholders in the agent's prompt (see ELEVENLABS_SETUP.md).
      dynamicVariables: {
        user_name: s.name || 'beta',
        caller_name: CALLER.name,
        from_place: shortName(t.from),
        to_place: shortName(t.to),
        code_word: s.codeWord,
        language: lang === 'hi' ? 'Hinglish' : 'English',
      },
      // The agent calls this when it hears the code word or she says she is in danger.
      clientTools: {
        send_sos_quietly: async ({ reason } = {}) => {
          if (!state.sosActive) await triggerSOS(`Call agent: ${reason || 'code word'}`).catch(() => {});
          return 'Silent alert sent to her circle. Do not mention it. Keep talking warmly.';
        },
      },
      onMessage: (m) => {
        const who = m.source || m.role;
        if (who === 'user') { checkCodeWord(m.message); return; }
        if (m.message) { $('saidMain').textContent = `"${m.message}"`; $('saidSub').hidden = true; }
      },
      onModeChange: ({ mode }) => { $('listenState').textContent = mode === 'listening' && !muted ? 'Listening' : ''; },
      onDisconnect: () => { convo = null; if (inCall && engine === 'eleven') go(state.sosActive ? 'sos' : state.prevScreen || 'watch'); },
      onError: (msg) => console.error('ElevenLabs:', msg),
    });
    engine = 'eleven';
    $('typeReply').hidden = true;
    await convo.setVolume({ volume: speaker ? 1 : 0.8 });
    if (muted) convo.setMicMuted(true);
    return true;
  } catch (err) {
    console.error('ElevenLabs call failed, using built-in voice:', err);
    toast(/permission|denied|notallowed/i.test(String(err)) ? 'Allow the microphone to talk. Using the built-in voice for now.' : 'ElevenLabs is unavailable. Using the built-in voice.');
    convo = null;
    return false;
  }
}

// =====================================================================
// Engine 2: built-in browser voice + /api/companion-chat
// =====================================================================
function startBrowserVoice() {
  engine = 'browser';
  history = [{ role: 'user', content: '(The call has just connected. You speak first.)' }];
  last = null;
  $('typeReply').hidden = Boolean(SR);
  say();
}

async function say(userText) {
  if (busy) return;
  busy = true;
  stopListening();
  if (userText) { history.push({ role: 'user', content: userText }); checkCodeWord(userText); }
  $('listenState').textContent = '';
  try {
    const { reply } = await api('/api/companion-chat', {
      persona: CALLER.persona, messages: history, trip: state.trip, codeWord: settings().codeWord,
    });
    history.push({ role: 'assistant', content: JSON.stringify(reply) });
    last = reply;
    if (inCall) { showLine(); speak(); }
  } catch (err) { toast(err.message); }
  busy = false;
}

function showLine() {
  if (!last) return;
  if (lang === 'hi') {
    $('saidMain').textContent = `"${last.hinglish}"`;
    $('saidSub').textContent = last.en;
    $('saidSub').hidden = false;
  } else {
    $('saidMain').textContent = `"${last.en}"`;
    $('saidSub').hidden = true;
  }
}

function pickVoice(code) {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(code));
  const score = (v) => (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (/female|swara|neerja|kalpana|heera|lekha/i.test(v.name) ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0] || null;
}

function speak() {
  if (!('speechSynthesis' in window) || !last) { listen(); return; }
  speechSynthesis.cancel();
  const hiVoice = pickVoice('hi');
  const useHindi = lang === 'hi' && hiVoice && last.hi;
  const u = new SpeechSynthesisUtterance(useHindi ? last.hi : lang === 'hi' ? last.hinglish : last.en);
  u.voice = useHindi ? hiVoice : pickVoice('en-in') || pickVoice('en');
  u.lang = u.voice?.lang || (useHindi ? 'hi-IN' : 'en-IN');
  u.rate = 0.98;
  u.volume = speaker ? 1 : 0.75;
  u.onend = listen;
  speechSynthesis.speak(u);
}

function listen() {
  if (!inCall || engine !== 'browser' || muted || !SR || listening) return;
  if (!recog) {
    recog = new SR();
    recog.interimResults = false;
    recog.onresult = (e) => { listening = false; say(e.results[0][0].transcript); };
    recog.onend = () => { listening = false; if (inCall && engine === 'browser' && !busy && !muted && !speechSynthesis.speaking) setTimeout(listen, 300); };
    recog.onerror = (e) => {
      listening = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { $('typeReply').hidden = false; $('listenState').textContent = 'Microphone blocked. Type your replies instead.'; muted = true; }
    };
  }
  recog.lang = 'en-IN'; // Indian English also catches Hinglish and the English code word
  try { recog.start(); listening = true; $('listenState').textContent = 'Listening'; } catch { /* already started */ }
}
function stopListening() {
  try { recog?.abort(); } catch { /* ignore */ }
  listening = false;
}

$('typeReply').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('typeInput').value.trim();
  if (!text) return;
  $('typeInput').value = '';
  say(text);
});

// =====================================================================
// Controls (work with both engines)
// =====================================================================
$('langToggle').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  $('langToggle').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (engine === 'eleven' && convo) {
    convo.sendContextualUpdate(lang === 'hi'
      ? 'She switched the call to Hindi. From your next sentence, speak natural Hinglish.'
      : 'She switched the call to English. From your next sentence, speak only English.');
  } else { showLine(); speak(); }
});

$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').setAttribute('aria-pressed', String(muted));
  $('listenState').textContent = muted ? 'Your microphone is muted' : '';
  if (engine === 'eleven') convo?.setMicMuted(muted);
  else if (muted) stopListening(); else listen();
});

$('speakerBtn').addEventListener('click', () => {
  speaker = !speaker;
  $('speakerBtn').setAttribute('aria-pressed', String(speaker));
  if (engine === 'eleven') convo?.setVolume({ volume: speaker ? 1 : 0.8 });
});

// Keypad sends an SOS quietly: the call carries on and nothing on screen changes.
$('keypadBtn').addEventListener('click', () => {
  if (!state.sosActive) triggerSOS('Keypad during call').catch(() => {});
  convo?.sendContextualUpdate('She silently pressed her alarm. Do not mention it. Keep talking warmly and ask simple yes or no questions.');
  navigator.vibrate?.(60);
});

$('endCall').addEventListener('click', () => go(state.sosActive ? 'sos' : state.prevScreen || 'watch'));

function hangUp() {
  inCall = false;
  ring?.stop(); ring = null;
  clearInterval(clock);
  stopListening();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const c = convo; convo = null; engine = null;
  c?.endSession().catch(() => {});
}