# Idea Dojo

A quiet, playful home for unfinished ideas.

## Run locally

```bash
npm install
npm run dev
```

The app starts a Vite client and the local dojo API together. Visit `http://127.0.0.1:5173`.

## Dojo backend sketch

The backend is intentionally play-first. It keeps each encounter in memory and exposes:

- `POST /api/dojo/sessions` — open an encounter for an idea
- `POST /api/dojo/sessions/:sessionId/moves` — make a move: `circle`, `grapple`, `listen`, or `play`
- `GET /api/dojo/senseis` — list the available perspective characters
- `GET /api/health` — see whether the API is in ambient or OpenAI mode

Without credentials, the API uses a deterministic ambient response set. To enable occasional model nudges, copy `.env.example` to `.env` and set both `OPENAI_API_KEY` and `OPENAI_MODEL`. The model is asked only on selected moves or every third turn, so the dojo remains a game rather than a chatbot.
...
