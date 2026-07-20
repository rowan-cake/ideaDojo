# Idea Dojo

A quiet, playful home for unfinished ideas.

## Run locally

```bash
npm install
npm run dev
```

The app starts a Vite client and the local dojo API together. Visit `http://127.0.0.1:5173`.

## Application routes

- `/` and `/dojo` — the empty dojo mat
- `/dojo/ideas` — the roster of ideas ready to be invited
- `/dojo/:ideaId` — an active encounter with the selected idea
- `/labyrinth` — plant, visit, and prune ideas

Every visit to the application home begins with an empty mat. Planting requires a semantic title of up to 60 characters and an original seed of up to 240 characters, then briefly reveals the idea before escorting it into its first dojo encounter.

## Dojo backend sketch

The backend is intentionally play-first. It keeps each encounter in memory and exposes:

- `GET /api/ideas` — restore active user-planted ideas and the pruned archive
- `POST /api/ideas` — save a planted idea into any open labyrinth clearing
- `POST /api/ideas/:ideaId/prune` — clear an idea from the labyrinth while preserving it in the archive
- `POST /api/dojo/sessions` — open an encounter for an idea
- `POST /api/dojo/sessions/:sessionId/moves` — make a move: `circle`, `grapple`, `listen`, or `play`
- `POST /api/dojo/sessions/:sessionId/messages` — speak to a grappled idea during a clinch conversation
- `GET /api/health` — see whether the API is in ambient or Gemini mode

Each encounter gives its idea a distinct model-backed voice drawn from its semantic title and original seed. Catching an idea has an even chance of starting either a rapid tap-X grapple or a direct-control clinch; succeeding at either opens a 2–4 exchange conversation. The first two successful conversations end with the idea escaping back into the chase, while the third lets it settle peacefully on the mat. A dedicated Gemini chat remembers the full session even though the overlay shows only the current clinch.

The server owns the chase, talking, escape, and settled phases. Gemini returns structured `text` and `endConversation` fields, but the server guarantees at least two exchanges, forces an ending after four, and prevents messages outside the talking phase. The private prompt combines a master-creative perspective with the idea's own voice, using plain, seed-specific reflective questions across intention, tension, and smallest-experiment stages.

To enable the idea brain, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.5-flash` and can be overridden. The key is read only by the local server. Without credentials—or when a model request fails—the encounter stays playable with deterministic ambient idea responses.

## Google account connection

Idea Dojo includes an optional Google Identity Services sign-in foundation. It verifies Google's ID token on the server, discards that token, and creates a seven-day Idea Dojo session in an HTTP-only `SameSite=Lax` cookie. The app remains fully usable when Google sign-in is not configured.

To enable it:

1. In Google Cloud, configure the OAuth consent screen and create an OAuth client with the **Web application** type.
2. Add the local origins you actually use, normally `http://localhost:5173` and `http://127.0.0.1:5173`, to **Authorized JavaScript origins**.
3. Put the client ID—not a client secret—in `.env` as `GOOGLE_CLIENT_ID`.
4. Restart `npm run dev`. For production HTTPS, also set `AUTH_COOKIE_SECURE=true` and register the production origin in Google Cloud.

The current iteration authenticates identity but deliberately does not claim ownership of existing idea records. Sessions are held in server memory and reset when the API restarts. The next account phase should add durable users/sessions plus an `ownerId` on active and pruned ideas before requiring sign-in for persistence routes.

Planted and pruned ideas are cached in the browser for immediate offline feedback and persisted by the local API in `server/data/ideas.json`. Pruned records are retained for a future archive/restoration screen. Dojo encounter turns and account sessions remain in memory and reset whenever the API process restarts.
