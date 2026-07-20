import { GoogleGenAI } from "@google/genai";
import {
  beginEncounter,
  createDojoProgress,
  normalizePlayerMessage,
  resolveExchange,
} from "./dojo-loop.js";
import { createD1Store } from "./d1-store.js";
import { authenticatedUser, signInPath, signOutPath } from "./identity.js";
import { normalizeIdea, normalizePrunedIdea, normalizeSessionIdea } from "./idea-data.js";
import {
  ambientDialogueReply,
  ambientIdeaReply,
  ideaDialogueInput,
  ideaEventInput,
  ideaInstructions,
  normalizeModelIdeaReply,
} from "./idea-voice.js";

const SESSION_DURATION = 24 * 60 * 60 * 1000;
const moves = {
  circle: { id: "circle", label: "circle", effect: "wonder", beat: "You circle once. The idea turns its leaves toward you." },
  grapple: { id: "grapple", label: "grapple", effect: "friction", beat: "A soft grapple. Something resistant gives a little." },
  listen: { id: "listen", label: "listen", effect: "stillness", beat: "Neither of you moves. The room gets more interesting." },
  play: { id: "play", label: "play", effect: "play", beat: "You make a small, ridiculous move. The idea brightens." },
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 32_000) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  const text = await request.text();
  if (text.length > 32_000) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}

function assertSafeMutation(request, url) {
  if (request.method !== "POST") return;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    throw Object.assign(new Error("Cross-origin writes are not allowed."), { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Write requests must use application/json."), { status: 415 });
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

function modelContents(session, input) {
  return [
    ...session.history.slice(-24).map((entry) => ({ role: entry.role, parts: [{ text: entry.text }] })),
    { role: "user", parts: [{ text: input }] },
  ];
}

async function modelIdeaReply(env, session, event) {
  const ambientReply = event.id === "dialogue"
    ? () => ambientDialogueReply(session, event)
    : () => ambientIdeaReply(session, event);
  const input = event.id === "dialogue" ? ideaDialogueInput(session, event) : ideaEventInput(session, event);
  let reply;

  if (!env.GEMINI_API_KEY) {
    reply = ambientReply();
  } else {
    try {
      const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const response = await gemini.models.generateContent({
        model: env.GEMINI_MODEL || "gemini-3.5-flash",
        contents: modelContents(session, input),
        config: {
          systemInstruction: ideaInstructions(session.idea),
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
      });
      reply = normalizeModelIdeaReply(JSON.parse(String(response.text || "{}"))) || ambientReply();
    } catch (error) {
      console.warn("Gemini idea response failed; using ambient mode.", error instanceof Error ? error.message : error);
      reply = ambientReply();
    }
  }

  session.history.push(
    { role: "user", text: input },
    { role: "model", text: reply.text },
  );
  session.history = session.history.slice(-24);
  return reply;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  assertSafeMutation(request, url);
  const user = await authenticatedUser(request, env);

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    return json(200, {
      user: user ? { name: user.name, email: user.email } : null,
      signInPath: signInPath(url.searchParams.get("returnTo") || "/"),
      signOutPath: signOutPath("/"),
    });
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(200, { ok: true, storage: "d1", auth: "sign-in-with-chatgpt", model: env.GEMINI_API_KEY ? "gemini" : "ambient" });
  }
  if (!user) return json(401, { error: "Sign in with ChatGPT to continue.", signInPath: signInPath(url.pathname) });

  const store = createD1Store(env.DB, user);

  if (request.method === "GET" && url.pathname === "/api/ideas") {
    return json(200, await store.getGarden());
  }
  if (request.method === "POST" && url.pathname === "/api/ideas") {
    const body = await readJson(request);
    const idea = normalizeIdea(body.idea);
    if (!idea) return json(400, { error: "A planted idea needs a title of 1–60 characters, a seed of 1–240 characters, and an open clearing." });
    await store.saveIdea(idea);
    return json(201, { idea });
  }

  const pruneMatch = url.pathname.match(/^\/api\/ideas\/([^/]+)\/prune$/);
  if (request.method === "POST" && pruneMatch) {
    const ideaId = decodeURIComponent(pruneMatch[1]);
    const body = await readJson(request);
    const idea = normalizePrunedIdea(body.idea);
    if (!idea || idea.id !== ideaId) return json(404, { error: "That idea is not growing in your garden." });
    await store.pruneIdea(idea);
    return json(200, { idea });
  }

  if (request.method === "POST" && url.pathname === "/api/dojo/sessions") {
    const body = await readJson(request);
    const idea = normalizeSessionIdea(body.idea);
    if (!idea) return json(400, { error: "A dojo idea needs a title of 1–60 characters and a seed of 1–240 characters." });
    const session = {
      id: crypto.randomUUID(),
      idea,
      turn: 0,
      moves: [],
      state: { wonder: 1, play: 0, stillness: 0, friction: 0 },
      progress: createDojoProgress(),
      history: [],
      messagePending: false,
      expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
    };
    const reply = await modelIdeaReply(env, session, { id: "arrival", label: "arrival" });
    await store.createSession(session);
    return json(201, serializeSession(session, {
      beat: "The mat is empty for a moment. Your idea arrives, looking around.",
      reply,
    }));
  }

  const moveMatch = url.pathname.match(/^\/api\/dojo\/sessions\/([^/]+)\/moves$/);
  if (request.method === "POST" && moveMatch) {
    const session = await store.getSession(moveMatch[1]);
    if (!session) return json(404, { error: "This dojo session has gone quiet. Start a new one." });
    const body = await readJson(request);
    const move = moves[String(body.moveId || "").toLowerCase()];
    if (!move) return json(400, { error: "Choose circle, grapple, listen, or play." });
    if (session.progress.phase === "settled") return json(409, { error: "This idea has already settled on the mat." });
    if (session.progress.phase !== "chasing") return json(409, { error: "Finish this conversation before making another move." });
    session.turn += 1;
    session.moves.push(move);
    session.state[move.effect] += 1;
    if (move.id === "grapple") session.progress = beginEncounter(session.progress);
    const reply = await modelIdeaReply(env, session, move);
    await store.updateSession(session);
    return json(200, serializeSession(session, { beat: move.beat, reply }));
  }

  const messageMatch = url.pathname.match(/^\/api\/dojo\/sessions\/([^/]+)\/messages$/);
  if (request.method === "POST" && messageMatch) {
    const session = await store.getSession(messageMatch[1]);
    if (!session) return json(404, { error: "This dojo session has gone quiet. Start a new one." });
    if (session.progress.phase === "settled") return json(409, { error: "This idea has already settled on the mat." });
    if (session.progress.phase !== "talking") return json(409, { error: "Catch the idea before speaking this closely." });
    if (!await store.claimMessage(session.id)) return json(409, { error: "The idea is still finding its words." });
    try {
      const body = await readJson(request);
      const message = normalizePlayerMessage(body.message);
      if (!message) return json(400, { error: "Say something between 1 and 400 characters." });
      const exchange = session.progress.exchange + 1;
      const reply = await modelIdeaReply(env, session, { id: "dialogue", message, exchange });
      session.progress = resolveExchange(session.progress, reply.endConversation);
      session.messagePending = false;
      await store.appendDialogue(session, message, reply.text, exchange);
      await store.updateSession(session);
      return json(200, serializeSession(session, { reply: { source: reply.source, text: reply.text } }));
    } finally {
      await store.releaseMessage(session.id);
    }
  }

  return json(404, { error: "Not found." });
}

export default {
  async fetch(request, env) {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      const status = Number(error?.status || 500);
      return json(status, {
        error: error?.status && error instanceof Error ? error.message : "Unable to complete that request.",
      });
    }
  },
};
