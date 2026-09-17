"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronRight, Check, Sparkles } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { APP_NAME } from "@/lib/config";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER, CAREER_PROFILE_QUIZZES, type CareerProfileQuizId } from "@/lib/careerProfile";
import { getPublicQuizProgress, isPublicQuizProgressComplete, type PublicQuizResult } from "@/lib/publicQuizProgress";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = { show: { transition: { staggerChildren: 0.07 } } };
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

function heroCopy(completedCount: number, totalCount: number): { title: string; subtitle: string } {
  if (completedCount === 0) {
    return {
      title: "Discover what makes you, you at work.",
      subtitle: `5 quick career discoveries. No sign-up needed -- get a shareable card at the end.`,
    };
  }
  if (completedCount === totalCount) {
    return { title: "Your Career Profile is ready ✨", subtitle: "Every discovery is in. Reveal your card and share it." };
  }
  const remaining = totalCount - completedCount;
  if (remaining === 1) {
    return { title: "One more to go 👀", subtitle: "Your Career Profile is almost ready." };
  }
  return { title: "Great start.", subtitle: `${remaining} more ${remaining === 1 ? "discovery" : "discoveries"} to unlock your Career Profile Card.` };
}

// The marketing-site entry point (see the file comment) -- deliberately no
// "back" affordance to anything inside the authenticated app; this is meant
// to work standalone for a visitor who has never signed in.
export function PublicQuizHubClient() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;

  // null until the client mount effect below reads localStorage -- avoids a
  // hydration mismatch (the server render has no access to it at all).
  const [progress, setProgress] = useState<Partial<Record<CareerProfileQuizId, PublicQuizResult>> | null>(null);

  useEffect(() => {
    // Reads localStorage on mount only (client-only value, avoids a
    // server/client hydration mismatch) -- not a render loop, same pattern
    // as CookieConsent.tsx's getStoredConsent() read.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setProgress(getPublicQuizProgress());
    trackEvent("career_profile_viewed", { source: "public_quiz_hub" });
  }, []);

  const resolvedProgress = progress ?? {};
  const completedCount = CAREER_PROFILE_QUIZ_ORDER.filter((id) => resolvedProgress[id]).length;
  const totalCount = CAREER_PROFILE_QUIZ_ORDER.length;
  const isComplete = progress !== null && isPublicQuizProgressComplete(resolvedProgress);
  const { title: heroTitle, subtitle: heroSubtitle } = heroCopy(completedCount, totalCount);

  function startQuiz(quizId: CareerProfileQuizId, alreadyDone: boolean) {
    trackEvent(alreadyDone ? "career_quiz_started" : completedCount === 0 ? "career_profile_started" : "career_quiz_started", {
      quizId,
      retake: alreadyDone,
      source: "public_quiz",
    });
    router.push(`/quiz/${quizId}`);
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}
        aria-hidden="true"
      />
      <DarkHeader wordmark right={<span className="text-[11px] font-semibold text-white/45">{APP_NAME}.ai</span>} />

      <motion.div initial="hidden" animate="show" variants={stagger} className="px-5 pt-5 space-y-5">
        <motion.div variants={variants}>
          <div className="rounded-[20px] p-6" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">Career Profile</p>
            <h1 className="mt-2 text-[20px] font-bold leading-snug text-white">{heroTitle}</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{heroSubtitle}</p>

            <div className="mt-5 flex items-center justify-between text-[12px] font-semibold text-white/70">
              <span>
                {completedCount} / {totalCount} discovered
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${(completedCount / totalCount) * 100}%`, background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
              />
            </div>

            {isComplete && (
              <button
                onClick={() => router.push("/quiz/reveal")}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-3 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
              >
                <Sparkles size={15} /> Reveal My Career Card
              </button>
            )}
          </div>
        </motion.div>

        <motion.div variants={variants}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">All 5 discoveries — any order</p>
          <div className="space-y-2.5">
            {CAREER_PROFILE_QUIZ_ORDER.map((quizId) => {
              const meta = CAREER_PROFILE_QUIZZES[quizId];
              const result = resolvedProgress[quizId];
              return (
                <button
                  key={quizId}
                  onClick={() => startQuiz(quizId, Boolean(result))}
                  className="flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left bg-white/8"
                  style={{ background: result ? "rgba(244,183,63,0.08)" : undefined }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">{meta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13.5px] font-semibold ${result ? "text-white/90" : "text-white/80"}`}>{meta.title}</span>
                    <span className="block truncate text-[11.5px] text-white/45">{result ? `${result.emoji} ${result.title}` : "Not started"}</span>
                  </span>
                  {result && <Check size={15} className="shrink-0 text-amber-300" />}
                  <ChevronRight size={16} className="shrink-0 text-white/35" />
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div variants={variants}>
          <p className="text-center text-[11px] text-white/35">No account needed — your results stay on this device until you generate a card.</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
