import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Career Profile QA -- same "throwaway SQLite file per suite" pattern as
// tests/lib/careerWrapped.test.ts (see tests/README.md). Covers the
// deterministic scoring engine (pure functions, no DB needed) and the
// persistence/progress layer (real repo functions against a real, if
// temporary, database).
let usersRepo: typeof import("@/lib/repo/users");
let careerProfileRepo: typeof import("@/lib/repo/careerProfile");
let careerProfile: typeof import("@/lib/careerProfile");
let dbDir: string;

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-career-profile-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
  usersRepo = await import("@/lib/repo/users");
  careerProfileRepo = await import("@/lib/repo/careerProfile");
  careerProfile = await import("@/lib/careerProfile");
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
    email: `career-profile-${userCounter}@example.com`,
    passwordHash: "unused-in-google-only-auth",
  });
}

describe("Career Profile: quiz roster", () => {
  it("has exactly 5 quizzes in a fixed order, with only Career Superpower implemented so far", () => {
    expect(careerProfile.CAREER_PROFILE_QUIZ_ORDER).toEqual([
      "career_superpower",
      "corporate_character",
      "corporate_red_flag",
      "ai_era_advantage",
      "career_mode",
    ]);
    const implemented = careerProfile.CAREER_PROFILE_QUIZ_ORDER.filter(
      (id) => careerProfile.CAREER_PROFILE_QUIZZES[id].implemented
    );
    expect(implemented).toEqual(["career_superpower"]);
  });

  it("getCareerProfileQuizDefinition returns null for a roster entry with no content yet", () => {
    expect(careerProfile.getCareerProfileQuizDefinition("career_mode")).toBeNull();
    expect(careerProfile.getCareerProfileQuizDefinition("career_superpower")).not.toBeNull();
  });
});

describe("Career Profile: deterministic scoring (Career Superpower)", () => {
  // NOTE: careerProfile is populated in beforeAll (a dynamic import, same
  // convention as careerWrapped.test.ts), which runs AFTER describe bodies
  // are collected -- so `quiz` must be read fresh inside each it(), never
  // hoisted to describe-body scope.

  it("has 7 questions, each with exactly 4 options, and every archetype is reachable", () => {
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    expect(quiz.questions).toHaveLength(7);
    for (const q of quiz.questions) {
      expect(q.options).toHaveLength(4);
    }
    const reachable = new Set(quiz.questions.flatMap((q) => q.options.map((o) => o.dimension)));
    for (const archetype of quiz.archetypes) {
      expect(reachable.has(archetype.key)).toBe(true);
    }
  });

  it("is deterministic -- the same answers always produce the same result", () => {
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    const answers = ["a", "b", "c", "d", "a", "b", "c"];
    const first = careerProfile.scoreCareerProfileQuiz(quiz, answers);
    const second = careerProfile.scoreCareerProfileQuiz(quiz, answers);
    expect(second).toEqual(first);
  });

  it("picking the strategic_problem_solver option on every reachable question makes it win", () => {
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    // q1a, q3a, q5a, q7a are all strategic_problem_solver; fill the rest with
    // options that don't compete as heavily.
    const answers = ["a", "d", "a", "b", "a", "b", "a"];
    const { resultKey, dimensionScores } = careerProfile.scoreCareerProfileQuiz(quiz, answers);
    expect(resultKey).toBe("strategic_problem_solver");
    expect(dimensionScores.strategic_problem_solver).toBe(4);
  });

  it("breaks ties deterministically -- whichever archetypes tie for the top score, the winner is always the one earliest in tieBreakOrder", () => {
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    // A handful of representative answer sets, chosen without trying to
    // predict their scores -- the property under test (earliest-in-order
    // wins any tie) should hold regardless of which dimensions happen to
    // tie, so this doesn't depend on hand-computing a specific tie.
    const answerSets = [
      ["a", "b", "c", "d", "a", "b", "c"],
      ["c", "c", "c", "c", "c", "c", "c"],
      ["d", "a", "d", "b", "d", "d", "d"],
      ["b", "d", "b", "a", "b", "c", "b"],
    ];
    for (const answers of answerSets) {
      const { resultKey, dimensionScores } = careerProfile.scoreCareerProfileQuiz(quiz, answers);
      const topScore = Math.max(...Object.values(dimensionScores));
      const tiedKeys = Object.entries(dimensionScores)
        .filter(([, score]) => score === topScore)
        .map(([key]) => key);
      const expectedWinner = quiz.tieBreakOrder.find((key) => tiedKeys.includes(key));
      expect(resultKey).toBe(expectedWinner);
    }
  });

  it("getArchetypeByKey returns the matching archetype with a non-empty description", () => {
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    const archetype = careerProfile.getArchetypeByKey(quiz, "builder");
    expect(archetype?.title).toBe("The Builder");
    expect(archetype?.description.length).toBeGreaterThan(0);
  });
});

describe("Career Profile: persistence + progress", () => {
  it("progress starts at 0 of 5 for a brand-new user", () => {
    const user = makeUser();
    const progress = careerProfileRepo.getCareerProfileProgress(user.id);
    expect(progress.completedCount).toBe(0);
    expect(progress.totalCount).toBe(5);
    expect(progress.isComplete).toBe(false);
    expect(progress.completedQuizIds).toEqual([]);
  });

  it("completing Career Superpower moves progress to 1 of 5", () => {
    const user = makeUser();
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    const answers = ["a", "b", "c", "d", "a", "b", "c"];
    const { dimensionScores, resultKey } = careerProfile.scoreCareerProfileQuiz(quiz, answers);

    careerProfileRepo.upsertCareerProfileResult({
      userId: user.id,
      quizId: "career_superpower",
      quizVersion: quiz.meta.version,
      answers,
      dimensionScores,
      resultKey,
    });

    const progress = careerProfileRepo.getCareerProfileProgress(user.id);
    expect(progress.completedCount).toBe(1);
    expect(progress.completedQuizIds).toEqual(["career_superpower"]);
    expect(progress.isComplete).toBe(false);

    const stored = careerProfileRepo.getCareerProfileResult(user.id, "career_superpower");
    expect(stored?.result_key).toBe(resultKey);
  });

  it("retaking a quiz overwrites the previous result in place -- no duplicate row, no history kept", () => {
    const user = makeUser();
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;

    const first = careerProfile.scoreCareerProfileQuiz(quiz, ["a", "a", "a", "a", "a", "a", "a"]);
    careerProfileRepo.upsertCareerProfileResult({
      userId: user.id,
      quizId: "career_superpower",
      quizVersion: quiz.meta.version,
      answers: ["a", "a", "a", "a", "a", "a", "a"],
      dimensionScores: first.dimensionScores,
      resultKey: first.resultKey,
    });

    const second = careerProfile.scoreCareerProfileQuiz(quiz, ["b", "b", "b", "b", "b", "b", "b"]);
    careerProfileRepo.upsertCareerProfileResult({
      userId: user.id,
      quizId: "career_superpower",
      quizVersion: quiz.meta.version,
      answers: ["b", "b", "b", "b", "b", "b", "b"],
      dimensionScores: second.dimensionScores,
      resultKey: second.resultKey,
    });

    const allResults = careerProfileRepo.listCareerProfileResults(user.id);
    expect(allResults).toHaveLength(1);
    expect(allResults[0].result_key).toBe(second.resultKey);
    expect(allResults[0].result_key).toBe("builder");

    const progress = careerProfileRepo.getCareerProfileProgress(user.id);
    expect(progress.completedCount).toBe(1); // still 1, not 2 -- retake, not a second quiz
  });

  it("Career Profile results are stored independently per user", () => {
    const userA = makeUser();
    const userB = makeUser();
    const quiz = careerProfile.CAREER_SUPERPOWER_QUIZ;
    const { dimensionScores, resultKey } = careerProfile.scoreCareerProfileQuiz(quiz, ["a", "a", "a", "a", "a", "a", "a"]);

    careerProfileRepo.upsertCareerProfileResult({
      userId: userA.id,
      quizId: "career_superpower",
      quizVersion: quiz.meta.version,
      answers: ["a", "a", "a", "a", "a", "a", "a"],
      dimensionScores,
      resultKey,
    });

    expect(careerProfileRepo.getCareerProfileProgress(userA.id).completedCount).toBe(1);
    expect(careerProfileRepo.getCareerProfileProgress(userB.id).completedCount).toBe(0);
  });
});
