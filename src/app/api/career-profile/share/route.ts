import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { buildCareerProfileCardData, createCareerProfileShare } from "@/lib/repo/careerProfile";
import type { CareerProfileCardData } from "@/lib/careerProfileCardImage";

// Same convention as APP_ORIGIN in lib/email.ts / app/api/career-wrapped/share/route.ts.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";

// Creates a new public Career Profile Card share. card_data is built here,
// server-side, from this user's own stored quiz results (never trusted from
// the request body) -- same posture as the Career Wrapped share route. No
// request body to parse: a Career Profile Card has exactly one shape (all 5
// results, fixed order), so there's nothing left for the client to choose.
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_profile")) {
    return NextResponse.json({ error: "Career Profile is temporarily unavailable." }, { status: 503 });
  }

  const user = getUserById(userId);
  const cardData: CareerProfileCardData | null = buildCareerProfileCardData(userId, user?.first_name ?? null);
  if (!cardData) {
    return NextResponse.json({ error: "Complete all 5 discoveries to generate your Career Profile Card." }, { status: 400 });
  }

  const share = createCareerProfileShare({ userId, cardData });

  return NextResponse.json({
    shareId: share.id,
    url: `${APP_ORIGIN}/cp/${share.id}`,
    cardData,
  });
}
