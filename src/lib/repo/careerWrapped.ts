import { getDb, newId, nowIso } from "@/lib/db";
import { listMemories, listMemoriesByDateRange, type Memory } from "@/lib/repo/memories";
import {
  ALL_TIME_PERIOD_KEY,
  CAREER_WRAPPED_ANALYSIS_VERSION,
  aggregateCareerWrappedCounts,
  computeCareerWrappedInsights,
  computeMemoryCareerSignals,
  isCareerWrappedSnapshotStale,
  type CareerMuscle,
  type MuscleEvidence,
} from "@/lib/careerWrapped";

export type CareerWrappedSnapshot = {
  id: string;
  user_id: string;
  period_key: string;
  wins_count: number;
  leadership_count: number;
  problems_solved_count: number;
  senior_stakeholder_count: number;
  muscle_scores: string; // JSON MuscleEvidence
  strongest_muscle: string | null;
  growing_muscle: string | null;
  underrepresented_muscle: string | null;
  memory_count_at_generation: number;
  analysis_version: number;
  generated_at: string;
};

export function getLatestCareerWrappedSnapshot(userId: string, periodKey: string): CareerWrappedSnapshot | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM career_wrapped_snapshots WHERE user_id = ? AND period_key = ?`)
    .get(userId, periodKey) as CareerWrappedSnapshot | undefined;
}

function upsertCareerWrappedSnapshot(input: {
  userId: string;
  periodKey: string;
  counts: { winsCount: number; leadershipCount: number; problemsSolvedCount: number; seniorStakeholderCount: number; memoryCount: number };
  muscles: MuscleEvidence;
  strongestMuscle: CareerMuscle | null;
  growingMuscle: CareerMuscle | null;
  underrepresentedMuscle: CareerMuscle | null;
}): CareerWrappedSnapshot {
  const db = getDb();
  const id = newId("cwsnap");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO career_wrapped_snapshots
       (id, user_id, period_key, wins_count, leadership_count, problems_solved_count, senior_stakeholder_count,
        muscle_scores, strongest_muscle, growing_muscle, underrepresented_muscle, memory_count_at_generation, analysis_version, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, period_key) DO UPDATE SET
       wins_count = excluded.wins_count,
       leadership_count = excluded.leadership_count,
       problems_solved_count = excluded.problems_solved_count,
       senior_stakeholder_count = excluded.senior_stakeholder_count,
       muscle_scores = excluded.muscle_scores,
       strongest_muscle = excluded.strongest_muscle,
       growing_muscle = excluded.growing_muscle,
       underrepresented_muscle = excluded.underrepresented_muscle,
       memory_count_at_generation = excluded.memory_count_at_generation,
       analysis_version = excluded.analysis_version,
       generated_at = excluded.generated_at`
  ).run(
    id,
    input.userId,
    input.periodKey,
    input.counts.winsCount,
    input.counts.leadershipCount,
    input.counts.problemsSolvedCount,
    input.counts.seniorStakeholderCount,
    JSON.stringify(input.muscles),
    input.strongestMuscle,
    input.growingMuscle,
    input.underrepresentedMuscle,
    input.counts.memoryCount,
    CAREER_WRAPPED_ANALYSIS_VERSION,
    ts
  );
  return getLatestCareerWrappedSnapshot(input.userId, input.periodKey)!;
}

function memoriesForPeriod(userId: string, periodKey: string): Memory[] {
  if (periodKey === ALL_TIME_PERIOD_KEY) return listMemories(userId, { sort: "newest" });
  const year = Number(periodKey);
  if (!Number.isFinite(year)) return [];
  // Half-open [Jan 1, Jan 1 of next year) in UTC, consistent with
  // listMemoriesByDateRange's own convention elsewhere in the app.
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  return listMemoriesByDateRange(userId, start, end);
}

// The one function Home/the /career-wrapped page/the share-image route
// should call. Deterministic aggregation over memories.competencies +
// category + has_metric + mentions_senior_stakeholder -- no OpenAI call, so
// unlike weekly_recaps/growth_narratives/quarterly_benchmarks/
// underplayed_win_callouts there's no cron/eligibility gate needed here:
// it's cheap enough to check-and-recompute synchronously on every read, and
// still only actually recomputes when isCareerWrappedSnapshotStale says the
// cached row no longer reflects reality (see that function's comment in
// lib/careerWrapped.ts).
export function getOrComputeCareerWrappedSnapshot(userId: string, periodKey: string, now: Date = new Date()): CareerWrappedSnapshot {
  const periodMemories = memoriesForPeriod(userId, periodKey);
  const cached = getLatestCareerWrappedSnapshot(userId, periodKey);
  if (cached && !isCareerWrappedSnapshotStale(cached, periodMemories.length)) {
    return cached;
  }
  const { counts, muscles } = aggregateCareerWrappedCounts(periodMemories);
  // Growing-fastest needs the user's FULL history (not just this period) to
  // compare a recent window against a prior one -- see
  // computeCareerWrappedInsights' comment in lib/careerWrapped.ts.
  const allMemories = periodKey === ALL_TIME_PERIOD_KEY ? periodMemories : listMemories(userId, { sort: "newest" });
  const insights = computeCareerWrappedInsights(periodMemories, allMemories, now);
  return upsertCareerWrappedSnapshot({
    userId,
    periodKey,
    counts,
    muscles,
    strongestMuscle: insights.strongestMuscle,
    growingMuscle: insights.growingMuscle,
    underrepresentedMuscle: insights.underrepresentedMuscle,
  });
}

export function parseMuscleScores(snapshot: CareerWrappedSnapshot): MuscleEvidence {
  try {
    return JSON.parse(snapshot.muscle_scores) as MuscleEvidence;
  } catch {
    return {} as MuscleEvidence;
  }
}

// ---- Career Card shares (see app/api/career-wrapped/share/route.ts and
// app/cw/[shareId]) ----

export type CareerWrappedShare = {
  id: string;
  user_id: string;
  period_key: string;
  template: string;
  card_data: string; // JSON -- see CareerCardData in lib/careerWrapped.ts
  view_count: number;
  revoked: number;
  created_at: string;
};

export function createCareerWrappedShare(input: {
  userId: string;
  periodKey: string;
  template: string;
  cardData: unknown;
}): CareerWrappedShare {
  const db = getDb();
  const id = newId("cwshare");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO career_wrapped_shares (id, user_id, period_key, template, card_data, view_count, revoked, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(id, input.userId, input.periodKey, input.template, JSON.stringify(input.cardData), ts);
  return db.prepare(`SELECT * FROM career_wrapped_shares WHERE id = ?`).get(id) as CareerWrappedShare;
}

// Deliberately NOT scoped by user_id -- this is the one read path that's
// meant to be reachable by a logged-out visitor via the public /cw/[shareId]
// link (see the table's own comment in lib/db.ts). `revoked` is what keeps a
// pulled-down link from resolving, not an auth check.
export function getCareerWrappedShareById(id: string): CareerWrappedShare | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM career_wrapped_shares WHERE id = ? AND revoked = 0`).get(id) as
    | CareerWrappedShare
    | undefined;
}

export function incrementCareerWrappedShareViews(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE career_wrapped_shares SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

// Scoped by user_id -- only the owner can revoke their own share link.
export function revokeCareerWrappedShare(userId: string, id: string): void {
  const db = getDb();
  db.prepare(`UPDATE career_wrapped_shares SET revoked = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
}

export function listCareerWrappedSharesForUser(userId: string): CareerWrappedShare[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM career_wrapped_shares WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC`)
    .all(userId) as CareerWrappedShare[];
}

// ---- Reward loop (spec section 9 / Phase 4) ----

// Decides whether a just-saved memory is worth an immediate "your Career
// Wrapped just got richer" moment, and what it should say -- called from
// app/api/memories/route.ts right after AI metadata succeeds. Returns null
// (no notification) far more often than not, by design: the spec is
// explicit that quality matters more than quantity and this shouldn't fire
// on every memory. Two cases actually fire:
//   1. This memory is the user's FIRST-EVER evidence for one of its muscles
//      -- "New career signal discovered."
//   2. This memory adds evidence to whatever muscle is currently this
//      user's strongest (per the last computed all-time snapshot) --
//      "Your X evidence just got stronger."
// Both require the memory to carry at least one real competency (the same
// bar generateMemoryMetadata already applies before setting praise/
// resumeLine) -- a memory with no genuine competency evidence never
// triggers this, which is what keeps "quality over quantity" true rather
// than just a comment.
export function computeCareerSignalNotification(userId: string, memory: Memory): { title: string; body: string } | null {
  const signals = computeMemoryCareerSignals(memory);
  if (signals.muscles.length === 0) return null;

  // Every OTHER memory this user has, i.e. the picture as it stood right
  // before this one was saved -- lets us tell "first ever evidence for this
  // muscle" apart from "just one more example of something already strong."
  const priorMemories = listMemories(userId, { sort: "newest" }).filter((m) => m.id !== memory.id);
  const { muscles: priorMuscleCounts } = aggregateCareerWrappedCounts(priorMemories);

  const firstEverMuscle = signals.muscles.find((m) => (priorMuscleCounts[m] ?? 0) === 0);
  if (firstEverMuscle) {
    return {
      title: "New career signal discovered",
      body: `This memory is your first captured evidence of ${firstEverMuscle}.`,
    };
  }

  const allTimeSnapshot = getLatestCareerWrappedSnapshot(userId, ALL_TIME_PERIOD_KEY);
  if (allTimeSnapshot?.strongest_muscle && signals.muscles.includes(allTimeSnapshot.strongest_muscle as CareerMuscle)) {
    return {
      title: "Career Wrapped update",
      body: `Your ${allTimeSnapshot.strongest_muscle} evidence just got stronger.`,
    };
  }

  return null;
}
