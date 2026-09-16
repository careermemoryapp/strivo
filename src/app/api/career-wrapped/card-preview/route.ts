import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import { ALL_TIME_PERIOD_KEY } from "@/lib/careerWrapped";
import { buildCareerCardElement, CAREER_CARD_SIZE, type CareerCardData, type CareerCardTemplate } from "@/lib/careerCardImage";

const TEMPLATES: CareerCardTemplate[] = ["A", "B", "C"];

// Lets the template-picker step of the "Generate My Career Card" flow show
// the user a REAL rendered preview of each template (same buildCareerCardElement
// used by the actual share image/OG routes) before they've generated
// anything -- so the picker never resorts to a fake CSS mockup that could
// drift from what actually gets produced. Auth-gated and re-derives
// cardData from the user's own authoritative snapshot every time (same
// "never trust/persist client input" posture as the share route) rather
// than creating a career_wrapped_shares row -- this is a look, not a share,
// so nothing here is persisted or publicly reachable.
export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_wrapped")) {
    return NextResponse.json({ error: "Career Wrapped is temporarily unavailable." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const periodKey = searchParams.get("periodKey") || ALL_TIME_PERIOD_KEY;
  const templateParam = searchParams.get("template");
  const template: CareerCardTemplate = TEMPLATES.includes(templateParam as CareerCardTemplate)
    ? (templateParam as CareerCardTemplate)
    : "A";

  const user = getUserById(userId);
  const snapshot = getOrComputeCareerWrappedSnapshot(userId, periodKey);
  const periodLabel = periodKey === ALL_TIME_PERIOD_KEY ? "All Time" : periodKey;

  const cardData: CareerCardData = {
    title: `${user?.first_name ? `${user.first_name}'s` : "Your"} ${periodLabel} Career`,
    periodLabel,
    winsCount: snapshot.wins_count,
    leadershipCount: snapshot.leadership_count,
    problemsSolvedCount: snapshot.problems_solved_count,
    strongestMuscle: snapshot.strongest_muscle,
    growingMuscle: snapshot.growing_muscle,
  };

  return new ImageResponse(buildCareerCardElement(cardData, template), { ...CAREER_CARD_SIZE });
}
