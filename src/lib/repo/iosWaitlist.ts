import { getDb, newId, nowIso } from "@/lib/db";

// Backs the "iOS coming soon" prompt PlayStoreLink.tsx shows an iOS/Mac
// visitor instead of sending them to a Play Store listing they can't
// install from (see the ios_waitlist comment in lib/db.ts for the full
// story). email has a UNIQUE constraint, so a visitor submitting the form
// twice -- different button, different page, or just a retry -- is a
// harmless no-op rather than a duplicate row; ON CONFLICT DO NOTHING keeps
// that a single round trip instead of a SELECT-then-maybe-INSERT.

export function addToIosWaitlist(input: { email: string; location?: string; pagePath?: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO ios_waitlist (id, email, location, page_path, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO NOTHING`
  ).run(newId("ioswait"), input.email.trim().toLowerCase(), input.location ?? null, input.pagePath ?? null, nowIso());
}

export function countIosWaitlist(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ios_waitlist`).get() as { n: number };
  return row.n;
}
