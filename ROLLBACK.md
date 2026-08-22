# If a deploy breaks the site

Two scripts live in `scripts/` on the server. From now on, deploy using
`deploy.sh` instead of typing the four commands by hand — it does the exact
same thing, plus it remembers what was running before, which is what makes
`rollback.sh` possible.

## Normal deploy (replaces the old manual steps)

On the EC2 terminal, inside `~/strivo`:

```
bash scripts/deploy.sh
```

This pulls the latest code, installs dependencies, builds, and restarts —
same as before. The only difference: right before it starts, it saves
whatever commit is currently live to a file called `.last-known-good`.

## If something looks broken right after a deploy

```
bash scripts/rollback.sh
```

This puts the server back exactly how it was before the last `deploy.sh`
run, and restarts. Takes about as long as a normal deploy (it still has to
rebuild), but it's one command instead of trying to figure out what to do
under pressure.

**What it does not do:** it doesn't touch the database (SQLite migrations
here only ever *add* things, never remove or rename — see `src/lib/db.ts`
— so old code and the current database always get along fine). It also
doesn't fix anything on GitHub. The broken commit is still the latest thing
there, so if you run `deploy.sh` again before the real fix is pushed,
you'll just pull the same broken version right back. Talk to me about what
went wrong first, let me push an actual fix, then deploy again.

## One-time setup

The scripts need to be executable. Run this once on the server:

```
chmod +x scripts/deploy.sh scripts/rollback.sh
```

## Why this instead of something fancier

A proper CI/CD pipeline or blue-green deploy would roll back faster (no
rebuild wait), but it's a lot more infrastructure for one person to
maintain. This gets you the actual thing that matters — a fast, low-panic
way to undo a bad deploy — without a second server or a build pipeline to
babysit. A staging environment (testing changes before they go live at
all) is the natural next step up from this, and is tracked separately.
