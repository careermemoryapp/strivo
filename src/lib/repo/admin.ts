import { getDb } from "@/lib/db";
import { getSubscriptionInfo, type User } from "@/lib/repo/users";

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
function dailyCounts(table: "users" | "memories", days = 14): { date: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT substr(created_at,1,10) as d, COUNT(*) as c FROM ${table} WHERE created_at >= ? GROUP BY d`)
    .all(isoDaysAgo(days - 1)) as { d: string; c: number }[];
  const byDate = new Map(rows.map((r) => [r.d, r.c]));
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

export function computeAdminMetrics(): AdminMetrics {
  const db = getDb();

  const totalUsers = count(`SELECT COUNT(*) as c FROM users`);
  const newUsersToday = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, isoDaysAgo(1));
  const newUsersThisWeek = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, isoDaysAgo(7));
  const newUsersThisMonth = count(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, isoDaysAgo(30));

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
  createdAt: string;
  memoryCount: number;
  chatCount: number;
  // Pinged on every native app open/resume regardless of notification
  // permission (see useAppVersionPing.ts) — null means either a web-only
  // user or someone who hasn't opened the native app since this shipped.
  appVersion: string | null;
  // Which plan this person is on (their own choice from welcome-trial, or
  // whatever the admin picked when manually granting Strivo Plus — see
  // setPreferredPlan). Null just means no preference recorded yet.
  preferredPlan: "monthly" | "annual" | null;
};

export function listUsersForAdmin(search?: string, limit = 50): AdminUserRow[] {
  const db = getDb();
  const term = search?.trim();
  const rows = (
    term
      ? db
          .prepare(
            `SELECT * FROM users WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ? ORDER BY created_at DESC LIMIT ?`
          )
          .all(`%${term}%`, `%${term}%`, `%${term}%`, limit)
      : db.prepare(`SELECT * FROM users ORDER BY created_at DESC LIMIT ?`).all(limit)
  ) as User[];

  return rows.map((u) => {
    const info = getSubscriptionInfo(u);
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      status: info.status,
      daysLeft: info.daysLeft,
      createdAt: u.created_at,
      memoryCount: count(`SELECT COUNT(*) as c FROM memories WHERE user_id = ?`, u.id),
      chatCount: count(`SELECT COUNT(*) as c FROM chats WHERE user_id = ?`, u.id),
      appVersion: u.app_version,
      preferredPlan: info.preferredPlan,
    };
  });
}
