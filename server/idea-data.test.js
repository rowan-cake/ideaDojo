import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIdea, normalizeSessionIdea, SEED_LIMIT, TITLE_LIMIT } from "./idea-data.js";

const validIdea = {
  id: "community-radio",
  slot: 5,
  name: "legacy-fantasy-name",
  title: "Neighborhood Story Radio",
  seed: "A weekly radio hour where neighbors record and share one local story.",
  tone: "ochre",
};

test("semantic title is the canonical title and legacy name", () => {
  const idea = normalizeIdea(validIdea);
  assert.equal(idea.title, validIdea.title);
  assert.equal(idea.name, validIdea.title);
  assert.equal(idea.seed, validIdea.seed);
  assert.equal(idea.description, validIdea.seed);
});

test("planting requires independently valid title and seed fields", () => {
  assert.equal(normalizeIdea({ ...validIdea, title: "" }), null);
  assert.equal(normalizeIdea({ ...validIdea, seed: "" }), null);
  assert.equal(normalizeIdea({ ...validIdea, title: "x".repeat(TITLE_LIMIT + 1) }), null);
  assert.equal(normalizeIdea({ ...validIdea, seed: "x".repeat(SEED_LIMIT + 1) }), null);
  assert.ok(normalizeIdea({ ...validIdea, title: "x".repeat(TITLE_LIMIT), seed: "x".repeat(SEED_LIMIT) }));
});

test("dojo sessions enforce the same title and seed limits", () => {
  assert.equal(normalizeSessionIdea({ title: "", seed: validIdea.seed }), null);
  assert.equal(normalizeSessionIdea({ title: validIdea.title, seed: "x".repeat(SEED_LIMIT + 1) }), null);
  assert.deepEqual(
    normalizeSessionIdea(validIdea),
    {
      id: validIdea.id,
      name: validIdea.title,
      title: validIdea.title,
      seed: validIdea.seed,
      description: validIdea.seed,
      tone: validIdea.tone,
      quip: `What do you most want ${validIdea.title} to make possible?`,
    },
  );
});
