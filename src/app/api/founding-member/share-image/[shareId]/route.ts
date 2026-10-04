import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getFoundingMemberShareById } from "@/lib/repo/foundingMember";
import { buildFoundingMemberCardElement, FOUNDING_MEMBER_CARD_SIZE, type FoundingMemberCardData } from "@/lib/founderCardImage";

// The actual downloadable/shareable PNG for a given Founding Member share
// (see app/api/founding-member/share/route.ts for how a share is created).
// Public and unauthenticated on purpose -- same reachability as the
// /fm/[shareId] landing page itself (an unguessable id is the access
// control, see founding_member_shares' comment in lib/db.ts), since this
// is exactly the URL the "Download" button and the native share sheet
// (@capacitor/share, which needs an actual file to attach) both fetch.
export async function GET(_req: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getFoundingMemberShareById(shareId);
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let cardData: FoundingMemberCardData;
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    return NextResponse.json({ error: "Corrupt card data" }, { status: 500 });
  }

  return new ImageResponse(buildFoundingMemberCardElement(cardData), {
    ...FOUNDING_MEMBER_CARD_SIZE,
  });
}
