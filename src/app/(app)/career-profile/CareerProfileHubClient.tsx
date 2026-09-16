"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Lock, ChevronRight, Check } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER, type CareerProfileQuizId, type CareerProfileQuizMeta } from "@/lib/careerProfile";
import type { CareerProfileProgress } from "@/lib/repo/careerProfile";

type QuizSummary = {
  quizId: CareerProfileQuizId;
  meta: CareerProfileQuizMeta;
  completed: boolean;
  result: { title: string; emoji: string; description: string } | null;
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = { show: { transition: { staggerChildren: 0.07 } } };
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

function heroCopy(progress: CareerProfileProgress): { title: string; subtitle: string } {
  const { completedCount, totalCount } = progress;
  if (completedCount === 0) {
    return {
      title: "Discover what makes you, you at work.",
      subtitle: `Take ${totalCount} quick career discoveries and unlock your complete Career Profile.`,
    };
  }
  if (completedCount === totalCount) {
    return { title: "Your Career Profile is ready ✨", subtitle: "Every discovery is in. Take a look at what it says about you." };
  }
  const remaining = totalCount - completedCount;
  if (remaining === 1) {
    return { title: "One more to go 👀", subtitle: "Your Career Profile is almost ready." };
  }
  if (completedCount / totalCount > 0.5) {
    return { title: "You're more than halfway there 🔥", subtitle: `${remaining} more ${remaining === 1 ? "discovery" : "discoveries"} to unlock your Career Card.` };
  }
  return { title: "Great start.", subtitle: `${remaining} more ${remaining === 1 ? "discovery" : "discoveries"} left to unlock your Career Profile.` };
}

export function CareerProfileHubClient({ progress, quizzes }: { progress: CareerProfileProgress; quizzes: QuizSummary[] }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;

  useEffect(() => {
    trackEvent("career_profile_viewed", { completedCount: progress.completedCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  const byId = new Map(quizzes.map((q) => [q.quizId, q]));
  const { title: heroTitle, subtitle: heroSubtitle } = heroCopy(progress);

  // No forced order: tapping ANY row (including an already-completed one,
  // to retake it -- see lib/repo/careerProfile.ts's overwrite-in-place
  // behavior) opens that quiz directly. There's no separate "next
  // discovery" funnel -- every row is its own equally-valid entry point.
  function startQuiz(quizId: CareerProfileQuizId, alreadyDone: boolean) {
    trackEvent(alreadyDone ? "career_quiz_started" : progress.completedCount === 0 ? "career_profile_started" : "career_quiz_started", {
      quizId,
      retake: alreadyDone,
    });
    router.push(`/career-profile/${quizId}`);
  }

  return (
    <div className="pb-10" style={{ background: "linear-gradient(180deg,#1a1330 0%,#191527 220px,#f8f7fc 220px)" }}>
      <DarkHeader back inlineTitle="Career Profile" />

      <motion.div initial="hidden" animate="show" variants={stagger} className="px-5 pt-5 space-y-5">
        <motion.div variants={variants}>
          <div className="rounded-[20px] p-6" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">Career Profile</p>
            <h1 className="mt-2 text-[20px] font-bold leading-snug text-white">{heroTitle}</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{heroSubtitle}</p>

            <div className="mt-5 flex items-center justify-between text-[12px] font-semibold text-white/70">
              <span>
                {progress.completedCount} / {progress.totalCount} discovered
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(progress.completedCount / progress.totalCount) * 100}%`,
                  background: "linear-gradient(135deg,#fbbf24,#f472b6)",
                }}
              />
            </div>

            {!progress.isComplete && (
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-white/45">
                <Lock size={11} /> Complete all {progress.totalCount} to unlock your Career Profile Card
              </p>
            )}

            {progress.isComplete && (
              <button
                onClick={() => router.push("/career-profile/card")}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-3 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
              >
                Reveal My Career Card
              </button>
            )}
          </div>
        </motion.div>

        <motion.div variants={variants}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">All 5 discoveries — any order</p>
          <div className="space-y-2.5">
            {CAREER_PROFILE_QUIZ_ORDER.map((quizId) => {
              const quiz = byId.get(quizId)!;
              return <QuizChip key={quizId} quiz={quiz} onStart={() => startQuiz(quizId, quiz.completed)} />;
            })}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function QuizChip({ quiz, onStart }: { quiz: QuizSummary; onStart: () => void }) {
  const locked = !quiz.meta.implemented;
  // Locked (no content yet) is the only non-interactive state -- a
  // completed quiz stays tappable so the user can retake it whenever they
  // want, in whatever order, per the "no forced sequence" product feedback.
  const clickable = !locked;

  return (
    <button
      onClick={clickable ? onStart : undefined}
      disabled={!clickable}
      className={`flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left ${clickable ? "bg-white/8" : "bg-white/[0.04]"}`}
      style={{ background: quiz.completed ? "rgba(244,183,63,0.08)" : undefined }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
        {locked ? <Lock size={15} className="text-white/40" /> : quiz.meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13.5px] font-semibold ${quiz.completed ? "text-white/90" : "text-white/80"}`}>
          {quiz.meta.title}
        </span>
        <span className="block truncate text-[11.5px] text-white/45">
          {quiz.completed && quiz.result ? `${quiz.result.emoji} ${quiz.result.title}` : locked ? "Coming soon" : "Not started"}
        </span>
      </span>
      {quiz.completed && <Check size={15} className="shrink-0 text-amber-300" />}
      {clickable && <ChevronRight size={16} className="shrink-0 text-white/35" />}
    </button>
  );
}
