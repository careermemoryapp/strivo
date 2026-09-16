import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getCareerProfileShareById } from "@/lib/repo/careerProfile";
import { buildCareerProfileCardElement, CAREER_PROFILE_CARD_SIZE, type CareerProfileCardData } from "@/lib/careerProfileCardImage";

// The actual downloadable/shareable PNG for a given Career Profile Card
// share -- same role as career-wrapped/share-image/[shareId]/route.ts.
// Public and unauthenticated on purpose (an unguessable id is the access
// control, same as career_wrapped_shares). card_data was frozen once at
// share-creation time, so this route just renders it, never re-derives it.
export async function GET(_req: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerProfileShareById(shareId);
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let cardData: CareerProfileCardData;
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    return NextResponse.json({ error: "Corrupt card data" }, { status: 500 });
  }

  return new ImageResponse(buildCareerProfileCardElement(cardData), { ...CAREER_PROFILE_CARD_SIZE });
}
