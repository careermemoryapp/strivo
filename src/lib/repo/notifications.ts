import { getDb, newId, nowIso } from "@/lib/db";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string;
  route: string | null;
  read: number;
  created_at: string;
};

export function createNotification(input: {
  userId: string;
  type: string;
  title?: string | null;
  body: string;
  route?: string | null;
}): Notification {
  const db = getDb();
  const id = newId("notif");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, body, route, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, input.userId, input.type, input.title ?? null, input.body, input.route ?? null, ts);
  return db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id) as Notification;
}

// IMPORTANT: scoped by user_id, same invariant as every other repo read in
// this app. Bounded by `limit` (default a generous but finite number) --
// this is a history list, not an unbounded export; same reasoning as
// listOldestMemories/listNewestMemories in memories.ts.
export function listNotifications(userId: string, limit = 50): Notification[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Notification[];
}

export function countUnreadNotifications(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0`)
    .get(userId) as { c: number };
  return row.c;
}

// Marks a single notification read -- called when the user taps it in the
// list (see NotificationsClient.tsx), right before following its route.
// Scoped by user_id so one user can never mark (or even probe the
// existence of) another user's notification by guessing an id.
export function markNotificationRead(userId: string, id: string): void {
  const db = getDb();
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
}

// Bulk "mark all read" -- offered as a single action at the top of the list
// (see NotificationsClient.tsx) rather than making someone tap every row
// individually just to clear the bell's badge.
export function markAllNotificationsRead(userId: string): void {
  const db = getDb();
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`).run(userId);
}
