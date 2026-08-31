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
  // SQLite's actual default (synchronous=FULL) does a full disk sync on
  // every single write -- safe, but the slowest option, and mostly
  // redundant once WAL mode is already on. SQLite's own docs recommend
  // NORMAL specifically for WAL-mode databases: it only forces a sync at
  // WAL checkpoints instead of every write, which is significantly faster
  // for a write-heavy path like chat messages, while still never
  // corrupting the database file even in a crash -- the only real-world
  // risk is losing the last few WAL-only commits in an OS crash/power
  // loss, not app-level crashes or a normal `pm2 restart`.
  db.exec("PRAGMA synchronous = NORMAL;");
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
      search_text TEXT,
      competencies TEXT,
      praise TEXT,
      resume_line TEXT,
      has_metric INTEGER NOT NULL DEFAULT 0,
      reflective_question TEXT,
      reflective_answer TEXT,
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

    -- Broadcast marketing/lifecycle emails sent from the admin panel (see
    -- lib/repo/emailCampaigns.ts) — a subject/body pair fanned out via SES
    -- to whichever audience segment the admin picked (all users, free
    -- trial, paid monthly, paid annual, or trial-ended). Kept as a table
    -- purely for history/audit, same pattern as nudges above -- there's
    -- no "active campaign" concept, every send is a one-off, permanent row.
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      segment TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Reusable, admin-editable starting points for the campaign composer
    -- (see lib/repo/emailTemplates.ts) -- both the seeded "traditional"
    -- starter templates (Welcome, Promotional, Re-engagement, Update) and
    -- anything the admin saves themselves via "Save as template" live in
    -- this same table. Loading one just fills in the composer fields; it
    -- doesn't send anything or reference email_campaigns at all.
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      banner_image_url TEXT,
      button_text TEXT,
      button_url TEXT,
      accent_color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Admin-controlled "kill switches" for the app's riskiest/most
    -- expensive external calls (AI chat, file/voice uploads, push sends) --
    -- see lib/repo/featureFlags.ts for the fixed set of keys. Flipping a row
    -- to disabled makes the relevant code path fail gracefully with a
    -- friendly message immediately (no redeploy needed), for when something
    -- is misbehaving or costing too much and needs to be paused right away.
    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    -- One row per user per week -- the "weekly recap" human-angle feature
    -- (see lib/repo/weeklyRecaps.ts, app/api/weekly-recap/run, and
    -- app/(app)/recap). Generated by an external weekly automation job
    -- (same pattern as the daily blog automation -- see
    -- BLOG_AUTOMATION_SECRET/checkBlogAutomationSecret in lib/adminAuth.ts)
    -- that picks the user's 2-3 best memories from the past 7 days and
    -- writes a short, warm recap, then pushes a notification linking to
    -- /recap. week_start (YYYY-MM-DD, the IST date the 7-day window
    -- started) is what the run route checks against to avoid sending the
    -- same user two recaps for the same week if the job is ever re-run.
    CREATE TABLE IF NOT EXISTS weekly_recaps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      headline TEXT NOT NULL,
      stories TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_weekly_recaps_user ON weekly_recaps(user_id, created_at);

    -- One row per generated "growth narrative" -- a deeper, longer-arc
    -- human-angle feature than weekly_recaps above: instead of praising one
    -- memory, it compares the user's earliest recorded memories to their
    -- most recent ones and reflects back a genuine pattern of change (see
    -- generateGrowthNarrative in lib/ai.ts, generated by an external
    -- monthly automation -- same shape as the weekly recap and blog
    -- automations, see GROWTH_NARRATIVE_SECRET in lib/adminAuth.ts).
    -- earliest/latest _memory_date bound the two comparison windows so the
    -- UI can show "then vs now" date ranges without re-deriving them from
    -- narrative_text.
    CREATE TABLE IF NOT EXISTS growth_narratives (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      narrative_text TEXT NOT NULL,
      memory_count_at_generation INTEGER NOT NULL,
      earliest_memory_date TEXT NOT NULL,
      latest_memory_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_narratives_user ON growth_narratives(user_id, created_at);

    -- "You vs. You" -- a calendar-quarter benchmark, distinct from
    -- growth_narratives above: that one looks for a narrative PATTERN across
    -- a user's whole history and stays silent if it can't find one; this one
    -- is a fixed quarterly ritual (see generateQuarterlyBenchmark in
    -- lib/ai.ts, generated by an external quarterly automation -- see
    -- QUARTERLY_BENCHMARK_SECRET in lib/adminAuth.ts) that always reports
    -- back honestly, even "a steady quarter, consistent with the one
    -- before" when nothing dramatic changed -- the point is the check-in
    -- itself, not manufacturing a story every time. The current_/prior_
    -- counts are stored (not just the reflection text) so the UI can show
    -- real numbers alongside the AI's written reflection.
    CREATE TABLE IF NOT EXISTS quarterly_benchmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quarter_label TEXT NOT NULL,
      prior_quarter_label TEXT NOT NULL,
      reflection_text TEXT NOT NULL,
      current_total INTEGER NOT NULL,
      current_competency_stories INTEGER NOT NULL,
      current_distinct_competencies INTEGER NOT NULL,
      current_metric_stories INTEGER NOT NULL,
      prior_total INTEGER NOT NULL,
      prior_competency_stories INTEGER NOT NULL,
      prior_distinct_competencies INTEGER NOT NULL,
      prior_metric_stories INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quarterly_benchmarks_user ON quarterly_benchmarks(user_id, created_at);
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
  // Which plan (monthly vs annual) the user picked on the first-run trial
  // screen (see app/(app)/welcome-trial). Null means they haven't seen that
  // screen yet -- that's also the flag the Home page checks to decide
  // whether to show it. Purely a stored preference until Google Play
  // Billing is wired up (see pricing comments in repo/users.ts): once real
  // billing goes live, this is what we pre-select in the Play purchase flow
  // rather than defaulting everyone to monthly.
  if (!userColumns.includes("preferred_plan")) {
    db.exec(`ALTER TABLE users ADD COLUMN preferred_plan TEXT;`);
  }
  // Stamped every time setPreferredPlan() runs (any value, including
  // "later"). Exists specifically to power the plan-choice nudge: someone
  // who picked "later" gets shown a reminder screen again once enough time
  // has passed since THIS timestamp, not since they first signed up (see
  // PLAN_NUDGE_AFTER_MS in repo/users.ts and app/plan-nudge). Picking
  // anything again -- including "later" a second time -- re-stamps this
  // and pushes the next nudge out another full interval, so it can't
  // re-appear every single session.
  if (!userColumns.includes("preferred_plan_chosen_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN preferred_plan_chosen_at TEXT;`);
  }
  // True while an admin has manually granted this account free access via
  // "Grant Strivo Plus" (see PATCH /api/admin/users/[id]) rather than a
  // real Google Play purchase. Settings/subscription reads this to show
  // "you were gifted this plan" instead of pricing/a plan picker -- a
  // distinct flag rather than inferring it from subscription_status ===
  // "active", because right now that inference would happen to be correct
  // (there's no real billing yet, so every active account IS a grant) but
  // would silently become WRONG the moment real Play Billing purchases
  // start landing, telling a genuine paying customer they got a free gift.
  if (!userColumns.includes("plan_granted_by_admin")) {
    db.exec(`ALTER TABLE users ADD COLUMN plan_granted_by_admin INTEGER NOT NULL DEFAULT 0;`);
  }
  // Set once someone clicks the unsubscribe link in a broadcast campaign
  // email (see /api/email/unsubscribe) -- every campaign send excludes
  // opted-out users automatically (see recipientsForSegment in
  // lib/repo/emailCampaigns.ts). Does NOT affect transactional email
  // (password reset, support replies) -- those aren't marketing and keep
  // sending regardless of this flag.
  if (!userColumns.includes("email_opt_out")) {
    db.exec(`ALTER TABLE users ADD COLUMN email_opt_out INTEGER NOT NULL DEFAULT 0;`);
  }

  // Design fields for campaign emails -- added after email_campaigns
  // already existed in production, so these are nullable/optional: older
  // history rows (sent before this feature) simply have no banner/button/
  // color and render with the plain default template, same as before.
  const emailCampaignColumns = (db.prepare(`PRAGMA table_info(email_campaigns)`).all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!emailCampaignColumns.includes("banner_image_url")) {
    db.exec(`ALTER TABLE email_campaigns ADD COLUMN banner_image_url TEXT;`);
  }
  if (!emailCampaignColumns.includes("button_text")) {
    db.exec(`ALTER TABLE email_campaigns ADD COLUMN button_text TEXT;`);
  }
  if (!emailCampaignColumns.includes("button_url")) {
    db.exec(`ALTER TABLE email_campaigns ADD COLUMN button_url TEXT;`);
  }
  if (!emailCampaignColumns.includes("accent_color")) {
    db.exec(`ALTER TABLE email_campaigns ADD COLUMN accent_color TEXT;`);
  }

  // Seeds four "traditional" starter templates the first time this table
  // is empty, so the admin has something usable to click into right away
  // instead of a blank slate. Only runs once ever, in practice -- after
  // that the table always has at least these four rows (unless the admin
  // deletes them all, in which case they simply don't come back).
  const templateCount = (db.prepare(`SELECT COUNT(*) AS n FROM email_templates`).get() as { n: number }).n;
  if (templateCount === 0) {
    const now = new Date().toISOString();
    const starterTemplates = [
      {
        id: "template_starter_welcome",
        name: "Welcome / What's new",
        subject: "Welcome to Strivo, {{firstName}} — here's how to get started",
        body: "Hi {{firstName}},\n\nWelcome to Strivo! We built this so you never have to start an interview answer, resume bullet, or performance review from a blank page again.\n\nStart by recording one memory — a project you're proud of, a hard problem you solved, anything. Strivo turns it into something you can pull up whenever you need it.",
        banner_image_url: null,
        button_text: "Record your first memory",
        button_url: "https://strivo.ai/app",
        accent_color: "#8b5cf6",
      },
      {
        id: "template_starter_promotional",
        name: "Promotional / Upgrade",
        subject: "{{firstName}}, lock in Strivo Plus before your trial ends",
        body: "Hi {{firstName}},\n\nYour free trial won't last forever — but Strivo Plus is **50% off** if you go annual. Unlimited memories, AI chat grounded in your real experience, and interview/resume coaching whenever you need it.\n\nNo pressure, just wanted you to know before it ends.",
        banner_image_url: null,
        button_text: "See plans",
        button_url: "https://strivo.ai/settings/subscription",
        accent_color: "#f97316",
      },
      {
        id: "template_starter_reengagement",
        name: "Re-engagement (trial ended)",
        subject: "We kept your memories, {{firstName}}",
        body: "Hi {{firstName}},\n\nYour Strivo trial ended, but everything you recorded is still there — nothing was deleted. Come back anytime to pick up where you left off.\n\nIf something didn't work for you, just reply and tell us — we read every email.",
        banner_image_url: null,
        button_text: "Come back to Strivo",
        button_url: "https://strivo.ai/app",
        accent_color: "#60a5fa",
      },
      {
        id: "template_starter_update",
        name: "Plain update (no banner/button)",
        subject: "A quick update from Strivo",
        body: "Hi {{firstName}},\n\nJust a short note — write your update here. This template is intentionally plain text, no banner image or button, for when a simple note fits better than a promotional layout.",
        banner_image_url: null,
        button_text: null,
        button_url: null,
        accent_color: "#8b5cf6",
      },
    ];
    const insertTemplate = db.prepare(
      `INSERT INTO email_templates (id, name, subject, body, banner_image_url, button_text, button_url, accent_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const t of starterTemplates) {
      insertTemplate.run(t.id, t.name, t.subject, t.body, t.banner_image_url, t.button_text, t.button_url, t.accent_color, now, now);
    }
  }

  // Retroactive fix for a real broken link in the seed above: the
  // "Promotional / Upgrade" template's button used to point at
  // /app/settings/subscription, which was never an actual route (no
  // nested route exists under /app -- see src/app/app/page.tsx, it's a
  // single redirect-only entry page). Anyone who clicked that button
  // would have hit a 404. Only touches the row if it still has the exact
  // broken URL, so it's a no-op on a fresh install (which seeds the
  // already-fixed URL above) and doesn't clobber an admin's own edits if
  // they've since changed this template's button themselves.
  db.prepare(
    `UPDATE email_templates SET button_url = ?, updated_at = ? WHERE id = ? AND button_url = ?`
  ).run(
    "https://strivo.ai/settings/subscription",
    new Date().toISOString(),
    "template_starter_promotional",
    "https://strivo.ai/app/settings/subscription"
  );

  // Added later than the four above, once the "decide_later" plan choice
  // shipped -- can't reuse the `templateCount === 0` block, since on any
  // real deployment that table is already non-empty by the time this runs.
  // Checked by id instead, so it's added exactly once regardless of what
  // else is already in the table (including if an admin has since deleted
  // some of the original four).
  const hasDecideLaterTemplate = db
    .prepare(`SELECT 1 FROM email_templates WHERE id = ?`)
    .get("template_starter_decide_later");
  if (!hasDecideLaterTemplate) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO email_templates (id, name, subject, body, banner_image_url, button_text, button_url, accent_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "template_starter_decide_later",
      "Nudge: hasn't picked a plan",
      "{{firstName}}, don't lose what you've built on Strivo",
      "Hi {{firstName}},\n\nWhen you signed up, you chose to decide on a plan later — no problem, your free trial has been running exactly the same either way.\n\nBut once your trial ends, you'll need to be on a plan to keep using Strivo, or you'll lose access to your memories and everything you've captured so far. Picking one now takes less than a minute, and **Yearly is 50% off** if you want to lock in the better rate.",
      null,
      "Choose your plan",
      "https://strivo.ai/settings/subscription",
      "#f97316",
      now,
      now
    );
  }

  // Seed the three feature-flag rows the first time each is missing (not
  // gated on the table being empty, so adding a fourth flag later just
  // needs its own `if (!hasFlag)` block here rather than reworking this
  // one). Everyone starts enabled -- this table only ever turns something
  // OFF deliberately from the admin panel, never ships pre-disabled.
  const seedFlags: { key: string }[] = [{ key: "ai_chat" }, { key: "uploads" }, { key: "push_notifications" }];
  for (const f of seedFlags) {
    const exists = db.prepare(`SELECT 1 FROM feature_flags WHERE key = ?`).get(f.key);
    if (!exists) {
      db.prepare(`INSERT INTO feature_flags (key, enabled, updated_at) VALUES (?, 1, ?)`).run(
        f.key,
        new Date().toISOString()
      );
    }
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

  // Interview-competency tags (Leadership, Ownership & Initiative,
  // Problem-Solving, etc. — see COMPETENCY_OPTIONS in lib/ai.ts), generated
  // alongside the rest of the AI metadata. Distinct from `category` (one
  // broad classification like Work/Meeting) and `tags` (freeform keywords)
  // -- this is specifically "which behavioral-interview competencies does
  // this story actually demonstrate," so a memory a user dictated casually
  // (e.g. "I helped a stuck teammate finish their part") can still surface
  // as a strong Leadership example even though the word "leadership" never
  // appears in it and they never framed it that way themselves. Null for
  // memories created before this existed.
  if (!memoryColumns.includes("competencies")) {
    db.exec(`ALTER TABLE memories ADD COLUMN competencies TEXT;`);
  }

  // A short, specific, warm compliment generated alongside competencies
  // above (see generateMemoryMetadata in lib/ai.ts) -- the "human angle"
  // feature: shown as a one-time popup right after a memory is saved (see
  // app/(app)/record/page.tsx), praising the person for the specific thing
  // they described rather than a generic "nice job." Always null when
  // competencies is empty -- praising something that isn't genuinely there
  // would feel fake. Null for memories created before this existed.
  if (!memoryColumns.includes("praise")) {
    db.exec(`ALTER TABLE memories ADD COLUMN praise TEXT;`);
  }

  // A single ready-to-use resume bullet line generated alongside praise
  // above (see generateMemoryMetadata in lib/ai.ts) -- always in English
  // regardless of the memory's own language, since that's the resume
  // convention in Strivo's target market. Shown with a one-tap copy button
  // on the Record success popup and the memory detail page. Same gate as
  // praise: null whenever competencies is empty. Null for memories created
  // before this existed.
  if (!memoryColumns.includes("resume_line")) {
    db.exec(`ALTER TABLE memories ADD COLUMN resume_line TEXT;`);
  }

  // Whether this memory states a concrete, quantifiable metric (see
  // hasMetric in generateMemoryMetadata, lib/ai.ts) -- stored as its own
  // column, rather than re-parsing every transcript with AI on demand,
  // specifically so the "first story backed by a real number" one-time
  // milestone (see app/api/memories/route.ts) can be checked with a cheap
  // COUNT query. Defaults to 0 (false) for memories created before this
  // existed, which is the safe default -- it just means they don't count
  // toward that milestone, not that they're wrongly flagged either way.
  if (!memoryColumns.includes("has_metric")) {
    db.exec(`ALTER TABLE memories ADD COLUMN has_metric INTEGER NOT NULL DEFAULT 0;`);
  }

  // The optional "someone is actually listening" follow-up question (see
  // reflectiveQuestion in generateMemoryMetadata, lib/ai.ts), generated
  // alongside the rest of the AI metadata, plus the user's answer if they
  // chose to give one (see /api/memories/[id]/reflect). Null question means
  // the AI judged this memory too thin to follow up on; null answer just
  // means they haven't answered yet (or skipped it) -- answering also
  // folds the Q&A into the transcript itself, so reflective_answer here is
  // a convenience copy for UI purposes, not the only place the content
  // lives. Null for memories created before this existed.
  if (!memoryColumns.includes("reflective_question")) {
    db.exec(`ALTER TABLE memories ADD COLUMN reflective_question TEXT;`);
  }
  if (!memoryColumns.includes("reflective_answer")) {
    db.exec(`ALTER TABLE memories ADD COLUMN reflective_answer TEXT;`);
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
