import { getDb, newId, nowIso } from "@/lib/db";
import type { NudgeSegment } from "@/lib/repo/pushTokens";

export type Nudge = {
  id: string;
  title: string | null;
  message: string;
  active: number;
  segment: NudgeSegment;
  created_at: string;
};

// Nudges are push-only now — there's no more in-app Home banner, so
// nothing ever needs to be "active." The `active` column stays in the
// table for backward compatibility with old rows, but new inserts never
// set it and nothing reads it. This function purely logs a history of what
// was sent (see listRecentNudges), for the admin panel's "Previous nudges"
// list.
export function listRecentNudges(limit = 10): Nudge[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM nudges ORDER BY created_at DESC LIMIT ?`).all(limit) as Nudge[];
}

export function createNudge(input: { title?: string; message: string; segment: NudgeSegment }): Nudge {
  const db = getDb();
  const id = newId("nudge");
  const created_at = nowIso();
  db.prepare(`INSERT INTO nudges (id, title, message, active, segment, created_at) VALUES (?, ?, ?, 0, ?, ?)`).run(
    id,
    input.title?.trim() || null,
    input.message.trim(),
    input.segment,
    created_at
  );
  return db.prepare(`SELECT * FROM nudges WHERE id = ?`).get(id) as Nudge;
}
