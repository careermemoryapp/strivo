import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CareerMuscle } from "@/lib/careerWrapped";

// Phase 5 QA for Career Wrapped -- same "throwaway SQLite file per suite"
// pattern as tests/security/idor.test.ts (see tests/README.md), run against
// the REAL repo functions rather than re-deriving expected behavior by
// reading the source. Covers the data-volume/tier scenarios from the
// Career Wrapped spec's own QA checklist: a brand-new user, 1/3/5+/50+
// memories, multi-year data, missing/failed-classification metadata,
// existing users predating this feature (NULL mentions_senior_stakeholder),
// and the privacy guarantee behind a public Career Card share.
let dbDir: string;
let memoriesRepo: typeof import("@/lib/repo/memories");
let usersRepo: typeof import("@/lib/repo/users");
let careerWrappedRepo: typeof import("@/lib/repo/careerWrapped");
let careerWrapped: typeof import("@/lib/careerWrapped");
let dbModule: typeof import("@/lib/db");

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-career-wrapped-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
  memoriesRepo = await import("@/lib/repo/memories");
  usersRepo = await import("@/lib/repo/users");
  careerWrappedRepo = await import("@/lib/repo/careerWrapped");
  careerWrapped = await import("@/lib/careerWrapped");
  dbModule = await import("@/lib/db");
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

let userCounter = 0;
function makeUser() {
  userCounter += 1;
  return usersRepo.createUser({
    firstName: "Test",
    lastName: "User",
    email: `career-wrapped-${userCounter}@example.com`,
    passwordHash: "unused-in-google-only-auth",
  });
}

// Creates a fully-classified memory the way generateMemoryMetadata (lib/ai.ts)
// would have left it after a real AI pass -- createMemory alone only ever
// inserts the pending/unclassified row, same as a real POST /api/memories
// does before its background classification step runs.
function makeClassifiedMemory(
  userId: string,
  opts: {
    competencies?: string[];
    category?: string | null;
    hasMetric?: boolean;
    seniorStakeholder?: number | null; // null = unclassified/predates the flag
    createdAt?: string; // overrides the default "now" timestamp
    transcript?: string;
  } = {}
) {
  const memory = memoriesRepo.createMemory({
    userId,
    title: "A career memory",
    transcript: opts.transcript ?? "Some private detail about a specific project and client only the owner should see.",
    source: "text",
  });
  memoriesRepo.updateMemoryMetadata(userId, memory.id, {
    competencies: JSON.stringify(opts.competencies ?? []),
    category: opts.category ?? null,
    has_metric: opts.hasMetric ? 1 : 0,
    mentions_senior_stakeholder: opts.seniorStakeholder === undefined ? 1 : opts.seniorStakeholder,
    metadata_status: "ready",
  });
  if (opts.createdAt) {
    // created_at isn't part of updateMemoryMetadata's writable fields (by
    // design -- nothing else in the app needs to backdate a memory), so
    // multi-year/growth-window test fixtures set it directly, the same way
    // a real memory's timestamp would differ only by when it was actually
    // recorded.
    dbModule.getDb().prepare(`UPDATE memories SET created_at = ? WHERE id = ?`).run(opts.createdAt, memory.id);
  }
  return memoriesRepo.getMemoryById(userId, memory.id)!;
}

describe("Career Wrapped: data tiers by memory volume", () => {
  it("brand-new user with zero memories gets the empty tier and all-zero counts", () => {
    const user = makeUser();
    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(careerWrapped.getCareerWrappedDataTier(snapshot.memory_count_at_generation)).toBe("empty");
    expect(snapshot.wins_count).toBe(0);
    expect(snapshot.strongest_muscle).toBeNull();
    expect(snapshot.growing_muscle).toBeNull();
    expect(snapshot.underrepresented_muscle).toBeNull();
  });

  it("1 memory: basic tier, real counts, but strongest muscle stays locked", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"], category: "Achievement" });
    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(careerWrapped.getCareerWrappedDataTier(snapshot.memory_count_at_generation)).toBe("basic");
    expect(snapshot.wins_count).toBe(1);
    expect(snapshot.leadership_count).toBe(1);
    // A single data point isn't enough to claim a "strongest" pattern yet --
    // see computeCareerWrappedInsights' tier === "patterns" || "full" gate.
    expect(snapshot.strongest_muscle).toBeNull();
  });

  it("3 memories: patterns tier unlocks strongest muscle, but not growing/underrepresented", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Communication"] });
    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(careerWrapped.getCareerWrappedDataTier(snapshot.memory_count_at_generation)).toBe("patterns");
    expect(snapshot.strongest_muscle).toBe("Leadership");
    expect(snapshot.underrepresented_muscle).toBeNull();
    expect(snapshot.growing_muscle).toBeNull();
  });

  it("5+ memories: full tier unlocks underrepresented muscle too", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Communication"] });
    makeClassifiedMemory(user.id, { competencies: ["Communication"] });
    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(careerWrapped.getCareerWrappedDataTier(snapshot.memory_count_at_generation)).toBe("full");
    expect(snapshot.strongest_muscle).toBe("Leadership");
    // Every muscle with zero evidence is tied for "least represented" --
    // the underrepresented pick only needs to be a real CareerMuscle that
    // isn't the strongest one, not specifically "Communication".
    expect(snapshot.underrepresented_muscle).not.toBeNull();
    expect(snapshot.underrepresented_muscle).not.toBe("Leadership");
  });

  it("50+ memories: aggregation stays correct at volume", () => {
    const user = makeUser();
    for (let i = 0; i < 60; i++) {
      makeClassifiedMemory(user.id, {
        competencies: [i % 2 === 0 ? "Leadership" : "Communication"],
        hasMetric: i % 3 === 0,
        seniorStakeholder: i % 5 === 0 ? 1 : 0,
      });
    }
    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(snapshot.memory_count_at_generation).toBe(60);
    expect(snapshot.leadership_count).toBe(30);
    expect(snapshot.senior_stakeholder_count).toBe(12);
    expect(careerWrapped.getCareerWrappedDataTier(snapshot.memory_count_at_generation)).toBe("full");
  });
});

describe("Career Wrapped: multi-year data and the year filter", () => {
  it("a year filter isolates that year's memories; All Time includes every year", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"], createdAt: "2024-03-10T00:00:00.000Z" });
    makeClassifiedMemory(user.id, { competencies: ["Leadership"], createdAt: "2024-06-10T00:00:00.000Z" });
    makeClassifiedMemory(user.id, { competencies: ["Communication"], createdAt: "2025-01-15T00:00:00.000Z" });

    const snapshot2024 = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, "2024");
    const snapshot2025 = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, "2025");
    const snapshotAll = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);

    expect(snapshot2024.memory_count_at_generation).toBe(2);
    expect(snapshot2024.leadership_count).toBe(2);
    expect(snapshot2025.memory_count_at_generation).toBe(1);
    expect(snapshot2025.leadership_count).toBe(0);
    expect(snapshotAll.memory_count_at_generation).toBe(3);
  });

  it("a year with zero memories reports the empty tier even though the account has history in other years", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"], createdAt: "2024-03-10T00:00:00.000Z" });
    const emptyYear = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, "2030");
    expect(careerWrapped.getCareerWrappedDataTier(emptyYear.memory_count_at_generation)).toBe("empty");
  });
});

describe("Career Wrapped: missing/failed metadata and pre-existing users", () => {
  it("a memory with null competencies/category/senior-stakeholder (unclassified) contributes zero signals without crashing", () => {
    const user = makeUser();
    const memory = memoriesRepo.createMemory({ userId: user.id, title: "Unclassified", transcript: "x", source: "text" });
    // Deliberately left exactly as createMemory leaves it: metadata_status
    // 'pending', competencies/category NULL, mentions_senior_stakeholder
    // NULL -- either a failed AI classification, or (for
    // mentions_senior_stakeholder specifically) a memory that predates that
    // column entirely and hasn't been reached by the backfill job yet.
    const fresh = memoriesRepo.getMemoryById(user.id, memory.id)!;
    const signals = careerWrapped.computeMemoryCareerSignals(fresh);
    expect(signals.isWin).toBe(false);
    expect(signals.isLeadershipEvidence).toBe(false);
    expect(signals.isProblemSolved).toBe(false);
    expect(signals.isSeniorStakeholder).toBe(false);
    expect(signals.muscles).toEqual([]);

    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(snapshot.memory_count_at_generation).toBe(1);
    expect(snapshot.wins_count).toBe(0);
  });

  it("an unknown/legacy competency string is ignored rather than throwing", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Some Retired Competency That No Longer Exists"] });
    expect(() => careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY)).not.toThrow();
  });
});

describe("Career Wrapped: cache invalidation", () => {
  it("recomputes once a new memory is added, rather than serving a stale cached snapshot", () => {
    const user = makeUser();
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    const first = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(first.memory_count_at_generation).toBe(1);

    makeClassifiedMemory(user.id, { competencies: ["Communication"] });
    const second = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    expect(second.memory_count_at_generation).toBe(2);
  });
});

describe("Career Wrapped: privacy of a generated share", () => {
  it("card_data never contains the underlying memory's transcript text", () => {
    const user = makeUser();
    const secretTranscript = "Confidential: Project Nightingale for client Initech, budget details attached.";
    makeClassifiedMemory(user.id, { competencies: ["Leadership"], transcript: secretTranscript });
    makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    makeClassifiedMemory(user.id, { competencies: ["Communication"] });

    const snapshot = careerWrappedRepo.getOrComputeCareerWrappedSnapshot(user.id, careerWrapped.ALL_TIME_PERIOD_KEY);
    // Mirrors exactly what app/api/career-wrapped/share/route.ts builds --
    // only aggregated counts and muscle names, never memory text.
    const cardData = {
      title: "Test User's Career",
      periodLabel: "All Time",
      winsCount: snapshot.wins_count,
      leadershipCount: snapshot.leadership_count,
      problemsSolvedCount: snapshot.problems_solved_count,
      seniorStakeholderCount: snapshot.senior_stakeholder_count,
      strongestMuscle: snapshot.strongest_muscle,
      growingMuscle: snapshot.growing_muscle,
      underrepresentedMuscle: snapshot.underrepresented_muscle,
      insights: careerWrapped.buildCareerCardInsights({
        winsCount: snapshot.wins_count,
        leadershipCount: snapshot.leadership_count,
        problemsSolvedCount: snapshot.problems_solved_count,
        seniorStakeholderCount: snapshot.senior_stakeholder_count,
        strongestMuscle: snapshot.strongest_muscle as CareerMuscle | null,
        growingMuscle: snapshot.growing_muscle as CareerMuscle | null,
        underrepresentedMuscle: snapshot.underrepresented_muscle as CareerMuscle | null,
      }),
    };
    const share = careerWrappedRepo.createCareerWrappedShare({
      userId: user.id,
      periodKey: careerWrapped.ALL_TIME_PERIOD_KEY,
      template: "A",
      cardData,
    });

    const stored = careerWrappedRepo.getCareerWrappedShareById(share.id)!;
    expect(stored.card_data).not.toContain("Nightingale");
    expect(stored.card_data).not.toContain("Initech");
    expect(stored.card_data).not.toContain(secretTranscript);
  });

  it("a share can only be revoked by the user who owns it", () => {
    const owner = makeUser();
    const otherUser = makeUser();
    makeClassifiedMemory(owner.id, { competencies: ["Leadership"] });
    const share = careerWrappedRepo.createCareerWrappedShare({
      userId: owner.id,
      periodKey: careerWrapped.ALL_TIME_PERIOD_KEY,
      template: "A",
      cardData: {
        title: "x",
        periodLabel: "All Time",
        winsCount: 0,
        leadershipCount: 0,
        problemsSolvedCount: 0,
        seniorStakeholderCount: 0,
        strongestMuscle: null,
        growingMuscle: null,
        underrepresentedMuscle: null,
        insights: [],
      },
    });

    // A different user's revoke call is scoped by user_id and has no
    // effect -- the share is still live (getCareerWrappedShareById itself
    // filters to revoked = 0, so "still findable" IS "still live" here,
    // same convention the public /cw/[shareId] page relies on).
    careerWrappedRepo.revokeCareerWrappedShare(otherUser.id, share.id);
    expect(careerWrappedRepo.getCareerWrappedShareById(share.id)).toBeDefined();
    expect(careerWrappedRepo.listCareerWrappedSharesForUser(owner.id)).toHaveLength(1);

    // The real owner's revoke call takes effect -- the share stops
    // resolving at all (both for the public page and the owner's own
    // "My Career Cards" list), the same as if it never existed.
    careerWrappedRepo.revokeCareerWrappedShare(owner.id, share.id);
    expect(careerWrappedRepo.getCareerWrappedShareById(share.id)).toBeUndefined();
    expect(careerWrappedRepo.listCareerWrappedSharesForUser(owner.id)).toHaveLength(0);
  });
});

describe("Career Wrapped: reward-loop notification signal", () => {
  it("fires 'first ever evidence' the first time a muscle shows up, not on later repeats", () => {
    const user = makeUser();
    const first = makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    const firstSignal = careerWrappedRepo.computeCareerSignalNotification(user.id, first);
    expect(firstSignal?.title).toBe("New career signal discovered");

    const second = makeClassifiedMemory(user.id, { competencies: ["Leadership"] });
    const secondSignal = careerWrappedRepo.computeCareerSignalNotification(user.id, second);
    // Leadership already had evidence before this memory, and it isn't
    // (yet) the cached all-time strongest muscle, so this one is quiet --
    // matches the "rare by design" comment on computeCareerSignalNotification.
    expect(secondSignal).toBeNull();
  });

  it("a memory with no recognizable competencies never fires a signal", () => {
    const user = makeUser();
    const memory = memoriesRepo.createMemory({ userId: user.id, title: "x", transcript: "x", source: "text" });
    memoriesRepo.updateMemoryMetadata(user.id, memory.id, { competencies: JSON.stringify([]), metadata_status: "ready" });
    const fresh = memoriesRepo.getMemoryById(user.id, memory.id)!;
    expect(careerWrappedRepo.computeCareerSignalNotification(user.id, fresh)).toBeNull();
  });
});
