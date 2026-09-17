import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { PublicQuizHubClient } from "./PublicQuizHubClient";

// The public, no-login Career Profile quiz hub on strivo.ai -- the
// top-of-funnel replacement for the old in-app career-profile hub (see
// app/(app)/career-profile/page.tsx, which now just redirects here).
// Unlike that page, there's no per-user progress to fetch server-side --
// a visitor's progress across the 5 quizzes lives in their own browser
// (lib/publicQuizProgress.ts), so this is just a thin gate + client shell.
export default async function PublicQuizHubPage() {
  if (!isFeatureEnabled("career_profile")) redirect("/");
  return <PublicQuizHubClient />;
}
