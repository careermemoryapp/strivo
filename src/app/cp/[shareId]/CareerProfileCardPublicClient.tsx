"use client";

import { APP_NAME } from "@/lib/config";

type CardRow = { quizId: string; eyebrow: string; title: string };
type CardData = { title: string; rows: CardRow[] };

// Deliberately plain/static -- mirrors app/cw/[shareId]/CareerCardPublicClient.tsx
// exactly. The image itself carries the visual design; this page's job is
// just to display it, give a real download, and offer the CTA back into the
// product. Referral params on the CTA (ref=career_profile&cp=) let a new
// visitor arriving this way be correlated back to this specific share at
// signup time, same as the Career Wrapped equivalent's ref=career_card&cw=.
export function CareerProfileCardPublicClient({ shareId, cardData, imageUrl }: { shareId: string; cardData: CardData; imageUrl: string }) {
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
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-white/70">
            5 quick discoveries about how they work — built with {APP_NAME}.ai.
          </p>
        </div>

        <a
          href={`/signup?ref=career_profile&cp=${shareId}`}
          className="mt-6 flex w-full items-center justify-center rounded-pill py-3.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
        >
          Discover yours — take the quiz on {APP_NAME}.ai
        </a>
        <a href={imageUrl} download className="mt-3 flex w-full items-center justify-center rounded-pill border border-white/15 py-3 text-sm font-medium text-white/70">
          Download image
        </a>
      </div>
    </div>
  );
}
