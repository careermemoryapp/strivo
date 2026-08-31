import { getDb, newId, nowIso } from "@/lib/db";
import { countMemories, countMemoriesSince } from "@/lib/repo/memories";

export type GrowthNarrative = {
  id: string;
  user_id: string;
  narrative_text: string;
  memory_count_at_generation: number;
  earliest_memory_date: string;
  latest_memory_date: string;
  created_at: string;
};

// Below this total memory count, there just isn't enough history to
// meaningfully compare "earlier" against "recent" -- an 8-memory account
// split into two batches of a few each would produce a narrative built on
// almost nothing. Matches the batch size used when picking the comparison
// windows (see app/api/growth-narrative/run).
const MIN_TOTAL_MEMORIES = 12;

// Re-trigger thresholds once a first narrative already exists: either
// enough NEW material has piled up since the last one (8 new memories is
// roughly "a real chunk of a life", not just one or two more stories), or
// enough time has passed that even a handful of new memories is worth
// reflecting on again. Both are deliberately generous -- this is meant to
// be rare and earned, not a recurring nudge like the weekly recap.
const MIN_NEW_MEMORIES_FOR_RETRIGGER = 8;
const MIN_DAYS_FOR_RETRIGGER = 30;
const MIN_NEW_MEMORIES_IF_TIME_ELAPSED = 3;

export function createGrowthNarrative(input: {
  userId: string;
  narrativeText: string;
  memoryCountAtGeneration: number;
  earliestMemoryDate: string;
  latestMemoryDate: string;
}): GrowthNarrative {
  const db = getDb();
  const id = newId("growth");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO growth_narratives (id, user_id, narrative_text, memory_count_at_generation, earliest_memory_date, latest_memory_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.narrativeText, input.memoryCountAtGeneration, input.earliestMemoryDate, input.latestMemoryDate, ts);
  return db.prepare(`SELECT * FROM growth_narratives WHERE id = ?`).get(id) as GrowthNarrative;
}

// IMPORTANT: scoped by user_id, same invariant as every other repo read in
// this app.
export function getLatestGrowthNarrative(userId: string): GrowthNarrative | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM growth_narratives WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as GrowthNarrative | undefined;
}

// Same freshness-gating idea as getRecentWeeklyRecap in weeklyRecaps.ts --
// kept here rather than inline in a page/route component so the impure
// Date.now() call stays out of anything React's purity lint checks.
export function getRecentGrowthNarrative(userId: string, maxAgeMs: number): GrowthNarrative | undefined {
  const narrative = getLatestGrowthNarrative(userId);
  if (!narrative) return undefined;
  const isRecent = Date.now() - new Date(narrative.created_at).getTime() < maxAgeMs;
  return isRecent ? narrative : undefined;
}

// Decides whether this user is due for a new growth narrative -- called by
// the monthly automation (see app/api/growth-narrative/run) for every user
// as a cheap pre-filter before spending an AI call on them. See the
// threshold constants above for the reasoning behind each check.
export function shouldGenerateGrowthNarrative(userId: string): boolean {
  const total = countMemories(userId);
  if (total < MIN_TOTAL_MEMORIES) return false;

  const latest = getLatestGrowthNarrative(userId);
  if (!latest) return true;

  const newSinceLast = countMemoriesSince(userId, latest.created_at);
  if (newSinceLast >= MIN_NEW_MEMORIES_FOR_RETRIGGER) return true;

  const daysSinceLast = (Date.now() - new Date(latest.created_at).getTime()) / (24 * 60 * 60 * 1000);
  if (daysSinceLast >= MIN_DAYS_FOR_RETRIGGER && newSinceLast >= MIN_NEW_MEMORIES_IF_TIME_ELAPSED) return true;

  return false;
}
