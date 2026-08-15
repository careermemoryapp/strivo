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
  `);

  // --- Incremental migrations for columns/data added after initial launch ---
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so we check pragma table_info
  // first and only add the column if it's missing. Safe to run on every boot.
  const userColumns = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  if (!userColumns.includes("trial_ends_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at TEXT;`);
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
