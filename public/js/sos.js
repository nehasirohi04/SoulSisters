// SOS active screen: countdown, who has been alerted, audio recording, safe PIN. Owner: Person 3.
import { state, api, register, go, on, settings, refreshTrip, triggerSOS, toast, joinNames, ICON, shortName } from './core.js';
import { sharing, startSharing } from './sharing.js';

const $ = (id) => document.getElementById(id);
const COUNTDOWN = 3;
// Demo data: a real app would look these up from the live location.
const POLICE = {
  'Kempegowda Airport, Terminal 1': 'KIA Airport Police Station', Indiranagar: 'Indiranagar Police Station',
  Domlur: 'HAL Police Station', Koramangala: 'Koramangala Police Station', 'HSR Layout': 'HSR Layout Police Station',
  Whitefield: 'Whitefield Police Station', 'MG Road': 'Cubbon Park Police Station', Jayanagar: 'Jayanagar Police Station',
};

let timer = null, pollTimer = null, recorder = null, chunks = [], recording = false, womenTimer = null;

register('sos', {
  onShow() {
    $('audioLink').hidden = true;
    if (state.sosActive) { showActive(); return; }
    // Short countdown so an accidental tap can be cancelled.
    let left = COUNTDOWN;
    setHead('SENDING SOS', `Alerting your circle in ${left}`, 'Tap cancel if you pressed this by mistake.', true);
    renderRows();
    timer = setInterval(async () => {
      left -= 1;
      if (left > 0) { $('sosTitle').textContent = `Alerting your circle in ${left}`; return; }
      clearInterval(timer);
      try { await triggerSOS('SOS button'); } catch (err) { toast(err.message); go('home'); }
    }, 1000);
  },
  onHide() { clearInterval(timer); clearInterval(pollTimer); },
});

$('sosCancel').addEventListener('click', () => { clearInterval(timer); toast('SOS cancelled.'); go(state.prevScreen || 'home'); });

on('sos', () => {
  startSharing();
  startRecording();
  if (state.screen === 'sos') showActive();
});

function setHead(tag, title, text, cancellable) {
  $('sosTag').textContent = tag;
  $('sosTitle').textContent = title;
  $('sosText').textContent = text;
  $('sosCancel').hidden = !cancellable;
}

function showActive() {
  setHead('SOS ACTIVE · SHARING LIVE', 'Help is on the way',
    `Your location is being sent every few seconds.${recording ? ' Audio is recording.' : ''}`, false);
  renderRows();
  clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshTrip().then(renderRows).catch(() => {}), 3000);
  // Demo: nearby verified women respond a few seconds later.
  clearTimeout(womenTimer);
  womenTimer = setTimeout(() => { state.womenJoined = 2; renderRows(); }, 4000);
}

function row(iconId, textId, done, text) {
  $(iconId).className = `status-icon ${done ? 'done' : 'wait'}`;
  $(iconId).innerHTML = done ? ICON.done : ICON.wait;
  $(textId).textContent = text;
}

function renderRows() {
  const t = state.trip;
  const active = state.sosActive && t?.sos;
  const names = settings().contacts.map((c) => c.name);
  const seen = active ? names.filter((n) => t.sos.seenBy.includes(n)) : [];
  if (!active) row('circleIcon', 'circleStatus', false, 'Waiting to send');
  else if (seen.length) row('circleIcon', 'circleStatus', true, `${joinNames(seen)} ${seen.length === 1 ? 'has' : 'have'} seen it`);
  else row('circleIcon', 'circleStatus', false, 'Sent. Waiting for them to open it');

  if (!active) row('womenIcon', 'womenStatus', false, 'Waiting to send');
  else if (state.womenJoined) row('womenIcon', 'womenStatus', true, `${state.womenJoined} have joined your call`);
  else row('womenIcon', 'womenStatus', false, 'Notifying women nearby');

  const station = POLICE[t?.to] || `${shortName(t?.to || 'Bengaluru')} Police Station`;
  row('policeIcon', 'policeStatus', false, active ? `${station} · Calling now` : station);
}

// ---------- Audio recording (only on https or localhost, with permission) ----------
async function startRecording() {
  if (recording || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      $('audioLink').innerHTML = `<a href="${url}" download="soulsisters-sos-audio.webm">Save the audio recording</a>`;
      $('audioLink').hidden = false;
    };
    recorder.start(1000);
    recording = true;
    if (state.screen === 'sos') showActive();
  } catch { recording = false; }
}

// ---------- I am safe now ----------
const pinDlg = $('pinDialog');
$('safeBtn').addEventListener('click', () => {
  if (!state.sosActive) { clearInterval(timer); go(state.prevScreen || 'home'); return; }
  $('pinEntry').value = '';
  $('pinError').hidden = true;
  pinDlg.showModal();
});
$('pinCancel').addEventListener('click', () => pinDlg.close());
$('pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('pinEntry').value !== settings().pin) { $('pinError').hidden = false; $('pinEntry').select(); return; }
  pinDlg.close();
  try { await api(`/api/trips/${state.trip.id}/safe`, {}); await refreshTrip(); } catch { /* still stop locally */ }
  state.sosActive = false;
  state.womenJoined = 0;
  clearInterval(pollTimer);
  const hadAudio = recording;
  if (recorder && recording) { recorder.stop(); recording = false; }
  setHead('SOS STOPPED', 'Glad you are safe', 'Your circle has been told. Your trip is still being shared.', false);
  row('circleIcon', 'circleStatus', true, 'Told you are safe');
  setTimeout(() => { if (state.screen === 'sos' && !state.sosActive) go(sharing.on ? 'watch' : 'home'); }, hadAudio ? 10000 : 2500);
});
