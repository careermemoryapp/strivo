import { getDb, newId, nowIso } from "@/lib/db";

export type CheckinStatus = "pending" | "active" | "answered" | "dismissed" | "expired";

export type PendingCheckin = {
  id: string;
  user_id: string;
  source_memory_id: string;
  question: string;
  target_date: string; // YYYY-MM-DD
  status: CheckinStatus;
  resolved_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

// A soft per-user cap on how many check-ins can be open (pending or active)
// at once -- see MAX_OPEN_CHECKINS in app/api/memories/route.ts. Someone who
// mentions several upcoming things in quick succession shouldn't end up with
// a pile of nags all landing around the same time; new ones just don't get
// created past this count until earlier ones resolve.
export function countOpenCheckins(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM pending_checkins WHERE user_id = ? AND status IN ('pending', 'active')`)
    .get(userId) as { c: number };
  return row.c;
}

export function createPendingCheckin(input: {
  userId: string;
  sourceMemoryId: string;
  question: string;
  targetDate: string;
}): PendingCheckin {
  const db = getDb();
  const id = newId("chk");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO pending_checkins (id, user_id, source_memory_id, question, target_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(id, input.userId, input.sourceMemoryId, input.question, input.targetDate, ts, ts);
  return db.prepare(`SELECT * FROM pending_checkins WHERE id = ?`).get(id) as PendingCheckin;
}

// Scoped by user_id, same as getMemoryById -- a check-in can never be read
// by a user who doesn't own it, even if they know/guess its id (relevant
// here specifically because the id is what a push notification's deep link
// carries).
export function getPendingCheckinById(userId: string, id: string): PendingCheckin | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM pending_checkins WHERE id = ? AND user_id = ?`).get(id, userId) as
    | PendingCheckin
    | undefined;
}

// The candidates for the daily automation (see app/api/checkins/run):
// still 'pending' (never surfaced yet), due today or earlier, and not so
// overdue that resurrecting it would feel strange (see the caller's
// CHECKIN_STALE_DAYS cutoff -- rows past that are handled separately by
// expireStaleCheckins below, never activated).
export function getDueCheckins(todayIso: string, staleCutoffIso: string): PendingCheckin[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM pending_checkins WHERE status = 'pending' AND target_date <= ? AND target_date >= ? ORDER BY target_date ASC`
    )
    .all(todayIso, staleCutoffIso) as PendingCheckin[];
}

// Rows that fell due more than the stale cutoff ago without ever being
// activated -- e.g. the daily job didn't run for a while. Rather than
// surfacing a "how did that interview go?" push weeks late, these are
// quietly marked expired instead of activated.
export function expireStaleCheckins(staleCutoffIso: string): number {
  const db = getDb();
  const result = db
    .prepare(`UPDATE pending_checkins SET status = 'expired', updated_at = ? WHERE status = 'pending' AND target_date < ?`)
    .run(nowIso(), staleCutoffIso);
  return Number(result.changes ?? 0);
}

export function markCheckinActive(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE pending_checkins SET status = 'active', updated_at = ? WHERE id = ?`).run(nowIso(), id);
}

export function markCheckinAnswered(userId: string, id: string, resolvedMemoryId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE pending_checkins SET status = 'answered', resolved_memory_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(resolvedMemoryId, nowIso(), id, userId);
}

export function markCheckinDismissed(userId: string, id: string): void {
  const db = getDb();
  db.prepare(`UPDATE pending_checkins SET status = 'dismissed', updated_at = ? WHERE id = ? AND user_id = ?`).run(
    nowIso(),
    id
  );
}

// The oldest still-active (pushed, not yet answered/dismissed) check-in for
// this user -- backs the Home teaser (see HomeClient.tsx). Oldest-first (not
// newest) so a check-in the user has been sitting on doesn't get silently
// buried behind a fresher one.
export function getActiveCheckinForUser(userId: string): PendingCheckin | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM pending_checkins WHERE user_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1`)
    .get(userId) as PendingCheckin | undefined;
}
