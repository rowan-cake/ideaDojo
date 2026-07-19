const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ideas = {
  "tiny-libraries": { id: "tiny-libraries", name: "morrow", title: "the neighborhood of tiny libraries", seed: "A neighborhood network of tiny, welcoming libraries.", description: "A curious place to borrow a story, then leave one behind.", tone: "lilac", quip: "Take a story. Leave a secret in its place." },
  "stranger-dinner": { id: "stranger-dinner", name: "amble", title: "a dinner party for strangers", seed: "A dinner party designed to make strangers feel unexpectedly at home.", description: "A brave table where no one has to arrive knowing anyone.", tone: "ochre", quip: "Who gets the first chair if nobody knows anyone?" },
  "pocket-weather": { id: "pocket-weather", name: "pella", title: "the pocket weather station", seed: "A tiny weather ritual for noticing the emotional atmosphere of a day.", description: "A tiny ritual for noticing the atmosphere inside a day.", tone: "moss", quip: "Today feels cloudy with a chance of courage." },
  "memory-map": { id: "memory-map", name: "orlo", title: "a map made of memories", seed: "A living map whose paths are made from small, personal memories.", description: "A map that changes when a small memory finds a new home.", tone: "blue", quip: "This path remembers something you forgot." },
};

let dojoSessionId = null;
let activeIdea = ideas["stranger-dinner"];
let playerPosition = { x: 0, y: 0 };
let ideaPosition = { x: 0, y: 0 };
let arenaState = 'idle';
let aimVector = { x: 0, y: 0, power: 0 };
let wanderTimer = null;
let speechTimer = null;
let qteTimer = null;
let qteCount = 0;
let audioContext = null;
const QTE_TARGET = 12;
const POSITION_KEY = 'idea-dojo.arena-positions.v1';

function showView(view) {
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.viewPanel !== view));
  $$('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === (view === 'arena' ? 'dojo' : view)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function routeTo(view, ideaId) {
  const path = view === 'garden' ? '/' : view === 'dojo' ? '/dojo' : `/dojo/${ideaId}`;
  window.history.pushState({}, '', path);
  if (view === 'arena') enterArena(ideas[ideaId] || activeIdea, false);
  else showView(view);
}

function ideaFromElement(element) {
  return ideas[element.dataset.ideaId] || {
    id: element.dataset.ideaId,
    name: element.dataset.ideaName || 'new idea',
    title: element.dataset.ideaTitle,
    seed: element.dataset.ideaSeed,
    description: element.dataset.ideaTitle,
    tone: element.dataset.ideaTone || 'moss',
  };
}

function setArenaIdea(idea) {
  $('#arena-kicker').textContent = `quiet encounter · ${idea.title}`;
  $('#arena-idea-name').textContent = idea.name;
  $('#arena-tree-label').textContent = idea.name;
  $('#arena-idea-title').textContent = idea.title;
  $('#arena-description').textContent = idea.description;
  $('#arena-tree').className = `arena-tree idea-${idea.id}`;
  const creature = $('#arena-tree .tree-creature');
  creature.className = `tree-creature tree-${idea.tone}`;
  typeIdeaSpeech(idea.quip, false);
}

function updateDojo(response) {
  const nudge = response.nudge;
  const line = nudge?.text || response.beat;
  $('#dojo-presence').textContent = nudge ? `${nudge.sensei} enters quietly` : 'the idea shifts its weight';
  $('#idea-question').textContent = `“${line}”`;
  $('#dojo-beat').textContent = nudge ? response.beat : 'Keep it playful. There is no right sequence.';
  typeIdeaSpeech(line);
}

async function startDojoSession(idea = activeIdea) {
  activeIdea = idea;
  dojoSessionId = null;
  try {
    const response = await fetch('/api/dojo/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
    if (!response.ok) throw new Error('The dojo is resting.');
    const session = await response.json();
    dojoSessionId = session.sessionId;
    updateDojo(session);
  } catch {
    $('#dojo-presence').textContent = 'the mat is quiet';
    $('#idea-question').textContent = '“Make one small move.”';
  }
}

function enterArena(idea, updateUrl = true) {
  activeIdea = idea;
  setArenaIdea(idea);
  showView('arena');
  requestAnimationFrame(initializeBout);
  startDojoSession(idea);
  if (updateUrl) window.history.pushState({}, '', `/dojo/${idea.id}`);
}

async function takeMove(moveId) {
  if (!dojoSessionId) await startDojoSession();
  if (!dojoSessionId) return;
  try {
    const response = await fetch(`/api/dojo/sessions/${dojoSessionId}/moves`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moveId }),
    });
    if (!response.ok) throw new Error('The mat is quiet.');
    updateDojo(await response.json());
  } catch {
    $('#dojo-beat').textContent = 'The dojo is quiet for a moment. Try another small move.';
  }
}

function placePlayer(x, y) {
  playerPosition = { x, y };
  const player = $('#player-avatar');
  player.style.left = `${x}px`;
  player.style.top = `${y}px`;
}

function placeIdea(x, y, animate = false) {
  ideaPosition = { x, y };
  const tree = $('#arena-tree');
  tree.classList.toggle('is-walking', animate);
  tree.style.left = `${x}px`;
  tree.style.top = `${y}px`;
  if (animate) setTimeout(() => tree.classList.remove('is-walking'), 760);
}

function readSavedPositions() {
  try {
    const stored = JSON.parse(localStorage.getItem(POSITION_KEY) || '{}');
    if (Object.keys(stored).length) return stored;
  } catch { /* Fall through to the cookie backup. */ }
  try {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith('idea_dojo_positions='));
    return cookie ? JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('='))) : {};
  } catch { return {}; }
}

function savePositions() {
  const scene = $('#arena-scene');
  if (!scene.clientWidth || !activeIdea) return;
  const saved = readSavedPositions();
  saved[activeIdea.id] = {
    player: { x: playerPosition.x / scene.clientWidth, y: playerPosition.y / scene.clientHeight },
    idea: { x: ideaPosition.x / scene.clientWidth, y: ideaPosition.y / scene.clientHeight },
  };
  localStorage.setItem(POSITION_KEY, JSON.stringify(saved));
  document.cookie = `idea_dojo_positions=${encodeURIComponent(JSON.stringify(saved))}; path=/; max-age=31536000; SameSite=Lax`;
  scene.dataset.positionSaved = activeIdea.id;
}

function initializeBout(forceDefaults = false) {
  const scene = $('#arena-scene');
  if (!scene.offsetWidth) return;
  arenaState = 'idle';
  clearInterval(qteTimer);
  $('#grapple-qte').classList.add('hidden');
  scene.classList.remove('is-aiming', 'is-launching', 'is-grappling', 'is-miss', 'qte-active', 'is-victory');
  $('#arena-tree').classList.remove('is-taken-down');
  $('#aim-line').style.width = '0px';
  const saved = forceDefaults ? null : readSavedPositions()[activeIdea.id];
  scene.dataset.positionSource = saved ? 'saved' : 'default';
  placePlayer(scene.clientWidth * (saved?.player?.x ?? .22), scene.clientHeight * (saved?.player?.y ?? .62));
  placeIdea(scene.clientWidth * (saved?.idea?.x ?? .71), scene.clientHeight * (saved?.idea?.y ?? .47));
  if (forceDefaults) savePositions();
  scheduleIdeaWander();
}

function resetBout() {
  initializeBout(true);
  typeIdeaSpeech('Back to our corners. Try another angle.');
}

function scheduleIdeaWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (arenaState === 'idle' && !$('#arena-view').classList.contains('hidden')) wanderIdea();
    scheduleIdeaWander();
  }, 2700 + Math.random() * 2200);
}

function wanderIdea(farFromPlayer = false) {
  const scene = $('#arena-scene');
  const minY = Math.min(190, scene.clientHeight * .38);
  const maxY = scene.clientHeight - 150;
  let next;
  for (let attempts = 0; attempts < 8; attempts += 1) {
    next = {
      x: scene.clientWidth * (.42 + Math.random() * .4),
      y: minY + Math.random() * Math.max(60, maxY - minY),
    };
    if (!farFromPlayer || Math.hypot(next.x - playerPosition.x, next.y - playerPosition.y) > 150) break;
  }
  placeIdea(next.x, next.y, true);
  savePositions();
  if (Math.random() > .56) typeIdeaSpeech(activeIdea.quip);
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playBlip(kind = 'type', step = 0) {
  if (!audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequencies = { type: 280 + (step % 3) * 38, aim: 190, hit: 92, press: 350 + step * 15, win: 620, fail: 125 };
  oscillator.type = kind === 'hit' ? 'square' : 'triangle';
  oscillator.frequency.setValueAtTime(frequencies[kind], audioContext.currentTime);
  gain.gain.setValueAtTime(kind === 'type' ? .018 : .045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + (kind === 'win' ? .22 : .07));
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + (kind === 'win' ? .23 : .08));
}

function typeIdeaSpeech(text, sound = true) {
  if (!text) return;
  clearInterval(speechTimer);
  const bubble = $('#idea-speech');
  const output = $('#idea-speech-text');
  bubble.classList.add('is-visible');
  output.textContent = '';
  let index = 0;
  speechTimer = setInterval(() => {
    output.textContent = text.slice(0, index + 1);
    if (sound && /\S/.test(text[index]) && index % 3 === 0) playBlip('type', index);
    index += 1;
    if (index >= text.length) clearInterval(speechTimer);
  }, 27);
}

function localPoint(event) {
  const rect = $('#arena-scene').getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function updateAim(point) {
  const dx = point.x - playerPosition.x;
  const dy = point.y - playerPosition.y;
  const distance = Math.hypot(dx, dy);
  const power = Math.min(distance, 220);
  aimVector = { x: dx / (distance || 1), y: dy / (distance || 1), power };
  const line = $('#aim-line');
  line.style.left = `${playerPosition.x}px`;
  line.style.top = `${playerPosition.y}px`;
  line.style.width = `${power}px`;
  line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
}

function beginAim(event) {
  if (arenaState !== 'idle' || event.button > 0) return;
  ensureAudio();
  playBlip('aim');
  arenaState = 'aiming';
  const scene = $('#arena-scene');
  scene.classList.add('is-aiming');
  scene.setPointerCapture(event.pointerId);
  updateAim(localPoint(event));
  event.preventDefault();
}

function moveAim(event) {
  if (arenaState !== 'aiming') return;
  updateAim(localPoint(event));
}

function releaseAim(event) {
  if (arenaState !== 'aiming') return;
  const scene = $('#arena-scene');
  if (scene.hasPointerCapture(event.pointerId)) scene.releasePointerCapture(event.pointerId);
  scene.classList.remove('is-aiming');
  $('#aim-line').style.width = '0px';
  if (aimVector.power < 18) {
    arenaState = 'idle';
    $('#dojo-beat').textContent = 'A tiny feint. Drag farther to build a little momentum.';
    return;
  }
  launchPlayer(aimVector);
}

function launchPlayer(vector) {
  const scene = $('#arena-scene');
  const treeRect = $('#arena-tree').getBoundingClientRect();
  const sceneRect = scene.getBoundingClientRect();
  const target = { x: treeRect.left - sceneRect.left + treeRect.width / 2, y: treeRect.top - sceneRect.top + treeRect.height / 2 };
  const start = { ...playerPosition };
  const travel = 105 + vector.power * 1.75;
  const margin = 48;
  const end = {
    x: Math.max(margin, Math.min(scene.clientWidth - margin, start.x + vector.x * travel)),
    y: Math.max(145, Math.min(scene.clientHeight - 82, start.y + vector.y * travel)),
  };
  const startedAt = performance.now();
  arenaState = 'launching';
  scene.classList.add('is-launching');

  function frame(now) {
    const raw = Math.min((now - startedAt) / 620, 1);
    const eased = 1 - Math.pow(1 - raw, 3);
    const x = start.x + (end.x - start.x) * eased;
    const y = start.y + (end.y - start.y) * eased - Math.sin(raw * Math.PI) * 18;
    placePlayer(x, y);
    if (Math.hypot(x - target.x, y - target.y) < 72) return startGrapple(target);
    if (raw < 1) requestAnimationFrame(frame);
    else missIdea();
  }
  requestAnimationFrame(frame);
}

function startGrapple(target) {
  const scene = $('#arena-scene');
  arenaState = 'qte';
  placePlayer(target.x - 45, target.y + 18);
  savePositions();
  scene.classList.remove('is-launching');
  scene.classList.add('qte-active');
  $('#impact-burst').style.left = `${target.x}px`;
  $('#impact-burst').style.top = `${target.y}px`;
  qteCount = 0;
  $('#qte-count').textContent = `0 / ${QTE_TARGET}`;
  $('#qte-progress').style.width = '0%';
  $('#grapple-qte').classList.remove('hidden');
  $('#dojo-presence').textContent = `${activeIdea.name} catches your momentum`;
  $('#idea-question').textContent = '“The idea is pushing back—grapple with it!”';
  $('#dojo-beat').textContent = 'Press X or tap rapidly before it wriggles free.';
  typeIdeaSpeech('You caught me. Now hold on!');
  playBlip('hit');
  const endsAt = performance.now() + 4000;
  clearInterval(qteTimer);
  qteTimer = setInterval(() => {
    const remaining = Math.max(0, endsAt - performance.now());
    $('#qte-timer').textContent = `${(remaining / 1000).toFixed(1)} seconds`;
    if (!remaining) finishGrapple(false);
  }, 50);
}

function missIdea() {
  const scene = $('#arena-scene');
  arenaState = 'recovering';
  scene.classList.remove('is-launching');
  scene.classList.add('is-miss');
  $('#dojo-presence').textContent = 'you slide past';
  $('#idea-question').textContent = '“Misses count. What did you notice on the way by?”';
  $('#dojo-beat').textContent = 'The mat gives you the idea back at a slightly different angle.';
  typeIdeaSpeech('Almost. I am still over here.');
  savePositions();
  setTimeout(() => {
    scene.classList.remove('is-miss');
    arenaState = 'idle';
  }, 650);
}

function pressGrapple() {
  if (arenaState !== 'qte') return;
  qteCount += 1;
  $('#qte-count').textContent = `${qteCount} / ${QTE_TARGET}`;
  $('#qte-progress').style.width = `${Math.min(100, qteCount / QTE_TARGET * 100)}%`;
  const button = $('#qte-button');
  button.classList.remove('is-pressed');
  void button.offsetWidth;
  button.classList.add('is-pressed');
  playBlip('press', qteCount);
  if (qteCount >= QTE_TARGET) finishGrapple(true);
}

function finishGrapple(won) {
  if (arenaState !== 'qte') return;
  clearInterval(qteTimer);
  $('#grapple-qte').classList.add('hidden');
  const scene = $('#arena-scene');
  scene.classList.remove('qte-active');
  if (won) {
    arenaState = 'victory';
    scene.classList.add('is-grappling', 'is-victory');
    $('#arena-tree').classList.add('is-taken-down');
    $('#dojo-presence').textContent = 'takedown — the idea yields';
    $('#idea-question').textContent = '“Aha. Something surprising shook loose.”';
    $('#dojo-beat').textContent = 'You did not solve the idea. You changed your relationship to it.';
    typeIdeaSpeech('Okay, okay! Here is what I was protecting...');
    playBlip('win');
    takeMove('grapple');
    setTimeout(() => {
      scene.classList.remove('is-grappling', 'is-victory');
      $('#arena-tree').classList.remove('is-taken-down');
      arenaState = 'idle';
      wanderIdea(true);
    }, 1500);
  } else {
    arenaState = 'recovering';
    $('#dojo-presence').textContent = `${activeIdea.name} slips away`;
    $('#idea-question').textContent = '“Not yet. Try meeting me from another angle.”';
    $('#dojo-beat').textContent = 'The idea scampers across the mat, still very much alive.';
    typeIdeaSpeech('Too slow! Catch me again.');
    playBlip('fail');
    wanderIdea(true);
    setTimeout(() => { arenaState = 'idle'; }, 700);
  }
}

function handleRoute() {
  const [, root, ideaId] = window.location.pathname.split('/');
  if (root === 'dojo' && ideaId && ideas[ideaId]) return enterArena(ideas[ideaId], false);
  if (root === 'dojo') return showView('dojo');
  return showView('garden');
}

$$('[data-route]').forEach((button) => button.addEventListener('click', () => routeTo(button.dataset.route)));
$$('[data-view]').forEach((button) => button.addEventListener('click', () => routeTo(button.dataset.view)));
$$('[data-open-idea], [data-enter-dojo]').forEach((element) => element.addEventListener('click', () => enterArena(ideaFromElement(element))));
$$('.arena-action[data-move-id]').forEach((button) => button.addEventListener('click', () => takeMove(button.dataset.moveId)));
$('#reset-bout').addEventListener('click', resetBout);
$('#qte-button').addEventListener('click', pressGrapple);
$('#arena-scene').addEventListener('pointerdown', beginAim);
$('#arena-scene').addEventListener('pointermove', moveAim);
$('#arena-scene').addEventListener('pointerup', releaseAim);
$('#arena-scene').addEventListener('pointercancel', releaseAim);

const modal = $('#seed-modal');
const input = $('#seed-input');
$$('[data-new-seed]').forEach((button) => button.addEventListener('click', () => { modal.classList.remove('hidden'); setTimeout(() => input.focus(), 50); }));
$('#close-modal').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); });
input.addEventListener('input', () => { $('#character-count').textContent = `${input.value.length} / 240`; });
$('#plant-button').addEventListener('click', () => {
  if (!input.value.trim()) { input.focus(); return; }
  modal.classList.add('hidden');
  input.value = '';
  $('#character-count').textContent = '0 / 240';
  routeTo('dojo');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') modal.classList.add('hidden');
  if (event.target.matches('textarea, input')) return;
  if (event.key.toLowerCase() === 'x' && arenaState === 'qte') {
    event.preventDefault();
    pressGrapple();
  }
  if (event.key.toLowerCase() === 'r' && !$('#arena-view').classList.contains('hidden')) resetBout();
});
window.addEventListener('resize', () => { if (!$('#arena-view').classList.contains('hidden')) initializeBout(); });
window.addEventListener('popstate', handleRoute);
handleRoute();
