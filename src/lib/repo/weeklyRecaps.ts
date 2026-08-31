import { getDb, newId, nowIso } from "@/lib/db";

export type RecapStory = { memoryId: string; title: string; blurb: string };

export type WeeklyRecap = {
  id: string;
  user_id: string;
  // YYYY-MM-DD — the IST date the 7-day window this recap covers started.
  // Used as the per-week dedupe key (see hasWeeklyRecapForWeek below).
  week_start: string;
  headline: string;
  stories: string; // JSON RecapStory[]
  created_at: string;
};

export function createWeeklyRecap(input: {
  userId: string;
  weekStart: string;
  headline: string;
  stories: RecapStory[];
}): WeeklyRecap {
  const db = getDb();
  const id = newId("recap");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO weekly_recaps (id, user_id, week_start, headline, stories, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.weekStart, input.headline, JSON.stringify(input.stories), ts);
  return db.prepare(`SELECT * FROM weekly_recaps WHERE id = ?`).get(id) as WeeklyRecap;
}

// IMPORTANT: scoped by user_id, same invariant as every other repo read in
// this app (see the comment on getMemoryById in repo/memories.ts) — a
// recap can never be fetched by a user who doesn't own it.
export function getLatestWeeklyRecap(userId: string): WeeklyRecap | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM weekly_recaps WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as WeeklyRecap | undefined;
}

// Same as getLatestWeeklyRecap, but returns undefined if that recap is
// older than maxAgeMs -- used by Home (see RECAP_VISIBLE_MS in
// app/(app)/home/page.tsx and app/api/home/route.ts) so a recap from weeks
// ago doesn't linger on Home forever looking stale. The Date.now() call is
// deliberately kept here rather than inline in a page/route component --
// the lint rule guarding component purity (see eslint react-hooks/purity)
// flags impure calls directly inside a component/route function, but not
// inside an ordinary library function one layer down like this.
export function getRecentWeeklyRecap(userId: string, maxAgeMs: number): WeeklyRecap | undefined {
  const recap = getLatestWeeklyRecap(userId);
  if (!recap) return undefined;
  const isRecent = Date.now() - new Date(recap.created_at).getTime() < maxAgeMs;
  return isRecent ? recap : undefined;
}

// Lets the weekly automation job (see app/api/weekly-recap/run) skip a user
// it's already sent a recap to for this exact week, so re-running the job
// (retry after a partial failure, accidentally triggering it twice) doesn't
// spam a second push notification for the same 7 days.
export function hasWeeklyRecapForWeek(userId: string, weekStart: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM weekly_recaps WHERE user_id = ? AND week_start = ?`).get(userId, weekStart);
  return !!row;
}
