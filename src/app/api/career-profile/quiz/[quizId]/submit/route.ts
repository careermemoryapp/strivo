import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import {
  CAREER_PROFILE_QUIZ_ORDER,
  getArchetypeByKey,
  getCareerProfileQuizDefinition,
  scoreCareerProfileQuiz,
  type CareerProfileQuizId,
} from "@/lib/careerProfile";
import { getCareerProfileProgress, upsertCareerProfileResult } from "@/lib/repo/careerProfile";

const bodySchema = z.object({
  // One option id per question, in the same order as the quiz's own
  // question list -- validated for length and option-id membership below,
  // never trusted blindly (this determines the stored result).
  answers: z.array(z.string()).min(1).max(20),
});

// No trial/subscription gate here on purpose -- Career Profile is meant to
// work even for a user whose trial has ended (see the Home redesign audit,
// "risks" section: it's deterministic, costs nothing, and is a reasonable
// re-engagement lever). Only the feature flag gates it.
export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const limited = rateLimitOrResponse(`career-profile-submit:${requestIp(req)}`, 30, 60 * 1000);
  if (limited) return limited;

  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_profile")) {
    return NextResponse.json({ error: "Career Profile is temporarily unavailable." }, { status: 503 });
  }

  const { quizId: rawQuizId } = await params;
  if (!CAREER_PROFILE_QUIZ_ORDER.includes(rawQuizId as CareerProfileQuizId)) {
    return NextResponse.json({ error: "Unknown quiz" }, { status: 404 });
  }
  const quizId = rawQuizId as CareerProfileQuizId;

  const quiz = getCareerProfileQuizDefinition(quizId);
  if (!quiz) {
    // Roster entry exists but content isn't shipped yet (see the
    // `implemented` flag in lib/careerProfile.ts) -- same "hidden, not
    // broken" posture as a disabled feature flag.
    return NextResponse.json({ error: "This discovery isn't available yet." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
  }
  const { answers } = parsed.data;

  if (answers.length !== quiz.questions.length) {
    return NextResponse.json({ error: `Expected ${quiz.questions.length} answers, got ${answers.length}` }, { status: 400 });
  }
  const invalidIndex = quiz.questions.findIndex((q, i) => !q.options.some((o) => o.id === answers[i]));
  if (invalidIndex !== -1) {
    return NextResponse.json({ error: `Invalid answer for question ${invalidIndex + 1}` }, { status: 400 });
  }

  const { dimensionScores, resultKey } = scoreCareerProfileQuiz(quiz, answers);
  const archetype = getArchetypeByKey(quiz, resultKey);
  if (!archetype) {
    // Should be unreachable given the dev-time completeness assertion in
    // lib/careerProfile.ts, but never trust that assertion ran in this
    // process -- fail loudly rather than return a broken result.
    return NextResponse.json({ error: "Could not compute a result" }, { status: 500 });
  }

  upsertCareerProfileResult({
    userId,
    quizId,
    quizVersion: quiz.meta.version,
    answers,
    dimensionScores,
    resultKey,
  });

  const progress = getCareerProfileProgress(userId);

  return NextResponse.json({
    result: {
      quizId,
      resultKey,
      title: archetype.title,
      emoji: archetype.emoji,
      description: archetype.description,
      resultLabel: quiz.meta.resultLabel,
    },
    progress,
  });
}
