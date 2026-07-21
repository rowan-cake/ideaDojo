# OpenAI Build Week submission

## Submission fields

- **Project:** Idea Dojo
- **Category:** Apps for Your Life
- **Entrant:** Rowan Cake, solo entrant
- **Repository:** https://github.com/rowan-cake/ideaDojo
- **Live demo:** https://idea-dojo-private-alpha.cakerowan.chatgpt.site
- **YouTube demo:** https://youtu.be/wE5Ewevj1Sc
- **Codex Session ID:** TODO — run `/feedback` in the primary GPT-5.6 build thread and paste the generated ID into Devpost

## Project description

Idea Dojo is a playful creative-practice app for people who have promising ideas but do not yet know what those ideas want to become. A user plants a short seed in a labyrinth, gives it a clear semantic title, and invites its living form onto a dojo mat. There, the user chases and grapples with the idea through two tactile game modes before entering a concise reflective conversation grounded in the original seed.

Across three encounters, the idea helps clarify its purpose, surface assumptions and tensions, and identify the smallest useful experiment it could become. The idea escapes after the first two conversations and settles peacefully after the third. OpenAI Sites provides Sign in with ChatGPT and deployment, while D1 keeps every user's ideas and conversations isolated. Gemini powers the idea's runtime dialogue, with deterministic ambient fallbacks when the model is unavailable.

GPT-5.6 powered the primary Codex development workflow. Codex helped transform the initial concept into a routed, tested application; implement the gameplay and adaptive dialogue loop; migrate storage to authenticated per-user D1 records; resolve branch and dependency issues; and publish the production Worker through Sites. The core creative decisions—constructive wrestling rather than combat, a dojo-first experience, seed-specific questions, and peaceful settlement—were directed by the human creator and translated into working software with Codex.

## Final submission checklist

- [x] Upload a public YouTube video shorter than three minutes.
- [ ] Confirm the video includes audio explaining the product and the distinct roles of Codex, GPT-5.6, and Gemini.
- [ ] Confirm the video contains no unlicensed music and does not display the two published book quotations.
- [x] Add the YouTube URL to this file and `README.md`.
- [ ] Run `/feedback` in the primary GPT-5.6 Codex thread and paste the Session ID into Devpost.
- [ ] Confirm the repository is public and the MIT license renders on GitHub.
- [ ] Confirm the Sites demo is public and works in a signed-out browser.
- [ ] Paste the project description above into Devpost.
- [ ] Preview every Devpost link before submitting.
- [ ] Submit before July 21, 2026 at 5:00 PM PDT.

## Video-safe framing

The labyrinth's two attributed book quotations are hidden by the existing responsive layout at viewport widths of 700px or narrower. Record that portion at a narrow viewport or crop the frame so the quotations are not visible. Do not show the private model prompt. Use voice-only narration or music you created or have permission to use.
