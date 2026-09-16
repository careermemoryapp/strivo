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

// Two more "aspects" beyond strongest/growing/underrepresented (product
// feedback: those three read as thin once the card and the /career-wrapped
// page filled out everywhere else). Both are derived purely from the SAME
// muscle_scores map career_wrapped_snapshots already persists in full (see
// muscle_scores in lib/repo/careerWrapped.ts) -- no new DB column, no new
// memory query, no AI call. Gated behind the same "patterns"/"full" tier as
// strongestMuscle: a second-place muscle or a breadth count is just as easy
// to over-read from 1-2 memories as a "strongest" claim would be.
export type SecondaryCareerWrappedInsights = {
  secondStrongestMuscle: CareerMuscle | null;
  // How many of the 12 career muscles have at least one piece of evidence --
  // 0 when the tier gate isn't met yet, so a caller can treat 0 as "don't
  // show this aspect" the same way it already treats a null muscle.
  muscleBreadthCount: number;
};

export function computeSecondaryCareerWrappedInsights(
  muscles: MuscleEvidence,
  strongestMuscle: CareerMuscle | null,
  tier: CareerWrappedDataTier
): SecondaryCareerWrappedInsights {
  if (tier !== "patterns" && tier !== "full") {
    return { secondStrongestMuscle: null, muscleBreadthCount: 0 };
  }

  let secondStrongestMuscle: CareerMuscle | null = null;
  if (strongestMuscle) {
    let best: CareerMuscle | null = null;
    let bestCount = 0;
    for (const m of CAREER_MUSCLES_LIST) {
      if (m === strongestMuscle) continue;
      if (muscles[m] > bestCount) {
        best = m;
        bestCount = muscles[m];
      }
    }
    secondStrongestMuscle = bestCount > 0 ? best : null;
  }

  const muscleBreadthCount = CAREER_MUSCLES_LIST.filter((m) => muscles[m] > 0).length;

  return { secondStrongestMuscle, muscleBreadthCount };
}

// One evocative "read" per muscle -- an actual character judgment ("what do
// you think of this person"), not a restatement of a count. Still fully
// deterministic: a fixed lookup keyed on the muscle Strivo.ai already
// computed as strongest, not a model's free-form opinion, and every claim
// stays grounded in something the muscle taxonomy itself already asserts
// (see COMPETENCY_TO_MUSCLE above) rather than inventing a new fact about
// the person. A dev-time assertion at the bottom of this file keeps this in
// sync with CAREER_MUSCLES_LIST the same way COMPETENCY_TO_MUSCLE is.
const MUSCLE_IDENTITY: Record<CareerMuscle, string> = {
  Leadership: "Someone people look to when things get hard — this career reads leadership-first",
  Execution: "A finisher, not just a planner — this record is built on shipped outcomes",
  "Strategic Thinking": "Thinks several moves ahead — the pattern here is foresight, not firefighting",
  "Stakeholder Management": "Comfortable in the room with senior stakeholders — trust earned upward, not just managed",
  Communication: "Explains the 'why' clearly enough that other people act on it",
  Collaboration: "A multiplier — makes the people around them better, not just their own output",
  Innovation: "Brings new ideas to the table instead of waiting for permission to try something different",
  Ownership: "Takes the wheel without being asked — initiative is the throughline here",
  "Commercial Impact": "Thinks like an owner — ties the work back to real business outcomes",
  "Customer Focus": "Decisions run through what the user actually needs, not just what's easy to ship",
  "People Development": "Builds other people up — a career defined as much by mentorship as by output",
  "Problem Solving": "The one who gets called in when things go sideways — a fixer, not just a doer",
};

if (process.env.NODE_ENV !== "production") {
  const missingIdentity = CAREER_MUSCLES_LIST.filter((m) => !(m in MUSCLE_IDENTITY));
  if (missingIdentity.length > 0) {
    console.error(`MUSCLE_IDENTITY is missing a line for: ${missingIdentity.join(", ")}`);
  }
}

// A single headline "read" on the person -- the card's actual centerpiece
// insight (product feedback: the old count-restatement lines weren't real
// insight, this is what "what do you think of the person" becomes without
// an AI call). Below the pattern tier, there's no strongest muscle yet to
// characterize, so this falls back to an honest, still-evaluative line
// about the record itself rather than guessing at a personality.
export function buildCareerPersonaHeadline(input: {
  strongestMuscle: CareerMuscle | null;
  secondStrongestMuscle: CareerMuscle | null;
  winsCount: number;
  leadershipCount: number;
}): string {
  if (input.strongestMuscle) {
    const base = MUSCLE_IDENTITY[input.strongestMuscle];
    if (input.secondStrongestMuscle) {
      return `${base}, backed by real range in ${input.secondStrongestMuscle} too — not a one-trick record.`;
    }
    return `${base}.`;
  }
  if (input.winsCount > 0) {
    return `Already building a real record — ${input.winsCount} documented win${input.winsCount === 1 ? "" : "s"} and counting, with sharper patterns to come as more memories are captured.`;
  }
  if (input.leadershipCount > 0) {
    return `Early days, but the evidence already on file points toward leadership — worth capturing more to see the full pattern.`;
  }
  return `Every memory captured here becomes part of this career story — the patterns get sharper as more get added.`;
}

// A short, punchy persona title per muscle -- the "archetype" badge on the
// shareable Career Card (product feedback: the card needs a headline
// identity someone would be proud to post, not a data dump). Same
// deterministic lookup pattern as MUSCLE_IDENTITY, just compressed to a
// 2-4 word title instead of a full sentence.
const MUSCLE_ARCHETYPE: Record<CareerMuscle, string> = {
  Leadership: "The Natural Leader",
  Execution: "The Finisher",
  "Strategic Thinking": "The Strategic Mind",
  "Stakeholder Management": "The Trusted Operator",
  Communication: "The Clear Communicator",
  Collaboration: "The Team Multiplier",
  Innovation: "The Innovator",
  Ownership: "The Self-Starter",
  "Commercial Impact": "The Business Builder",
  "Customer Focus": "The Customer Champion",
  "People Development": "The Mentor",
  "Problem Solving": "The Fixer",
};

if (process.env.NODE_ENV !== "production") {
  const missingArchetype = CAREER_MUSCLES_LIST.filter((m) => !(m in MUSCLE_ARCHETYPE));
  if (missingArchetype.length > 0) {
    console.error(`MUSCLE_ARCHETYPE is missing a title for: ${missingArchetype.join(", ")}`);
  }
}

// The archetype badge itself -- "The Rising Talent" is the one non-muscle
// entry, an honest and still-positive placeholder for accounts that haven't
// unlocked a strongest muscle yet (same tier gate as strongestMuscle).
export function buildCareerArchetype(strongestMuscle: CareerMuscle | null): string {
  return strongestMuscle ? MUSCLE_ARCHETYPE[strongestMuscle] : "The Rising Talent";
}

// 2 short, forward-looking "what this person is well-suited for" lines per
// muscle, plus an optional 3rd that blends in the second-strongest muscle
// when there is one. Deliberately phrased as fit/potential ("well-suited
// for", "positioned to") rather than asserted fact -- a genuine, positive
// inference from a real signal, not a fabricated claim about the person's
// actual job history. This is what makes the card feel worth sharing
// (product feedback: "what can they aim for") instead of a private data
// dump ("1 leadership moment on record").
const MUSCLE_POTENTIAL: Record<CareerMuscle, [string, string]> = {
  Leadership: [
    "Well-suited for people-leadership roles — team lead, manager, or beyond.",
    "A strong fit for leading through ambiguity when others are looking for direction.",
  ],
  Execution: [
    "Well-suited for roles that live or die on delivery — program or delivery leadership.",
    "Positioned to scale personal execution into leading a high-output team.",
  ],
  "Strategic Thinking": [
    "Well-suited for roles that shape direction, not just execute it — strategy or planning leadership.",
    "A strong fit for turning complexity into a clear plan others can follow.",
  ],
  "Stakeholder Management": [
    "Well-suited for roles at the center of competing priorities — cross-functional or client-facing leadership.",
    "A strong fit for representing the team in rooms where trust matters as much as title.",
  ],
  Communication: [
    "Well-suited for roles that need someone to align people around an idea.",
    "A strong fit for turning complex work into a story other people rally behind.",
  ],
  Collaboration: [
    "Well-suited for roles that connect teams rather than sit inside one — program or platform leadership.",
    "Positioned to be the glue that holds cross-team work together.",
  ],
  Innovation: [
    "Well-suited for roles that reward new thinking — product, R&D, or 0-to-1 work.",
    "Positioned to lead the next thing rather than maintain the last one.",
  ],
  Ownership: [
    "Well-suited for roles with real autonomy — founder, GM, or independent ownership of a business line.",
    "Positioned to run something end-to-end without needing to be told how.",
  ],
  "Commercial Impact": [
    "Well-suited for roles that own outcomes, not just output — GM or revenue-facing leadership.",
    "A strong fit for being trusted with real business-line responsibility.",
  ],
  "Customer Focus": [
    "Well-suited for roles closest to the customer — product or CX leadership.",
    "A strong fit for being the voice of the customer in rooms that need one.",
  ],
  "People Development": [
    "Well-suited for people-manager or mentorship-heavy roles — team lead or people-ops leadership.",
    "Positioned to build the next generation of leaders around them.",
  ],
  "Problem Solving": [
    "Well-suited for roles that need a fixer — crisis response or high-ambiguity problem spaces.",
    "Positioned to be the person called in when something's broken.",
  ],
};

if (process.env.NODE_ENV !== "production") {
  const missingPotential = CAREER_MUSCLES_LIST.filter((m) => !(m in MUSCLE_POTENTIAL));
  if (missingPotential.length > 0) {
    console.error(`MUSCLE_POTENTIAL is missing lines for: ${missingPotential.join(", ")}`);
  }
}

export function buildCareerAchievementPotential(
  strongestMuscle: CareerMuscle | null,
  secondStrongestMuscle: CareerMuscle | null
): string[] {
  if (!strongestMuscle) {
    return ["Every new memory sharpens this picture — the potential here is still being written."];
  }
  const lines: string[] = [...MUSCLE_POTENTIAL[strongestMuscle]];
  if (secondStrongestMuscle) {
    lines.push(`Combine that with real ${secondStrongestMuscle} range, and it's a case for roles that need both.`);
  }
  return lines;
}

// Short, card-length insight lines for the shareable Career Card -- the
// supporting evidence underneath the headline read above. Deliberately
// evaluative rather than a flat count restatement (feedback: "just don't
// say X captured, say what you think of the person") -- but still
// deterministic, same "prefer computation over generation" posture as the
// rest of this file: every line is a fixed template around a real number
// the caller already computed, never fabricated and never phrased by a
// model.
//
// Muscle-pattern insights (growing/underrepresented) come first since
// they're the most specific, genuinely "we noticed something about you"
// claims -- strongest and second-strongest are already the headline above,
// so they're deliberately excluded here to avoid repeating the same claim
// twice on one card. A newer account may not have any muscle-level pattern
// yet (tier-gated in computeCareerWrappedInsights), so this backfills with
// count-based lines until there are at least 2, up to a cap of 3.
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

  if (input.growingMuscle) {
    insights.push(`${input.growingMuscle} is on the rise — noticeably more evidence recently than before, a real shift, not a one-off.`);
  }
  if (input.underrepresentedMuscle) {
    insights.push(`${input.underrepresentedMuscle} shows up least so far — not necessarily a gap in the work, but one worth capturing more of.`);
  }

  const countBackfill: { count: number; line: string }[] = [
    { count: input.winsCount, line: `A track record of turning effort into outcomes — ${input.winsCount} documented win${input.winsCount === 1 ? "" : "s"}, not just activity.` },
    { count: input.leadershipCount, line: `Steps up when it counts — ${input.leadershipCount} leadership moment${input.leadershipCount === 1 ? "" : "s"} on record.` },
    { count: input.problemsSolvedCount, line: `Doesn't shy away from hard problems — ${input.problemsSolvedCount} solved and documented.` },
    { count: input.seniorStakeholderCount, line: `Operates comfortably at the senior level — ${input.seniorStakeholderCount} senior-stakeholder interaction${input.seniorStakeholderCount === 1 ? "" : "s"} on record.` },
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
