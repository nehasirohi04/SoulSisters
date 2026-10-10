// App shell: plan-trip screen, trusted circle, settings, navigation, SOS button. Owner: Person 1.
import { state, api, go, register, on, settings, saveSettings, ensureTrip, toast, esc, avatarClass, initial } from './core.js';
import { sharing } from './sharing.js';
import './companions.js'; // Person 2
import './watch.js';      // Person 3
import './sos.js';        // Person 3
import './call.js';       // Person 4

const $ = (id) => document.getElementById(id);

// ---------- Step tracker at the bottom of screens ----------
const STEPS = [['1', 'Together', 'companions'], ['2', 'Watched', 'watch'], ['3', 'On a call', 'call']];
document.querySelectorAll('.steps').forEach((nav) => {
  nav.innerHTML = STEPS.map(([n, t, screen]) =>
    `<button type="button" data-step="${n}" data-target="${screen}"><span class="n">STEP ${n}</span><span class="t">${t}</span></button>`).join('');
});
document.addEventListener('click', async (e) => {
  const step = e.target.closest('.steps button');
  if (step) { await goWithTrip(step.dataset.target); return; }
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) { await goWithTrip(goBtn.dataset.go); return; }
  if (e.target.closest('[data-call]')) { await goWithTrip('call'); return; }
  if (e.target.closest('[data-sos]')) { await goWithTrip('sos'); }
});

// Screens after "home" need a trip, so create it from the form first.
async function goWithTrip(screen) {
  if (screen === 'home') { go('home'); return; }
  try { await ensureTrip(); go(screen); } catch (err) { go('home'); toast(err.message); }
}

// ---------- Plan trip ----------
register('home', {
  onShow() {
    renderCircle();
    $('livePill').hidden = !sharing.on;
  },
});

$('tripForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await goWithTrip(e.submitter?.value || 'companions');
});

// ---------- Trusted circle row + settings dialog ----------
function renderCircle() {
  const { contacts } = settings();
  $('circleRow').innerHTML = contacts.map((c, i) => `
    <button type="button" class="person" data-edit>
      <span class="avatar ${avatarClass(i)}">${initial(c.name)}</span>${esc(c.name)}
    </button>`).join('') + `
    <button type="button" class="person add-person" data-add>
      <span class="avatar add">+</span>Add
    </button>`;
}

const dlg = $('circleDialog');
function openSettings(focusAdd) {
  const s = settings();
  $('codeWordInput').value = s.codeWord;
  $('pinInput').value = s.pin;
  $('simulateInput').checked = s.simulate;
  renderContactList();
  dlg.showModal();
  if (focusAdd) $('contactForm').name.focus();
}
function renderContactList() {
  const { contacts } = settings();
  $('contactList').innerHTML = contacts.length ? contacts.map((c, i) => `
    <li><span class="avatar ${avatarClass(i)}">${initial(c.name)}</span>
      <span class="c-body"><span class="c-name">${esc(c.name)}</span><br><span class="c-phone">${esc(c.phone) || 'No number yet. Links are shared from your WhatsApp.'}</span></span>
      <button type="button" class="link" data-remove="${i}">Remove</button></li>`).join('')
    : '<li class="empty">Add the people who should know where you are.</li>';
}
$('editCircle').addEventListener('click', () => openSettings(false));
$('circleRow').addEventListener('click', (e) => {
  if (e.target.closest('[data-add]')) openSettings(true);
  else if (e.target.closest('[data-edit]')) openSettings(false);
});
$('contactList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (!b) return;
  const contacts = settings().contacts.filter((_, i) => i !== Number(b.dataset.remove));
  saveSettings({ contacts });
  renderContactList();
});
$('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  saveSettings({ contacts: [...settings().contacts, { name: f.name.value.trim(), phone: f.phone.value.trim() }] });
  f.reset();
  renderContactList();
});
$('closeCircle').addEventListener('click', () => {
  const pin = $('pinInput').value.trim();
  if (!/^\d{4,6}$/.test(pin)) { toast('Your safe PIN needs 4 to 6 digits.'); $('pinInput').focus(); return; }
  saveSettings({ codeWord: $('codeWordInput').value.trim() || 'I forgot my charger', pin, simulate: $('simulateInput').checked });
  dlg.close();
});
dlg.addEventListener('close', renderCircle);
on('sharing', () => { if (state.screen === 'home') $('livePill').hidden = !sharing.on; });

// ---------- Start ----------
async function init() {
  const { areas } = await api('/api/areas');
  state.areas = areas;
  $('places').innerHTML = areas.map((a) => `<option value="${esc(a.name)}"></option>`).join('');
  const form = $('tripForm');
  form.from.value = 'Kempegowda Airport, Terminal 1';
  form.to.value = 'Indiranagar';
  form.from.addEventListener('focus', () => form.from.select());
  form.to.addEventListener('focus', () => form.to.select());
  state.screen = '';
  go('home');
}
init().catch((err) => toast(`Couldn't start the app: ${err.message}`, 6000));
