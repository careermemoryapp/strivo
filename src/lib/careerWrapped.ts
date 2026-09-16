import type { Memory } from "@/lib/repo/memories";
import { CAREER_MUSCLES_LIST, MEMORY_COMPETENCIES_LIST } from "@/lib/config";

// Server-only-ish: nothing here touches the DB (see lib/repo/careerWrapped.ts
// for that), but it's kept alongside the rest of lib/ rather than under a
// "use client" boundary since it's imported from Server Components, API
// routes, AND the backfill/notification code paths. Safe to import from a
// client component too if a future UI needs the pure math (e.g. a
// client-side preview) -- there's no server-only dependency in this file.

export type CareerMuscle = (typeof CAREER_MUSCLES_LIST)[number];

// Bump this whenever COMPETENCY_TO_MUSCLE, the wins/leadership/problems-
// solved/senior-stakeholder definitions below, or the strongest/growing/
// underrepresented logic changes -- every cached career_wrapped_snapshots
// row whose analysis_version doesn't match gets treated as stale and
// recomputed on next read (see isCareerWrappedSnapshotStale below and
// getOrComputeCareerWrappedSnapshot in lib/repo/careerWrapped.ts). No data
// migration needed, just a recompute.
export const CAREER_WRAPPED_ANALYSIS_VERSION = 1;

export const ALL_TIME_PERIOD_KEY = "all";

// Every one of the 22 behavioral-interview competencies (see
// MEMORY_COMPETENCIES_LIST in lib/config.ts) maps to exactly one of the 12
// coarser Career Muscles -- this IS the "extend the analysis pipeline"
// Career Wrapped needed, done deterministically over data
// generateMemoryMetadata (lib/ai.ts) already computes and stores on every
// memory, rather than a second AI classification pass. Each mapping choice:
//   Strategic Thinking   <- Strategic Thinking, Data-Driven Decision Making
//   Problem Solving      <- Problem-Solving, Crisis Management
//   Leadership            <- Leadership
//   Execution             <- Adaptability & Resilience, Results & Impact,
//                            Technical & Hard Skills, Time & Priority
//                            Management, Risk & Quality Management
//   Stakeholder Management<- Conflict Resolution, Stakeholder Focus,
//                            Negotiation & Influence
//   Communication          <- Communication
//   Collaboration          <- Collaboration & Teamwork
//   Innovation             <- Innovation & Creativity, AI & Tools Fluency,
//                            Learning Agility
//   Ownership              <- Ownership & Initiative
//   Commercial Impact      <- Product & Business Thinking
//   Customer Focus         <- Customer & User Empathy
//   People Development     <- Mentorship & Coaching
// Every item in MEMORY_COMPETENCIES_LIST appears exactly once below -- a
// dev-time assertion at the bottom of this file catches drift if either
// list changes without updating the other.
export const COMPETENCY_TO_MUSCLE: Record<string, CareerMuscle> = {
  Leadership: "Leadership",
  "Ownership & Initiative": "Ownership",
  "Problem-Solving": "Problem Solving",
  "Collaboration & Teamwork": "Collaboration",
  Communication: "Communication",
  "Conflict Resolution": "Stakeholder Management",
  "Mentorship & Coaching": "People Development",
  "Innovation & Creativity": "Innovation",
  "Adaptability & Resilience": "Execution",
  "Strategic Thinking": "Strategic Thinking",
  "Stakeholder Focus": "Stakeholder Management",
  "Results & Impact": "Execution",
  "Technical & Hard Skills": "Execution",
  "AI & Tools Fluency": "Innovation",
  "Data-Driven Decision Making": "Strategic Thinking",
  "Product & Business Thinking": "Commercial Impact",
  "Negotiation & Influence": "Stakeholder Management",
  "Time & Priority Management": "Execution",
  "Crisis Management": "Problem Solving",
  "Learning Agility": "Innovation",
  "Customer & User Empathy": "Customer Focus",
  "Risk & Quality Management": "Execution",
};

if (process.env.NODE_ENV !== "production") {
  const missing = MEMORY_COMPETENCIES_LIST.filter((c) => !(c in COMPETENCY_TO_MUSCLE));
  if (missing.length > 0) {
    // Loud in dev only -- a silently-unmapped competency would just quietly
    // never count toward any muscle, which is exactly the kind of thing
    // that's invisible without this check.
    console.error(`COMPETENCY_TO_MUSCLE is missing a mapping for: ${missing.join(", ")}`);
  }
}

// Data-tier thresholds for the low-data/empty states (spec section 10).
// Deliberately named/structured as configurable constants, not magic
// numbers inline, so they can be tuned after seeing real user behavior
// without touching the logic that reads them.
export const CAREER_WRAPPED_THRESHOLDS = {
  // Below this many memories in the period: the "taking shape" empty state,
  // no stats, no locked teasers -- there's nothing to tease yet.
  minForAnyStats: 1,
  // Below this many: show the real headline counts (wins/leadership/
  // problems solved/senior stakeholder) but keep strongest/growing/
  // underrepresented locked -- a pattern claim needs more than 1-2 data
  // points to not be misleading.
  minForPatterns: 3,
  // At or above this many: unlock the full experience, including
  // underrepresented (which specifically needs enough breadth across
  // muscles to say "relatively little evidence" without it just meaning
  // "you have 4 memories total").
  minForFullAnalysis: 5,
} as const;

export type CareerWrappedDataTier = "empty" | "basic" | "patterns" | "full";

export function getCareerWrappedDataTier(meaningfulMemoryCount: number): CareerWrappedDataTier {
  if (meaningfulMemoryCount < CAREER_WRAPPED_THRESHOLDS.minForAnyStats) return "empty";
  if (meaningfulMemoryCount < CAREER_WRAPPED_THRESHOLDS.minForPatterns) return "basic";
  if (meaningfulMemoryCount < CAREER_WRAPPED_THRESHOLDS.minForFullAnalysis) return "patterns";
  return "full";
}

// Two most recent years plus "All Time" -- matches the spec's own example
// (2026, 2025, All Time) while never hardcoding a year: `now` defaults to
// the real current time, so this automatically shifts forward every January
// without a code change.
export function getCareerWrappedYearOptions(now: Date = new Date()): number[] {
  const year = now.getUTCFullYear();
  return [year, year - 1];
}

export function periodKeyForYear(year: number): string {
  return String(year);
}

function safeJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Pure, deterministic per-memory signal extraction -- no AI call, just
// reading fields generateMemoryMetadata (lib/ai.ts) already computed at
// creation time. This is the "explore whether existing metadata can
// identify signals" work from the spec, made explicit and reusable rather
// than inlined into an aggregation loop.
export type MemoryCareerSignals = {
  isWin: boolean;
  isLeadershipEvidence: boolean;
  isProblemSolved: boolean;
  isSeniorStakeholder: boolean;
  muscles: CareerMuscle[];
};

export function computeMemoryCareerSignals(memory: Memory): MemoryCareerSignals {
  const competencies = safeJsonArray(memory.competencies);
  const muscleSet = new Set<CareerMuscle>();
  for (const c of competencies) {
    const muscle = COMPETENCY_TO_MUSCLE[c];
    if (muscle) muscleSet.add(muscle);
  }
  return {
    // "Wins captured" -- an explicit Achievement-category memory, or one
    // that states a concrete quantified result (has_metric). Both are
    // already-stored, already-validated fields; nothing invented.
    isWin: memory.category === "Achievement" || memory.has_metric === 1,
    isLeadershipEvidence: competencies.includes("Leadership"),
    isProblemSolved: competencies.includes("Problem-Solving") || competencies.includes("Crisis Management"),
    isSeniorStakeholder: memory.mentions_senior_stakeholder === 1,
    muscles: Array.from(muscleSet),
  };
}

export type CareerWrappedCounts = {
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  memoryCount: number;
};

export type MuscleEvidence = Record<CareerMuscle, number>;

function emptyMuscleEvidence(): MuscleEvidence {
  const result = {} as MuscleEvidence;
  for (const m of CAREER_MUSCLES_LIST) result[m] = 0;
  return result;
}

export function aggregateCareerWrappedCounts(memories: Memory[]): { counts: CareerWrappedCounts; muscles: MuscleEvidence } {
  const counts: CareerWrappedCounts = {
    winsCount: 0,
    leadershipCount: 0,
    problemsSolvedCount: 0,
    seniorStakeholderCount: 0,
    memoryCount: memories.length,
  };
  const muscles = emptyMuscleEvidence();
  for (const memory of memories) {
    const signals = computeMemoryCareerSignals(memory);
    if (signals.isWin) counts.winsCount += 1;
    if (signals.isLeadershipEvidence) counts.leadershipCount += 1;
    if (signals.isProblemSolved) counts.problemsSolvedCount += 1;
    if (signals.isSeniorStakeholder) counts.seniorStakeholderCount += 1;
    for (const muscle of signals.muscles) muscles[muscle] += 1;
  }
  return { counts, muscles };
}

// Minimum evidence a muscle needs in the "recent" window before it can be
// named "growing fastest" -- without this, a muscle going from 0 evidence to
// 1 would technically have the biggest (infinite-ratio) jump but that's
// noise, not a genuine pattern worth reflecting back.
const MIN_RECENT_EVIDENCE_FOR_GROWTH = 2;
const GROWTH_WINDOW_DAYS = 90;

export type CareerWrappedInsights = {
  strongestMuscle: CareerMuscle | null;
  growingMuscle: CareerMuscle | null;
  underrepresentedMuscle: CareerMuscle | null;
};

// `periodMemories` is whatever the year/all-time filter selected (for the
// headline counts and "strongest"/"underrepresented"); `allMemories` is the
// user's FULL history regardless of filter, used only for the recent-vs-
// prior comparison behind "growing fastest" -- a meaningful growth signal
// needs a real prior baseline to compare against, which a single filtered
// year might not contain (e.g. filtering to the user's very first year has
// no "prior" window at all).
export function computeCareerWrappedInsights(
  periodMemories: Memory[],
  allMemories: Memory[],
  now: Date = new Date()
): CareerWrappedInsights {
  const { muscles } = aggregateCareerWrappedCounts(periodMemories);
  const tier = getCareerWrappedDataTier(periodMemories.length);

  let strongestMuscle: CareerMuscle | null = null;
  if (tier === "patterns" || tier === "full") {
    let best: CareerMuscle | null = null;
    let bestCount = 0;
    for (const m of CAREER_MUSCLES_LIST) {
      if (muscles[m] > bestCount) {
        best = m;
        bestCount = muscles[m];
      }
    }
    strongestMuscle = bestCount > 0 ? best : null;
  }

  let underrepresentedMuscle: CareerMuscle | null = null;
  if (tier === "full") {
    let worst: CareerMuscle | null = null;
    let worstCount = Infinity;
    for (const m of CAREER_MUSCLES_LIST) {
      if (m === strongestMuscle) continue;
      if (muscles[m] < worstCount) {
        worst = m;
        worstCount = muscles[m];
      }
    }
    // Only worth naming if it's genuinely thin relative to the rest, not
    // just "the smallest of several roughly-equal numbers" -- require it to
    // be clearly behind the strongest muscle, never equal to it.
    if (worst && worstCount < bestMuscleCount(muscles)) underrepresentedMuscle = worst;
  }

  let growingMuscle: CareerMuscle | null = null;
  if (tier === "full") {
    const recentCutoff = new Date(now.getTime() - GROWTH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const priorCutoff = new Date(now.getTime() - 2 * GROWTH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = allMemories.filter((m) => new Date(m.created_at) >= recentCutoff);
    const prior = allMemories.filter((m) => new Date(m.created_at) >= priorCutoff && new Date(m.created_at) < recentCutoff);
    const recentMuscles = aggregateCareerWrappedCounts(recent).muscles;
    const priorMuscles = aggregateCareerWrappedCounts(prior).muscles;
    let best: CareerMuscle | null = null;
    let bestDelta = 0;
    for (const m of CAREER_MUSCLES_LIST) {
      if (recentMuscles[m] < MIN_RECENT_EVIDENCE_FOR_GROWTH) continue;
      const delta = recentMuscles[m] - priorMuscles[m];
      if (delta > bestDelta) {
        best = m;
        bestDelta = delta;
      }
    }
    growingMuscle = bestDelta > 0 ? best : null;
  }

  return { strongestMuscle, growingMuscle, underrepresentedMuscle };
}

function bestMuscleCount(muscles: MuscleEvidence): number {
  return Math.max(...CAREER_MUSCLES_LIST.map((m) => muscles[m]));
}

// Short, card-length insight lines for the shareable Career Card (spec
// feedback: the card felt "very empty" -- this is what fills it, without
// an AI call. Deterministic, same "prefer computation over generation"
// posture as the rest of this file: every line here is derived straight
// from numbers/muscles the caller already computed (getOrComputeCareerWrappedSnapshot),
// never fabricated and never phrased by a model.
//
// Muscle-pattern insights (strongest/growing/underrepresented) come first
// since they're the most specific, genuinely "we noticed something about
// you" claims -- but a newer account may not have any yet (they're tier-
// gated in computeCareerWrappedInsights, same as the in-app page), so this
// backfills with count-based lines until there are at least 2, up to a cap
// of 3, so the card never looks sparse just because someone is early on
// with muscle-level patterns specifically.
export function buildCareerCardInsights(input: {
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  strongestMuscle: CareerMuscle | null;
  growingMuscle: CareerMuscle | null;
  underrepresentedMuscle: CareerMuscle | null;
}): string[] {
  const insights: string[] = [];

  if (input.strongestMuscle) {
    insights.push(`${input.strongestMuscle} is your strongest, most consistent career pattern.`);
  }
  if (input.growingMuscle) {
    insights.push(`${input.growingMuscle} is growing fastest right now.`);
  }
  if (input.underrepresentedMuscle) {
    insights.push(`${input.underrepresentedMuscle} is underrepresented — worth capturing more of.`);
  }

  const countBackfill: { count: number; line: string }[] = [
    { count: input.winsCount, line: `${input.winsCount} real career win${input.winsCount === 1 ? "" : "s"} captured, straight from memory.` },
    { count: input.leadershipCount, line: `${input.leadershipCount} moment${input.leadershipCount === 1 ? "" : "s"} of leadership evidence on record.` },
    { count: input.problemsSolvedCount, line: `${input.problemsSolvedCount} problem${input.problemsSolvedCount === 1 ? "" : "s"} solved and documented.` },
    { count: input.seniorStakeholderCount, line: `${input.seniorStakeholderCount} senior-stakeholder interaction${input.seniorStakeholderCount === 1 ? "" : "s"} captured.` },
  ];
  for (const candidate of countBackfill.sort((a, b) => b.count - a.count)) {
    if (insights.length >= 3) break;
    if (candidate.count > 0) insights.push(candidate.line);
  }

  return insights.slice(0, 3);
}

// A cached career_wrapped_snapshots row is stale (needs recomputing) if
// either the taxonomy/logic version moved on, or the user has recorded
// (or presumably edited) memories since it was generated -- a plain
// memory-count comparison is a cheap, good-enough proxy for "did anything
// change" without needing to track per-memory dirty flags.
export function isCareerWrappedSnapshotStale(
  snapshot: { analysis_version: number; memory_count_at_generation: number },
  currentMemoryCountInPeriod: number
): boolean {
  return (
    snapshot.analysis_version !== CAREER_WRAPPED_ANALYSIS_VERSION ||
    snapshot.memory_count_at_generation !== currentMemoryCountInPeriod
  );
}
