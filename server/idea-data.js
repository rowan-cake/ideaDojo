export const TITLE_LIMIT = 60;
export const SEED_LIMIT = 240;
const GARDEN_SLOTS = [1, 2, 3, 4, 5, 6, 7];
const TONES = ["lilac", "ochre", "moss", "blue"];

export function cleanRequiredText(value, maximum) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean && clean.length <= maximum ? clean : null;
}

export function normalizeIdea(value) {
  const slot = Number(value?.slot);
  const title = cleanRequiredText(value?.title, TITLE_LIMIT);
  const seed = cleanRequiredText(value?.seed, SEED_LIMIT);
  if (!GARDEN_SLOTS.includes(slot) || !value?.id || !title || !seed) return null;

  return {
    id: String(value.id).slice(0, 80),
    slot,
    name: title,
    title,
    seed,
    description: seed,
    tone: TONES.includes(value.tone) ? value.tone : "moss",
    quip: String(value.quip || `What do you most want ${title} to make possible?`).slice(0, 140),
    createdAt: String(value.createdAt || new Date().toISOString()),
  };
}

export function normalizePrunedIdea(value) {
  const idea = normalizeIdea(value);
  return idea ? { ...idea, prunedAt: String(value.prunedAt || new Date().toISOString()) } : null;
}

export function normalizeSessionIdea(value) {
  const title = cleanRequiredText(value?.title, TITLE_LIMIT);
  const seed = cleanRequiredText(value?.seed, SEED_LIMIT);
  if (!title || !seed) return null;

  return {
    id: String(value?.id || "idea-seed").slice(0, 80),
    name: title,
    title,
    seed,
    description: seed,
    tone: TONES.includes(value?.tone) ? value.tone : "moss",
    quip: String(value?.quip || `What do you most want ${title} to make possible?`).slice(0, 140),
  };
}
