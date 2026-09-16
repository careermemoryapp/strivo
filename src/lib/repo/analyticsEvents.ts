import { getDb, newId, nowIso } from "@/lib/db";

// See the analytics_events table's own comment in lib/db.ts for why this
// exists (GA4 is deliberately excluded from every (app)/admin route and the
// native shell, and Singular only does native install attribution, not
// custom in-product events). user_id is nullable because the public
// /cw/[shareId] Career Card landing page can log events from a logged-out
// visitor (career_card_share_clicked-style events, before they've ever
// signed up).
export function logAnalyticsEvent(input: { userId: string | null; eventName: string; properties?: Record<string, unknown> }): void {
  const db = getDb();
  db.prepare(`INSERT INTO analytics_events (id, user_id, event_name, properties, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    newId("evt"),
    input.userId,
    input.eventName,
    input.properties ? JSON.stringify(input.properties) : null,
    nowIso()
  );
}

// How many times a given event has fired for one user -- used by the "did
// Career Wrapped cause this user to add another memory" retention question
// (spec section 12): compare career_wrapped_add_memory_clicked counts
// against actual new memories in the same window. Deliberately simple (a
// single COUNT), not a full analytics query layer -- more sophisticated
// funnels/cohorts are a job for actual SQL against this table directly when
// that analysis is needed, not something to over-build here speculatively.
export function countAnalyticsEventsForUser(userId: string, eventName: string, sinceUtcIso?: string): number {
  const db = getDb();
  const row = sinceUtcIso
    ? (db
        .prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE user_id = ? AND event_name = ? AND created_at >= ?`)
        .get(userId, eventName, sinceUtcIso) as { c: number })
    : (db.prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE user_id = ? AND event_name = ?`).get(userId, eventName) as {
        c: number;
      });
  return row.c;
}
