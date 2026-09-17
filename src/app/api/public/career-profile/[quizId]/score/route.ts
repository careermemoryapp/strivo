import { NextResponse } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import {
  CAREER_PROFILE_QUIZ_ORDER,
  getArchetypeByKey,
  getCareerProfileQuizDefinition,
  scoreCareerProfileQuiz,
  type CareerProfileQuizId,
} from "@/lib/careerProfile";

// Public, unauthenticated twin of
// app/api/career-profile/quiz/[quizId]/submit/route.ts -- for the
// marketing-site /quiz flow (strivo.ai), where a visitor takes all 5 Career
// Profile quizzes WITHOUT ever signing in. Scoring itself is a pure,
// deterministic function of the quiz definition + answers (see
// lib/careerProfile.ts), so it needs no DB write here at all: unlike the
// in-app submit route, there is no per-user row to upsert. The caller
// (PublicQuizClient.tsx) holds each quiz's {quizId, resultKey} in
// localStorage across the 5 quizzes and sends the full set to
// /api/public/career-profile/share once all 5 are done.
const bodySchema = z.object({
  answers: z.array(z.string()).min(1).max(20),
});

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const limited = rateLimitOrResponse(`public-career-profile-score:${requestIp(req)}`, 30, 60 * 1000);
  if (limited) return limited;

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

  const { resultKey } = scoreCareerProfileQuiz(quiz, answers);
  const archetype = getArchetypeByKey(quiz, resultKey);
  if (!archetype) {
    return NextResponse.json({ error: "Could not compute a result" }, { status: 500 });
  }

  return NextResponse.json({
    result: {
      quizId,
      resultKey,
      title: archetype.title,
      emoji: archetype.emoji,
      description: archetype.description,
      resultLabel: quiz.meta.resultLabel,
    },
  });
}
