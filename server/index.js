import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const port = Number(process.env.PORT || 8787);
const sessions = new Map();
let persistQueue = Promise.resolve();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const ideasFile = process.env.IDEA_DOJO_DATA_FILE || path.join(serverDirectory, "data", "ideas.json");
const model = process.env.OPENAI_MODEL;
const client = process.env.OPENAI_API_KEY && model ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function normalizeIdea(value) {
  const slot = Number(value?.slot);
  if (![1, 2, 3, 4, 5, 6, 7].includes(slot) || !value?.id || !value?.seed) return null;
  return {
    id: String(value.id).slice(0, 80),
    slot,
    name: String(value.name || "sprout").slice(0, 24),
    title: String(value.title || value.seed).slice(0, 120),
    seed: String(value.seed).slice(0, 240),
    description: String(value.description || value.seed).slice(0, 300),
    tone: ["lilac", "ochre", "moss", "blue"].includes(value.tone) ? value.tone : "moss",
    quip: String(value.quip || "I am still becoming. What do you notice?").slice(0, 140),
    createdAt: String(value.createdAt || new Date().toISOString()),
  };
}

function normalizePrunedIdea(value) {
  const idea = normalizeIdea(value);
  return idea ? { ...idea, prunedAt: String(value.prunedAt || new Date().toISOString()) } : null;
}

async function loadIdeas() {
  try {
    const stored = JSON.parse(await readFile(ideasFile, "utf8"));
    const activeValues = Array.isArray(stored) ? stored : stored.active;
    const prunedValues = Array.isArray(stored) ? [] : stored.pruned;
    const active = new Map();
    const pruned = new Map();
    (activeValues || []).map(normalizeIdea).filter(Boolean).forEach((idea) => active.set(idea.slot, idea));
    (prunedValues || []).map(normalizePrunedIdea).filter(Boolean).forEach((idea) => pruned.set(idea.id, idea));
    return { active, pruned };
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Unable to load planted ideas.", error.message);
    return { active: new Map(), pruned: new Map() };
  }
}

const { active: plantedIdeas, pruned: prunedIdeas } = await loadIdeas();

function persistIdeas() {
  const garden = { active: [...plantedIdeas.values()], pruned: [...prunedIdeas.values()] };
  persistQueue = persistQueue.catch(() => {}).then(async () => {
    await mkdir(path.dirname(ideasFile), { recursive: true });
    const temporaryFile = `${ideasFile}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(garden, null, 2)}\n`, "utf8");
    await rename(temporaryFile, ideasFile);
  });
  return persistQueue;
}

const senseis = [
  { id: "gardener", name: "The Gardener", quality: "notices what needs patience" },
  { id: "trickster", name: "The Trickster", quality: "finds the delightfully sideways move" },
  { id: "witness", name: "The Witness", quality: "pays attention without trying to fix" },
  { id: "maker", name: "The Maker", quality: "turns play into a small experiment" },
];

const moves = {
  circle: { id: "circle", label: "circle", effect: "wonder", beat: "You circle once. The idea turns its leaves toward you." },
  grapple: { id: "grapple", label: "grapple", effect: "friction", beat: "A soft grapple. Something resistant gives a little." },
  listen: { id: "listen", label: "listen", effect: "stillness", beat: "Neither of you moves. The room gets more interesting." },
  play: { id: "play", label: "play", effect: "play", beat: "You make a small, ridiculous move. The idea brightens." },
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 32_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function chooseSensei(session) {
  return senseis[(session.turn + session.idea.id.length) % senseis.length];
}

function ambientNudge(session, move, sensei) {
  const responses = {
    circle: "What part of this becomes more alive when you stop looking straight at it?",
    grapple: "Where is the interesting resistance: in the idea, or in the picture you have of it?",
    listen: "If this idea had no obligation to become useful, what would it do for the next five minutes?",
    play: "Make the version that would make a child laugh before you make the version that makes sense.",
  };

  return {
    source: "ambient",
    sensei: sensei.name,
    text: responses[move.id],
  };
}

async function modelNudge(session, move, sensei) {
  if (!client) return ambientNudge(session, move, sensei);

  try {
    const response = await client.responses.create({
      model,
      instructions: [
        "You are a quiet creative sensei inside a playful idea dojo.",
        "Do not optimize, plan, prescribe, or turn this into productivity advice.",
        "Offer one short, surprising question or invitation (maximum 32 words).",
        "Write plainly, warmly, and leave space for the user to play.",
      ].join(" "),
      input: `Sensei: ${sensei.name}, who ${sensei.quality}.\nIdea: ${session.idea.title}\nSeed: ${session.idea.seed}\nMove: ${move.label}\nRecent moves: ${session.moves.slice(-3).map(({ label }) => label).join(", ") || "none"}`,
    });

    return {
      source: "openai",
      sensei: sensei.name,
      text: response.output_text.trim() || ambientNudge(session, move, sensei).text,
    };
  } catch (error) {
    console.warn("Dojo model nudge failed; using ambient mode.", error instanceof Error ? error.message : error);
    return ambientNudge(session, move, sensei);
  }
}

function serializeSession(session, extras = {}) {
  return {
    sessionId: session.id,
    idea: session.idea,
    turn: session.turn,
    state: session.state,
    moves: Object.values(moves).map(({ id, label, effect }) => ({ id, label, effect })),
    ...extras,
  };
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, mode: client ? "openai" : "ambient" });
  }

  if (request.method === "GET" && url.pathname === "/api/dojo/senseis") {
    return sendJson(response, 200, { senseis });
  }

  if (request.method === "GET" && url.pathname === "/api/ideas") {
    return sendJson(response, 200, { ideas: [...plantedIdeas.values()], prunedIdeas: [...prunedIdeas.values()] });
  }

  if (request.method === "POST" && url.pathname === "/api/ideas") {
    const body = await readJson(request);
    const idea = normalizeIdea(body.idea);
    if (!idea) return sendJson(response, 400, { error: "A planted idea needs a seed and an open clearing." });
    const occupant = plantedIdeas.get(idea.slot);
    if (occupant && occupant.id !== idea.id) return sendJson(response, 409, { error: "That clearing is already growing an idea." });
    prunedIdeas.delete(idea.id);
    plantedIdeas.set(idea.slot, idea);
    await persistIdeas();
    return sendJson(response, occupant ? 200 : 201, { idea });
  }

  const pruneMatch = url.pathname.match(/^\/api\/ideas\/([^/]+)\/prune$/);
  if (request.method === "POST" && pruneMatch) {
    const ideaId = decodeURIComponent(pruneMatch[1]);
    const body = await readJson(request);
    const plantedIdea = [...plantedIdeas.values()].find(({ id }) => id === ideaId);
    const idea = plantedIdea || normalizeIdea(body.idea);
    if (!idea || idea.id !== ideaId) return sendJson(response, 404, { error: "That idea is not growing in this garden." });
    if (plantedIdea) plantedIdeas.delete(plantedIdea.slot);
    const prunedIdea = normalizePrunedIdea({ ...idea, prunedAt: body.idea?.prunedAt });
    prunedIdeas.set(prunedIdea.id, prunedIdea);
    await persistIdeas();
    return sendJson(response, 200, { idea: prunedIdea });
  }

  if (request.method === "POST" && url.pathname === "/api/dojo/sessions") {
    const body = await readJson(request);
    const idea = {
      id: String(body.idea?.id || "idea-seed"),
      title: String(body.idea?.title || "an unfinished thought").slice(0, 120),
      seed: String(body.idea?.seed || "Something is beginning to stir.").slice(0, 800),
    };
    const session = {
      id: randomUUID(),
      idea,
      turn: 0,
      moves: [],
      state: { wonder: 1, play: 0, stillness: 0, friction: 0 },
    };
    sessions.set(session.id, session);
    return sendJson(response, 201, serializeSession(session, {
      beat: "The mat is empty for a moment. Your idea arrives, looking around.",
      nudge: null,
    }));
  }

  const moveMatch = url.pathname.match(/^\/api\/dojo\/sessions\/([^/]+)\/moves$/);
  if (request.method === "POST" && moveMatch) {
    const session = sessions.get(moveMatch[1]);
    if (!session) return sendJson(response, 404, { error: "This dojo session has gone quiet. Start a new one." });

    const body = await readJson(request);
    const move = moves[String(body.moveId || "").toLowerCase()];
    if (!move) return sendJson(response, 400, { error: "Choose circle, grapple, listen, or play." });

    session.turn += 1;
    session.moves.push(move);
    session.state[move.effect] += 1;
    const shouldNudge = move.id === "listen" || move.id === "play" || session.turn % 3 === 0;
    const sensei = chooseSensei(session);
    const nudge = shouldNudge ? await modelNudge(session, move, sensei) : null;

    return sendJson(response, 200, serializeSession(session, { beat: move.beat, nudge }));
  }

  return sendJson(response, 404, { error: "Not found." });
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to read that move." });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Idea Dojo API listening on http://127.0.0.1:${port} (${client ? "OpenAI" : "ambient"} mode)`);
});
