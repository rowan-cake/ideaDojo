import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createD1Store } from "./d1-store.js";

async function withDatabase(run) {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  try {
    await run(await miniflare.getD1Database("DB"));
  } finally {
    await miniflare.dispose();
  }
}

const alpha = { ownerId: "alpha-owner", name: "Alpha", email: "alpha@example.com" };
const beta = { ownerId: "beta-owner", name: "Beta", email: "beta@example.com" };
const idea = {
  id: "private-seed",
  slot: 5,
  title: "A private seed",
  seed: "Only its owner should see this.",
  tone: "moss",
  quip: "What should this seed make possible?",
  createdAt: "2026-07-20T04:00:00.000Z",
};

test("D1 gardens are isolated by authenticated owner", async () => withDatabase(async (db) => {
  const alphaStore = createD1Store(db, alpha);
  const betaStore = createD1Store(db, beta);
  await alphaStore.saveIdea(idea);

  assert.deepEqual((await alphaStore.getGarden()).ideas.map(({ id }) => id), ["private-seed"]);
  assert.deepEqual((await betaStore.getGarden()).ideas, []);

  await betaStore.pruneIdea({ ...idea, prunedAt: "2026-07-20T05:00:00.000Z" });
  assert.deepEqual((await alphaStore.getGarden()).ideas.map(({ id }) => id), ["private-seed"]);
  assert.deepEqual((await betaStore.getGarden()).prunedIdeas.map(({ id }) => id), ["private-seed"]);
}));

test("D1 dojo sessions cannot be loaded or claimed by another owner", async () => withDatabase(async (db) => {
  const alphaStore = createD1Store(db, alpha);
  const betaStore = createD1Store(db, beta);
  const session = {
    id: "session-one",
    idea,
    turn: 0,
    moves: [],
    state: { wonder: 1 },
    progress: { phase: "talking", encounter: 1, exchange: 0, outcome: "continue" },
    history: [],
    messagePending: false,
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  await alphaStore.createSession(session);

  assert.equal((await alphaStore.getSession(session.id)).id, session.id);
  assert.equal(await betaStore.getSession(session.id), null);
  assert.equal(await alphaStore.claimMessage(session.id), true);
  assert.equal(await alphaStore.claimMessage(session.id), false);
  assert.equal(await betaStore.claimMessage(session.id), false);
}));
