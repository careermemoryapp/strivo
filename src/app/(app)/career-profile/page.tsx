import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { CAREER_PROFILE_QUIZZES, getArchetypeByKey, getCareerProfileQuizDefinition } from "@/lib/careerProfile";
import { getCareerProfileProgress, listCareerProfileResults } from "@/lib/repo/careerProfile";
import { CareerProfileHubClient } from "./CareerProfileHubClient";

// The Career Profile hub -- "0/5 discovered" through "5/5, reveal your
// card". Same shape as career-wrapped/page.tsx: a thin server page that
// fetches everything up front and hands plain objects to a client
// component (node:sqlite rows never cross the boundary directly, per
// CLAUDE.md's hard rule -- results here are already plain objects built by
// the repo layer, not raw rows, but we still only pass plain data down).
export default async function CareerProfilePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_profile")) redirect("/home");

  const progress = getCareerProfileProgress(userId);
  const resultRows = listCareerProfileResults(userId);
  const resultsByQuiz = new Map(resultRows.map((r) => [r.quiz_id, r]));

  const quizzes = Object.values(CAREER_PROFILE_QUIZZES).map((meta) => {
    const row = resultsByQuiz.get(meta.id);
    if (!row) return { quizId: meta.id, meta, completed: false as const, result: null };
    const quiz = getCareerProfileQuizDefinition(meta.id);
    const archetype = quiz ? getArchetypeByKey(quiz, row.result_key) : null;
    return {
      quizId: meta.id,
      meta,
      completed: true as const,
      result: archetype ? { title: archetype.title, emoji: archetype.emoji, description: archetype.description } : null,
    };
  });

  return <CareerProfileHubClient progress={progress} quizzes={quizzes} />;
}
