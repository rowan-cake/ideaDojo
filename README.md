# Idea Dojo

Idea Dojo is a quiet, playful practice for developing unfinished creative ideas. Instead of treating an idea as a task to complete or an opponent to defeat, the app gives it a living form that can be planted, chased, wrestled with, questioned, and eventually allowed to settle.

- **Live demo:** [idea-dojo-private-alpha.cakerowan.chatgpt.site](https://idea-dojo-private-alpha.cakerowan.chatgpt.site)
- **Demo video:** [Idea Dojo — OpenAI Build Week 2026](https://youtu.be/wE5Ewevj1Sc)
- **OpenAI Build Week category:** Apps for Your Life

## What it does

1. Plant a seed with a semantic title and up to 240 characters of context.
2. Find the idea in the labyrinth and invite it onto the dojo mat.
3. Chase it with drag, aim, and release controls.
4. Enter one of two grapple styles: rapid tap-X or a direct-control clinch.
5. After a successful grapple, talk with the embodied idea through a short reflective conversation.
6. Repeat the encounter. The idea escapes after the first two conversations and settles peacefully after the third.

The dialogue follows a three-stage creative arc: clarify what the idea wants to make possible, surface its tensions and assumptions, and identify its smallest useful next experiment. Gemini may end a conversation naturally after two exchanges, while the server guarantees that it ends by the fourth.

## Judge walkthrough

The hosted demo is the fastest way to test Idea Dojo without rebuilding it:

1. Open the [live demo](https://idea-dojo-private-alpha.cakerowan.chatgpt.site).
2. Sign in with ChatGPT so Sites can provide a private user identity.
3. Open **the labyrinth**, choose an empty clearing, and plant a titled seed.
4. Escort the new idea to the dojo and use drag, aim, and release to catch it.
5. Complete the selected grapple and respond to the idea's reflective questions.
6. Return to the roster or labyrinth to confirm that the planted idea persists.

Each judge receives isolated idea and dojo records. One signed-in visitor cannot read or modify another visitor's data.

## Run locally

Requirements:

- Node.js 20 or newer
- npm

Install and configure the project:

```bash
npm install
cp .env.example .env
```

Set `LOCAL_DEV_USER_EMAIL` in `.env` to any test email. To enable model-backed dialogue, also set `GEMINI_API_KEY`; leaving it blank uses deterministic ambient responses instead.

```bash
npm run dev
```

Visit `http://127.0.0.1:5173`. Local development uses a Cloudflare Worker runtime and local D1 storage.

Validation commands:

```bash
npm test
npm run build
```

## Application routes

- `/` and `/dojo` — begin on an intentionally empty dojo mat
- `/dojo/ideas` — browse ideas ready to be invited
- `/dojo/:ideaId` — enter an active encounter
- `/labyrinth` — plant, visit, and prune ideas

## Architecture and privacy

Idea Dojo is a Vite application deployed through OpenAI Sites as a Cloudflare Worker. Sites provides Sign in with ChatGPT, production deployment, secrets, and a D1 database binding.

Every persistence query is scoped to a SHA-256 owner key derived server-side from the authenticated Sites identity header. User email addresses are not stored in idea or dojo records. D1 stores profiles, active and pruned ideas, authoritative dojo sessions, model history, and conversation messages. Browser storage is limited to device-local arena position and cleanup markers.

The server owns the chase, conversation, escape, and settled phases. It validates every state transition and dialogue request rather than trusting the browser. Gemini returns structured `text` and `endConversation` fields; malformed or unavailable model output falls back to deterministic, seed-specific ambient replies.

Production secrets are configured through Sites and are never committed to the repository. `.openai/hosting.json` contains only the Sites project identifier and the logical D1 binding.

## Built with Codex and GPT-5.6

Idea Dojo was created on July 18, 2026, entirely within the OpenAI Build Week submission period. GPT-5.6 powered Codex in the primary build thread. Gemini is a separate runtime dependency that supplies the deployed idea conversations; it did not replace GPT-5.6's role in building the project.

Codex accelerated the project by:

- turning an early visual prototype into a dojo-first application with explicit routes and accessible empty states;
- implementing and testing the chase, randomized grapple modes, adaptive conversations, escape loop, and final settlement;
- replacing fantasy nicknames with semantic idea titles and rewriting the idea voice around the user's original seed;
- moving browser and JSON-file persistence into authenticated, per-user D1 records;
- integrating Sign in with ChatGPT and the OpenAI Sites deployment model;
- diagnosing dependency and server issues, resolving branch conflicts, and validating production builds; and
- using tests to lock down ownership isolation, dialogue constraints, grapple progression, and model fallbacks.

The key product and design decisions remained human-led: wrestling should mean constructive engagement rather than combat; every visit should begin on an empty mat; planting belongs in the labyrinth; ideas should ask plain, specific reflective questions; and the final state should be peaceful settlement rather than defeat. Codex helped translate those decisions into implementation plans, code, tests, and deployable infrastructure.

The `/feedback` Session ID from the primary GPT-5.6 Codex thread is `019f76ea-cc6b-7aa0-9122-981403ef7366`.

## API overview

- `GET /api/ideas` — restore the signed-in user's active ideas and pruned archive
- `POST /api/ideas` — plant an idea in an open clearing
- `POST /api/ideas/:ideaId/prune` — move an idea to the user's archive
- `POST /api/dojo/sessions` — open an encounter
- `POST /api/dojo/sessions/:sessionId/moves` — record dojo moves and grapple results
- `POST /api/dojo/sessions/:sessionId/messages` — continue a grapple conversation
- `GET /api/health` — report ambient or Gemini dialogue mode

Persistent tables are defined in `db/schema.ts`, with generated migrations in `drizzle/`.

## License

The project source code is available under the [MIT License](LICENSE).
