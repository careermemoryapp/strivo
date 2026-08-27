@AGENTS.md

# Working on Strivo — hard rules

These exist because breaking them has already caused real outages on this
project. Follow them every time, not just when convenient.

## Deploying

- Always deploy with `bash scripts/deploy.sh` from `~/strivo` on the server.
  Never hand the user a manual `git pull && npm install && npm run build &&
  pm2 reload` sequence — that builds straight into the live `.next` folder
  while it's still serving traffic, which corrupts running chunk files and
  takes the whole app down. `deploy.sh` builds into a scratch folder and
  swaps it in atomically once the build is fully done.
- The founder has no SSH/AWS console access of their own to hand off to —
  every server-side action (deploy, logs, EC2 console commands) has to be
  spelled out as exact copy-pasteable commands for them to run themselves.

## Git

- Never run `git` commands (even read-only ones like `git status` or
  `git log`) against the live working copy at the repo root. The founder
  commits and pushes through GitHub Desktop on their own machine, and a
  stray `git` process from another tool can leave a `.git/index.lock` file
  that silently blocks every commit in GitHub Desktop until it's manually
  deleted. If commit history needs checking, ask the founder to check it
  in GitHub Desktop instead.

## Before calling any change done

- Run `npx tsc --noEmit` and `npx eslint <changed files>` (separate calls,
  `timeout_ms: 300000`) and confirm both are clean. This has caught real
  bugs before shipping; skipping it has shipped real ones.
- tsc/eslint passing is necessary but not sufficient — it does not catch
  every runtime bug (see the Server/Client rule below). Reason about
  runtime behavior too, not just types and lint.

## Server Component → Client Component boundary (Next.js App Router)

- Rows returned by `node:sqlite` (`db.prepare(...).get()` / `.all()`) are
  NOT plain objects — passing one directly as a prop from a Server
  Component (`page.tsx` with no `"use client"`) into a Client Component
  throws `Only plain objects... can be passed to Client Components` at
  request time, not at build time, so `tsc`/`eslint` won't catch it.
  Always spread into a fresh object literal first: `{ ...row }` for a
  single row, `rows.map((r) => ({ ...r }))` for an array, before handing
  it to a client component's props.

