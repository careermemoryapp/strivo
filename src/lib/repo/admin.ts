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
    };
  });
}
