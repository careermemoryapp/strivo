import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getOrComputeCareerWrappedSnapshot, createCareerWrappedShare, listCareerWrappedSharesForUser } from "@/lib/repo/careerWrapped";
import { ALL_TIME_PERIOD_KEY, buildCareerCardInsights, type CareerMuscle } from "@/lib/careerWrapped";
import type { CareerCardData } from "@/lib/careerCardImage";

// Same convention as APP_ORIGIN in lib/email.ts.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";

// Creates a new public Career Card share. Deliberately does NOT trust any
// stats the client might send -- card_data is built here, server-side, from
// the user's own authoritative snapshot (see getOrComputeCareerWrappedSnapshot
// in lib/repo/careerWrapped.ts), never from the request body. This is both a
// correctness guarantee (the spec's "every displayed number must be derived
// from actual user data" applies just as much to a public link as to the
// in-app view) and the privacy guarantee from spec section 7: the snapshot
// object only ever contains aggregated counts and muscle names -- there is
// no memory text, project name, client name, or feedback anywhere in it to
// leak, structurally, not just by convention.
//
// No request body to parse anymore: the period is always ALL_TIME_PERIOD_KEY
// (the year filter was pulled from the UI -- see the card-preview route's
// comment) and the template is always "A" (the only design left after the
// template picker was removed), so there's nothing left for the client to
// choose.
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_wrapped")) {
    return NextResponse.json({ error: "Career Wrapped is temporarily unavailable." }, { status: 503 });
  }

  const user = getUserById(userId);
  const snapshot = getOrComputeCareerWrappedSnapshot(userId, ALL_TIME_PERIOD_KEY);

  const cardData: CareerCardData = {
    title: `${user?.first_name ? `${user.first_name}'s` : "Your"} Career`,
    periodLabel: "All Time",
    winsCount: snapshot.wins_count,
    leadershipCount: snapshot.leadership_count,
    problemsSolvedCount: snapshot.problems_solved_count,
    seniorStakeholderCount: snapshot.senior_stakeholder_count,
    strongestMuscle: snapshot.strongest_muscle,
    growingMuscle: snapshot.growing_muscle,
    underrepresentedMuscle: snapshot.underrepresented_muscle,
    insights: buildCareerCardInsights({
      winsCount: snapshot.wins_count,
      leadershipCount: snapshot.leadership_count,
      problemsSolvedCount: snapshot.problems_solved_count,
      seniorStakeholderCount: snapshot.senior_stakeholder_count,
      strongestMuscle: snapshot.strongest_muscle as CareerMuscle | null,
      growingMuscle: snapshot.growing_muscle as CareerMuscle | null,
      underrepresentedMuscle: snapshot.underrepresented_muscle as CareerMuscle | null,
    }),
  };

  const share = createCareerWrappedShare({ userId, periodKey: ALL_TIME_PERIOD_KEY, template: "A", cardData });

  return NextResponse.json({
    shareId: share.id,
    url: `${APP_ORIGIN}/cw/${share.id}`,
    cardData,
  });
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const shares = listCareerWrappedSharesForUser(userId).map((s) => ({
    id: s.id,
    periodKey: s.period_key,
    template: s.template,
    viewCount: s.view_count,
    createdAt: s.created_at,
    url: `${APP_ORIGIN}/cw/${s.id}`,
  }));
  return NextResponse.json({ shares });
}
