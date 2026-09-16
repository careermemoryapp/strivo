import { getDb, newId, nowIso } from "@/lib/db";
import {
  CAREER_PROFILE_QUIZ_ORDER,
  CAREER_PROFILE_QUIZZES,
  getArchetypeByKey,
  getCareerProfileQuizDefinition,
  type CareerProfileQuizId,
} from "@/lib/careerProfile";
import type { CareerProfileCardData } from "@/lib/careerProfileCardImage";

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

// ---- Career Profile Card shares (see app/api/career-profile/share/route.ts
// and app/cp/[shareId]) -- same shape/conventions as
// lib/repo/careerWrapped.ts's career_wrapped_shares functions, on the
// career_profile_shares table (lib/db.ts). Kept in this file rather than a
// separate one since it's a small, closely-related extension of the same
// "results -> card" surface, not a different subsystem.

export type CareerProfileShareRow = {
  id: string;
  user_id: string;
  card_data: string; // JSON -- see CareerProfileCardData in lib/careerProfileCardImage.tsx
  view_count: number;
  revoked: number;
  created_at: string;
};

export function createCareerProfileShare(input: { userId: string; cardData: unknown }): CareerProfileShareRow {
  const db = getDb();
  const id = newId("cpshare");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO career_profile_shares (id, user_id, card_data, view_count, revoked, created_at)
     VALUES (?, ?, ?, 0, 0, ?)`
  ).run(id, input.userId, JSON.stringify(input.cardData), ts);
  return db.prepare(`SELECT * FROM career_profile_shares WHERE id = ?`).get(id) as CareerProfileShareRow;
}

// Deliberately NOT scoped by user_id -- this is the one read path meant to
// be reachable by a logged-out visitor via the public /cp/[shareId] link.
// `revoked` is what keeps a pulled-down link from resolving, not an auth
// check -- same posture as getCareerWrappedShareById.
export function getCareerProfileShareById(id: string): CareerProfileShareRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM career_profile_shares WHERE id = ? AND revoked = 0`).get(id) as
    | CareerProfileShareRow
    | undefined;
}

export function incrementCareerProfileShareViews(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE career_profile_shares SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

// Assembles the 5-row card data from this user's own stored results -- the
// one place this composition happens, so app/(app)/career-profile/card/
// page.tsx, the card-preview route, and the share route can never drift
// apart on what a "complete" card actually contains. Returns null if the
// user hasn't finished all 5 quizzes yet -- callers redirect/error rather
// than ever rendering a partial card (a Career Profile Card is a 5/5 reveal
// moment, not a progress view; that's what the hub page is for).
export function buildCareerProfileCardData(userId: string, displayName: string | null): CareerProfileCardData | null {
  const progress = getCareerProfileProgress(userId);
  if (!progress.isComplete) return null;

  const resultsByQuiz = new Map(listCareerProfileResults(userId).map((r) => [r.quiz_id, r]));

  const rows = CAREER_PROFILE_QUIZ_ORDER.map((quizId) => {
    const meta = CAREER_PROFILE_QUIZZES[quizId];
    const row = resultsByQuiz.get(quizId);
    const quiz = getCareerProfileQuizDefinition(quizId);
    const archetype = row && quiz ? getArchetypeByKey(quiz, row.result_key) : null;
    return {
      quizId,
      eyebrow: meta.resultLabel,
      // Should be unreachable given progress.isComplete above (every quiz
      // is implemented and every completed row's result_key always matches
      // a real archetype), but never render undefined onto a public image.
      title: archetype?.title ?? "—",
    };
  });

  return {
    title: `${displayName ? `${displayName}'s` : "Your"} Career Profile`,
    rows,
  };
}
