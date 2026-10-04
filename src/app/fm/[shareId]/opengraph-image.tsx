import { ImageResponse } from "next/og";
import { getFoundingMemberShareById } from "@/lib/repo/foundingMember";
import { buildFoundingMemberCardElement, FOUNDING_MEMBER_CARD_SIZE, type FoundingMemberCardData } from "@/lib/founderCardImage";

// This is what makes a Founding Member LINK posted to LinkedIn/X/WhatsApp/
// Instagram actually show the card image in the unfurled preview -- those
// platforms' share intents only take a URL, never a raw image upload (same
// reasoning as app/cw/[shareId]/opengraph-image.tsx, which this mirrors).
// Renders the exact same element as
// app/api/founding-member/share-image/[shareId]/route.ts (via
// buildFoundingMemberCardElement) so the two can never visually drift
// apart.
export const size = FOUNDING_MEMBER_CARD_SIZE;
export const contentType = "image/png";

export default async function FoundingMemberOgImage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getFoundingMemberShareById(shareId);
  if (!share) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#fff", fontSize: 40 }}>
          Founding Member card not found
        </div>
      ),
      { ...size }
    );
  }
  const cardData = JSON.parse(share.card_data) as FoundingMemberCardData;
  return new ImageResponse(buildFoundingMemberCardElement(cardData), { ...size });
}
