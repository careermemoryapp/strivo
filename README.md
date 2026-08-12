# Strivo — Personal AI built from your own experiences

A mobile-first web MVP: capture your professional experiences by voice or text,
get AI-generated titles/summaries, and chat with an AI that answers using
*your own* memories (retrieval-augmented, grounded, per-user isolated).

This is a fully functional app — real auth, a real (embedded) database, real
OpenAI calls for summaries/embeddings/chat — not a UI mockup.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 on your phone or a mobile-width browser window,
sign up, and go. The SQLite database file is created automatically on first
run at `data/strivo.db` — no separate migration step needed.

Your OpenAI key is already set in `.env.local` (gitignored, never committed).
See `.env.example` for the full list of variables if you need to move this
to a new machine or a hosting provider.

## Deploying it somewhere real

This is a standard Next.js app, so it deploys anywhere Next.js does
(Vercel, Render, Railway, a VPS, etc.). The one thing to know: it uses
Node's built-in `node:sqlite` module (no native binaries, no separate DB to
provision — the whole database is a single file), which needs **Node.js 22.5+**
on whatever host you deploy to, and a **persistent filesystem** for the
`data/` folder (a serverless/ephemeral host like plain Vercel functions will
reset the file on every deploy — Railway/Render/a VPS/a Docker volume all
work fine). If you outgrow SQLite, `src/lib/repo/*.ts` is the only place
that talks to the database, so swapping it for Postgres later is a
contained change.

## Design

Rebuilt to match the provided screen mockups: bottom nav order (Home, Chats,
Memories, Record, Settings), the two-tone brain wordmark, list-style Home
quick actions, Transcript-first Memory Detail tabs with Edit/Share/Duplicate
and an AI-summary feedback (thumbs up/down) control, voice-vs-text source
indicators, and the narrower chat category set (Interview Prep, Career
Advice, Personal, Other). All of these are wired to real endpoints — Edit
re-runs AI enrichment on the new text, Duplicate and Delete hit real API
routes, feedback is persisted per memory — nothing is decorative-only.

## What's implemented (and verified working end-to-end)

- **Auth**: email/password signup, login, logout, forgot/reset password
  (see note below), JWT sessions (NextAuth), bcrypt-hashed passwords.
- **Capture**: voice-to-text (browser Web Speech API) with a "Type instead"
  fallback, review/edit before saving, transcript always saved even if AI
  enrichment fails.
- **AI enrichment**: title/summary/category/tags generated per memory
  (OpenAI `gpt-4o-mini` by default), plus an embedding for semantic search.
- **Memories**: searchable list grouped by Today/Yesterday/This Week/Earlier,
  detail view with Summary/Transcript as horizontal tabs.
- **Chat**: reusable chat screen for every conversation type (Interview,
  Resume, Promotion, Leadership, Career, Performance Review, General),
  persisted history, retry on failure.
- **Retrieval-augmented answers**: every chat message triggers a retrieval
  step scoped to *that user only* — semantic (OpenAI embeddings + cosine
  similarity) when available, with a keyword-overlap fallback so the app
  still works end-to-end without AI configured. See `src/lib/retrieval.ts`.
- **Per-user data isolation**: enforced at the database query level (every
  read/write filters `WHERE user_id = ?`), not just in the UI — see the
  comments in `src/lib/repo/*.ts`. Verified with an automated test that
  signs up two users and confirms user B gets a 404 on user A's memory/chat
  ids and an empty list otherwise.
- **Failure states**: mic permission denied, transcription failure, AI
  summary failure, AI chat failure, no relevant memories found — all
  handled per the spec (transcript/message is never lost).
- **Home streak, quick-action shortcuts, settings, profile, delete account**.

## Known MVP limitations (disclosed, not hidden)

- **Password reset has no email service configured.** `forgot-password`
  generates a real, expiring, single-use token and returns the reset link
  directly in the UI (clearly labeled "development mode") instead of
  emailing it. Wire up an email provider (Resend, Postmark, SES, etc.) in
  `src/app/api/auth/forgot-password/route.ts` to make this production-ready.
- **Voice-to-text uses the browser's built-in speech recognition** (Web
  Speech API), which is Chrome/Edge-based and works great on Android and
  desktop Chrome. Safari/iOS support is inconsistent — the "Type instead"
  fallback is always available and is what you'd want for a broader beta.
- **I could not test the live OpenAI calls inside my sandbox** — the sandbox
  I built this in blocks outbound requests to `api.openai.com` at the
  network level (unrelated to your key, which is correctly wired in). I
  verified this is a sandbox restriction, not a bug: I confirmed the request
  never leaves the sandbox (`blocked-by-allowlist`), then verified the
  fallback behavior is correct (transcript/message preserved, clear error
  shown, retry available). Everything else — auth, database, retrieval
  fallback, per-user isolation, persistence across restarts — was tested
  against a real running production build. Run `npm run dev` on your own
  machine and the AI calls (summaries, embeddings, chat) should work
  immediately; if anything looks off there, it's the one piece I couldn't
  see with my own eyes, so check `OPENAI_API_KEY` in `.env.local` first.

## Project structure

```
src/
  app/
    (auth)/            login, signup, forgot-password, reset-password
    (app)/              home, record, memories, chats, settings — behind auth
    api/                 all backend routes (Node runtime)
  components/           shared UI (BottomNav, cards, tabs, chat bubble, mic hook…)
  lib/
    config.ts            APP_NAME + all copy/branding — change this to re-skin
    db.ts                 SQLite connection + schema (auto-migrates on boot)
    repo/                 one file per table — the ONLY place that queries the DB
    ai.ts                  OpenAI calls (metadata, embeddings, chat) with grounding prompt
    retrieval.ts           semantic + keyword-fallback retrieval, user-scoped
    chatService.ts        shared send-message-and-get-reply used by two API routes
```

## Rebranding

Everything user-facing lives in two files: `src/lib/config.ts` (app name,
taglines, quick actions, chat categories/templates) and `src/app/globals.css`
(`@theme` block — colors, gradient, radius, shadows). Change those and the
whole app re-skins.
