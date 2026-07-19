const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ideas = {
  "tiny-libraries": { id: "tiny-libraries", slot: 1, name: "morrow", title: "the neighborhood of tiny libraries", seed: "A neighborhood network of tiny, welcoming libraries.", description: "A curious place to borrow a story, then leave one behind.", tone: "lilac", quip: "Take a story. Leave a secret in its place." },
  "stranger-dinner": { id: "stranger-dinner", slot: 2, name: "amble", title: "a dinner party for strangers", seed: "A dinner party designed to make strangers feel unexpectedly at home.", description: "A brave table where no one has to arrive knowing anyone.", tone: "ochre", quip: "Who gets the first chair if nobody knows anyone?" },
  "pocket-weather": { id: "pocket-weather", slot: 3, name: "pella", title: "the pocket weather station", seed: "A tiny weather ritual for noticing the emotional atmosphere of a day.", description: "A tiny ritual for noticing the atmosphere inside a day.", tone: "moss", quip: "Today feels cloudy with a chance of courage." },
  "memory-map": { id: "memory-map", slot: 4, name: "orlo", title: "a map made of memories", seed: "A living map whose paths are made from small, personal memories.", description: "A map that changes when a small memory finds a new home.", tone: "blue", quip: "This path remembers something you forgot." },
};

let dojoSessionId = null;
let activeIdea = null;
let currentScreen = 'dojo-home';
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
const PLANTED_KEY = 'idea-dojo.planted-ideas.v1';
const PRUNED_KEY = 'idea-dojo.pruned-ideas.v1';
const PLANT_NAMES = ['luma', 'tavi', 'rill', 'nori', 'fable', 'sora', 'brio', 'minka', 'tillo', 'vesper', 'lilo', 'cairn'];
const PLANT_TONES = ['lilac', 'ochre', 'moss', 'blue'];
const GARDEN_SLOTS = [1, 2, 3, 4, 5, 6, 7];
const SLOT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const SLOT_DIRECTIONS = ['top', 'upper-right', 'lower-right', 'center', 'upper-left', 'lower-left', 'bottom'];
let plantedIdeas = [];
let prunedIdeas = [];
let activePlantSlot = null;
let activePruneIdea = null;
let pendingEscortTimer = null;
let lastFocusedElement = null;

function cookieValue(name) {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
}

function normalizePlantedIdea(value) {
  const slot = Number(value?.slot);
  if (!GARDEN_SLOTS.includes(slot) || !value?.id || !value?.seed) return null;
  return {
    id: String(value.id).slice(0, 80),
    slot,
    name: String(value.name || 'sprout').slice(0, 24),
    title: String(value.title || value.seed).slice(0, 120),
    seed: String(value.seed).slice(0, 240),
    description: String(value.description || value.seed).slice(0, 300),
    tone: PLANT_TONES.includes(value.tone) ? value.tone : 'moss',
    quip: String(value.quip || 'I am still becoming. What do you notice?').slice(0, 140),
    createdAt: String(value.createdAt || new Date().toISOString()),
  };
}

function normalizePrunedIdea(value) {
  const slot = Number(value?.slot);
  if (![1, 2, 3, 4, 5, 6, 7].includes(slot) || !value?.id || !value?.seed) return null;
  return {
    id: String(value.id).slice(0, 80),
    slot,
    name: String(value.name || 'sprout').slice(0, 24),
    title: String(value.title || value.seed).slice(0, 120),
    seed: String(value.seed).slice(0, 240),
    description: String(value.description || value.seed).slice(0, 300),
    tone: PLANT_TONES.includes(value.tone) ? value.tone : 'moss',
    quip: String(value.quip || 'I am still becoming. What do you notice?').slice(0, 140),
    createdAt: String(value.createdAt || new Date().toISOString()),
    prunedAt: String(value.prunedAt || new Date().toISOString()),
  };
}

function readPlantedIdeas() {
  let values = [];
  try { values = JSON.parse(localStorage.getItem(PLANTED_KEY) || '[]'); }
  catch { /* Fall through to the cookie backup. */ }
  if (!Array.isArray(values) || !values.length) {
    try { values = JSON.parse(cookieValue('idea_dojo_planted') || '[]'); }
    catch { values = []; }
  }
  const bySlot = new Map();
  values.map(normalizePlantedIdea).filter(Boolean).forEach((idea) => bySlot.set(idea.slot, idea));
  return [...bySlot.values()].slice(0, 7);
}

function readPrunedIdeas() {
  let values = [];
  try { values = JSON.parse(localStorage.getItem(PRUNED_KEY) || '[]'); }
  catch { /* Fall through to the cookie backup. */ }
  if (!Array.isArray(values) || !values.length) {
    try { values = JSON.parse(cookieValue('idea_dojo_pruned') || '[]'); }
    catch { values = []; }
  }
  const byId = new Map();
  values.map(normalizePrunedIdea).filter(Boolean).forEach((idea) => byId.set(idea.id, idea));
  return [...byId.values()];
}

function savePlantedIdeas() {
  const serialized = JSON.stringify(plantedIdeas);
  localStorage.setItem(PLANTED_KEY, serialized);
  document.cookie = `idea_dojo_planted=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax`;
}

function savePrunedIdeas() {
  const serialized = JSON.stringify(prunedIdeas);
  localStorage.setItem(PRUNED_KEY, serialized);
  document.cookie = `idea_dojo_pruned=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax`;
}

function seedHash(seed) {
  return [...seed].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0) >>> 0;
}

function makeIdeaFromSeed(seed, slot) {
  const cleanSeed = seed.replace(/\s+/g, ' ').trim();
  const hash = seedHash(cleanSeed);
  const usedNames = new Set(Object.values(ideas).map(({ name }) => name));
  let nameIndex = hash % PLANT_NAMES.length;
  while (usedNames.has(PLANT_NAMES[nameIndex])) nameIndex = (nameIndex + 1) % PLANT_NAMES.length;
  const title = cleanSeed.replace(/[.!?]+$/, '').slice(0, 90);
  return {
    id: `seed-${slot}-${hash.toString(36)}`,
    slot,
    name: PLANT_NAMES[nameIndex],
    title,
    seed: cleanSeed,
    description: cleanSeed,
    tone: PLANT_TONES[(hash + slot) % PLANT_TONES.length],
    quip: `I began as “${cleanSeed.slice(0, 72)}${cleanSeed.length > 72 ? '…' : ''}”`,
    createdAt: new Date().toISOString(),
  };
}

function treeMarkup(tone) {
  const creature = document.createElement('span');
  creature.className = `tree-creature tree-${tone}`;
  creature.setAttribute('aria-hidden', 'true');
  creature.innerHTML = '<i class="branch branch-left"></i><i class="branch branch-right"></i><span class="tree-crown"><b class="tree-eye left"></b><b class="tree-eye right"></b><em></em></span><span class="tree-trunk"></span>';
  return creature;
}

function makeGardenTree(idea, animate = false) {
  const button = document.createElement('button');
  button.className = `tree-idea tree-${SLOT_WORDS[idea.slot - 1]}${animate ? ' is-new' : ''}`;
  button.dataset.dynamicIdea = 'true';
  button.dataset.openIdea = '';
  button.dataset.ideaId = idea.id;
  button.setAttribute('aria-label', `Open ${idea.title}`);
  button.append(treeMarkup(idea.tone));
  const label = document.createElement('span');
  label.className = 'tree-label';
  const name = document.createElement('strong');
  name.textContent = idea.name;
  const title = document.createElement('small');
  title.textContent = idea.title.split(/\s+/).slice(0, 4).join(' ');
  label.append(name, title);
  button.append(label);
  return button;
}

function makePruneControl(idea) {
  const button = document.createElement('button');
  button.className = `prune-control prune-${SLOT_WORDS[idea.slot - 1]}`;
  button.dataset.pruneIdea = '';
  button.dataset.ideaId = idea.id;
  button.setAttribute('aria-label', `Prune ${idea.name} from the labyrinth`);
  button.innerHTML = '<span aria-hidden="true">✂</span><small>prune</small>';
  return button;
}

function makeSeedClearing(slot) {
  const button = document.createElement('button');
  button.className = `empty-grove seed-clearing grove-slot-${SLOT_WORDS[slot - 1]}`;
  button.dataset.dynamicSeed = 'true';
  button.dataset.newSeed = '';
  button.dataset.slot = String(slot);
  button.setAttribute('aria-label', `Plant a new seed in the ${SLOT_DIRECTIONS[slot - 1]} clearing`);
  button.innerHTML = '<i><b>+</b></i><span class="seed-clearing-label">plant a new seed</span>';
  return button;
}

function makeRosterIdea(idea) {
  const button = document.createElement('button');
  button.className = 'roster-idea';
  button.dataset.dynamicIdea = 'true';
  button.dataset.enterDojo = '';
  button.dataset.ideaId = idea.id;
  const creatureWrap = document.createElement('span');
  creatureWrap.className = 'roster-creature';
  creatureWrap.append(treeMarkup(idea.tone));
  const copy = document.createElement('span');
  copy.className = 'roster-copy';
  const status = document.createElement('small');
  status.textContent = 'newly planted';
  const name = document.createElement('strong');
  name.textContent = idea.name;
  const title = document.createElement('span');
  title.textContent = idea.title;
  const description = document.createElement('em');
  description.textContent = idea.description;
  copy.append(status, name, title, description);
  const arrow = document.createElement('span');
  arrow.className = 'roster-arrow';
  arrow.textContent = '↗';
  button.append(creatureWrap, copy, arrow);
  return button;
}

function registerPlantedIdeas(values, animateId = '') {
  plantedIdeas.forEach(({ id }) => delete ideas[id]);
  const bySlot = new Map();
  values.map(normalizePlantedIdea).filter(Boolean).forEach((idea) => bySlot.set(idea.slot, idea));
  plantedIdeas = [...bySlot.values()].sort((a, b) => a.slot - b.slot).slice(0, 7);
  plantedIdeas.forEach((idea) => { ideas[idea.id] = idea; });
  renderPlantedIdeas(animateId);
}

function renderPlantedIdeas(animateId = '') {
  $$('[data-dynamic-idea]').forEach((element) => element.remove());
  $$('[data-dynamic-seed]').forEach((element) => element.remove());
  $$('[data-prune-idea]').forEach((element) => element.remove());
  const maze = $('.labyrinth-map');
  const roster = $('.idea-roster');
  const prunedIds = new Set(prunedIdeas.map(({ id }) => id));
  $$('[data-static-idea]').forEach((element) => element.classList.toggle('hidden', prunedIds.has(element.dataset.ideaId)));
  const occupiedSlots = new Set(Object.values(ideas)
    .filter((idea) => !prunedIds.has(idea.id))
    .map(({ slot }) => slot));
  $$('[data-new-seed]').forEach((button) => button.classList.toggle('hidden', occupiedSlots.has(Number(button.dataset.slot))));
  GARDEN_SLOTS.filter((slot) => !occupiedSlots.has(slot) && !$(`[data-new-seed][data-slot="${slot}"]`))
    .forEach((slot) => maze.append(makeSeedClearing(slot)));
  plantedIdeas.forEach((idea) => {
    maze.append(makeGardenTree(idea, idea.id === animateId));
    roster.append(makeRosterIdea(idea));
  });
  Object.values(ideas).filter((idea) => !prunedIds.has(idea.id)).forEach((idea) => maze.append(makePruneControl(idea)));
  const total = Object.values(ideas).filter((idea) => !prunedIds.has(idea.id)).length;
  const openPlaces = 7 - total;
  $('#garden-count').textContent = `${total} of 7 ideas are growing`;
  $('#dojo-count').textContent = `${total} guests`;
  maze.setAttribute('aria-label', `A hedge labyrinth containing ${total} growing ideas and ${openPlaces} ${openPlaces === 1 ? 'place' : 'places'} to plant a new seed`);
}

async function saveIdeaToServer(idea) {
  try {
    await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
  } catch { /* Client storage remains the immediate offline fallback. */ }
}

async function pruneIdeaOnServer(idea) {
  try {
    await fetch(`/api/ideas/${encodeURIComponent(idea.id)}/prune`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
  } catch { /* The local archive remains the immediate offline fallback. */ }
}

async function hydrateIdeasFromServer() {
  try {
    const response = await fetch('/api/ideas');
    if (!response.ok) return;
    const payload = await response.json();
    const clientIdeas = [...plantedIdeas];
    const clientPrunedIdeas = [...prunedIdeas];
    const merged = new Map(payload.ideas?.map((idea) => [Number(idea.slot), idea]) || []);
    clientIdeas.forEach((idea) => merged.set(idea.slot, idea));
    const mergedPruned = new Map(payload.prunedIdeas?.map((idea) => [idea.id, idea]) || []);
    clientPrunedIdeas.forEach((idea) => mergedPruned.set(idea.id, idea));
    const activeById = new Map([...merged.values()].map((idea) => [idea.id, idea]));
    prunedIdeas = [...mergedPruned.values()].map(normalizePrunedIdea).filter((idea) => {
      const active = activeById.get(idea?.id);
      return idea && (!active || new Date(active.createdAt) <= new Date(idea.prunedAt));
    });
    const prunedIds = new Set(prunedIdeas.map(({ id }) => id));
    registerPlantedIdeas([...merged.values()].filter((idea) => !prunedIds.has(idea.id)));
    savePlantedIdeas();
    savePrunedIdeas();
    clientIdeas.filter((idea) => !prunedIds.has(idea.id)).forEach((idea) => { void saveIdeaToServer(idea); });
    clientPrunedIdeas.forEach((idea) => { void pruneIdeaOnServer(idea); });
  } catch { /* The garden still works from client storage in offline mode. */ }
}

function showView(view) {
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.viewPanel !== view));
  const activeNav = view === 'labyrinth' ? 'labyrinth' : 'dojo';
  $$('[data-nav]').forEach((link) => {
    const isActive = link.dataset.nav === activeNav;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior });
}

function stopEncounter() {
  dojoSessionId = null;
  clearTimeout(wanderTimer);
  clearInterval(qteTimer);
  clearInterval(speechTimer);
  arenaState = 'inactive';
  $('#grapple-qte').classList.add('hidden');
}

function initializeEmptyMat() {
  const scene = $('#arena-scene');
  if (!scene.offsetWidth) return;
  scene.classList.remove('is-aiming', 'is-launching', 'is-grappling', 'is-miss', 'qte-active', 'is-victory');
  placePlayer(scene.clientWidth * .24, scene.clientHeight * .64);
}

function renderDojoHome() {
  stopEncounter();
  activeIdea = null;
  currentScreen = 'dojo-home';
  const arena = $('#arena-view');
  arena.classList.add('is-empty');
  $('#arena-kicker').textContent = 'the mat is ready';
  $('#arena-idea-name').textContent = 'the dojo';
  $('#arena-scene').setAttribute('aria-label', 'An empty dojo mat waiting for an invited idea');
  $('#arena-scene').dataset.movement = 'disabled';
  $('#idea-speech').classList.remove('is-visible');
  showView('dojo');
  requestAnimationFrame(initializeEmptyMat);
}

function renderRoster() {
  stopEncounter();
  activeIdea = null;
  currentScreen = 'roster';
  showView('roster');
}

function renderLabyrinth() {
  stopEncounter();
  activeIdea = null;
  currentScreen = 'labyrinth';
  showView('labyrinth');
}

function navigateTo(path, { replace = false, preserveEscort = false } = {}) {
  if (!preserveEscort) {
    clearTimeout(pendingEscortTimer);
    pendingEscortTimer = null;
  }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  handleRoute();
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
  typeIdeaSpeech(line);
}

async function startDojoSession(idea = activeIdea) {
  if (!idea || currentScreen !== 'encounter') return;
  const requestedIdeaId = idea.id;
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
    if (currentScreen !== 'encounter' || activeIdea?.id !== requestedIdeaId) return;
    dojoSessionId = session.sessionId;
    updateDojo(session);
  } catch { /* The encounter remains playable when the dojo API is offline. */ }
}

function activateEncounter(idea) {
  stopEncounter();
  activeIdea = idea;
  currentScreen = 'encounter';
  $('#arena-view').classList.remove('is-empty');
  $('#arena-scene').setAttribute('aria-label', 'A playful dojo mat. Drag from the penguin toward the idea and release to launch.');
  $('#arena-scene').dataset.movement = 'enabled';
  setArenaIdea(idea);
  showView('dojo');
  requestAnimationFrame(initializeBout);
  void startDojoSession(idea);
}

async function takeMove(moveId) {
  if (!activeIdea || currentScreen !== 'encounter') return;
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
  } catch { /* Keep the local encounter moving when a dojo move cannot be saved. */ }
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

function initializeBout() {
  const scene = $('#arena-scene');
  if (!scene.offsetWidth || !activeIdea || currentScreen !== 'encounter') return;
  arenaState = 'idle';
  clearInterval(qteTimer);
  $('#grapple-qte').classList.add('hidden');
  scene.classList.remove('is-aiming', 'is-launching', 'is-grappling', 'is-miss', 'qte-active', 'is-victory');
  $('#arena-tree').classList.remove('is-taken-down');
  $('#aim-line').style.width = '0px';
  const saved = readSavedPositions()[activeIdea.id];
  scene.dataset.positionSource = saved ? 'saved' : 'default';
  placePlayer(scene.clientWidth * (saved?.player?.x ?? .22), scene.clientHeight * (saved?.player?.y ?? .62));
  placeIdea(scene.clientWidth * (saved?.idea?.x ?? .71), scene.clientHeight * (saved?.idea?.y ?? .47));
  scheduleIdeaWander();
}

function scheduleIdeaWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (currentScreen !== 'encounter') return;
    if (arenaState === 'idle' && !$('#arena-view').classList.contains('hidden')) wanderIdea();
    scheduleIdeaWander();
  }, 2700 + Math.random() * 2200);
}

function wanderIdea(farFromPlayer = false) {
  if (!activeIdea || currentScreen !== 'encounter') return;
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
  if (currentScreen !== 'encounter' || arenaState !== 'idle' || event.button > 0) return;
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
    if (currentScreen !== 'encounter') return;
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
  if (currentScreen !== 'encounter') return;
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
    typeIdeaSpeech('Too slow! Catch me again.');
    playBlip('fail');
    wanderIdea(true);
    setTimeout(() => { arenaState = 'idle'; }, 700);
  }
}

function handleRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/dojo') return renderDojoHome();
  if (path === '/dojo/ideas') return renderRoster();
  if (path === '/labyrinth') return renderLabyrinth();
  const encounterMatch = path.match(/^\/dojo\/([^/]+)$/);
  if (encounterMatch) {
    let ideaId = encounterMatch[1];
    try { ideaId = decodeURIComponent(ideaId); } catch { /* Treat malformed IDs as missing. */ }
    const ideaIsPruned = prunedIdeas.some(({ id }) => id === ideaId);
    if (ideas[ideaId] && !ideaIsPruned) return activateEncounter(ideas[ideaId]);
    window.history.replaceState({}, '', '/dojo/ideas');
    return renderRoster();
  }
  window.history.replaceState({}, '', '/');
  return renderDojoHome();
}

document.addEventListener('click', (event) => {
  const routeLink = event.target.closest('[data-route-to]');
  if (!routeLink || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(routeLink.dataset.routeTo);
});
$('#qte-button').addEventListener('click', pressGrapple);
$('#arena-scene').addEventListener('pointerdown', beginAim);
$('#arena-scene').addEventListener('pointermove', moveAim);
$('#arena-scene').addEventListener('pointerup', releaseAim);
$('#arena-scene').addEventListener('pointercancel', releaseAim);

const modal = $('#seed-modal');
const input = $('#seed-input');
const pruneModal = $('#prune-modal');

function openDialog(dialog, focusTarget) {
  lastFocusedElement = document.activeElement;
  dialog.classList.remove('hidden');
  requestAnimationFrame(() => focusTarget.focus());
}

function closeDialog(dialog) {
  if (dialog.classList.contains('hidden')) return;
  dialog.classList.add('hidden');
  if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
  lastFocusedElement = null;
}

document.addEventListener('click', (event) => {
  const pruneButton = event.target.closest('[data-prune-idea]');
  if (pruneButton) {
    activePruneIdea = ideas[pruneButton.dataset.ideaId];
    if (!activePruneIdea) return;
    $('#prune-name').textContent = activePruneIdea.name;
    $('#prune-title').textContent = activePruneIdea.title;
    openDialog(pruneModal, $('#cancel-prune'));
    return;
  }
  const seedButton = event.target.closest('[data-new-seed]');
  if (seedButton) {
    activePlantSlot = Number(seedButton.dataset.slot);
    openDialog(modal, input);
    return;
  }
  const ideaButton = event.target.closest('[data-open-idea], [data-enter-dojo]');
  if (ideaButton) navigateTo(`/dojo/${encodeURIComponent(ideaFromElement(ideaButton).id)}`);
});
$('#close-modal').addEventListener('click', () => closeDialog(modal));
modal.addEventListener('click', (event) => { if (event.target === modal) closeDialog(modal); });
function closePruneModal() {
  closeDialog(pruneModal);
  activePruneIdea = null;
}
$('#close-prune-modal').addEventListener('click', closePruneModal);
$('#cancel-prune').addEventListener('click', closePruneModal);
pruneModal.addEventListener('click', (event) => { if (event.target === pruneModal) closePruneModal(); });
$('#confirm-prune').addEventListener('click', () => {
  if (!activePruneIdea) return;
  const idea = { ...activePruneIdea, prunedAt: new Date().toISOString() };
  const slot = idea.slot;
  prunedIdeas = [...prunedIdeas.filter(({ id }) => id !== idea.id), idea];
  registerPlantedIdeas(plantedIdeas.filter(({ id }) => id !== idea.id));
  savePlantedIdeas();
  savePrunedIdeas();
  void pruneIdeaOnServer(idea);
  closePruneModal();
  requestAnimationFrame(() => $(`[data-new-seed][data-slot="${slot}"]`)?.focus());
});
input.addEventListener('input', () => { $('#character-count').textContent = `${input.value.length} / 240`; });
$('#plant-button').addEventListener('click', () => {
  const seed = input.value.trim();
  if (!seed) { input.focus(); return; }
  const occupied = new Set(Object.values(ideas)
    .filter((idea) => !prunedIdeas.some(({ id }) => id === idea.id))
    .map(({ slot }) => slot));
  const slot = [activePlantSlot, ...GARDEN_SLOTS].find((candidate) => GARDEN_SLOTS.includes(candidate) && !occupied.has(candidate));
  if (!slot) {
    $('#character-count').textContent = 'all seven plots are growing';
    return;
  }
  const idea = makeIdeaFromSeed(seed, slot);
  prunedIdeas = prunedIdeas.filter(({ id }) => id !== idea.id);
  registerPlantedIdeas([...plantedIdeas, idea], idea.id);
  savePlantedIdeas();
  savePrunedIdeas();
  void saveIdeaToServer(idea);
  closeDialog(modal);
  input.value = '';
  $('#character-count').textContent = '0 / 240';
  activePlantSlot = null;
  $('#labyrinth-status').textContent = `${idea.name} has taken root. Escorting it to the dojo.`;
  requestAnimationFrame(() => $(`[data-dynamic-idea][data-idea-id="${idea.id}"]`)?.focus());
  const escortDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1200;
  pendingEscortTimer = setTimeout(() => {
    pendingEscortTimer = null;
    navigateTo(`/dojo/${encodeURIComponent(idea.id)}`, { preserveEscort: true });
  }, escortDelay);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!modal.classList.contains('hidden')) closeDialog(modal);
    if (!pruneModal.classList.contains('hidden')) closePruneModal();
  }
  const openModal = [modal, pruneModal].find((dialog) => !dialog.classList.contains('hidden'));
  if (event.key === 'Tab' && openModal) {
    const focusable = $$('button, textarea, input, a[href]').filter((element) => openModal.contains(element) && !element.disabled && element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.target.matches('textarea, input')) return;
  if (event.key.toLowerCase() === 'x' && arenaState === 'qte') {
    event.preventDefault();
    pressGrapple();
  }
});
window.addEventListener('resize', () => {
  if (currentScreen === 'encounter') initializeBout();
  if (currentScreen === 'dojo-home') initializeEmptyMat();
});
window.addEventListener('popstate', () => {
  clearTimeout(pendingEscortTimer);
  pendingEscortTimer = null;
  handleRoute();
});

async function initializeApp() {
  prunedIdeas = readPrunedIdeas();
  registerPlantedIdeas(readPlantedIdeas());
  const isDirectEncounter = /^\/dojo\/[^/]+\/?$/.test(window.location.pathname) && window.location.pathname.replace(/\/+$/, '') !== '/dojo/ideas';
  if (!isDirectEncounter) handleRoute();
  await hydrateIdeasFromServer();
  handleRoute();
}

void initializeApp();
