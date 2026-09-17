import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { PublicCareerProfileRevealClient } from "./PublicCareerProfileRevealClient";

// The public flow's card-generation step -- reached once a visitor has
// finished all 5 quizzes in /quiz/[quizId] (progress lives in their
// browser, see lib/publicQuizProgress.ts). Entirely client-driven (there's
// no per-visitor server data to fetch), so this is just the feature-flag
// gate + client shell, same shape as app/quiz/page.tsx.
export default async function PublicCareerProfileRevealPage() {
  if (!isFeatureEnabled("career_profile")) redirect("/");
  return <PublicCareerProfileRevealClient />;
}
