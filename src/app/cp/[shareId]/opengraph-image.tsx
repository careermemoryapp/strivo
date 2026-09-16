import { ImageResponse } from "next/og";
import { getCareerProfileShareById } from "@/lib/repo/careerProfile";
import { buildCareerProfileCardElement, CAREER_PROFILE_CARD_SIZE, type CareerProfileCardData } from "@/lib/careerProfileCardImage";

// Makes a Career Profile Card LINK posted to LinkedIn/X/WhatsApp actually
// show the card image in the unfurled preview -- mirrors
// app/cw/[shareId]/opengraph-image.tsx exactly. Renders the exact same
// element as the share-image route so the two can never visually drift.
export const size = CAREER_PROFILE_CARD_SIZE;
export const contentType = "image/png";

export default async function CareerProfileCardOgImage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerProfileShareById(shareId);
  if (!share) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#fff", fontSize: 40 }}>
          Career Profile Card not found
        </div>
      ),
      { ...size }
    );
  }
  const cardData = JSON.parse(share.card_data) as CareerProfileCardData;
  return new ImageResponse(buildCareerProfileCardElement(cardData), { ...size });
}
