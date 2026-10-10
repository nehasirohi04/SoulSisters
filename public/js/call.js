// Step 3: the fake family call. Owner: Person 4.
// AI writes each line in Hindi, Hinglish and English; the browser speaks it and listens for replies.
import { state, api, register, go, settings, triggerSOS, toast } from './core.js';

const $ = (id) => document.getElementById(id);
const CALLER = { name: 'Mummy', initial: 'M', persona: 'mom' };

let lang = 'hi', muted = false, speaker = false, inCall = false;
let history = [], last = null, ring = null, clock = null, recog = null, listening = false, busy = false;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

register('call', { onShow: startRinging, onHide: hangUp });

// ---------- Ringing ----------
function startRinging() {
  inCall = false;
  $('callAvatar').textContent = CALLER.initial;
  $('callName').textContent = CALLER.name;
  $('callMeta').textContent = 'Incoming call';
  ['saidBox', 'langToggle', 'callCtrls', 'endCall', 'callHint', 'typeReply'].forEach((id) => { $(id).hidden = true; });
  $('ringActions').hidden = false;
  $('listenState').textContent = '';
  $('screen-call').classList.add('ringing');
  history = [{ role: 'user', content: '(The call has just connected. You speak first.)' }];
  last = null;
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
  $('typeReply').hidden = Boolean(SR);
  $('saidMain').textContent = '';
  $('saidSub').textContent = '';
  const started = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('callMeta').textContent = `Mobile · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  clock = setInterval(tick, 1000);
  await say();
});

// ---------- Conversation ----------
async function say(userText) {
  if (busy) return;
  busy = true;
  stopListening();
  if (userText) {
    history.push({ role: 'user', content: userText });
    if (userText.toLowerCase().includes(settings().codeWord.toLowerCase()) && !state.sosActive) {
      triggerSOS('Code word during call').catch(() => {}); // quiet: nothing changes on screen
    }
  }
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

// Pick the most natural-sounding voice the browser has. Edge's "Natural" voices sound best.
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

// ---------- Listening (Chrome and Edge). Other browsers show a text box instead. ----------
function listen() {
  if (!inCall || muted || !SR || listening) return;
  if (!recog) {
    recog = new SR();
    recog.interimResults = false;
    recog.onresult = (e) => { listening = false; say(e.results[0][0].transcript); };
    // Keep listening for the whole call, like a real phone line.
    recog.onend = () => { listening = false; if (inCall && !busy && !muted && !speechSynthesis.speaking) setTimeout(listen, 300); };
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

// ---------- Controls ----------
$('langToggle').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  $('langToggle').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  showLine();
  speak();
});

$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').setAttribute('aria-pressed', String(muted));
  $('listenState').textContent = muted ? 'Your microphone is muted' : '';
  if (muted) stopListening(); else listen();
});

$('speakerBtn').addEventListener('click', () => {
  speaker = !speaker;
  $('speakerBtn').setAttribute('aria-pressed', String(speaker));
});

// Keypad sends an SOS quietly: the call carries on and nothing on screen changes.
$('keypadBtn').addEventListener('click', () => {
  if (!state.sosActive) triggerSOS('Keypad during call').catch(() => {});
  navigator.vibrate?.(60);
});

$('endCall').addEventListener('click', () => go(state.sosActive ? 'sos' : state.prevScreen || 'watch'));

function hangUp() {
  inCall = false;
  ring?.stop(); ring = null;
  clearInterval(clock);
  stopListening();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// Some browsers load voices late.
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
