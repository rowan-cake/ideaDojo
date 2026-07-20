import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { AuthError, GoogleAuthSessions } from "./google-auth.js";
import {
  beginEncounter,
  createDojoProgress,
  normalizePlayerMessage,
  resolveExchange,
} from "./dojo-loop.js";
import { normalizeIdea, normalizePrunedIdea, normalizeSessionIdea } from "./idea-data.js";
import {
  ambientDialogueReply,
  ambientIdeaReply,
  ideaDialogueInput,
  ideaEventInput,
  ideaInstructions,
  normalizeModelIdeaReply,
} from "./idea-voice.js";

const port = Number(process.env.PORT || 8787);
const sessions = new Map();
let persistQueue = Promise.resolve();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const ideasFile = process.env.IDEA_DOJO_DATA_FILE || path.join(serverDirectory, "data", "ideas.json");
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const apiKey = process.env.GEMINI_API_KEY;
const gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const auth = new GoogleAuthSessions({
  clientId: googleClientId,
  secureCookies: process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
});

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

async function modelIdeaReply(session, event) {
  const ambientReply = event.id === "dialogue"
    ? () => ambientDialogueReply(session, event)
    : () => ambientIdeaReply(session, event);
  if (!session.chat) return ambientReply();

  try {
    const response = await session.chat.sendMessage({
      message: event.id === "dialogue" ? ideaDialogueInput(session, event) : ideaEventInput(session, event),
    });
    const result = normalizeModelIdeaReply(JSON.parse(String(response.text || "{}")));
    return result || ambientReply();
  } catch (error) {
    console.warn("Gemini idea response failed; using ambient mode.", error instanceof Error ? error.message : error);
    return ambientReply();
  }
}

function serializeSession(session, extras = {}) {
  return {
    sessionId: session.id,
    idea: session.idea,
    turn: session.turn,
    state: session.state,
    ...session.progress,
    moves: Object.values(moves).map(({ id, label, effect }) => ({ id, label, effect })),
    ...extras,
  };
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/auth/config") {
    return sendJson(response, 200, {
      enabled: auth.configured,
      googleClientId: auth.configured ? googleClientId : null,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    return sendJson(response, 200, { user: auth.userForRequest(request) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/google") {
    try {
      const body = await readJson(request);
      const result = await auth.signIn(body.credential);
      response.setHeader("set-cookie", result.cookie);
      return sendJson(response, 200, { user: result.user });
    } catch (error) {
      const status = error instanceof AuthError ? error.status : 401;
      return sendJson(response, status, {
        error: error instanceof AuthError ? error.message : "Google sign-in could not be completed.",
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    response.setHeader("set-cookie", auth.signOut(request));
    return sendJson(response, 200, { user: null });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      mode: gemini ? "gemini" : "ambient",
      model: gemini ? model : null,
      googleAuth: auth.configured,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/ideas") {
    return sendJson(response, 200, { ideas: [...plantedIdeas.values()], prunedIdeas: [...prunedIdeas.values()] });
  }

  if (request.method === "POST" && url.pathname === "/api/ideas") {
    const body = await readJson(request);
    const idea = normalizeIdea(body.idea);
    if (!idea) return sendJson(response, 400, { error: "A planted idea needs a title of 1–60 characters, a seed of 1–240 characters, and an open clearing." });
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
    const idea = normalizeSessionIdea(body.idea);
    if (!idea) return sendJson(response, 400, { error: "A dojo idea needs a title of 1–60 characters and a seed of 1–240 characters." });
    const session = {
      id: randomUUID(),
      idea,
      turn: 0,
      moves: [],
      state: { wonder: 1, play: 0, stillness: 0, friction: 0 },
      progress: createDojoProgress(),
      messagePending: false,
      chat: gemini ? gemini.chats.create({
        model,
        config: {
          systemInstruction: ideaInstructions(idea),
          temperature: 1.1,
          maxOutputTokens: 180,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              endConversation: { type: "boolean" },
            },
            required: ["text", "endConversation"],
            additionalProperties: false,
          },
        },
      }) : null,
    };
    sessions.set(session.id, session);
    const reply = await modelIdeaReply(session, { id: "arrival", label: "arrival" });
    return sendJson(response, 201, serializeSession(session, {
      beat: "The mat is empty for a moment. Your idea arrives, looking around.",
      reply,
    }));
  }

  const moveMatch = url.pathname.match(/^\/api\/dojo\/sessions\/([^/]+)\/moves$/);
  if (request.method === "POST" && moveMatch) {
    const session = sessions.get(moveMatch[1]);
    if (!session) return sendJson(response, 404, { error: "This dojo session has gone quiet. Start a new one." });

    const body = await readJson(request);
    const move = moves[String(body.moveId || "").toLowerCase()];
    if (!move) return sendJson(response, 400, { error: "Choose circle, grapple, listen, or play." });
    if (session.progress.phase === "settled") return sendJson(response, 409, { error: "This idea has already settled on the mat." });
    if (session.progress.phase !== "chasing") return sendJson(response, 409, { error: "Finish this conversation before making another move." });

    session.turn += 1;
    session.moves.push(move);
    session.state[move.effect] += 1;
    if (move.id === "grapple") session.progress = beginEncounter(session.progress);
    const reply = await modelIdeaReply(session, move);

    return sendJson(response, 200, serializeSession(session, { beat: move.beat, reply }));
  }

  const messageMatch = url.pathname.match(/^\/api\/dojo\/sessions\/([^/]+)\/messages$/);
  if (request.method === "POST" && messageMatch) {
    const session = sessions.get(messageMatch[1]);
    if (!session) return sendJson(response, 404, { error: "This dojo session has gone quiet. Start a new one." });
    if (session.progress.phase === "settled") return sendJson(response, 409, { error: "This idea has already settled on the mat." });
    if (session.progress.phase !== "talking") return sendJson(response, 409, { error: "Catch the idea before speaking this closely." });
    if (session.messagePending) return sendJson(response, 409, { error: "The idea is still finding its words." });

    session.messagePending = true;
    try {
      const body = await readJson(request);
      const message = normalizePlayerMessage(body.message);
      if (!message) return sendJson(response, 400, { error: "Say something between 1 and 400 characters." });

      const exchange = session.progress.exchange + 1;
      const reply = await modelIdeaReply(session, { id: "dialogue", message, exchange });
      session.progress = resolveExchange(session.progress, reply.endConversation);
      return sendJson(response, 200, serializeSession(session, {
        reply: { source: reply.source, text: reply.text },
      }));
    } finally {
      session.messagePending = false;
    }
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
  console.log(`Idea Dojo API listening on http://127.0.0.1:${port} (${gemini ? "Gemini" : "ambient"} mode)`);
});
