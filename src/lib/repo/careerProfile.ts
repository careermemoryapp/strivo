import { getDb, newId, nowIso } from "@/lib/db";
import { CAREER_PROFILE_QUIZ_ORDER, type CareerProfileQuizId } from "@/lib/careerProfile";

// Storage layer for Career Profile quiz results. Deliberately has NO
// dependency on lib/repo/memories.ts or lib/repo/careerWrapped.ts -- see the
// separation this file comment in lib/careerProfile.ts explains. A quiz
// result row here should never be read by anything that computes Career
// Wrapped/memory-evidence data, and vice versa.

export type CareerProfileResultRow = {
  id: string;
  user_id: string;
  quiz_id: string;
  quiz_version: number;
  answers: string; // JSON string[]
  dimension_scores: string; // JSON Record<string, number>
  result_key: string;
  completed_at: string;
};

// One row per (user, quiz) -- a retake overwrites in place (product
// decision: no result history kept, see the career_profile_results comment
// in lib/db.ts).
export function upsertCareerProfileResult(input: {
  userId: string;
  quizId: CareerProfileQuizId;
  quizVersion: number;
  answers: string[];
  dimensionScores: Record<string, number>;
  resultKey: string;
}): CareerProfileResultRow {
  const db = getDb();
  const id = newId("cpres");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO career_profile_results
       (id, user_id, quiz_id, quiz_version, answers, dimension_scores, result_key, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, quiz_id) DO UPDATE SET
       quiz_version = excluded.quiz_version,
       answers = excluded.answers,
       dimension_scores = excluded.dimension_scores,
       result_key = excluded.result_key,
       completed_at = excluded.completed_at`
  ).run(id, input.userId, input.quizId, input.quizVersion, JSON.stringify(input.answers), JSON.stringify(input.dimensionScores), input.resultKey, ts);

  return getCareerProfileResult(input.userId, input.quizId)!;
}

export function getCareerProfileResult(userId: string, quizId: CareerProfileQuizId): CareerProfileResultRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM career_profile_results WHERE user_id = ? AND quiz_id = ?`)
    .get(userId, quizId) as CareerProfileResultRow | undefined;
}

export function listCareerProfileResults(userId: string): CareerProfileResultRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM career_profile_results WHERE user_id = ?`).all(userId) as CareerProfileResultRow[];
}

export type CareerProfileProgress = {
  completedQuizIds: CareerProfileQuizId[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
};

// Progress is derived from the roster + completed rows, never stored
// separately -- see the file comment in lib/careerProfile.ts.
export function getCareerProfileProgress(userId: string): CareerProfileProgress {
  const results = listCareerProfileResults(userId);
  const completedSet = new Set(results.map((r) => r.quiz_id));
  const completedQuizIds = CAREER_PROFILE_QUIZ_ORDER.filter((id) => completedSet.has(id));
  return {
    completedQuizIds,
    completedCount: completedQuizIds.length,
    totalCount: CAREER_PROFILE_QUIZ_ORDER.length,
    isComplete: completedQuizIds.length === CAREER_PROFILE_QUIZ_ORDER.length,
  };
}
