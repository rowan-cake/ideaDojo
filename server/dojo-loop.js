export const MAX_ENCOUNTERS = 3;
export const MIN_EXCHANGES = 2;
export const MAX_EXCHANGES = 4;
export const AMBIENT_END_EXCHANGE = 3;

export function createDojoProgress() {
  return { phase: "chasing", encounter: 0, exchange: 0, outcome: "continue" };
}

export function beginEncounter(progress) {
  if (progress.phase !== "chasing") throw new Error("The idea is not ready for another grapple.");
  if (progress.encounter >= MAX_ENCOUNTERS) throw new Error("This practice has already settled.");
  return {
    phase: "talking",
    encounter: progress.encounter + 1,
    exchange: 0,
    outcome: "continue",
  };
}

export function resolveExchange(progress, modelWantsToEnd = false) {
  if (progress.phase !== "talking") throw new Error("The idea is not in conversation right now.");
  const exchange = progress.exchange + 1;
  const mayEnd = exchange >= MIN_EXCHANGES;
  const mustEnd = exchange >= MAX_EXCHANGES;
  const endsNow = mustEnd || (mayEnd && modelWantsToEnd);

  if (!endsNow) return { ...progress, exchange, outcome: "continue" };
  if (progress.encounter >= MAX_ENCOUNTERS) {
    return { phase: "settled", encounter: progress.encounter, exchange, outcome: "settled" };
  }
  return { phase: "chasing", encounter: progress.encounter, exchange, outcome: "escape" };
}

export function normalizePlayerMessage(value) {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message && message.length <= 400 ? message : null;
}
