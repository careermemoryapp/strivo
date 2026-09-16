import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { CAREER_PROFILE_QUIZ_ORDER, getCareerProfileQuizDefinition, type CareerProfileQuizId } from "@/lib/careerProfile";
import { CareerProfileQuizClient } from "./CareerProfileQuizClient";

export default async function CareerProfileQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_profile")) redirect("/home");

  const { quizId: rawQuizId } = await params;
  if (!CAREER_PROFILE_QUIZ_ORDER.includes(rawQuizId as CareerProfileQuizId)) redirect("/career-profile");
  const quizId = rawQuizId as CareerProfileQuizId;

  const quiz = getCareerProfileQuizDefinition(quizId);
  if (!quiz) redirect("/career-profile"); // roster entry exists but content isn't shipped yet

  return <CareerProfileQuizClient quiz={quiz} />;
}
