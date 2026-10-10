// Step 1: women going the same way. Owner: Person 2.
import { state, api, register, go, toast, esc, avatarClass, ICON, shortName, timeLabel } from './core.js';

const $ = (id) => document.getElementById(id);
let loadedFor = null, matches = [];

register('companions', { onShow: load });

async function load() {
  const { id, from, to, time } = state.trip;
  if (loadedFor === id) return; // keep request states when coming back
  loadedFor = id;
  $('matchTitle').textContent = 'Looking for women on your route';
  $('matchSub').textContent = '';
  $('matchList').innerHTML = '';
  try {
    ({ matches } = await api(`/api/companions?${new URLSearchParams({ from, to, time })}`));
  } catch (err) { toast(err.message); return; }

  const route = `${shortName(from)} to ${shortName(to)}, around ${timeLabel(time)}.`;
  if (!matches.length) {
    $('matchTitle').textContent = 'No one on your route yet';
    $('matchSub').textContent = `${route} Your circle can watch over you instead.`;
    return;
  }
  $('matchTitle').textContent = `${matches.length} ${matches.length === 1 ? 'woman' : 'women'} on your route`;
  $('matchSub').textContent = `${route} Phone numbers stay hidden until you both agree.`;
  $('matchList').innerHTML = matches.map((m, i) => `
    <div class="card" data-id="${esc(m.id)}">
      <div class="who">
        <span class="avatar ${avatarClass(i)}">${esc(m.name[0])}</span>
        <div class="who-body">
          <span class="who-name">${esc(m.name)}${m.verified ? ICON.verified : '<span class="unverified">Not verified</span>'}</span>
          <span class="who-meta">Leaving ${timeLabel(m.time)} · ${m.to === to ? 'Same drop area' : `Drops at ${esc(shortName(m.to))}`}</span>
        </div>
      </div>
      <div class="pair">
        <button class="btn primary sm" type="button" data-together>Travel together</button>
        <button class="btn outline sm" type="button" data-stop>Meet at a stop</button>
      </div>
    </div>`).join('');
}

// Mock request flow: in a real app the other woman would get a notification and accept.
$('matchList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-together], [data-stop]');
  if (!btn) return;
  const card = btn.closest('.card');
  const m = matches.find((x) => x.id === card.dataset.id);
  const atStop = btn.hasAttribute('data-stop');
  card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  btn.textContent = `Asking ${m.name}`;
  await new Promise((r) => setTimeout(r, 1200));
  try {
    await api(`/api/trips/${state.trip.id}/companion`, { name: m.name, meetAt: atStop ? m.meetAt : '' });
    state.trip.companion = { name: m.name, meetAt: atStop ? m.meetAt : '' };
  } catch { /* the trip still works without it */ }
  toast(atStop ? `${m.name} said yes. Meet at ${m.meetAt}.` : `${m.name} said yes. Your circle can see you're travelling together.`, 5000);
  go('watch');
});
