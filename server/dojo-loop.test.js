import test from "node:test";
import assert from "node:assert/strict";
import {
  beginEncounter,
  createDojoProgress,
  normalizePlayerMessage,
  resolveExchange,
} from "./dojo-loop.js";

test("a successful grapple opens the first conversation", () => {
  assert.deepEqual(beginEncounter(createDojoProgress()), {
    phase: "talking",
    encounter: 1,
    exchange: 0,
    outcome: "continue",
  });
});

test("the model cannot end a conversation before two exchanges", () => {
  const talking = beginEncounter(createDojoProgress());
  assert.deepEqual(resolveExchange(talking, true), { ...talking, exchange: 1 });
});

test("the model may end from exchange two and the idea escapes", () => {
  const talking = { ...beginEncounter(createDojoProgress()), exchange: 1 };
  assert.deepEqual(resolveExchange(talking, true), {
    phase: "chasing",
    encounter: 1,
    exchange: 2,
    outcome: "escape",
  });
});

test("the fourth exchange forces an escape when the model keeps talking", () => {
  const talking = { ...beginEncounter(createDojoProgress()), exchange: 3 };
  assert.equal(resolveExchange(talking, false).outcome, "escape");
});

test("only the third encounter settles the idea", () => {
  const third = { phase: "talking", encounter: 3, exchange: 1, outcome: "continue" };
  assert.deepEqual(resolveExchange(third, true), {
    phase: "settled",
    encounter: 3,
    exchange: 2,
    outcome: "settled",
  });
});

test("messages are trimmed and constrained to 400 characters", () => {
  assert.equal(normalizePlayerMessage("  hello, idea  "), "hello, idea");
  assert.equal(normalizePlayerMessage(" "), null);
  assert.equal(normalizePlayerMessage("x".repeat(401)), null);
  assert.equal(normalizePlayerMessage({ message: "no" }), null);
});

test("invalid phase transitions are rejected", () => {
  assert.throws(() => beginEncounter({ phase: "talking", encounter: 1 }), /not ready/);
  assert.throws(() => resolveExchange(createDojoProgress(), false), /not in conversation/);
});
