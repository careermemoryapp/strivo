import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getCareerWrappedShareById } from "@/lib/repo/careerWrapped";
import { buildCareerCardElement, CAREER_CARD_SIZE, type CareerCardData } from "@/lib/careerCardImage";

// The actual downloadable/shareable PNG for a given Career Card share (see
// app/api/career-wrapped/share/route.ts for how a share is created). Public
// and unauthenticated on purpose -- same reachability as the /cw/[shareId]
// landing page itself (an unguessable id is the access control, see that
// table's comment in lib/db.ts), since this is exactly the URL the "Download"
// button and the native share sheet (@capacitor/share, which needs an actual
// file to attach) both fetch. card_data was captured once at share-creation
// time (see the share route's comment on why it's never re-derived from a
// live, possibly-since-changed snapshot) -- this route just renders it.
export async function GET(_req: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerWrappedShareById(shareId);
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let cardData: CareerCardData;
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    return NextResponse.json({ error: "Corrupt card data" }, { status: 500 });
  }

  return new ImageResponse(buildCareerCardElement(cardData), {
    ...CAREER_CARD_SIZE,
  });
}
