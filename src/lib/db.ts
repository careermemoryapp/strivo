import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// A single shared SQLite connection for the whole server process.
// We use Node's built-in `node:sqlite` module so the app has zero native
// dependencies to compile/download — `npm install && npm run dev` just works.

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "strivo.db");

function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

declare global {
  var __strivoDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  ensureDir(DB_PATH);
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  // Once pm2 runs Strivo as multiple clustered processes, more than one of
  // them can open this same file at once. WAL mode already lets that work
  // (one writer + concurrent readers), but without a busy_timeout a writer
  // that loses a brief race gets an immediate "database is locked" error
  // instead of just waiting its turn. 5s is far longer than any single
  // query here should ever take, so this only ever kicks in on genuine
  // contention.
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_image TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      transcript TEXT NOT NULL,
      summary TEXT,
      category TEXT,
      tags TEXT,
      embedding TEXT,
      metadata_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'text',
      key_points TEXT,
      summary_feedback TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_user_created ON memories(user_id, created_at);

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      last_message TEXT,
      memory_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      retrieved_memories TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Help & Support submissions. No destination email is configured yet,
    -- so these are just persisted here for now — once a support inbox is
    -- decided on, a follow-up can add actual email delivery without
    -- changing this table.
    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );

    -- Google blocks its sign-in screen inside embedded WebViews (which is
    -- what the Android app's Capacitor WebView is), so Google auth for the
    -- native app has to happen in the system browser instead. This table is
    -- the handoff: after sign-in completes in the system browser, we mint a
    -- short-lived single-use token that carries that browser's already-valid
    -- NextAuth session cookie value across to the app's own WebView cookie
    -- jar (they don't share cookies with each other). See
    -- /api/auth/mobile-bridge and /api/auth/mobile-consume.
    CREATE TABLE IF NOT EXISTS mobile_auth_tokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      session_cookie_value TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Broadcast "nudge" messages set from the admin panel to encourage
    -- people to come back and record a memory. Only one is ever "active"
    -- at a time (see createNudge in lib/repo/nudges.ts, which deactivates
    -- any previous row) — kept as a table instead of a single row so past
    -- nudges stay around as history.
    CREATE TABLE IF NOT EXISTS nudges (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Device tokens for real notification-bar push (via Firebase Cloud
    -- Messaging — see lib/push.ts), registered by usePushRegistration.ts
    -- the first time someone opens the native app signed in. The token
    -- column is unique because FCM issues one per app-install-on-device,
    -- and it can
    -- get re-issued (app reinstall, data clear) — re-registering just
    -- updates which user it's attached to instead of erroring.
    CREATE TABLE IF NOT EXISTS push_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'android',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

    -- SEO content marketing posts served at strivo.ai/blog, aimed at
    -- ranking for career/interview/resume search terms and funneling
    -- readers to the app via the CTA banner on every post (see
    -- src/app/blog). Rows are created either by the founder (reusing the
    -- admin session cookie) or by the daily automation task (authenticated
    -- via the separate BLOG_AUTOMATION_SECRET header instead of the human
    -- admin password — see /api/blog/publish) — kept as its own secret
    -- specifically so the automation's credential can be rotated without
    -- logging the founder out of /admin.
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      meta_title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      category TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content_html TEXT NOT NULL,
      keywords TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_blog_posts_created ON blog_posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);

    -- Backs the rate limiter (see lib/rateLimit.ts). Used to live as a
    -- plain in-memory Map, which was correct only because Strivo ran as a
    -- single pm2 process. Now that pm2 runs it in cluster mode (multiple
    -- Node processes sharing this same DB file), the counter has to live
    -- somewhere all processes see -- this table, not each process's own
    -- memory.
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at TEXT NOT NULL
    );
  `);

  // --- Incremental migrations for columns/data added after initial launch ---
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so we check pragma table_info
  // first and only add the column if it's missing. Safe to run on every boot.
  const userColumns = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  if (!userColumns.includes("trial_ends_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at TEXT;`);
  }
  // Tracks the last nudge (see the `nudges` table) each user has already
  // seen and dismissed on Home, so a broadcast message doesn't reappear
  // for them once acknowledged. Null means "hasn't dismissed anything yet".
  if (!userColumns.includes("dismissed_nudge_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN dismissed_nudge_id TEXT;`);
  }
  // The native app's versionName (e.g. "1.5.1"), pinged once per app
  // open/resume regardless of whether they've granted notification
  // permission (see useAppVersionPing.ts) — unlike push_tokens.app_version,
  // this covers every native user, not just ones who opted into push, so
  // it's the source of truth for the admin Users table's "App version"
  // column. Null for web-only users and anyone who hasn't opened the app
  // since this shipped.
  if (!userColumns.includes("app_version")) {
    db.exec(`ALTER TABLE users ADD COLUMN app_version TEXT;`);
  }
  // Timestamp of the most recent app-version ping (see useAppVersionPing.ts,
  // which fires on every native app open/resume) — the closest thing we
  // have to "when did this person last open the app," used to build nudge
  // audience segments (see repo/pushTokens.ts's segment queries) like
  // "opened recently but not today" or "hasn't opened in a while."
  if (!userColumns.includes("last_active_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN last_active_at TEXT;`);
  }

  // English translation/paraphrase of the transcript, generated alongside
  // the rest of the AI metadata (see generateMemoryMetadata in lib/ai.ts)
  // and folded into what gets embedded (see lib/retrieval.ts). Never shown
  // to the user — it exists purely so a Hindi memory and an English
  // question (or vice versa) land in the same embedding neighborhood
  // instead of relying on the embedding model's native cross-lingual
  // alignment, which isn't reliable enough on its own for short, informal,
  // voice-transcribed text. Null for memories created before this existed.
  const memoryColumns = (db.prepare(`PRAGMA table_info(memories)`).all() as { name: string }[]).map((c) => c.name);
  if (!memoryColumns.includes("search_text")) {
    db.exec(`ALTER TABLE memories ADD COLUMN search_text TEXT;`);
  }

  // The app's versionName (e.g. "1.5.1"), sent by the client on push-token
  // registration (see App.getInfo() in usePushRegistration.ts) — lets the
  // admin panel show which build each user is actually running, since push
  // notifications only reach phones on a version that has them built in.
  // Null for tokens registered before this existed.
  const pushTokenColumns = (db.prepare(`PRAGMA table_info(push_tokens)`).all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!pushTokenColumns.includes("app_version")) {
    db.exec(`ALTER TABLE push_tokens ADD COLUMN app_version TEXT;`);
  }

  // Which audience segment a nudge was sent to (see repo/pushTokens.ts) —
  // 'all' for anyone sent before this existed. Shown in the admin panel's
  // "Previously sent" history so it's clear who each past nudge targeted.
  const nudgeColumns = (db.prepare(`PRAGMA table_info(nudges)`).all() as { name: string }[]).map((c) => c.name);
  if (!nudgeColumns.includes("segment")) {
    db.exec(`ALTER TABLE nudges ADD COLUMN segment TEXT NOT NULL DEFAULT 'all';`);
  }

  // Backfill trial_ends_at for any existing users who don't have one yet
  // (e.g. accounts created before the subscription system existed) — gives
  // them a fresh trial starting now rather than leaving it null. Kept in
  // sync with TRIAL_MONTHS in lib/repo/users.ts.
  db.exec(`
    UPDATE users
    SET trial_ends_at = datetime(COALESCE(created_at, CURRENT_TIMESTAMP), '+2 months')
    WHERE trial_ends_at IS NULL;
  `);

  // One-time correction: accounts created before the trial length changed
  // from 6 months to 2 months already have "+6 months" baked into their
  // trial_ends_at, since that value is set once at signup and never
  // recalculated. Re-derive it from created_at for anyone still mid-trial
  // so they move onto the current 2-month policy too. Safe to run on every
  // boot — it always recomputes to the same value, so it's a no-op once
  // everyone is already on the 2-month trial.
  db.exec(`
    UPDATE users
    SET trial_ends_at = datetime(COALESCE(created_at, CURRENT_TIMESTAMP), '+2 months')
    WHERE subscription_status = 'trial';
  `);

  // One-time cleanup: the chat category taxonomy was renamed (Interview Prep ->
  // Interview, Career Advice -> Resume/Leadership/Performance Review/Others,
  // Personal/Other -> Others). Remap any chats still on the old values so their
  // category icon/filter tab keeps working instead of silently losing its icon.
  db.exec(`
    UPDATE chats SET category = CASE
      WHEN category = 'Interview Prep' THEN 'Interview'
      WHEN category = 'Career Advice' AND title LIKE '%Resume%' THEN 'Resume'
      WHEN category = 'Career Advice' AND title LIKE '%Leadership%' THEN 'Leadership'
      WHEN category = 'Career Advice' AND title LIKE '%Performance%' THEN 'Performance Review'
      WHEN category = 'Career Advice' THEN 'Others'
      WHEN category = 'Personal' THEN 'Others'
      WHEN category = 'Other' THEN 'Others'
      ELSE category
    END
    WHERE category IN ('Interview Prep', 'Career Advice', 'Personal', 'Other');
  `);

  // The Home "ask anything" box used to file every chat under the generic
  // "Others" bucket regardless of what was typed. Give those existing chats
  // a real category (and icon) based on their title, same heuristic as the
  // client-side guess for new ones. Only touches chats still sitting on the
  // generic bucket, so a real "general chat" stays put.
  db.exec(`
    UPDATE chats SET category = CASE
      WHEN category = 'Others' AND (title LIKE '%resume%' OR title LIKE '%cv %' OR title LIKE '% cv') THEN 'Resume'
      WHEN category = 'Others' AND title LIKE '%performance%' THEN 'Performance Review'
      WHEN category = 'Others' AND (title LIKE '%leadership%' OR title LIKE '%leader %') THEN 'Leadership'
      WHEN category = 'Others' AND title LIKE '%interview%' THEN 'Interview'
      ELSE category
    END
    WHERE category = 'Others';
  `);
}

export function getDb(): DatabaseSync {
  if (!global.__strivoDb) {
    global.__strivoDb = createConnection();
  }
  return global.__strivoDb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
