import { getDb } from "@/lib/db";
import { getSubscriptionInfo, type User } from "@/lib/repo/users";
import { listProductUpdatePostsOrdered } from "@/lib/repo/blogPosts";

export type AdminMetrics = {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  statusCounts: { trial: number; active: number; expired: number };
  // active / (active + expired) — only counts users whose trial has
  // actually run its course one way or the other, so people still mid-trial
  // don't dilute the number. Null until at least one person has converted
  // or lapsed.
  conversionRate: number | null;
  totalMemories: number;
  totalChats: number;
  totalMessages: number;
  avgMemoriesPerUser: number;
  activeUsers: { daily: number; weekly: number; monthly: number };
  // How many devices have registered for real push notifications (see
  // push_tokens / usePushRegistration.ts) — shown next to the nudge
  // composer so it's obvious whether "send" actually reaches any phones
  // yet, since that only happens once someone has the app build with
  // notifications built in installed and open at least once.
  registeredDevices: number;
  // Day-by-day counts, oldest first, for the growth/engagement charts on
  // the admin dashboard.
  dailySignups: { date: string; count: number }[];
  dailyMemories: { date: string; count: number }[];
  // Day-by-day DAU/WAU/MAU, oldest first -- see activeUsersTrend() below
  // for how each day's three numbers are computed (trailing 1/7/30-day
  // windows ENDING on that day, not the day's own activity in isolation).
  activeUsersTrend: { date: string; dau: number; wau: number; mau: number }[];
  memorySourceBreakdown: { voice: number; text: number; file: number };
  topCategories: { category: string; count: number }[];
  // Signed up but never recorded a single memory — the clearest signal of
  // someone who bounced off the core "record a memory" action entirely.
  zeroMemoryUsers: number;
  // Fraction (0-1) of all signups who recorded at least one memory in the
  // last 7 days — a rough stickiness/retention proxy until there's real
  // session tracking.
  recordedLast7dRate: number;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// India is Strivo's target market -- same IST convention used everywhere
// else "today" needs to mean a real calendar day, not a rolling 24h window
// (src/lib/retrieval.ts's IST_OFFSET_MS, src/app/api/product-update-drip
// /run/route.ts's todayIstMidnightUtc, etc.). Duplicated here rather than
// imported, same reasoning as those files: it's a tiny fixed constant.
//
// 2026-09-10 fix: newUsersToday/ThisWeek/ThisMonth and dailyCounts() below
// used to use isoDaysAgo() (a rolling window from the exact request
// instant) and substr(created_at,1,10) (a raw slice of the UTC-stored
// created_at string) respectively -- two DIFFERENT, un-aligned definitions
// of "today," and a THIRD one again in admin/page.tsx's Joined column
// (browser-local time via toLocaleDateString(), which is IST for a founder
// viewing from India but not guaranteed). Founder noticed the "New Today"
// stat card, the signups chart's rightmost point, and counting rows in the
// Users table by Joined date all disagreed -- because they were, genuinely,
// three different calculations. Signup counts now use IST calendar-day
// boundaries everywhere (this file and the Joined column); DAU/WAU/MAU
// below deliberately keep rolling trailing windows (see activeUsersTrend's
// own comment) since "active in the last 24h" is a defensible, different
// definition from "signed up on this calendar day."
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The UTC instant for "midnight IST, `daysAgo` days before today" --
// daysAgo=0 is the start of today (IST); daysAgo=6 is the start of the IST
// day 6 days ago, so "created_at >= istMidnightUtcDaysAgo(6)" is a 7-day,
// calendar-aligned window that includes today.
function istMidnightUtcDaysAgo(daysAgo: number): string {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightTodayUtcMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return new Date(istMidnightTodayUtcMs - daysAgo * 86400000).toISOString();
}

// IST calendar-day key (YYYY-MM-DD) for a UTC ISO timestamp -- e.g. a
// signup at 2026-09-09T19:00:00Z (00:30 IST on the 10th) correctly buckets
// under "2026-09-10", not "2026-09-09" like a raw UTC substr would.
function istDateKey(isoUtc: string): string {
  return new Date(new Date(isoUtc).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function count(sql: string, ...params: (string | number)[]): number {
  const db = getDb();
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

// Distinct users who created a memory, chat, or message in the given
// window — the closest proxy we have to "active users" without a separate
// login/session-tracking table. Combines all three so someone who only
// chats (no new memories that day) still counts.
function activeUsersSince(iso: string): number {
  return count(
    `SELECT COUNT(DISTINCT user_id) as c FROM (
       SELECT user_id, created_at FROM memories
       UNION ALL
       SELECT user_id, created_at FROM chats
       UNION ALL
       SELECT user_id, created_at FROM messages
     ) WHERE created_at >= ?`,
    iso
  );
}

// Day-by-day row counts for the last `days` days (including today),
// oldest first, with gaps filled in as 0 — table name is only ever passed
// as a fixed literal from computeAdminMetrics below, never user input.
//
// Buckets by IST calendar day (see istDateKey/IST_OFFSET_MS comment above),
// not a raw substr() of the UTC-stored created_at string -- that used to
// silently misfile any signup between IST 00:00-05:29 (UTC 18:30-23:59 the
// previous day) into "yesterday" forever, and made "today"'s bar a partial
// UTC-day count instead of a real IST calendar day. Pulling raw rows and
// bucketing in JS (rather than a SQL GROUP BY on a computed column) is the
// same tradeoff activeUsersTrend below already makes -- cheap at this data
// scale, and simpler than teaching SQLite an IST-aware date expression.
function dailyCounts(table: "users" | "memories", days = 30): { date: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT created_at FROM ${table} WHERE created_at >= ?`)
    .all(istMidnightUtcDaysAgo(days - 1)) as { created_at: string }[];
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const key = istDateKey(r.created_at);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = istDateKey(istMidnightUtcDaysAgo(i));
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

// Real DAU/WAU/MAU trend, oldest first -- for each of the last `days` days,
// computes distinct active users (same memories/chats/messages union as
// activeUsersSince above) in a trailing 1-day / 7-day / 30-day window
// ENDING on that day. This is what "DAU on day X" actually means (active
// in the 24h ending on X), not "rows created on day X in isolation."
//
// Deliberately one bounded SQL query (everything touched in the last
// `days - 1 + 29` days, since the oldest day's MAU window reaches back 30
// days before it) rather than up to `days * 3` separate COUNT queries --
// same N+1-avoidance reasoning as listUsersForAdmin's memory/chat count
// merge above. The per-day set math then happens in memory, which is cheap
// at this data scale (a young product's total activity rows, not millions).
function activeUsersTrend(days = 30): { date: string; dau: number; wau: number; mau: number }[] {
  const db = getDb();
  const lookbackIso = isoDaysAgo(days - 1 + 29);
  const rows = db
    .prepare(
      `SELECT user_id, created_at FROM memories WHERE created_at >= ?
       UNION ALL
       SELECT user_id, created_at FROM chats WHERE created_at >= ?
       UNION ALL
       SELECT user_id, created_at FROM messages WHERE created_at >= ?`
    )
    .all(lookbackIso, lookbackIso, lookbackIso) as { user_id: string; created_at: string }[];

  const out: { date: string; dau: number; wau: number; mau: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const windowEnd = new Date(Date.now() - i * 86400000);
    const windowEndIso = windowEnd.toISOString();
    const dateKey = windowEndIso.slice(0, 10);
    const dauStartIso = new Date(windowEnd.getTime() - 1 * 86400000).toISOString();
    const wauStartIso = new Date(windowEnd.getTime() - 7 * 86400000).toISOString();
    const mauStartIso = new Date(windowEnd.getTime() - 30 * 86400000).toISOString();

    const dau = new Set<string>();
    const wau = new Set<string>();
    const mau = new Set<string>();
    for (const r of rows) {
      if (r.created_at > windowEndIso || r.created_at < mauStartIso) continue;
      mau.add(r.user_id);
      if (r.created_at >= wauStartIso) wau.add(r.user_id);
      if (r.created_at >= dauStartIso) dau.add(r.user_id);
    }
    out.push({ date: dateKey, dau: dau.size, wau: wau.size, mau: mau.size });
  }
  return out;
}

export function computeAdminMetrics(): AdminMetrics {
  const db = getDb();

  const totalUsers = count(`SELECT COUNT(*) as c FROM users`);
  // IST calendar-day boundaries (see the 2026-09-10 fix comment above
  // istMidnightUtcDaysAgo) -- "today" is a real IST calendar day, "this
  // week"/"this month" are 7/30-day windows aligned to that same boundary
  // (ending today, inclusive) rather than rolling from the exact request
  // instant. Matches the signups chart and the Users table's Joined column.
  const newUsersToday = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, istMidnightUtcDaysAgo(0));
  const newUsersThisWeek = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, istMidnightUtcDaysAgo(6));
  const newUsersThisMonth = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, istMidnightUtcDaysAgo(29));

  const users = db.prepare(`SELECT subscription_status, trial_ends_at FROM users`).all() as Pick<
    User,
    "subscription_status" | "trial_ends_at"
  >[];
  const statusCounts = { trial: 0, active: 0, expired: 0 };
  for (const u of users) {
    statusCounts[getSubscriptionInfo(u).status]++;
  }
  const decided = statusCounts.active + statusCounts.expired;
  const conversionRate = decided > 0 ? statusCounts.active / decided : null;

  const totalMemories = count(`SELECT COUNT(*) as c FROM memories`);
  const totalChats = count(`SELECT COUNT(*) as c FROM chats`);
  const totalMessages = count(`SELECT COUNT(*) as c FROM messages`);
  const avgMemoriesPerUser = totalUsers > 0 ? totalMemories / totalUsers : 0;
  const registeredDevices = count(`SELECT COUNT(*) as c FROM push_tokens`);

  const sourceRows = db.prepare(`SELECT source, COUNT(*) as c FROM memories GROUP BY source`).all() as {
    source: string;
    c: number;
  }[];
  const memorySourceBreakdown = { voice: 0, text: 0, file: 0 };
  for (const r of sourceRows) {
    if (r.source === "voice" || r.source === "text" || r.source === "file") memorySourceBreakdown[r.source] = r.c;
  }

  const topCategories = db
    .prepare(
      `SELECT COALESCE(category,'Uncategorized') as category, COUNT(*) as count
       FROM memories GROUP BY category ORDER BY count DESC LIMIT 5`
    )
    .all() as { category: string; count: number }[];

  const zeroMemoryUsers = count(
    `SELECT COUNT(*) as c FROM users u WHERE NOT EXISTS (SELECT 1 FROM memories m WHERE m.user_id = u.id)`
  );
  const recordedLast7d = count(
    `SELECT COUNT(DISTINCT user_id) as c FROM memories WHERE created_at >= ?`,
    isoDaysAgo(7)
  );
  const recordedLast7dRate = totalUsers > 0 ? recordedLast7d / totalUsers : 0;

  return {
    totalUsers,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    statusCounts,
    conversionRate,
    totalMemories,
    totalChats,
    totalMessages,
    avgMemoriesPerUser,
    activeUsers: {
      daily: activeUsersSince(isoDaysAgo(1)),
      weekly: activeUsersSince(isoDaysAgo(7)),
      monthly: activeUsersSince(isoDaysAgo(30)),
    },
    registeredDevices,
    dailySignups: dailyCounts("users"),
    dailyMemories: dailyCounts("memories"),
    activeUsersTrend: activeUsersTrend(),
    memorySourceBreakdown,
    topCategories,
    zeroMemoryUsers,
    recordedLast7dRate,
  };
}

export type AdminUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "trial" | "active" | "expired";
  daysLeft: number | null;
  // Doubles as "trial ends" (status trial/expired) and "renews" (status
  // active, i.e. admin-granted) -- see the same field's comment on
  // getSubscriptionInfo in repo/users.ts. Shown for every user regardless of
  // status so the admin table always answers "when does this account next
  // need attention," not just for gifted accounts.
  trialEndsAt: string | null;
  createdAt: string;
  memoryCount: number;
  chatCount: number;
  // Pinged on every native app open/resume regardless of notification
  // permission (see useAppVersionPing.ts) — null means either a web-only
  // user or someone who hasn't opened the native app since this shipped.
  appVersion: string | null;
  // Which plan this person is on (their own choice from welcome-trial, or
  // whatever the admin picked when manually granting Strivo Plus — see
  // setPreferredPlan). "later" means they explicitly deferred rather than
  // picking a plan; null means they haven't been asked yet (shouldn't
  // really persist for long now that welcome-trial gates every app route).
  preferredPlan: "monthly" | "annual" | "later" | null;
  // Whether this person can still receive campaign emails (product update
  // drip, broadcast campaigns, etc.) -- false once they've clicked the
  // unsubscribe link (see /api/email/unsubscribe and emailCampaigns.ts's
  // candidateRows(), which excludes opted-out users at the SQL level before
  // any segment filtering runs). Surfaced here so an admin looking at a
  // specific user can tell, at a glance, why that person isn't showing up
  // in a campaign's recipient count.
  emailSubscribed: boolean;
  // Last time this person actually opened the app -- stamped by
  // setUserAppVersion() on every native app open/resume (see
  // useAppVersionPing.ts). Null means either a web-only user or someone who
  // hasn't opened the native app since this shipped. Distinct from
  // createdAt (signup date): this is "when were they last here," which is
  // what the admin panel actually wants to know at a glance.
  lastActiveAt: string | null;
  // Best-effort 2-letter country code from Cloudflare's cf-ipcountry header
  // (see maybeSetUserCountry in repo/users.ts) -- null for anyone who
  // signed up before this shipped and hasn't visited since, or if the
  // header wasn't present for their request.
  country: string | null;
  // Timestamp of the one-time AI-processing consent gate (see /ai-consent
  // and its redirect in (app)/layout.tsx, closing Guideline 5.1.2(i)) --
  // null means they haven't seen/accepted it yet, including every account
  // that existed before this shipped. This is the compliance evidence
  // trail: proof, per user, that explicit permission was actually
  // obtained before their data went to OpenAI, not just documented in a
  // policy somewhere.
  aiConsentAt: string | null;
  // Title of the last Product Updates drip email this person actually
  // received (see /api/product-update-drip/run) -- null if they haven't
  // gotten one yet. Deliberately per-user rather than "today's post": the
  // drip sends everyone their OWN next post in the backlog
  // (posts[product_update_sent_count]), so two people who joined on
  // different days are mid-sequence at different points and were never
  // sent the same email on the same day -- see product_update_sent_count's
  // comment on the User type for the full mechanics.
  lastProductUpdateTitle: string | null;
};

export type AdminUsersPage = {
  users: AdminUserRow[];
  // Total rows matching the current search (ignoring pagination) -- the
  // page needs this to render "44 users" / compute how many pages exist,
  // since the LIMIT/OFFSET query below only ever returns one page's worth.
  total: number;
};

// pageSize is intentionally small (20) -- the admin Users table used to
// load every signup in one unbounded query, which was fine at a handful of
// users but turned into a very long unpaginated page as signups grew.
// Real pagination (LIMIT/OFFSET on the DB side, not "render everything and
// hide most of it in CSS") keeps each request small regardless of how many
// total users there are.
export function listUsersForAdmin(search?: string, page = 1, pageSize = 20): AdminUsersPage {
  const db = getDb();
  const term = search?.trim();
  const offset = Math.max(0, (page - 1) * pageSize);

  const total = term
    ? (
        db
          .prepare(`SELECT COUNT(*) as c FROM users WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ?`)
          .get(`%${term}%`, `%${term}%`, `%${term}%`) as { c: number }
      ).c
    : (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;

  const rows = (
    term
      ? db
          .prepare(
            `SELECT * FROM users WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
          )
          .all(`%${term}%`, `%${term}%`, `%${term}%`, pageSize, offset)
      : db.prepare(`SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset)
  ) as User[];

  // N+1 fix: this used to run two COUNT queries per row inside the .map()
  // below (up to 100 extra queries for a 50-row page). Instead, grab counts
  // for every user on this page in two GROUP BY queries and merge by id.
  const ids = rows.map((u) => u.id);
  const memoryCounts = new Map<string, number>();
  const chatCounts = new Map<string, number>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    (
      db
        .prepare(`SELECT user_id, COUNT(*) as c FROM memories WHERE user_id IN (${placeholders}) GROUP BY user_id`)
        .all(...ids) as { user_id: string; c: number }[]
    ).forEach((r) => memoryCounts.set(r.user_id, r.c));
    (
      db
        .prepare(`SELECT user_id, COUNT(*) as c FROM chats WHERE user_id IN (${placeholders}) GROUP BY user_id`)
        .all(...ids) as { user_id: string; c: number }[]
    ).forEach((r) => chatCounts.set(r.user_id, r.c));
  }

  // Same ordered list the drip route itself indexes into
  // (posts[user.product_update_sent_count]) -- a user who's received N
  // emails has their most recent one at index N-1. Fetched once for the
  // whole page rather than per-row, same N+1-avoidance reasoning as the
  // memory/chat counts above.
  const productUpdatePosts = listProductUpdatePostsOrdered();

  const users = rows.map((u) => {
    const info = getSubscriptionInfo(u);
    const lastProductUpdateTitle =
      u.product_update_sent_count > 0 ? (productUpdatePosts[u.product_update_sent_count - 1]?.title ?? null) : null;
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      status: info.status,
      daysLeft: info.daysLeft,
      trialEndsAt: info.trialEndsAt,
      createdAt: u.created_at,
      memoryCount: memoryCounts.get(u.id) ?? 0,
      chatCount: chatCounts.get(u.id) ?? 0,
      appVersion: u.app_version,
      preferredPlan: info.preferredPlan,
      emailSubscribed: !u.email_opt_out,
      lastActiveAt: u.last_active_at,
      country: u.country,
      aiConsentAt: u.ai_consent_at,
      lastProductUpdateTitle,
    };
  });

  return { users, total };
}
