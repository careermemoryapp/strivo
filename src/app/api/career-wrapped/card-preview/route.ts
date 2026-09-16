import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getCareerWrappedSecondaryInsights, getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import {
  ALL_TIME_PERIOD_KEY,
  buildCareerAchievementPotential,
  buildCareerArchetype,
  buildCareerPersonaHeadline,
  type CareerMuscle,
} from "@/lib/careerWrapped";
import { buildCareerCardElement, CAREER_CARD_SIZE, type CareerCardData } from "@/lib/careerCardImage";

// Lets the "Generate My Career Card" flow show the user a REAL rendered
// preview (same buildCareerCardElement used by the actual share image/OG
// routes) before they've generated anything -- so the preview never resorts
// to a fake CSS mockup that could drift from what actually gets produced.
// Auth-gated and re-derives cardData from the user's own authoritative
// snapshot every time (same "never trust/persist client input" posture as
// the share route) rather than creating a career_wrapped_shares row -- this
// is a look, not a share, so nothing here is persisted or publicly
// reachable.
//
// Always the user's whole career (ALL_TIME_PERIOD_KEY) -- the year filter
// was pulled from the UI (product feedback: a brand-new account has no
// prior-year data to filter to, so picking a year was a dead end for
// everyone until they have multi-year history; the underlying per-year
// aggregation in lib/careerWrapped.ts is untouched and can resurface later).
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_wrapped")) {
    return NextResponse.json({ error: "Career Wrapped is temporarily unavailable." }, { status: 503 });
  }

  const user = getUserById(userId);
  const snapshot = getOrComputeCareerWrappedSnapshot(userId, ALL_TIME_PERIOD_KEY);
  const secondary = getCareerWrappedSecondaryInsights(snapshot);

  const cardData: CareerCardData = {
    title: `${user?.first_name ? `${user.first_name}'s` : "Your"} Career`,
    periodLabel: "All Time",
    archetype: buildCareerArchetype(snapshot.strongest_muscle as CareerMuscle | null),
    strongestMuscle: snapshot.strongest_muscle,
    personaHeadline: buildCareerPersonaHeadline({
      strongestMuscle: snapshot.strongest_muscle as CareerMuscle | null,
      secondStrongestMuscle: secondary.secondStrongestMuscle,
      winsCount: snapshot.wins_count,
      leadershipCount: snapshot.leadership_count,
    }),
    achievementPotential: buildCareerAchievementPotential(
      snapshot.strongest_muscle as CareerMuscle | null,
      secondary.secondStrongestMuscle
    ),
  };

  return new ImageResponse(buildCareerCardElement(cardData), { ...CAREER_CARD_SIZE });
}
