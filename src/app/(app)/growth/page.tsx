import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getLatestGrowthNarrative } from "@/lib/repo/growthNarratives";
import { GrowthClient } from "./GrowthClient";

// "How You've Grown" -- see app/api/growth-narrative/run for how the
// narrative itself gets generated (a monthly external automation, same
// pattern as the blog and weekly-recap automations). This page just
// displays the most recent one already saved for this user, and is also
// where a growth-narrative push notification's tap deep-links to (see
// route: "/growth" in that route file).
export default async function GrowthPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const narrative = getLatestGrowthNarrative(userId);

  return (
    <GrowthClient
      narrative={
        narrative
          ? {
              text: narrative.narrative_text,
              earliestDate: narrative.earliest_memory_date,
              latestDate: narrative.latest_memory_date,
              createdAt: narrative.created_at,
            }
          : null
      }
    />
  );
}
