import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCareerProfileShareById, incrementCareerProfileShareViews } from "@/lib/repo/careerProfile";
import { APP_NAME } from "@/lib/config";
import type { CareerProfileCardData } from "@/lib/careerProfileCardImage";
import { CareerProfileCardPublicClient } from "./CareerProfileCardPublicClient";

// Public, unauthenticated Career Profile Card landing page -- mirrors
// app/cw/[shareId]/page.tsx exactly (deliberately OUTSIDE the (app) route
// group, no auth gate, no BottomNav). This is the "Discover yours" viral
// loop surface for Career Profile: this page's sibling opengraph-image.tsx
// is what makes a posted link unfurl the card image on LinkedIn/X/WhatsApp,
// and this page is what a human actually lands on after clicking through.
export default async function CareerProfileCardPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerProfileShareById(shareId);
  if (!share) notFound();

  incrementCareerProfileShareViews(shareId);

  let cardData: CareerProfileCardData;
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    notFound();
  }

  return <CareerProfileCardPublicClient shareId={shareId} cardData={cardData} imageUrl={`/api/career-profile/share-image/${shareId}`} />;
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId } = await params;
  const share = getCareerProfileShareById(shareId);
  if (!share) return { title: `Career Profile · ${APP_NAME}` };
  let title = `Career Profile · ${APP_NAME}`;
  try {
    const cardData = JSON.parse(share.card_data);
    title = `${cardData.title} · ${APP_NAME}`;
  } catch {
    // fall back to the generic title above
  }
  return {
    title,
    description: "Take 5 quick quizzes and discover your own Career Profile.",
    openGraph: { title, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}
