import { getDb, nowIso } from "@/lib/db";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";

export type NotificationPrefs = Record<NotificationType, boolean>;

const ALL_ON: NotificationPrefs = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true])) as NotificationPrefs;

type PrefRow = {
  user_id: string;
  weekly_recap: number;
  growth_narrative: number;
  quarterly_benchmark: number;
  checkin: number;
  underplayed_win: number;
  nudge: number;
  updated_at: string;
};

// No row means everything is on -- see the migration comment in lib/db.ts
// for why rows are created lazily rather than seeded for every user.
export function getNotificationPrefs(userId: string): NotificationPrefs {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM notification_prefs WHERE user_id = ?`).get(userId) as PrefRow | undefined;
  if (!row) return { ...ALL_ON };
  return {
    weekly_recap: row.weekly_recap === 1,
    growth_narrative: row.growth_narrative === 1,
    quarterly_benchmark: row.quarterly_benchmark === 1,
    checkin: row.checkin === 1,
    underplayed_win: row.underplayed_win === 1,
    nudge: row.nudge === 1,
  };
}

// Checked by notifyUser (lib/notify.ts) before every automatic notification.
// Accepts a plain string (not NotificationType) since the caller is always
// passing along whatever `type` string it was given, not necessarily
// already narrowed -- an unrecognized type fails OPEN (returns true) rather
// than silently swallowing a message from some future type this file
// doesn't know about yet.
export function isNotificationTypeEnabled(userId: string, type: string): boolean {
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) return true;
  return getNotificationPrefs(userId)[type as NotificationType];
}

// Always rewrites all 6 columns (merged from the current effective prefs,
// see getNotificationPrefs above) rather than a single-column upsert -- so
// the very first toggle for a user creates a row that correctly reflects
// every OTHER type still being on, not just the one being changed.
export function setNotificationPref(userId: string, type: NotificationType, enabled: boolean): void {
  const current = getNotificationPrefs(userId);
  const next: NotificationPrefs = { ...current, [type]: enabled };
  const db = getDb();
  db.prepare(
    `INSERT INTO notification_prefs (user_id, weekly_recap, growth_narrative, quarterly_benchmark, checkin, underplayed_win, nudge, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       weekly_recap = excluded.weekly_recap,
       growth_narrative = excluded.growth_narrative,
       quarterly_benchmark = excluded.quarterly_benchmark,
       checkin = excluded.checkin,
       underplayed_win = excluded.underplayed_win,
       nudge = excluded.nudge,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    next.weekly_recap ? 1 : 0,
    next.growth_narrative ? 1 : 0,
    next.quarterly_benchmark ? 1 : 0,
    next.checkin ? 1 : 0,
    next.underplayed_win ? 1 : 0,
    next.nudge ? 1 : 0,
    nowIso()
  );
}
