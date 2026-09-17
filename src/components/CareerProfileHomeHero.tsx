"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronRight } from "lucide-react";
import { trackEvent } from "@/lib/trackEvent";
import type { CareerProfileProgress } from "@/lib/repo/careerProfile";

// The Career Profile "front door" on Home -- deliberately placed ahead of
// CareerWrappedHomePreview (see HomeClient.tsx) so a brand-new, zero-data
// user sees something fun and immediately personal before anything that
// depends on real memory evidence. Free-flowing on the light body, same
// border-t-hairline-plus-spacing convention as every other Home section
// (see HomeClient.tsx's own comment on DARK) -- an earlier version wrapped
// this in a dark rounded panel, which read as a floating card sitting on
// top of an otherwise all-white page ("two parts in between that are
// blue"). The amber/pink gradient stays on the progress bar and CTA
// button only -- that's this feature's own accent color, same convention
// every other Home teaser already uses (see TEASER_ACCENTS), not a
// container background.
//
// DELIBERATELY CONDENSED (product feedback): this used to list all 5 quiz
// rows inline, which made Home feel long. Home's job now is just to say
// "here's a thing to discover" and hand off in one tap -- the actual 5
// discoveries (in whatever order the user likes, per the earlier "no
// forced sequence" feedback) live on the hub page, CareerProfileHubClient.tsx,
// which this card's one button always opens.
//
// Full state-based Home reordering (spec sections 19-20 -- demoting this
// once real memory data exists, etc.) is later Phase-3 work; for this stage
// it always renders in the same spot when the career_profile flag is on and
// progress data exists.
export function CareerProfileHomeHero({ progress }: { progress: CareerProfileProgress }) {
  const router = useRouter();

  useEffect(() => {
    trackEvent("career_profile_viewed", { source: "home", completedCount: progress.completedCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  const isZero = progress.completedCount === 0;
  const remaining = progress.totalCount - progress.completedCount;

  function handleCta() {
    trackEvent(isZero ? "career_profile_started" : "career_profile_viewed", { source: "home_cta", completedCount: progress.completedCount });
    router.push(progress.isComplete ? "/career-profile/card" : "/career-profile");
  }

  const headline = isZero
    ? "Discover what makes you, you at work."
    : progress.isComplete
      ? "Your Career Profile is ready ✨"
      : `${progress.completedCount} of ${progress.totalCount} discovered`;

  const subtitle = isZero
    ? "5 quick career discoveries, any order you like."
    : progress.isComplete
      ? "All 5 are in — see what they say about you."
      : `${remaining} more ${remaining === 1 ? "discovery" : "discoveries"} to unlock your Career Profile Card.`;

  const ctaLabel = isZero ? "Start discovering" : progress.isComplete ? "Reveal my Career Card" : "Continue discovering";

  return (
    <div className="border-t border-[#ece5f5] mt-5 px-5 pt-5">
      <button onClick={() => router.push("/career-profile")} className="flex w-full items-center justify-between text-left">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
          <Sparkles size={12} className="text-amber-500" /> Career Profile
        </p>
        <ChevronRight size={16} className="shrink-0 text-[#cec7dd]" />
      </button>

      <p className="mt-2.5 text-[15px] font-bold leading-snug text-ink">{headline}</p>
      <p className="mt-1 text-[11.5px] text-ink-faint">{subtitle}</p>

      <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f0ecf9]">
        <div
          className="h-full rounded-full"
          style={{ width: `${(progress.completedCount / progress.totalCount) * 100}%`, background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
        />
      </div>

      <button
        onClick={handleCta}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-2.5 text-xs font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
      >
        {ctaLabel} <ChevronRight size={13} />
      </button>
    </div>
  );
}
