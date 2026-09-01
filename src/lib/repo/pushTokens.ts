import { getDb, newId, nowIso } from "@/lib/db";

export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  app_version: string | null;
  created_at: string;
};

// A token is unique per app-install-on-device, so re-registering the same
// token (app reopened, permission re-granted) just re-points it at
// whichever user is currently signed in rather than erroring or
// duplicating rows — handles device handoff/reinstall for free. Also
// refreshes app_version every time, so it stays accurate as someone
// updates the app (each app open re-registers — see usePushRegistration.ts).
export function savePushToken(userId: string, token: string, platform: string, appVersion?: string): void {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM push_tokens WHERE token = ?`).get(token) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE push_tokens SET user_id = ?, platform = ?, app_version = ? WHERE token = ?`).run(
      userId,
      platform,
      appVersion ?? null,
      token
    );
    return;
  }
  db.prepare(
    `INSERT INTO push_tokens (id, user_id, token, platform, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("pushtok"), userId, token, platform, appVersion ?? null, nowIso());
}

// Most recent app_version this user's device(s) have reported, or null if
// they've never registered a push token (web-only user, notifications
// declined, or hasn't opened the app since the notifications build).
export function getLatestAppVersionForUser(userId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT app_version FROM push_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as { app_version: string | null } | undefined;
  return row?.app_version ?? null;
}

// All of one specific user's registered device tokens -- unlike everything
// else in this file (which is either "every token" or a broadcast segment),
// this is scoped to a single user. Needed for the weekly recap automation
// (see app/api/weekly-recap/run), which sends a personal push per user
// rather than a broadcast.
export function getPushTokensForUser(userId: string): string[] {
  const db = getDb();
  return (db.prepare(`SELECT token FROM push_tokens WHERE user_id = ?`).all(userId) as { token: string }[]).map(
    (r) => r.token
  );
}

export function listAllPushTokens(): string[] {
  const db = getDb();
  return (db.prepare(`SELECT token FROM push_tokens`).all() as { token: string }[]).map((r) => r.token);
}

// Nudge audience segments, built on users.last_active_at (stamped on every
// app-open ping — see setUserAppVersion in repo/users.ts). This is a best
// effort, not a true "opens daily" detector — we don't track a full open
// history, just the single most recent open — so "recently active" is used
// as a proxy for "the kind of person who'd normally have opened today."
export type NudgeSegment = "all" | "recent_missed_today" | "inactive";

// SQLite fragment selecting push_tokens joined to users, e.g. so segment
// filters can reference last_active_at. Reused by both the token list and
// the count-only query below so they can never drift out of sync.
function segmentWhere(segment: NudgeSegment): string {
  switch (segment) {
    case "recent_missed_today":
      // Opened at least once in the last 3 days, but not yet today —
      // someone who'd plausibly open today too, given the chance.
      return `u.last_active_at IS NOT NULL
              AND date(u.last_active_at) < date('now')
              AND u.last_active_at >= datetime('now','-3 days')`;
    case "inactive":
      // Never pinged an open at all, or the last one was over a week ago.
      return `(u.last_active_at IS NULL OR u.last_active_at < datetime('now','-7 days'))`;
    case "all":
    default:
      return `1=1`;
  }
}

export function listPushTokensForSegment(segment: NudgeSegment): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT pt.token FROM push_tokens pt JOIN users u ON u.id = pt.user_id WHERE ${segmentWhere(segment)}`)
      .all() as { token: string }[]
  ).map((r) => r.token);
}

// Distinct user ids matching a nudge segment -- unlike listPushTokensForSegment
// above (which returns tokens, for the actual push send), this drives the
// in-app notification fan-out for admin nudges (see app/api/admin/nudge):
// every user in the segment gets a permanent notification row regardless of
// whether they have a registered device, so someone who's never enabled
// push still sees the nudge the next time they open the app. Deliberately
// queries `users` directly rather than joining through push_tokens like the
// two functions above -- a segment is a property of the USER (are they
// active, inactive, etc.), and requiring a device token just to be eligible
// would silently exclude every push-disabled user from an otherwise
// perfectly good in-app message.
export function listUserIdsForSegment(segment: NudgeSegment): string[] {
  const db = getDb();
  // segmentWhere only ever references u.last_active_at (or the literal
  // "1=1" for "all") -- none of its branches touch push_tokens columns --
  // so aliasing `users` as `u` directly is enough to reuse it here without
  // the join listPushTokensForSegment needs.
  return (db.prepare(`SELECT id FROM users u WHERE ${segmentWhere(segment)}`).all() as { id: string }[]).map(
    (r) => r.id
  );
}

export function countDevicesForSegment(segment: NudgeSegment): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM push_tokens pt JOIN users u ON u.id = pt.user_id WHERE ${segmentWhere(segment)}`)
    .get() as { c: number };
  return row.c;
}

// Called when FCM reports a token as no longer valid (app uninstalled,
// notifications revoked at the OS level, etc.) so it stops being sent to.
export function deletePushTokens(tokens: string[]): void {
  if (tokens.length === 0) return;
  const db = getDb();
  const placeholders = tokens.map(() => "?").join(",");
  db.prepare(`DELETE FROM push_tokens WHERE token IN (${placeholders})`).run(...tokens);
}
