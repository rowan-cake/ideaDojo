# Idea Dojo

A quiet, playful home for unfinished ideas.

## Run locally

```bash
npm install
npm run dev
```

The app runs as a Cloudflare Worker with local D1 storage. For local development, set `LOCAL_DEV_USER_EMAIL` to a test email before starting Vite, then visit `http://127.0.0.1:5173`.

## Application routes

- `/` and `/dojo` — the empty dojo mat
- `/dojo/ideas` — the roster of ideas ready to be invited
- `/dojo/:ideaId` — an active encounter with the selected idea
- `/labyrinth` — plant, visit, and prune ideas

Every visit to the application home begins with an empty mat. Planting requires a semantic title of up to 60 characters and an original seed of up to 240 characters, then briefly reveals the idea before escorting it into its first dojo encounter.

## Private Sites backend

Idea Dojo is prepared for a private Sites deployment using D1 and Sign in with ChatGPT. Every database query is scoped to a SHA-256 owner key derived server-side from the authenticated Sites identity header. User emails are not stored in idea or dojo records.

The Worker exposes:

- `GET /api/ideas` — restore active user-planted ideas and the pruned archive
- `POST /api/ideas` — save a planted idea into any open labyrinth clearing
- `POST /api/ideas/:ideaId/prune` — clear an idea from the labyrinth while preserving it in the archive
- `POST /api/dojo/sessions` — open an encounter for an idea
- `POST /api/dojo/sessions/:sessionId/moves` — make a move: `circle`, `grapple`, `listen`, or `play`
- `POST /api/dojo/sessions/:sessionId/messages` — speak to a grappled idea during a clinch conversation
- `GET /api/health` — see whether the API is in ambient or Gemini mode

Each encounter gives its idea a distinct model-backed voice drawn from its semantic title and original seed. Catching an idea has an even chance of starting either a rapid tap-X grapple or a direct-control clinch; succeeding at either opens a 2–4 exchange conversation. The first two successful conversations end with the idea escaping back into the chase, while the third lets it settle peacefully on the mat. D1 keeps the private model history and dojo state durable even if the Worker restarts.

The server owns the chase, talking, escape, and settled phases. Gemini returns structured `text` and `endConversation` fields, but the server guarantees at least two exchanges, forces an ending after four, and prevents messages outside the talking phase. The private prompt combines a master-creative perspective with the idea's own voice, using plain, seed-specific reflective questions across intention, tension, and smallest-experiment stages.

To enable the idea brain locally, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.5-flash` and can be overridden. The key is available only to the Worker. Without credentials—or when a model request fails—the encounter stays playable with deterministic ambient idea responses.

## Authentication and ownership

Sites owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, OAuth cookies, and identity-header injection. Idea Dojo never handles ChatGPT passwords or OAuth tokens. Every persistence and dojo API endpoint checks the authenticated identity on the server.

Persistent D1 tables are defined in `db/schema.ts` and generated migrations are stored in `drizzle/`:

- `profiles` records the current display name under a private owner key.
- `ideas` keeps active and pruned ideas separated by owner.
- `dojo_sessions` keeps authoritative encounter state and private model history.
- `dojo_messages` keeps user/idea exchanges associated with the owning session.

Browser storage is limited to device-local arena position and one-time cleanup markers. It is not authoritative for ideas, pruning, accounts, or dojo conversations.

## Sites deployment

`.openai/hosting.json` declares the logical `DB` binding. Sites provisions the real D1 database, applies the packaged migration, stores runtime secrets, and controls whether the deployment is owner-only, shared with selected workspace members, or public. Production secrets must be configured through Sites rather than committed to `.env`.
