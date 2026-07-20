import test from "node:test";
import assert from "node:assert/strict";
import {
  ambientDialogueReply,
  ambientIdeaReply,
  encounterFocus,
  ideaDialogueInput,
  ideaInstructions,
  normalizeModelIdeaReply,
} from "./idea-voice.js";

const idea = {
  title: "Neighborhood Story Radio",
  seed: "A weekly radio hour where neighbors record and share one local story.",
  quip: "What should neighbors hear?",
};

function session(encounter = 1) {
  return {
    idea,
    progress: { encounter, exchange: 0, phase: "talking", outcome: "continue" },
    moves: [],
  };
}

test("the private voice prompt combines the requested persona with the specific idea", () => {
  const prompt = ideaInstructions(idea);
  assert.match(prompt, /You are Rick Rubin, a master creative/);
  assert.match(prompt, /never name Rick Rubin/);
  assert.match(prompt, new RegExp(idea.title));
  assert.match(prompt, new RegExp(idea.seed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /plain, direct language/);
  assert.match(prompt, /never ask more than one question/);
});

test("each encounter has a distinct reflective purpose", () => {
  assert.match(encounterFocus(1), /make possible/);
  assert.match(encounterFocus(2), /assumption, tension, audience question/);
  assert.match(encounterFocus(3), /smallest useful experiment/);
});

test("dialogue input includes the seed, stage, and the player's latest answer", () => {
  const first = ideaDialogueInput(session(1), { exchange: 1, message: "I want shy neighbors to feel heard." });
  const second = ideaDialogueInput(session(2), { exchange: 2, message: "I assume people will submit recordings." });
  const third = ideaDialogueInput(session(3), { exchange: 3, message: "I could interview one person this Friday." });
  assert.match(first, /Original seed: A weekly radio hour/);
  assert.match(first, /shy neighbors to feel heard/);
  assert.match(first, /make possible/);
  assert.match(second, /assumption, tension, audience question/);
  assert.match(second, /people will submit recordings/);
  assert.match(third, /smallest useful experiment/);
  assert.match(third, /one person this Friday/);
});

test("ambient fallback follows the same seed-specific three-stage arc", () => {
  const opening = ambientIdeaReply(session(1), { id: "arrival" });
  const intent = ambientIdeaReply(session(1), { id: "grapple" });
  const tension = ambientIdeaReply(session(2), { id: "grapple" });
  const experiment = ambientIdeaReply(session(3), { id: "grapple" });
  assert.match(opening.text, /weekly radio hour/);
  assert.match(intent.text, /make possible/);
  assert.match(tension.text, /assumption/);
  assert.match(experiment.text, /smallest useful version/);

  const response = ambientDialogueReply(session(2), { exchange: 1, message: "Teachers will send every recording." });
  assert.match(response.text, /Teachers will send every recording/);
  assert.equal(response.endConversation, false);
  assert.equal(ambientDialogueReply(session(2), { exchange: 3, message: "We can ask them." }).endConversation, true);
});

test("model reply validation rejects malformed output and multiple questions", () => {
  assert.equal(normalizeModelIdeaReply({ text: "One? Two?", endConversation: false }), null);
  assert.equal(normalizeModelIdeaReply({ text: "One useful question?", endConversation: "false" }), null);
  assert.deepEqual(
    normalizeModelIdeaReply({ text: "  What would one neighbor want to hear?  ", endConversation: false }),
    { source: "gemini", text: "What would one neighbor want to hear?", endConversation: false },
  );
});
