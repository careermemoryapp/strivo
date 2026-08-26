# Tests

Small, targeted suite -- not a full test suite. Added after a security review
flagged "no automated tests" as a real gap: these cover the two categories of
bug that would be most dangerous to reintroduce silently in a future change:

- **`security/idor.test.ts`** -- per-user data isolation. Every read/write in
  `lib/repo/*.ts` is supposed to be scoped by `user_id`, so one person can
  never read or modify another person's memories, chats, or messages, even if
  they know/guess the id. This test creates two users and asserts that
  cross-user access is always blocked.
- **`security/rateLimit.test.ts`** -- the shared SQLite-backed rate limiter
  (`lib/rateLimit.ts`). Confirms it actually blocks after the limit is hit,
  resets after the time window, and -- the specific bug this replaced --
  stays correct when "two processes" (simulated via `vi.resetModules()`) hit
  the same key, which matters now that pm2 runs Strivo in cluster mode.
- **`lib/ai.eval.test.ts`** -- a different kind of test from everything else
  here. Every other file mocks `@/lib/ai` out and checks plumbing; this one
  makes real OpenAI calls to check the AI chat's actual *behavior* against
  the rules in `SYSTEM_PROMPT_BASE` (personal vs. generic questions,
  no-fabrication, STAR formatting, not blending facts across memories) using
  a small "LLM as a judge" grader. tsc/eslint only prove the prompt string
  compiles -- this is what actually catches a regression when that prompt
  changes. Skips automatically if `OPENAI_API_KEY` isn't set; costs a
  handful of cheap `gpt-4o-mini` calls per run, so run it manually whenever
  you touch `SYSTEM_PROMPT_BASE` rather than expecting it in every commit.

## Running

```
npm test
```

Each test file points `DATABASE_PATH` at its own throwaway SQLite file in the
OS temp dir before importing anything that touches the database, so tests
never touch your real `data/strivo.db` and don't interfere with each other.

## What this doesn't cover

This is not a full test suite -- no UI/component tests, no end-to-end tests.
It's scoped specifically to the security-critical invariants above, plus
(as of `lib/ai.eval.test.ts`) a first pass at behavioral coverage for the AI
chat's system prompt. Worth extending over time, but this is the floor, not
the ceiling.
