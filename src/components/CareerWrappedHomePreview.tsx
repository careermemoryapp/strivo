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

export type ResumeStatsData = { wins: number; leadership: number; problemsSolved: number; seniorStakeholder: number };

// Turns the resume-only counts into one short, skimmable sentence, e.g.
// "Your resume also shows 3 wins and 2 leadership moments — record them to
// make them count." Skips any category that's zero rather than listing
// "0 problems solved" -- see analyzeResumeCareerStats in lib/ai.ts for how
// these are actually counted. Returns null if every category is zero
// (page.tsx already filters this case out server-side, but this stays
// defensive rather than assuming that).
function formatResumeStatsLine(stats: ResumeStatsData): string | null {
  const parts: string[] = [];
  if (stats.wins > 0) parts.push(`${stats.wins} win${stats.wins === 1 ? "" : "s"}`);
  if (stats.leadership > 0) parts.push(`${stats.leadership} leadership moment${stats.leadership === 1 ? "" : "s"}`);
  if (stats.problemsSolved > 0) parts.push(`${stats.problemsSolved} problem${stats.problemsSolved === 1 ? "" : "s"} solved`);
  if (stats.seniorStakeholder > 0) {
    parts.push(`${stats.seniorStakeholder} senior-stakeholder interaction${stats.seniorStakeholder === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Your resume also shows ${joined} — record them to make them count.`;
}

// The "very first thing" the spec asks for, right after Home's header --
// deliberately richer (a stat grid, not just an icon+title+subtitle row)
// than the recap/growth/benchmark teaser rows below it (see HomeClient.tsx)
// so it reads as a core part of the product rather than another digest.
// Free-flowing on the light body like every other Home section, though --
// an earlier version wrapped this in a dark rounded panel, which (paired
// with the old CareerProfileHomeHero's matching dark panel above it, back
// when Career Profile still had an in-app Home entry -- it's since moved to
// the public /quiz flow on the marketing site, see the
// career_profile_public_shares comment in lib/db.ts) read as two floating
// boxes sitting on an otherwise all-white page.
//
// BRAND_GRADIENT (purple -> blue) is the same gradient Home's own "Start
// recording" button uses -- product feedback was that this section's own
// amber/pink gradient made Home feel like unrelated accent colors instead
// of one lively, cohesive page. Stat numbers pick it up too now (gradient
// text, not a container fill), so this still reads as the "biggest" Home
// section without going back to a filled panel.
const BRAND_GRADIENT = "linear-gradient(135deg,#a78bfa,#60a5fa)";
export function CareerWrappedHomePreview({
  data,
  resumeStats,
}: {
  data: CareerWrappedHomePreviewData;
  resumeStats?: ResumeStatsData | null;
}) {
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
          className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full text-white"
          style={{ background: BRAND_GRADIENT, boxShadow: "0 6px 16px rgba(139,92,246,0.25)" }}
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
          style={{ background: BRAND_GRADIENT }}
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

        {/* Resume-only counts -- deliberately separate from the numbers
            above, never added into them (see formatResumeStatsLine's own
            comment for why: a resume is usually already a summary of things
            a user may separately record in full, and merging the two risks
            double-counting the same achievement). */}
        {resumeStats && formatResumeStatsLine(resumeStats) && (
          <p className="mt-3 text-[11.5px] text-ink-faint">{formatResumeStatsLine(resumeStats)}</p>
        )}

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

        <div className="mt-4 flex justify-center">
          <div
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-semibold text-white"
            style={{ background: BRAND_GRADIENT }}
          >
            View my Career Wrapped <ChevronRight size={13} />
          </div>
        </div>
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="bg-clip-text text-2xl font-extrabold text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
        {value}
      </p>
      <p className="text-[11px] leading-tight text-ink-faint">{label}</p>
    </div>
  );
}
