import { ImageResponse } from "next/og";
import { getCareerWrappedShareById } from "@/lib/repo/careerWrapped";
import { buildCareerCardElement, CAREER_CARD_SIZE, type CareerCardData, type CareerCardTemplate } from "@/lib/careerCardImage";

// This is what makes a Career Card LINK posted to LinkedIn/X/WhatsApp
// actually show the card image in the unfurled preview -- those platforms'
// share intents only take a URL, never a raw image upload (see the sharing
// plan in the Career Wrapped audit), so the image has to come from this
// route-convention file instead. Renders the exact same element as
// app/api/career-wrapped/share-image/[shareId]/route.ts (via
// buildCareerCardElement) so the two can never visually drift apart.
export const size = CAREER_CARD_SIZE;
export const contentType = "image/png";

export default async function CareerCardOgImage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerWrappedShareById(shareId);
  if (!share) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#fff", fontSize: 40 }}>
          Career Card not found
        </div>
      ),
      { ...size }
    );
  }
  const cardData = JSON.parse(share.card_data) as CareerCardData;
  return new ImageResponse(buildCareerCardElement(cardData, share.template as CareerCardTemplate), { ...size });
}
