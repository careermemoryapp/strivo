"use client";

import { APP_NAME } from "@/lib/config";

type CardData = {
  title: string;
  periodLabel: string;
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  strongestMuscle: string | null;
  growingMuscle: string | null;
  underrepresentedMuscle: string | null;
  insights: string[];
};

// Deliberately plain/static (no motion library needed for a one-off public
// landing page) -- the image itself carries the visual design; this page's
// job is just to display it, give a real download, and offer the CTA back
// into the product. Referral params on the CTA (ref=career_card&cw=) are the
// "attribution parameters" from spec section 12 -- a new visitor arriving
// this way can be correlated back to this specific share at signup time.
export function CareerCardPublicClient({ shareId, cardData, imageUrl }: { shareId: string; cardData: CardData; imageUrl: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-5 py-10 text-white">
      <div className="w-full max-w-sm">
        <img
          src={imageUrl}
          alt={cardData.title}
          className="w-full rounded-[20px] shadow-2xl"
          style={{ aspectRatio: "1080 / 1350" }}
        />

        <div className="mt-6 text-center">
          <p className="text-lg font-bold">{cardData.title}</p>
          <p className="mt-1 text-sm text-white/60">
            {cardData.winsCount} wins · {cardData.leadershipCount} leadership moments · {cardData.problemsSolvedCount} problems
            solved · {cardData.seniorStakeholderCount} senior-stakeholder interactions
          </p>
          {cardData.insights.length > 0 && (
            <p className="mx-auto mt-3 max-w-xs text-[12.5px] leading-relaxed text-white/50">{cardData.insights[0]}</p>
          )}
        </div>

        <a
          href={`/signup?ref=career_card&cw=${shareId}`}
          className="mt-6 flex w-full items-center justify-center rounded-pill py-3.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
        >
          Try {APP_NAME}.ai — capture your own career story
        </a>
        <a href={imageUrl} download className="mt-3 flex w-full items-center justify-center rounded-pill border border-white/15 py-3 text-sm font-medium text-white/70">
          Download image
        </a>
      </div>
    </div>
  );
}
