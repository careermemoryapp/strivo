import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCareerWrappedShareById, incrementCareerWrappedShareViews } from "@/lib/repo/careerWrapped";
import { APP_NAME } from "@/lib/config";
import { CareerCardPublicClient } from "./CareerCardPublicClient";

// Public, unauthenticated Career Card landing page -- deliberately OUTSIDE
// the (app) route group (no auth gate, no BottomNav; see (app)/layout.tsx's
// comment on why routes inherit that chrome). This is the actual "viral
// loop" surface (spec section 6): LinkedIn/X can only unfurl a URL, not a
// raw image upload, so this page's own opengraph-image.tsx is what makes a
// posted link show the Career Card image, and this page itself is what a
// human actually lands on after clicking through.
export default async function CareerCardPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const share = getCareerWrappedShareById(shareId);
  if (!share) notFound();

  incrementCareerWrappedShareViews(shareId);

  let cardData: { title: string; periodLabel: string; winsCount: number; leadershipCount: number; problemsSolvedCount: number; strongestMuscle: string | null; growingMuscle: string | null };
  try {
    cardData = JSON.parse(share.card_data);
  } catch {
    notFound();
  }

  return (
    <CareerCardPublicClient
      shareId={shareId}
      cardData={cardData}
      imageUrl={`/api/career-wrapped/share-image/${shareId}`}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId } = await params;
  const share = getCareerWrappedShareById(shareId);
  if (!share) return { title: `Career Card · ${APP_NAME}` };
  let title = `Career Card · ${APP_NAME}`;
  try {
    const cardData = JSON.parse(share.card_data);
    title = `${cardData.title} · ${APP_NAME}`;
  } catch {
    // fall back to the generic title above
  }
  return {
    title,
    description: "See the career patterns Strivo.ai found — and start capturing your own.",
    openGraph: { title, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}
