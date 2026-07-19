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

Every visit to the application home begins with an empty mat. Planting a new idea in the labyrinth briefly reveals its character before escorting it into its first dojo encounter.

## Dojo backend sketch

The backend is intentionally play-first. It keeps each encounter in memory and exposes:

- `GET /api/ideas` — restore active user-planted ideas and the pruned archive
- `POST /api/ideas` — save a planted idea into any open labyrinth clearing
- `POST /api/ideas/:ideaId/prune` — clear an idea from the labyrinth while preserving it in the archive
- `POST /api/dojo/sessions` — open an encounter for an idea
- `POST /api/dojo/sessions/:sessionId/moves` — make a move: `circle`, `grapple`, `listen`, or `play`
- `GET /api/dojo/senseis` — list the available perspective characters
- `GET /api/health` — see whether the API is in ambient or OpenAI mode

Without credentials, the API uses a deterministic ambient response set. To enable occasional model nudges, copy `.env.example` to `.env` and set both `OPENAI_API_KEY` and `OPENAI_MODEL`. The model is asked only on selected moves or every third turn, so the dojo remains a game rather than a chatbot.

Planted and pruned ideas are cached in the browser for immediate offline feedback and persisted by the local API in `server/data/ideas.json`. Pruned records are retained for a future archive/restoration screen. Dojo encounter turns remain in memory and reset whenever the API process restarts.
