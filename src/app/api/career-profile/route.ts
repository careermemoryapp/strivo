import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { CAREER_PROFILE_QUIZZES, getArchetypeByKey, getCareerProfileQuizDefinition } from "@/lib/careerProfile";
import { getCareerProfileProgress, listCareerProfileResults } from "@/lib/repo/careerProfile";

// Read-only summary used by Home and the /career-profile hub page: progress
// plus each completed quiz's result (title/emoji/description), never raw
// answers/dimension scores -- those stay internal to the results table.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_profile")) {
    return NextResponse.json({ error: "Career Profile is temporarily unavailable." }, { status: 503 });
  }

  const progress = getCareerProfileProgress(userId);
  const resultRows = listCareerProfileResults(userId);
  const resultsByQuiz = new Map(resultRows.map((r) => [r.quiz_id, r]));

  const results = Object.values(CAREER_PROFILE_QUIZZES).map((meta) => {
    const row = resultsByQuiz.get(meta.id);
    if (!row) return { quizId: meta.id, meta, completed: false as const };
    const quiz = getCareerProfileQuizDefinition(meta.id);
    const archetype = quiz ? getArchetypeByKey(quiz, row.result_key) : null;
    return {
      quizId: meta.id,
      meta,
      completed: true as const,
      result: archetype
        ? { resultKey: row.result_key, title: archetype.title, emoji: archetype.emoji, description: archetype.description }
        : null,
    };
  });

  return NextResponse.json({ progress, results });
}
