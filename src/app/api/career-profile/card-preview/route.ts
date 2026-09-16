import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { buildCareerProfileCardData } from "@/lib/repo/careerProfile";
import { buildCareerProfileCardElement, CAREER_PROFILE_CARD_SIZE } from "@/lib/careerProfileCardImage";

// Same role as career-wrapped/card-preview/route.ts: lets the reveal flow
// show a REAL rendered preview (the exact function every other render path
// uses) before anything is generated/shared, rather than a CSS mockup that
// could drift. Auth-gated, re-derives card data from this user's own stored
// results every time -- nothing here is persisted or publicly reachable.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("career_profile")) {
    return NextResponse.json({ error: "Career Profile is temporarily unavailable." }, { status: 503 });
  }

  const user = getUserById(userId);
  const cardData = buildCareerProfileCardData(userId, user?.first_name ?? null);
  if (!cardData) {
    return NextResponse.json({ error: "Complete all 5 discoveries to preview your Career Profile Card." }, { status: 400 });
  }

  return new ImageResponse(buildCareerProfileCardElement(cardData), { ...CAREER_PROFILE_CARD_SIZE });
}
