"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, ChevronRight, Check } from "lucide-react";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER, CAREER_PROFILE_QUIZZES, type CareerProfileQuizId } from "@/lib/careerProfile";
import type { CareerProfileProgress } from "@/lib/repo/careerProfile";

// The Career Profile "front door" on Home -- deliberately placed ahead of
// CareerWrappedHomePreview (see HomeClient.tsx) so a brand-new, zero-data
// user sees something fun and immediately personal before anything that
// depends on real memory evidence. Same card-shape convention as
// CareerWrappedHomePreview.tsx (px-5 wrapper, rounded-[18px] dark panel) so
// the two read as siblings.
//
// Product feedback: all 5 discoveries must read as independently choosable
// -- no forced order, no single "next discovery" funnel. Each row below is
// its own tap target with its own arrow; a user can do them in whatever
// order they like, same as the hub page (CareerProfileHubClient.tsx).
// Completed rows stay tappable too (retake overwrites in place -- see
// lib/repo/careerProfile.ts). Only a quiz with no content yet
// (`implemented: false`) is non-interactive.
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

  function openQuiz(quizId: CareerProfileQuizId, alreadyDone: boolean) {
    trackEvent(alreadyDone ? "career_quiz_started" : progress.completedCount === 0 ? "career_profile_started" : "career_quiz_started", {
      source: "home",
      quizId,
      retake: alreadyDone,
    });
    router.push(`/career-profile/${quizId}`);
  }

  const isZero = progress.completedCount === 0;

  return (
    <div className="px-5 pt-4">
      <div className="w-full rounded-[18px] p-5" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
        <button
          onClick={() => router.push("/career-profile")}
          className="flex w-full items-center justify-between text-left"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
            <Sparkles size={12} /> Career Profile
          </p>
          <ChevronRight size={16} className="shrink-0 text-white/40" />
        </button>

        <p className="mt-2.5 text-[15px] font-bold leading-snug text-white">
          {isZero ? "Discover what makes you, you at work." : `${progress.completedCount} of ${progress.totalCount} discovered`}
        </p>
        {isZero && (
          <p className="mt-1 text-[11.5px] text-white/60">
            5 quick career discoveries, any order you like. Complete them all to unlock your Career Profile Card.
          </p>
        )}

        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${(progress.completedCount / progress.totalCount) * 100}%`, background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
          />
        </div>

        <div className="mt-4 space-y-2">
          {CAREER_PROFILE_QUIZ_ORDER.map((quizId) => {
            const meta = CAREER_PROFILE_QUIZZES[quizId];
            const done = progress.completedQuizIds.includes(quizId);
            const clickable = meta.implemented;
            return (
              <button
                key={quizId}
                onClick={clickable ? () => openQuiz(quizId, done) : undefined}
                disabled={!clickable}
                className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left disabled:opacity-50"
                style={{ background: done ? "rgba(244,183,63,0.1)" : "transparent" }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ background: done ? "rgba(244,183,63,0.25)" : "rgba(255,255,255,0.08)" }}
                >
                  {clickable ? meta.icon : <Lock size={12} className="text-white/35" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white/90">{meta.title}</span>
                </span>
                {done && <Check size={15} className="shrink-0 text-amber-200" />}
                {clickable && <ChevronRight size={15} className="shrink-0 text-white/35" />}
              </button>
            );
          })}
        </div>

        {!progress.isComplete && (
          <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-white/45">
            <Lock size={10} /> Complete all {progress.totalCount} to unlock your Career Profile Card
          </p>
        )}

        {progress.isComplete && (
          <button
            onClick={() => router.push("/career-profile")}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-2.5 text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
          >
            Reveal my Career Card <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
