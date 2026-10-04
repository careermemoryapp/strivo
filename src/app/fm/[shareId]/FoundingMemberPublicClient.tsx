"use client";

import { PlayStoreLink } from "@/components/PlayStoreLink";
import { APP_NAME, SINGULAR_TRACKING_LINK } from "@/lib/config";

type CardData = {
  firstName: string;
  memberNumber: number;
  cap: number;
  joinedDateLabel: string;
};

// Deliberately plain/static, same reasoning as CareerCardPublicClient.tsx
// (the sibling page for Career Wrapped shares): the image itself carries
// the visual design, this page's job is just to display it and offer the
// CTA back into the product.
//
// The CTA here uses PlayStoreLink/SINGULAR_TRACKING_LINK -- the same
// install-attributed link every other "Get the app" button site-wide
// uses -- rather than CareerCardPublicClient.tsx's `/signup?ref=...`
// pattern. That page's CTA points at a /signup route that doesn't exist
// anywhere in this app (Strivo is social-sign-in-only -- see lib/auth.ts's
// file comment; the email/password signup page was removed) and 404s for
// every single visitor who clicks it. Noticed while building this page
// precisely because it's the same kind of link; not fixed here since it's
// a separate, existing page, but flagged for the founder separately.
export function FoundingMemberPublicClient({ cardData, imageUrl }: { cardData: CardData; imageUrl: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-5 py-10 text-white" style={{ background: "#0a0a0f" }}>
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
        <img src={imageUrl} alt={`${cardData.firstName} is Founding Member #${cardData.memberNumber}`} className="w-full rounded-[20px] shadow-2xl" style={{ aspectRatio: "1080 / 1350" }} />

        <div className="mt-6 text-center">
          <p className="text-lg font-bold">
            {cardData.firstName} is Founding Member #{cardData.memberNumber}
          </p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-white/70">
            One of the first {cardData.cap.toLocaleString("en-US")} people on {APP_NAME}. Joined {cardData.joinedDateLabel}.
          </p>
        </div>

        <div className="mt-6">
          <PlayStoreLink location="founding_member_share" href={SINGULAR_TRACKING_LINK} size="lg" className="w-full justify-center" />
        </div>
        <a href={imageUrl} download className="mt-3 flex w-full items-center justify-center rounded-pill border border-white/15 py-3 text-sm font-medium text-white/70">
          Download image
        </a>
      </div>
    </div>
  );
}
