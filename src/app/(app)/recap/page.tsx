import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getLatestWeeklyRecap } from "@/lib/repo/weeklyRecaps";
import { getMemoriesByIds } from "@/lib/repo/memories";
import { RecapClient } from "./RecapClient";

// "Your Week in Stories" -- see app/api/weekly-recap/run for how the recap
// itself gets generated (a weekly external automation, same pattern as the
// blog automation). This page just displays the most recent one already
// saved for this user, and is also where a recap push notification's tap
// deep-links to (see route: "/recap" in that route file).
export default async function RecapPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const recap = getLatestWeeklyRecap(userId);
  if (!recap) {
    return <RecapClient recap={null} stories={[]} />;
  }

  const storedStories = JSON.parse(recap.stories) as { memoryId: string; title: string; blurb: string }[];
  // Re-check which of the featured memories still exist (rather than
  // trusting the title/blurb captured at generation time forever) so a
  // memory deleted since the recap was generated doesn't leave a dead link
  // that still looks clickable.
  const existingIds = new Set(getMemoriesByIds(userId, storedStories.map((s) => s.memoryId)).map((m) => m.id));
  const stories = storedStories.map((s) => ({ ...s, exists: existingIds.has(s.memoryId) }));

  return (
    <RecapClient
      recap={{ headline: recap.headline, weekStart: recap.week_start, createdAt: recap.created_at }}
      stories={stories}
    />
  );
}
