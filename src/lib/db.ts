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
      created_at TEXT NOT NULL,
      resume_text TEXT,
      resume_filename TEXT,
      resume_uploaded_at TEXT,
      resume_reminder_sent_at TEXT,
      resume_stats_wins INTEGER,
      resume_stats_leadership INTEGER,
      resume_stats_problems INTEGER,
      resume_stats_stakeholder INTEGER,
      resume_stats_computed_at TEXT
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

    -- A real, permanent "project" a user creates once (Settings > Projects)
    -- that memories can attach to -- see memories.project_id below. Exists
    -- specifically to replace the old implicit approach (the AI just
    -- noticing a proper noun in a transcript and matching later mentions by
    -- exact string -- see entities/listRecurringEntities), which silently
    -- treated "Atlas project" and "the Atlas team" as two unrelated things.
    -- A project has a stable id a memory can point at regardless of how it
    -- gets referred to in speech from one recording to the next.
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

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
    -- messages has no index on user_id despite listMessagesWithEmbeddings
    -- (repo/messages.ts -- the cross-chat recall candidate pool, called on
    -- EVERY chat send, see chatService.ts) filtering by user_id first,
    -- before chat_id/sender/embedding. Without this, that query does a
    -- full table scan of the single fastest-growing table in the app (one
    -- row per turn, across every chat, every user, unbounded) on every
    -- single message. idx_messages_user_created also covers
    -- listAllMessagesForUser's user_id + created_at query (the GDPR/CCPA
    -- data-export route).
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at);

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

    -- "Roles you're ready for" (Home screen) -- up to 5 {title, industry}
    -- pairs an AI call names as genuinely supported by a sample of the
    -- user's own memories (see generateSuggestedRoles in lib/ai.ts).
    -- industry is stored as NULL, not a guessed string, whenever the
    -- memories themselves don't point at one specific field -- the UI shows
    -- that honestly as "Any industry" rather than inventing one. Generated
    -- by the SAME monthly automation as growth_narratives above (see
    -- app/api/growth-narrative/run) -- deliberately reusing that existing
    -- cron + secret instead of standing up a second one, since the two
    -- features already run on the same "enough history, due again" cadence
    -- (see shouldGenerateSuggestedRoles in lib/repo/suggestedRoles.ts).
    -- roles_json is a JSON array (not normalized rows) since it's always
    -- read and replaced as one unit, never queried per-role.
    CREATE TABLE IF NOT EXISTS suggested_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      roles_json TEXT NOT NULL,
      memory_count_at_generation INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_suggested_roles_user ON suggested_roles(user_id, created_at);

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

    -- "Proactive check-ins" -- the thing neither ChatGPT nor Claude can do:
    -- follow up, unprompted, on something the user mentioned was coming up.
    -- Extracted at memory-creation time (see futureCheckin in
    -- generateMemoryMetadata, lib/ai.ts) whenever a transcript names a
    -- specific upcoming event with an identifiable timeframe ("interview
    -- next Friday," "hard conversation with my manager next week"). A daily
    -- external automation (see /api/checkins/run, CHECKIN_SECRET in
    -- lib/adminAuth.ts) activates rows once target_date arrives and pushes
    -- a notification; answering (see /api/checkins/[id]/answer) creates a
    -- brand-new linked memory rather than editing the original one, since
    -- the follow-up is itself a genuinely new moment in time.
    -- status: pending (waiting for target_date) -> active (surfaced via
    -- push + Home banner, waiting on the user) -> answered | dismissed |
    -- expired (target_date passed by too long without the user acting --
    -- see CHECKIN_STALE_DAYS in the run route).
    CREATE TABLE IF NOT EXISTS pending_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      target_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_checkins_user ON pending_checkins(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_pending_checkins_due ON pending_checkins(status, target_date);

    -- One row per "someone's actually proud of you" push actually sent (see
    -- generateUnderplayedWinCallout in lib/ai.ts and app/api/underplayed-win/run)
    -- -- the unprompted callout on a specific past memory the user described
    -- in flat/self-minimizing language (see selfMinimized/self_minimized on
    -- the memories table below). memory_id records exactly which memory the
    -- message was about, both so the tap target can deep-link straight to it
    -- and so shouldSurfaceUnderplayedWin (lib/repo/underplayedWins.ts) can
    -- exclude already-surfaced memories from future candidate batches --
    -- each real memory only ever gets used for this once.
    CREATE TABLE IF NOT EXISTS underplayed_win_callouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      message_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_underplayed_win_callouts_user ON underplayed_win_callouts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_underplayed_win_callouts_memory ON underplayed_win_callouts(memory_id);

    -- The in-app notification center (bell icon on Home -- see
    -- app/(app)/home/HomeClient.tsx and app/(app)/notifications). Every
    -- automatic push this app sends (weekly recap, growth narrative,
    -- quarterly benchmark, check-ins, the underplayed-win callout, and admin
    -- nudges) writes one row here at the same moment it sends the phone push
    -- -- see notifyUser in lib/notify.ts, the single place both happen
    -- together. This is what makes the bell a permanent, complete history:
    -- unlike a push, it's still there if the phone was silenced, push was
    -- never enabled, or the user just didn't look at the time. 'type' is a
    -- loose tag (e.g. 'weekly_recap', 'nudge') for icon/grouping purposes
    -- only, not a closed enum enforced at the DB level -- same pragmatism as
    -- memories.category. 'route' mirrors the push's own deep-link target
    -- (see sendPushToAllDevices's 'route' field in lib/push.ts) so tapping a
    -- row in the list does exactly what tapping the original push would
    -- have done.
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      route TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read);

    -- Per-user on/off switches for each of the 7 notification types (see
    -- NOTIFICATION_TYPES in lib/notificationTypes.ts) -- the Settings >
    -- Notifications screen (app/(app)/settings/notifications). One column
    -- per type rather than a normalized key/value table, since the set of
    -- types is small and fixed and this keeps a single read cheap (no join,
    -- no JSON parsing). Deliberately lazy: no row means "everything on",
    -- the default -- a row only gets created the first time someone flips
    -- ANY switch (see setNotificationPref in lib/repo/notificationPrefs.ts),
    -- so a user who never visits this screen costs nothing here. Checked by
    -- notifyUser (lib/notify.ts) before EVERY automatic notification -- a
    -- disabled type is skipped entirely (no in-app row, no push), not just
    -- hidden from the list.
    CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      weekly_recap INTEGER NOT NULL DEFAULT 1,
      growth_narrative INTEGER NOT NULL DEFAULT 1,
      quarterly_benchmark INTEGER NOT NULL DEFAULT 1,
      checkin INTEGER NOT NULL DEFAULT 1,
      underplayed_win INTEGER NOT NULL DEFAULT 1,
      nudge INTEGER NOT NULL DEFAULT 1,
      category_insight INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    -- Cached "Career Wrapped" aggregate for one user + one period (a
    -- calendar year, e.g. "2026", or the literal string "all" -- see
    -- periodKeyForYear/ALL_TIME_PERIOD_KEY in lib/careerWrapped.ts; never a
    -- hardcoded year in code, only in this column's stored value). Unlike
    -- weekly_recaps/growth_narratives/quarterly_benchmarks/
    -- underplayed_win_callouts above, this is NOT an AI-authored text --
    -- muscle_scores is deterministic aggregation over memories.competencies
    -- (see computeCareerWrappedSnapshot in lib/careerWrapped.ts), so there's
    -- no OpenAI cost to gate with a cron/eligibility check the way those
    -- four do. Instead this is a plain read-through cache: Home/the
    -- /career-wrapped page reads the latest row for (user_id, period_key);
    -- if it's missing or stale (memory_count_at_generation /
    -- analysis_version don't match current reality -- see
    -- isCareerWrappedSnapshotStale), the caller recomputes synchronously
    -- (cheap: bounded SQL scan of one user's memories, no network call) and
    -- upserts a fresh row before rendering. analysis_version exists purely
    -- so a future change to the muscle taxonomy/mapping can invalidate every
    -- old cached row at once without a data migration -- bump
    -- CAREER_WRAPPED_ANALYSIS_VERSION and every snapshot recomputes on next
    -- read.
    CREATE TABLE IF NOT EXISTS career_wrapped_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      wins_count INTEGER NOT NULL DEFAULT 0,
      leadership_count INTEGER NOT NULL DEFAULT 0,
      problems_solved_count INTEGER NOT NULL DEFAULT 0,
      senior_stakeholder_count INTEGER NOT NULL DEFAULT 0,
      muscle_scores TEXT NOT NULL,
      strongest_muscle TEXT,
      growing_muscle TEXT,
      underrepresented_muscle TEXT,
      memory_count_at_generation INTEGER NOT NULL,
      analysis_version INTEGER NOT NULL,
      generated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_career_wrapped_snapshots_period ON career_wrapped_snapshots(user_id, period_key);

    -- One row per generated shareable Career Card (see
    -- app/api/career-wrapped/share/route.ts and app/cw/[shareId]). id is the
    -- unguessable public slug used in the /cw/[shareId] landing page's URL
    -- and as the seed for that page's opengraph-image, so it has to be
    -- unpredictable (crypto-random, same newId() convention as every other
    -- table) -- unlike every other id in this app, this one is embedded in
    -- a link meant to be posted publicly on LinkedIn/X/WhatsApp. card_data
    -- is the exact JSON snapshot of ONLY the aggregated fields the user
    -- approved on the pre-share preview (never raw memory text/project/
    -- client names -- see the privacy preview step in
    -- CareerCardClient.tsx) -- stored as its own copy, deliberately not a
    -- live join against career_wrapped_snapshots, so a share link keeps
    -- showing exactly what the user agreed to even if their underlying data
    -- (or the muscle taxonomy) changes afterward. revoked lets a user pull a
    -- link down after the fact (see DELETE /api/career-wrapped/share/[id])
    -- without deleting the row outright, so view_count history survives.
    CREATE TABLE IF NOT EXISTS career_wrapped_shares (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      template TEXT NOT NULL DEFAULT 'A',
      card_data TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_career_wrapped_shares_user ON career_wrapped_shares(user_id, created_at);

    -- Minimal in-app product-analytics event log (see lib/analytics.ts and
    -- POST /api/analytics/event). Added specifically because
    -- components/Analytics.tsx deliberately excludes GA4 from every
    -- (app)/admin route and the native shell (isNativeApp() ||
    -- pathname.startsWith('/app') || pathname.startsWith('/admin') all
    -- return null, i.e. no gtag ever loads there), and Singular
    -- (lib/singular.ts) only does native install attribution, not custom
    -- in-product events -- so there was no working destination for events
    -- like career_wrapped_opened/career_card_shared_linkedin fired from
    -- inside the signed-in product. A plain owned table (rather than a
    -- third-party SDK) also means the retention/virality questions in the
    -- Career Wrapped spec ("does this improve weekly retention," "do cards
    -- generate new signups") can be answered with a normal SQL query against
    -- data we already have, no export/warehouse needed. user_id is nullable
    -- because the public /cw/[shareId] landing page can fire
    -- career_card_share_clicked-style events from a logged-out visitor.
    -- properties is a loose JSON blob (same pragmatism as notifications.type
    -- elsewhere in this file) -- this is an event log, not a normalized
    -- schema, and is expected to grow the fastest of any table here once
    -- Career Wrapped ships, so keep queries against it scoped by
    -- event_name/created_at, mirroring the messages-table indexing lesson
    -- above.
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_name TEXT NOT NULL,
      properties TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created ON analytics_events(event_name, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, created_at);

    -- Career Profile: the fun, quiz-answer-based "front door" experience
    -- (Home redesign, phase 3 stage 1) -- deliberately a SEPARATE system
    -- from career_wrapped_snapshots/career_wrapped_shares above. Career
    -- Wrapped is evidence derived from real memories; Career Profile is
    -- purely "what your quiz answers say about you" and must never be
    -- blended with or presented as memory-derived evidence -- see
    -- lib/careerProfile.ts's file comment. One row per completed quiz per
    -- user; a retake overwrites the existing row in place (no history kept
    -- -- product decision, matches "don't make users repeat quizzes unless
    -- they choose to" while keeping this simple). quiz_version lets a
    -- future change to a quiz's questions/scoring invalidate old rows
    -- without a data migration, same convention as career_wrapped_snapshots'
    -- analysis_version. dimension_scores/answers are JSON blobs, same
    -- pragmatism as every other JSON column in this file.
    CREATE TABLE IF NOT EXISTS career_profile_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id TEXT NOT NULL,
      quiz_version INTEGER NOT NULL,
      answers TEXT NOT NULL,
      dimension_scores TEXT NOT NULL,
      result_key TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_career_profile_results_user_quiz ON career_profile_results(user_id, quiz_id);

    -- One row per generated shareable Career Profile Card, once all 5
    -- quizzes are complete -- same shape/purpose as career_wrapped_shares
    -- above (id is the public unguessable slug embedded in /cp/[shareId],
    -- card_data is a frozen JSON snapshot taken at reveal time so the link
    -- keeps showing what the user actually shared even if they retake a
    -- quiz afterward, revoked is a soft-delete). Not populated yet as of
    -- phase-3-stage-1 (only one of five quizzes is implemented so far) --
    -- created now so the schema is ready when the remaining quizzes ship.
    CREATE TABLE IF NOT EXISTS career_profile_shares (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_data TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_career_profile_shares_user ON career_profile_shares(user_id, created_at);

    -- Public, unauthenticated Career Profile Card shares -- created when
    -- someone completes all 5 quizzes on the marketing site's /quiz flow
    -- WITHOUT ever signing in (Home redesign, phase: quizzes move to
    -- strivo.ai as a top-of-funnel mechanic, replacing the in-app hub).
    -- Deliberately a SEPARATE table from career_profile_shares above,
    -- with NO user_id column at all, rather than relaxing that table's
    -- user_id NOT NULL REFERENCES users(id) constraint or inserting a
    -- placeholder "guest" row into users: several background jobs
    -- (engagement nudges, product-update drip, weekly recap, growth
    -- narrative, quarterly benchmark, check-ins, underplayed-win) already
    -- enumerate real rows in users and a fake row there risks silently
    -- pulling a guest into one of those. Same additive-only migration
    -- convention as everywhere else in this file -- see ROLLBACK.md.
    CREATE TABLE IF NOT EXISTS career_profile_public_shares (
      id TEXT PRIMARY KEY,
      card_data TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- One row per individual quiz someone finishes on the public /quiz flow
    -- (written from app/api/public/career-profile/[quizId]/score/route.ts
    -- right after it scores an answer set) -- added 2026-09-18 because the
    -- admin dashboard's only quiz signal used to be
    -- career_profile_public_shares above, i.e. people who finished all 5
    -- quizzes and generated a card. The founder pointed out that's a long
    -- way to ask people to go before showing up in any metric at all --
    -- most drop-off happens quiz-by-quiz, well before anyone reaches a
    -- card, and none of that was visible. Same "no user_id, anonymous
    -- event" posture as career_profile_public_shares (see its comment
    -- above) -- a retake logs another row on purpose, this counts
    -- completion events, not unique visitors.
    CREATE TABLE IF NOT EXISTS career_profile_public_quiz_completions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_career_profile_public_quiz_completions_quiz
      ON career_profile_public_quiz_completions(quiz_id, created_at);

    -- Server-driven processing for a long uploaded document that splits
    -- into several separate stories (see splitDocumentIntoStories in
    -- lib/ai.ts). Exists to fix a founder-reported bug (2026-09-17): the
    -- client used to drive the per-story save loop itself (one POST
    -- /api/memories request per story, one after another), which silently
    -- stopped partway through -- no error, nothing telling the user
    -- anything was missing -- whenever the phone's browser/WebView
    -- backgrounded long enough to suspend that page's JS (14 stories
    -- detected, only 4 actually saved, by the time they switched back to
    -- the app). POST /api/memories/batch (see that route) now writes ALL
    -- of a batch's rows here INSTANTLY (no AI calls, so no timeout risk)
    -- and returns right away; the actual per-story AI work happens in
    -- processStoryBatch (lib/storyBatchProcessor.ts), kicked off detached
    -- from that request/response so it keeps running whether or not the
    -- client is still around. The client only ever POLLS GET
    -- /api/memories/batch/[id] for progress -- safe to stop (backgrounding)
    -- and safe to resume (foregrounding) at any point, since polling reads
    -- state, it doesn't drive the work.
    CREATE TABLE IF NOT EXISTS story_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'completed'
      total INTEGER NOT NULL,
      -- Lease: when some server process last started/confirmed actively
      -- working this batch -- see claimStoryBatch in
      -- lib/repo/storyBatches.ts. Lets a status poll self-heal a batch
      -- that got orphaned mid-processing (a pm2 reload during a deploy,
      -- say) by re-claiming and resuming it, without two processes
      -- working the same batch at once in the normal case.
      claimed_at TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_story_batches_user ON story_batches(user_id, created_at);

    CREATE TABLE IF NOT EXISTS story_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES story_batches(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'failed'
      memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
      -- JSON string array, same milestone strings persistOneMemory returns
      -- (lib/memoryCreation.ts) -- the old per-story client loop got these
      -- straight back in each POST /api/memories response and aggregated
      -- them for the batch success screen's praise popup; stored here
      -- instead now that a story's save happens server-side without the
      -- client ever seeing that individual response (see
      -- processStoryBatch in lib/storyBatchProcessor.ts). NULL until done.
      milestones TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_story_batch_items_batch ON story_batch_items(batch_id, ordinal);

    -- The Opportunities tab's shared job pool (see lib/jooble.ts and
    -- app/api/opportunities/refresh-pool/run) -- fetched centrally for a
    -- fixed grid of functions x Indian cities, NOT per-user, specifically
    -- to stay inside Jooble's free-tier lifetime request cap. One row here
    -- can be matched against every user; refresh-pool/run upserts on
    -- jooble_id + last_seen_at so a job that's still live just gets its
    -- timestamp bumped rather than duplicated, and pruneStaleJobPostings
    -- (lib/repo/jobPostings.ts) drops rows that stop showing up in fresh
    -- fetches (the job's gone/filled at the source).
    CREATE TABLE IF NOT EXISTS job_postings (
      id TEXT PRIMARY KEY,
      jooble_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      snippet TEXT,
      salary TEXT,
      source_url TEXT NOT NULL,
      -- Which (function, city) grid search this row was fetched from --
      -- see FUNCTION_QUERIES/CITY_QUERIES in the refresh-pool route. Purely
      -- informational (helps debug why a given job showed up), never used
      -- as a hard filter -- matching is by actual title/snippet content.
      function_tag TEXT,
      city_tag TEXT,
      posted_date TEXT,
      fetched_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_postings_last_seen ON job_postings(last_seen_at);

    -- Cached, ranked Opportunities for one user (see lib/opportunities.ts).
    -- Recomputing the AI ranking on every tab open would be both slow and
    -- needlessly expensive -- this is the "user_opportunity_recommendations"
    -- cache from the product brief: generated once, reused until something
    -- that would actually change the ranking happens (new memories past a
    -- threshold, a new/refreshed suggested_roles row, or the cache going
    -- stale past OPPORTUNITIES_CACHE_MAX_AGE_DAYS -- see opportunities.ts).
    -- personalized = 0 means this was the generic (not-yet-personalized)
    -- fallback list shown to a user under the suggested_roles memory
    -- threshold, not a real ranking -- kept separate from a genuine
    -- personalized miss so the UI's "add memories to personalize" nudge and
    -- the cache-staleness check can both tell the two apart.
    CREATE TABLE IF NOT EXISTS user_opportunities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_posting_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      fit TEXT, -- 'strong' | 'good' | 'possible' -- see rankOpportunities in lib/ai.ts
      reason TEXT, -- one-line "why this fits", shown on the card
      personalized INTEGER NOT NULL DEFAULT 0,
      memory_count_at_generation INTEGER NOT NULL,
      generated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_opportunities_user ON user_opportunities(user_id, generated_at);

    -- One row per thumbs up/down on an Opportunities card (see
    -- POST /api/opportunities/[jobId]/feedback). Feedback captures career
    -- INTENT ("where do you want to go") which memories alone can't --
    -- kept as its own append-only log (not just a column on
    -- user_opportunities) so re-ranking never loses history, and so the
    -- same job can be re-shown and re-judged later without losing the
    -- earlier verdict.
    CREATE TABLE IF NOT EXISTS opportunity_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_posting_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      feedback TEXT NOT NULL, -- 'relevant' | 'not_for_me'
      reason TEXT, -- optional: 'wrong_role' | 'wrong_industry' | 'wrong_location' | 'too_senior' | 'too_junior' | 'not_interested'
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opportunity_feedback_user ON opportunity_feedback(user_id, job_posting_id);
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

  // Seed each feature-flag row the first time it's missing (not gated on
  // the table being empty, so adding another flag later just means adding
  // its key to this array). Everyone starts enabled -- this table only ever
  // turns something OFF deliberately from the admin panel, never ships
  // pre-disabled.
  const seedFlags: { key: string }[] = [
    { key: "ai_chat" },
    { key: "uploads" },
    { key: "push_notifications" },
    { key: "chat_tts" },
    { key: "career_wrapped" },
    { key: "career_profile" },
  ];
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

  // Whether this memory's own words visibly undersell a real accomplishment
  // (see selfMinimized in generateMemoryMetadata, lib/ai.ts) -- the flag
  // behind the unprompted "someone's actually proud of you" push (see
  // generateUnderplayedWinCallout in lib/ai.ts and app/api/underplayed-win/run).
  // Set once at creation time, same as competencies/praise -- never
  // recomputed on edit. Defaults to 0 (false) for memories created before
  // this existed, which is the safe default: they simply never become
  // candidates, not wrongly flagged either way.
  if (!memoryColumns.includes("self_minimized")) {
    db.exec(`ALTER TABLE memories ADD COLUMN self_minimized INTEGER NOT NULL DEFAULT 0;`);
  }
  // Short internal note (never shown to the user directly) naming the
  // specific gap the model spotted -- reused as grounding context when
  // generateUnderplayedWinCallout later writes the actual message. Always
  // null when self_minimized is 0.
  if (!memoryColumns.includes("self_minimized_reason")) {
    db.exec(`ALTER TABLE memories ADD COLUMN self_minimized_reason TEXT;`);
  }
  // JSON.stringify(string[]) of recurring proper nouns spotted in this
  // memory -- a manager's name, a team, a recurring project/product (see
  // entities in generateMemoryMetadata, lib/ai.ts). Distinct from tags
  // (generic lowercase keywords): this is specifically name-like things
  // worth remembering across memories, aggregated by
  // listRecurringEntities() into a lightweight personal glossary so the
  // chat can say "how did the rollout with Priya go?" instead of generic
  // phrasing. Null for memories created before this existed -- no
  // backfill, same rollout pattern as search_text/competencies before it.
  if (!memoryColumns.includes("entities")) {
    db.exec(`ALTER TABLE memories ADD COLUMN entities TEXT;`);
  }

  // Which project (see the `projects` table above) this memory has been
  // assigned to, if any -- deliberately NOT set automatically by AI
  // metadata generation, even when generateMemoryMetadata is confident
  // enough to suggest one (see suggestedExistingProjectId/
  // suggestedNewProjectName on its return value, lib/ai.ts). The AI's
  // suggestion is only ever a suggestion shown to the user (see
  // ProjectAssigner.tsx) -- this column is written only by an explicit
  // user action (PATCH /api/memories/[id]/project), same "AI proposes,
  // human confirms" principle as the transcription-cleanup pass in
  // transcribeAudio. No FK constraint on purpose (consistent with every
  // other column added via ALTER TABLE in this file) -- deleteProject
  // (lib/repo/projects.ts) clears this column on every memory that
  // pointed at it before removing the row, so a dangling reference should
  // never occur in practice, but the column itself stays a plain
  // nullable TEXT rather than relying on FK enforcement to guarantee it.
  // NULL for every memory created before this existed, and for any memory
  // never assigned one -- both read identically as "no project."
  if (!memoryColumns.includes("project_id")) {
    db.exec(`ALTER TABLE memories ADD COLUMN project_id TEXT;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);`);
  }

  // Vector embedding of a user (not AI) message's content, same
  // JSON.stringify(number[]) format as memories.embedding above (see
  // embedText in lib/ai.ts). Lets retrieval (lib/retrieval.ts) recall
  // something the user mentioned in passing in a DIFFERENT chat that was
  // never saved as a formal Memory -- otherwise a casual mention is
  // invisible to every conversation except the one it happened in. Set in
  // the background after a message is saved (see chatService.ts), not
  // synchronously, so it never adds latency to the reply the user is
  // waiting on. Null for messages sent before this existed and for AI
  // replies (only the user's own words are worth recalling this way).
  const messageColumns = (db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[]).map((c) => c.name);
  if (!messageColumns.includes("embedding")) {
    db.exec(`ALTER TABLE messages ADD COLUMN embedding TEXT;`);
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

  // Timestamp of the last automated re-engagement push sent to this user
  // (see lib/engagement.ts and /api/engagement-nudge/run) -- distinct from
  // last_active_at (when THEY last opened the app) and from the `nudges`
  // table (which only logs admin-composed, hand-written broadcasts). This
  // is what lets the engagement-nudge job enforce a per-user cooldown (see
  // computeEngagementTier's cadenceDays) instead of re-sending every time
  // the job runs. Null means "never sent one yet."
  if (!userColumns.includes("last_engagement_nudge_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN last_engagement_nudge_at TEXT;`);
  }
  // Same idea as last_engagement_nudge_at above, for the category-imbalance
  // insight (see lib/categoryInsight.ts and /api/category-insight/run) --
  // a separate cooldown timestamp since the two automations run on
  // different schedules and shouldn't share a gate. Null means "never sent
  // one yet."
  if (!userColumns.includes("last_category_insight_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN last_category_insight_at TEXT;`);
  }

  // 7th notification type -- see NOTIFICATION_TYPES in
  // lib/notificationTypes.ts and /api/category-insight/run. Existing
  // installs already have the notification_prefs table from before this
  // column existed (the CREATE TABLE above only applies to a brand-new
  // database), so it needs its own ALTER here same as every other
  // incremental column in this file. Defaults to 1 (on) for the same
  // "lazy row, no row means everything's on" reasoning as the other 6
  // columns -- see the table's own comment above.
  const notificationPrefColumns = (
    db.prepare(`PRAGMA table_info(notification_prefs)`).all() as { name: string }[]
  ).map((c) => c.name);
  if (!notificationPrefColumns.includes("category_insight")) {
    db.exec(`ALTER TABLE notification_prefs ADD COLUMN category_insight INTEGER NOT NULL DEFAULT 1;`);
  }

  // Resume upload (see /api/profile/resume, settings/resume, and the
  // "Upload Resume" option on /first-record) -- stored as background
  // context on the user row, not as a Memory, so it doesn't clutter the
  // Memories list. resume_text feeds buildSystemPrompt (lib/ai.ts) so chat
  // answers can reference it; resume_filename/resume_uploaded_at are just
  // for the Settings UI to show what's on file. All null until someone
  // uploads one; re-uploading overwrites all three together (see
  // setResume in lib/repo/users.ts), there's no history of past resumes.
  if (!userColumns.includes("resume_text")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_text TEXT;`);
  }
  if (!userColumns.includes("resume_filename")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_filename TEXT;`);
  }
  if (!userColumns.includes("resume_uploaded_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_uploaded_at TEXT;`);
  }

  // Timestamp of the LAST time the resume-reminder automation (see
  // lib/resumeReminder.ts and /api/resume-reminder/run) notified someone who
  // still has no resume on file -- same shape as
  // last_engagement_nudge_at/last_category_insight_at above: a recurring
  // cooldown, not a one-time flag. First nudge fires off account age
  // (FIRST_REMINDER_AFTER_DAYS since created_at) while this is still null;
  // every nudge after that fires REPEAT_REMINDER_EVERY_DAYS since THIS
  // timestamp. Null means never sent. Stops being updated (and stops being
  // checked at all) once resume_text is set -- see isDueForResumeReminder.
  if (!userColumns.includes("resume_reminder_sent_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_reminder_sent_at TEXT;`);
  }

  // Server-side companion to Log Out. Strivo's sessions are stateless JWTs
  // (see the comment on authOptions.session in lib/auth.ts) -- normally
  // "logging out" only works by deleting the cookie, which has no
  // server-side backstop if that deletion is ever lost. On Android that
  // deletion genuinely can be lost: WebView batches cookie writes to disk
  // rather than committing them immediately, so if the app's process gets
  // killed shortly after Log Out (very ordinary -- it's exactly what
  // happens when someone logs out and then closes the app), the deletion
  // never reaches disk and the next cold start reads the old, still-valid
  // cookie back and silently signs them back in. Stamping this on every
  // sign-out (see events.signOut in lib/auth.ts) and checking it against
  // each token's own login time (token.loginAt) in both the jwt/session
  // callbacks and proxy.ts's page middleware means a replayed pre-logout
  // token is rejected by the SERVER regardless of whether the client ever
  // actually got rid of the cookie -- fixing this with no dependency on
  // Android cookie-flush timing at all.
  if (!userColumns.includes("logged_out_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN logged_out_at TEXT;`);
  }

  // First-run product tour built around the actual record -> save -> chat
  // loop, not a static walk of the nav bar. Three checkpoints, tracked as a
  // single step counter rather than a boolean so progress survives across
  // Home/Record/Chats tab switches (see NavTourProvider in NavTour.tsx,
  // which is what actually reads/advances this):
  //   0 = not started -> spotlight the Record tab.
  //   1 = tapped through step 0, hasn't saved a memory yet -> no overlay;
  //       record/page.tsx shows the "that's saved" callout the moment their
  //       first memory finishes saving, which advances to 2.
  //   2 = spotlight the Chats tab.
  //   3 = done (completed OR skipped at any point) -> never shown again.
  // Deliberately separate from /first-record (which already covers "record
  // your first memory and see the wow") -- this only points them at WHERE
  // things live once that's done. See /api/tour/step for the write path.
  if (!userColumns.includes("nav_tour_step")) {
    db.exec(`ALTER TABLE users ADD COLUMN nav_tour_step INTEGER NOT NULL DEFAULT 0;`);
  }

  // Daily "Product Updates" email drip (see /api/product-update-drip/run
  // and lib/productUpdateDrip.ts). Deliberately has NO "drip started at"
  // column -- each user's personal day-1 falls out naturally from these two
  // fields instead of needing to be tracked explicitly: on any day the cron
  // runs, a user is due for their next post if
  // product_update_last_sent_at is null (never sent one) OR far enough in
  // the past (>= ~20h, so timing drift in the daily cron can't skip a day
  // or double-send). product_update_sent_count doubles as BOTH "how many
  // they've received" and the 0-based index into the Product Updates
  // category ordered oldest-first (see listProductUpdatePostsOrdered in
  // repo/blogPosts.ts) -- posts[sent_count] is always their next one. This
  // is what makes two users who joined on different days land on different
  // posts automatically: someone who joined today starts at index 0 today;
  // someone who joined a week ago is already partway through and never
  // repeats what they've seen, with zero per-user "start date" bookkeeping.
  if (!userColumns.includes("product_update_sent_count")) {
    db.exec(`ALTER TABLE users ADD COLUMN product_update_sent_count INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!userColumns.includes("product_update_last_sent_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN product_update_last_sent_at TEXT;`);
  }

  // Per-post CTA override for the Product Updates email drip (see
  // emailProductUpdate.ts and /api/product-update-drip/run) -- lets a post
  // about the Record feature end its email with "Record your first
  // memory" linking to /record, one about Memories end with "Create a
  // memory" linking to /memories, one about Chat end with "Ask Strivo
  // something" linking to /chats, etc., instead of every drip email ending
  // on the same generic "Open Strivo" link regardless of what it's about.
  // Both nullable: older posts published before this existed (and any post
  // the writing automation doesn't set these on) fall back to a generic
  // "Open Strivo" -> /home CTA in the email-sending code rather than
  // erroring or showing a blank button.
  const blogPostColumns = (db.prepare(`PRAGMA table_info(blog_posts)`).all() as { name: string }[]).map((c) => c.name);
  if (!blogPostColumns.includes("cta_label")) {
    db.exec(`ALTER TABLE blog_posts ADD COLUMN cta_label TEXT;`);
  }
  if (!blogPostColumns.includes("cta_path")) {
    db.exec(`ALTER TABLE blog_posts ADD COLUMN cta_path TEXT;`);
  }

  // Best-effort 2-letter country code (e.g. "IN", "US"), captured from
  // Cloudflare's automatic `cf-ipcountry` request header (see
  // maybeSetUserCountry in repo/users.ts, called from (app)/layout.tsx on
  // every protected page load) -- no GeoIP API/dependency needed since
  // Cloudflare already resolves this at the edge for every request that
  // reaches origin. Null for anyone who signed up before this shipped, or
  // if the header isn't present for some reason (e.g. request didn't come
  // through Cloudflare). Written once and left alone after that -- a
  // traveling user's country isn't re-derived on every page load, this is
  // "where they most likely are/were", not a live location tracker.
  if (!userColumns.includes("country")) {
    db.exec(`ALTER TABLE users ADD COLUMN country TEXT;`);
  }

  // Guideline 5.1.2(i) requires clearly disclosing when personal data goes
  // to a third-party AI and getting explicit permission before it does --
  // Strivo's Privacy Policy already discloses this, but the old signup
  // flow only linked to Terms/Privacy generically, never naming AI itself
  // in the consent step -- see /ai-consent and its gate in
  // (app)/layout.tsx. NULL for anyone who signed up before this shipped
  // (including every existing account) so they're prompted for it on
  // their next visit too, not just brand-new signups -- this is a real
  // compliance gap being closed retroactively, not just a new-user thing.
  if (!userColumns.includes("ai_consent_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN ai_consent_at TEXT;`);
  }

  // Whether this memory's transcript describes interacting with a
  // senior/executive-level stakeholder (a VP, director, C-suite exec, a
  // client's own leadership, etc.) -- classified in the SAME AI round trip
  // as competencies/praise/entities (see generateMemoryMetadata in
  // lib/ai.ts), not a separate call, so new memories get this for free with
  // no added latency or cost. Feeds the "senior-stakeholder interactions"
  // stat on the Career Wrapped Home preview (see lib/careerWrapped.ts).
  // Nullable and tri-state on purpose (NULL/0/1, not just 0/1 like
  // has_metric) -- NULL specifically means "created before this existed,
  // never classified," which is what lets the backfill route
  // (app/api/career-wrapped/backfill/route.ts) find exactly the memories
  // that still need a pass, the same "safely backfill without touching
  // memories that already went through it" requirement the Career Wrapped
  // spec calls for. Deliberately scoped narrow in the prompt (see
  // classifySeniorStakeholder's comment in lib/ai.ts) so it doesn't fire on
  // every mention of "my manager."
  if (!memoryColumns.includes("mentions_senior_stakeholder")) {
    db.exec(`ALTER TABLE memories ADD COLUMN mentions_senior_stakeholder INTEGER;`);
  }

  // 8th notification type -- "New career signal discovered" / "Your
  // Leadership evidence just got stronger" pushes fired when a fresh memory
  // meaningfully changes the user's Career Wrapped picture (see
  // maybeNotifyCareerSignal in lib/careerWrapped.ts, called from
  // chatService.ts/record's save path the same way underplayed-win and
  // category-insight are). Same lazy "no row means on" default as every
  // other column on this table -- see its own comment above.
  if (!notificationPrefColumns.includes("career_wrapped_signal")) {
    db.exec(`ALTER TABLE notification_prefs ADD COLUMN career_wrapped_signal INTEGER NOT NULL DEFAULT 1;`);
  }

  // Aggregate, COUNTS-ONLY read of a user's uploaded resume (see
  // analyzeResumeCareerStats in lib/ai.ts) -- how many wins/leadership
  // moments/problems solved/senior-stakeholder interactions the resume
  // appears to describe, using the same classification bar Career Wrapped
  // uses for a real recorded memory (see lib/careerWrapped.ts). Shown as a
  // small supplementary "also seen in your resume" line on the Home stats
  // card (see resumeStats in app/(app)/home/page.tsx) -- deliberately NEVER
  // merged into the primary memory-derived numbers and never turned into
  // actual Memory rows, since a resume is usually already a summary of
  // things a user may separately record in full -- doing that would risk
  // double-counting the same achievement twice. Computed once, synchronously,
  // right when a resume is saved (see POST /api/profile/resume) -- a single
  // bounded AI call, not the kind of unbounded per-story work that caused
  // the 2026-09-17 upload timeout, so no background job needed. All null
  // until a resume is uploaded; cleared together with the other resume_*
  // columns on removal (see clearResume in lib/repo/users.ts).
  // resume_stats_computed_at is null if analysis failed (e.g. no OpenAI
  // client available) even though resume_text is set -- distinguishes "no
  // resume" from "resume on file, stats not available" so the Home card
  // never shows a false zero.
  if (!userColumns.includes("resume_stats_wins")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_stats_wins INTEGER;`);
  }
  if (!userColumns.includes("resume_stats_leadership")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_stats_leadership INTEGER;`);
  }
  if (!userColumns.includes("resume_stats_problems")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_stats_problems INTEGER;`);
  }
  if (!userColumns.includes("resume_stats_stakeholder")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_stats_stakeholder INTEGER;`);
  }
  if (!userColumns.includes("resume_stats_computed_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN resume_stats_computed_at TEXT;`);
  }

  // WhatsApp/re-engagement phone capture (2026-09-19 product decision --
  // push notifications are effectively dead as a re-engagement channel: see
  // the Home banner in components/PhoneNumberBanner.tsx and its gate in
  // (app)/home/page.tsx via shouldShowPhoneBanner in repo/users.ts). Three
  // columns, deliberately separate rather than one:
  //
  // - phone_number: raw, user-entered, expected (but not enforced at the DB
  //   level) to include a country code -- see the client-side validation in
  //   PhoneNumberBanner.tsx. Null until someone submits the banner or adds
  //   one from Settings.
  // - phone_consent_at: stamped every time the banner/settings form is
  //   submitted, alongside the number -- this is the compliance evidence
  //   trail for WhatsApp's Marketing-template consent requirement, same
  //   role ai_consent_at plays for the OpenAI disclosure (see that column's
  //   comment above). Unlike ai_consent_at this is NOT write-once: it's
  //   deliberately re-stamped if someone updates their number later, since
  //   each submission is its own fresh, explicit consent event, not a
  //   one-time gate.
  // - phone_banner_dismissed_at: lets the Home banner behave like the
  //   plan-nudge screen (see PLAN_NUDGE_AFTER_MS/needsPlanNudge above) --
  //   dismissing it doesn't hide it forever, it resurfaces after
  //   PHONE_BANNER_SNOOZE_MS so someone who dismissed reflexively without
  //   reading it still gets asked again, without nagging every single
  //   visit.
  if (!userColumns.includes("phone_number")) {
    db.exec(`ALTER TABLE users ADD COLUMN phone_number TEXT;`);
  }
  if (!userColumns.includes("phone_consent_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN phone_consent_at TEXT;`);
  }
  if (!userColumns.includes("phone_banner_dismissed_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN phone_banner_dismissed_at TEXT;`);
  }
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
