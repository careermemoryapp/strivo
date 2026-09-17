import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { CAREER_PROFILE_QUIZ_ORDER, getCareerProfileQuizDefinition, type CareerProfileQuizId } from "@/lib/careerProfile";
import { PublicQuizClient } from "./PublicQuizClient";

// Public, no-login twin of app/(app)/career-profile/[quizId]/page.tsx --
// same quiz content and scoring engine (lib/careerProfile.ts is pure data,
// no DB access), just no requireUserId() gate and no per-user DB row.
export default async function PublicQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  if (!isFeatureEnabled("career_profile")) redirect("/");

  const { quizId: rawQuizId } = await params;
  if (!CAREER_PROFILE_QUIZ_ORDER.includes(rawQuizId as CareerProfileQuizId)) redirect("/quiz");
  const quizId = rawQuizId as CareerProfileQuizId;

  const quiz = getCareerProfileQuizDefinition(quizId);
  if (!quiz) redirect("/quiz"); // roster entry exists but content isn't shipped yet

  return <PublicQuizClient quiz={quiz} />;
}
