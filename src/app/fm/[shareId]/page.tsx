import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFoundingMemberShareById, incrementFoundingMemberShareViews } from "@/lib/repo/foundingMember";
import { APP_NAME } from "@/lib/config";
import type { FoundingMemberCardData } from "@/lib/founderCardImage";
import { FoundingMemberPublicClient } from "./FoundingMemberPublicClient";

// Public, unauthenticated Founding Member card landing page -- deliberately
// OUTSIDE the (app) route group (no auth gate, no BottomNav; same posture
// as app/cw/[shareId]/page.tsx, which this mirrors). This is the actual
// viral-loop surface: LinkedIn/X/WhatsApp/Instagram can only unfurl a URL,
// not a raw image upload, so this page's own opengraph-image.tsx is what
// makes a posted link show the card image, and this page itself is what a
// human actually lands on after clicking through -- and the one chance to
// turn "someone I know is Founding Member #214" into an install.
export default async function FoundingMemberPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getFoundingMemberShareById(shareId);
  if (!share) notFound();

  incrementFoundingMemberShareViews(shareId);

  let cardData: FoundingMemberCardData;
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    notFound();
  }

  return <FoundingMemberPublicClient cardData={cardData} imageUrl={`/api/founding-member/share-image/${shareId}`} />;
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId } = await params;
  const share = getFoundingMemberShareById(shareId);
  if (!share) return { title: `Founding Member · ${APP_NAME}` };
  let title = `Founding Member · ${APP_NAME}`;
  try {
    const cardData = JSON.parse(share.card_data) as FoundingMemberCardData;
    title = `${cardData.firstName} is Founding Member #${cardData.memberNumber} · ${APP_NAME}`;
  } catch {
    // fall back to the generic title above
  }
  return {
    title,
    description: `One of the first people on ${APP_NAME} -- see what that means and claim your own spot.`,
    openGraph: { title, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}
