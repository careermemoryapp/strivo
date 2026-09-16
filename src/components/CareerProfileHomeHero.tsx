"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, ChevronRight } from "lucide-react";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER, CAREER_PROFILE_QUIZZES } from "@/lib/careerProfile";
import type { CareerProfileProgress } from "@/lib/repo/careerProfile";

// The Career Profile "front door" on Home -- deliberately placed ahead of
// CareerWrappedHomePreview (see HomeClient.tsx) so a brand-new, zero-data
// user sees something fun and immediately personal before anything that
// depends on real memory evidence. Same card-shape convention as
// CareerWrappedHomePreview.tsx (px-5 wrapper, rounded-[18px] dark panel) so
// the two read as siblings, with the amber/pink "reward-loop" gradient this
// app already uses for unlock/generate-card CTAs (Record a memory, Generate
// My Career Card) reused here for the same semantic meaning: something to
// unlock.
//
// Full state-based Home reordering (spec sections 19-20 -- demoting this
// once real memory data exists, etc.) is later Phase-3 work; for this stage
// it always renders in the same spot when the career_profile flag is on and
// progress data exists, which is already a big step toward the "give a
// zero-data user something to do immediately" goal without touching the
// rest of Home's structure.
export function CareerProfileHomeHero({ progress }: { progress: CareerProfileProgress }) {
  const router = useRouter();

  useEffect(() => {
    trackEvent("career_profile_viewed", { source: "home", completedCount: progress.completedCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  const nextQuizId = CAREER_PROFILE_QUIZ_ORDER.find(
    (id) => !progress.completedQuizIds.includes(id) && CAREER_PROFILE_QUIZZES[id].implemented
  );

  // Whole-card tap goes straight to the next thing to do (start/continue a
  // quiz, or the hub once everything's complete) -- unlike
  // CareerWrappedHomePreview's card, which always opens an overview page,
  // there's no useful "overview" to show here for an incomplete profile
  // beyond what the card itself already displays, so skip the extra hop.
  function handleTap() {
    trackEvent(progress.completedCount === 0 ? "career_profile_started" : "career_quiz_started", {
      source: "home",
      quizId: nextQuizId,
    });
    router.push(nextQuizId ? `/career-profile/${nextQuizId}` : "/career-profile");
  }

  const isZero = progress.completedCount === 0;

  return (
    <div className="px-5 pt-4">
      <button onClick={handleTap} className="w-full rounded-[18px] p-5 text-left" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
            <Sparkles size={12} /> Career Profile
          </p>
          <ChevronRight size={16} className="shrink-0 text-white/40" />
        </div>

        <p className="mt-2.5 text-[15px] font-bold leading-snug text-white">
          {isZero ? "Discover what makes you, you at work." : `${progress.completedCount} of ${progress.totalCount} discovered`}
        </p>
        {isZero && (
          <p className="mt-1 text-[11.5px] text-white/60">
            Take {progress.totalCount} quick career discoveries and unlock your Career Profile Card.
          </p>
        )}

        <div className="mt-3.5 flex gap-1.5">
          {CAREER_PROFILE_QUIZ_ORDER.map((id) => {
            const done = progress.completedQuizIds.includes(id);
            return (
              <div
                key={id}
                className="flex h-8 flex-1 items-center justify-center rounded-[9px] text-sm"
                style={{ background: done ? "rgba(244,183,63,0.22)" : "rgba(255,255,255,0.07)" }}
              >
                {done ? CAREER_PROFILE_QUIZZES[id].icon : <Lock size={11} className="text-white/30" />}
              </div>
            );
          })}
        </div>

        {!progress.isComplete && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45">
            <Lock size={10} /> Complete all {progress.totalCount} to unlock your Career Profile Card
          </p>
        )}

        <div
          className="mt-4 inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
        >
          {isZero ? "Start discovering" : progress.isComplete ? "Reveal my Career Card" : "Next discovery"} <ChevronRight size={13} />
        </div>
      </button>
    </div>
  );
}
