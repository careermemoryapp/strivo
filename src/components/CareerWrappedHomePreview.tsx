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

// Turns the resume-only counts into one short, skimmable fragment, e.g.
// "3 wins and 2 leadership moments" -- the CTA button below wraps this into
// the full sentence. Skips any category that's zero rather than listing "0
// problems solved" -- see analyzeResumeCareerStats in lib/ai.ts for how
// these are actually counted. Returns null if every category is zero
// (page.tsx already filters this case out server-side, but this stays
// defensive rather than assuming that).
function formatResumeStatsFragment(stats: ResumeStatsData): string | null {
  const parts: string[] = [];
  if (stats.wins > 0) parts.push(`${stats.wins} win${stats.wins === 1 ? "" : "s"}`);
  if (stats.leadership > 0) parts.push(`${stats.leadership} leadership moment${stats.leadership === 1 ? "" : "s"}`);
  if (stats.problemsSolved > 0) parts.push(`${stats.problemsSolved} problem${stats.problemsSolved === 1 ? "" : "s"} solved`);
  if (stats.seniorStakeholder > 0) {
    parts.push(`${stats.seniorStakeholder} senior-stakeholder interaction${stats.seniorStakeholder === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Only shown while the person is still new (see the two render sites below)
// -- once they've built up real recorded history (tier "patterns" or
// "full", CAREER_WRAPPED_THRESHOLDS.minForPatterns+ memories), this nudge
// has done its job and gets dropped entirely rather than lingering as a
// permanent fixture. Reuses the tier Home already computes instead of a new
// threshold/prop, since "new user, not enough real history yet" is exactly
// what "empty"/"basic" already mean here.
function isNewUserTier(tier: CareerWrappedDataTier): boolean {
  return tier === "empty" || tier === "basic";
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
// of one lively, cohesive page. Used here as a solid fill (icon circle,
// buttons), which is why it stays light/vibrant -- it always sits under
// white text or a white icon, so contrast isn't a concern there.
const BRAND_GRADIENT = "linear-gradient(135deg,#a78bfa,#60a5fa)";
// Stat numbers (below) use gradient TEXT rather than a filled container, so
// they sit directly on the page's white background -- BRAND_GRADIENT's own
// light stops read as washed out/hard to read there (founder feedback: "the
// numbers... are very light"). Same purple -> blue direction, kept
// consistent with the rest of the page, but darker stops so the numbers
// stay legible at a glance instead of just decorative.
const STAT_GRADIENT = "linear-gradient(135deg,#7c3aed,#2563eb)";
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
        {/* A brand-new account with a resume already on file (see
            settings/resume) is exactly who this is for -- a real, ready-
            made starting point instead of a blank page. See
            ResumeStatsUploadCta's own comment for why this is a link to
            Record's Upload tab rather than an automatic conversion. */}
        {resumeStats && <ResumeStatsUploadCta stats={resumeStats} router={router} className="mt-3" />}
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

        <div className="mt-4 flex justify-center">
          <div
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-semibold text-white"
            style={{ background: BRAND_GRADIENT }}
          >
            View my Career Wrapped <ChevronRight size={13} />
          </div>
        </div>
      </button>

      {/* Own button, deliberately OUTSIDE the big "open Career Wrapped"
          button above (nesting an interactive element inside another isn't
          valid HTML and the two need different destinations) -- only while
          still a new-ish account (isNewUserTier), so this fades out once
          someone has built up enough real recorded history that "here's a
          starting point" no longer applies. See ResumeStatsUploadCta's own
          comment for what tapping it actually does. */}
      {resumeStats && isNewUserTier(data.tier) && <ResumeStatsUploadCta stats={resumeStats} router={router} className="mt-3" />}
    </div>
  );
}

// Deliberately a LINK to Record's own Upload tab (?mode=upload -- the same
// tab that already handles a big document by splitting it into several
// stories, see MIN_CHARS_FOR_SPLIT_CHECK in record/page.tsx), not an
// automatic background conversion of the resume already on file. Two
// reasons: (1) it keeps the founder's own no-duplication call intact (see
// analyzeResumeCareerStats' comment in lib/ai.ts) -- nothing becomes a
// memory unless the person deliberately chooses to upload it as one, same
// as any other document upload; (2) it reuses the exact upload+split flow
// that already exists rather than a second resume-specific pipeline. Only
// shown for a newer account (isNewUserTier) -- see its own comment for why
// -- so this reads as "here's a fast way to get started" rather than a
// permanent nag once someone already has real history.
function ResumeStatsUploadCta({
  stats,
  router,
  className,
}: {
  stats: ResumeStatsData;
  router: ReturnType<typeof useRouter>;
  className?: string;
}) {
  const fragment = formatResumeStatsFragment(stats);
  if (!fragment) return null;
  return (
    <button
      onClick={() => {
        trackEvent("resume_stats_upload_clicked", { source: "home_preview" });
        router.push("/record?mode=upload");
      }}
      className={`inline-flex items-center gap-1.5 text-left text-[11.5px] text-[#6d5fa8] ${className ?? ""}`}
    >
      <span>
        Your resume also shows {fragment}. Upload it as a story to make them count.
      </span>
      <ChevronRight size={13} className="shrink-0" />
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="bg-clip-text text-2xl font-extrabold text-transparent" style={{ backgroundImage: STAT_GRADIENT }}>
        {value}
      </p>
      <p className="text-[11px] leading-tight text-ink-faint">{label}</p>
    </div>
  );
}
