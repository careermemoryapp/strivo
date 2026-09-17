"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Lock, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/trackEvent";
import type { CareerWrappedDataTier } from "@/lib/careerWrapped";

export type CareerWrappedHomePreviewData = {
  tier: CareerWrappedDataTier;
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  strongestMuscle: string | null;
};

// The "very first thing" the spec asks for, right after Home's header --
// deliberately richer (a stat grid, not just an icon+title+subtitle row)
// than the recap/growth/benchmark teaser rows below it (see HomeClient.tsx)
// so it reads as a core part of the product rather than another digest.
// Free-flowing on the light body like every other Home section, though --
// an earlier version wrapped this in a dark rounded panel, which (paired
// with CareerProfileHomeHero's matching dark panel above it) read as two
// floating boxes sitting on an otherwise all-white page. Its own warm
// amber/pink "Wrapped" gradient still marks the stat bar / CTA button as
// this feature's accent color (same convention as every other Home teaser
// -- indigo = recap, violet = growth, emerald = benchmark, rose = check-in
// -- see TEASER_ACCENTS), just not as a container background anymore.
export function CareerWrappedHomePreview({ data }: { data: CareerWrappedHomePreviewData }) {
  const router = useRouter();

  // Fired once per Home render this card actually shows -- see spec section
  // 12 (career_wrapped_home_impression). Deliberately NOT gated on tier: an
  // impression of the empty state is still an impression.
  useEffect(() => {
    trackEvent("career_wrapped_home_impression", { tier: data.tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, not on every data change
  }, []);

  function openCareerWrapped() {
    // career_wrapped_opened itself is fired once by CareerWrappedClient on
    // mount (covers every way in, not just this button) -- this is just
    // navigation.
    router.push("/career-wrapped");
  }

  if (data.tier === "empty") {
    return (
      <div className="border-t border-[#ece5f5] mt-5 px-5 pt-6 text-center">
        <div
          className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-amber-500"
          style={{ boxShadow: "0 6px 16px rgba(251,191,36,0.18)" }}
        >
          <Sparkles size={19} />
        </div>
        <p className="text-sm font-semibold text-[#3c3650]">Your Career Wrapped is taking shape.</p>
        <p className="mx-auto mt-1 max-w-[260px] text-[11.5px] text-ink-faint">
          Add a few career memories and Strivo.ai will start discovering patterns in your career.
        </p>
        <button
          onClick={() => {
            trackEvent("career_wrapped_add_memory_clicked", { source: "home_preview_empty" });
            router.push("/record");
          }}
          className="mt-3.5 rounded-pill px-5 py-2.5 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
        >
          Record a memory
        </button>
      </div>
    );
  }

  const showLockedMuscle = data.tier === "basic" || data.tier === "patterns";

  return (
    <div className="border-t border-[#ece5f5] mt-5 px-5 pt-5">
      <button onClick={openCareerWrapped} className="w-full text-left">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Your Career</p>
          <ChevronRight size={16} className="shrink-0 text-[#cec7dd]" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat value={data.winsCount} label="Wins captured" />
          <Stat value={data.leadershipCount} label="Leadership moments" />
          <Stat value={data.problemsSolvedCount} label="Problems solved" />
          <Stat value={data.seniorStakeholderCount} label="Senior-stakeholder interactions" />
        </div>

        {data.tier === "full" && data.strongestMuscle && (
          <p className="mt-3.5 text-[11.5px] text-ink-faint">
            Strongest career muscle: <span className="font-semibold text-ink">{data.strongestMuscle}</span>
          </p>
        )}
        {showLockedMuscle && (
          <p className="mt-3.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            <Lock size={11} /> Strongest career muscle — add more memories to discover
          </p>
        )}

        <div
          className="mt-4 inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
        >
          View my Career Wrapped <ChevronRight size={13} />
        </div>
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-[11px] leading-tight text-ink-faint">{label}</p>
    </div>
  );
}
