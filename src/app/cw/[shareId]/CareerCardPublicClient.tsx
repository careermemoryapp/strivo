"use client";

import { APP_NAME } from "@/lib/config";

type CardData = {
  title: string;
  periodLabel: string;
  archetype: string;
  strongestMuscle: string | null;
  personaHeadline: string;
  achievementPotential: string[];
};

// Deliberately plain/static (no motion library needed for a one-off public
// landing page) -- the image itself carries the visual design; this page's
// job is just to display it, give a real download, and offer the CTA back
// into the product. Referral params on the CTA (ref=career_card&cw=) are the
// "attribution parameters" from spec section 12 -- a new visitor arriving
// this way can be correlated back to this specific share at signup time.
export function CareerCardPublicClient({ shareId, cardData, imageUrl }: { shareId: string; cardData: CardData; imageUrl: string }) {
  return (
    <div
      id="cw-root"
      className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-5 py-10 text-white"
      style={{ background: "#0a0a0f" }}
    >
      <div className="w-full max-w-sm">
        <img
          src={imageUrl}
          alt={cardData.title}
          className="w-full rounded-[20px] shadow-2xl"
          style={{ aspectRatio: "1080 / 1350" }}
        />

        <div className="mt-6 text-center">
          <p className="text-lg font-bold">{cardData.title}</p>
          <p className="mt-1 text-sm font-semibold text-white/80">{cardData.archetype}</p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-white/70">{cardData.personaHeadline}</p>
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
