const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showView(view) {
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.viewPanel !== view));
  $$('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));

const modal = $('#seed-modal');
const input = $('#seed-input');
$('#new-seed-button').addEventListener('click', () => { modal.classList.remove('hidden'); setTimeout(() => input.focus(), 50); });
$('#close-modal').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); });
input.addEventListener('input', () => { $('#character-count').textContent = `${input.value.length} / 240`; });
$('#plant-button').addEventListener('click', () => {
  if (!input.value.trim()) { input.focus(); return; }
  modal.classList.add('hidden');
  input.value = '';
  $('#character-count').textContent = '0 / 240';
  showView('dojo');
});

$$('[data-open-idea]').forEach((card) => card.addEventListener('click', () => showView('dojo')));
$$('.move-button').forEach((button) => button.addEventListener('click', () => {
  $('#idea-question').innerHTML = `“${button.dataset.question}”`;
  $('#pixel-creature').style.animation = 'float 1.2s ease-in-out 2';
  setTimeout(() => { $('#pixel-creature').style.animation = ''; }, 2500);
}));

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') modal.classList.add('hidden'); });
