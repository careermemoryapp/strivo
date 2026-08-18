import { getDb, newId, nowIso } from "@/lib/db";

export type Nudge = {
  id: string;
  title: string | null;
  message: string;
  active: number;
  created_at: string;
};

// The single currently-live broadcast message shown on Home to anyone who
// hasn't already dismissed it (see getDismissibleNudge below and
// dismissed_nudge_id on users).
export function getActiveNudge(): Nudge | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM nudges WHERE active = 1 ORDER BY created_at DESC LIMIT 1`).get() as
    | Nudge
    | undefined;
}

export function listRecentNudges(limit = 10): Nudge[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM nudges ORDER BY created_at DESC LIMIT ?`).all(limit) as Nudge[];
}

// Deactivates any previous nudge before inserting the new one, so there's
// only ever one live broadcast at a time — simpler for people to reason
// about than a queue of messages.
export function createNudge(input: { title?: string; message: string }): Nudge {
  const db = getDb();
  db.exec(`UPDATE nudges SET active = 0 WHERE active = 1`);
  const id = newId("nudge");
  const created_at = nowIso();
  db.prepare(`INSERT INTO nudges (id, title, message, active, created_at) VALUES (?, ?, ?, 1, ?)`).run(
    id,
    input.title?.trim() || null,
    input.message.trim(),
    created_at
  );
  return getActiveNudge()!;
}

export function clearActiveNudge(): void {
  const db = getDb();
  db.exec(`UPDATE nudges SET active = 0 WHERE active = 1`);
}
