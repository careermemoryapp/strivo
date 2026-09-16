import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { buildCareerProfileCardData } from "@/lib/repo/careerProfile";
import { CareerProfileCardClient } from "./CareerProfileCardClient";

// Entry point for the "Reveal My Career Profile Card" moment -- reached
// from the hub page and the quiz result-reveal screen once all 5/5 are
// done. Same shape as career-wrapped/card/page.tsx: a thin server page that
// builds the (already-plain-object) card data up front and hands it to a
// client component.
export default async function CareerProfileCardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_profile")) redirect("/home");

  const user = getUserById(userId);
  const previewData = buildCareerProfileCardData(userId, user?.first_name ?? null);

  // Not actually 5/5 yet (stale bookmark/back-navigation -- the only links
  // into this page are already gated on progress.isComplete) -- send them
  // back to the hub rather than rendering a broken reveal flow.
  if (!previewData) redirect("/career-profile");

  return <CareerProfileCardClient previewData={previewData} />;
}
