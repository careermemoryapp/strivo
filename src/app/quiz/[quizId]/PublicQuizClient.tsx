"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, AnimatePresence, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER, CAREER_PROFILE_QUIZZES, type CareerProfileQuizDefinition } from "@/lib/careerProfile";
import { getPublicQuizProgress, savePublicQuizResult, type PublicQuizResult } from "@/lib/publicQuizProgress";

const fadeSlide: Variants = {
  hidden: { opacity: 0, x: 16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.2 } },
};
const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

// Public, no-login twin of CareerProfileQuizClient.tsx -- same question-flow
// UI, but posts to the unauthenticated /api/public/career-profile score
// endpoint and keeps progress in the visitor's own browser (see
// lib/publicQuizProgress.ts) instead of a per-user DB row, since there's no
// account here at all.
export function PublicQuizClient({ quiz }: { quiz: CareerProfileQuizDefinition }) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeSlide;

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicQuizResult | null>(null);

  const question = quiz.questions[questionIndex];
  const total = quiz.questions.length;

  async function chooseOption(optionId: string) {
    if (submitting) return;
    trackEvent("career_quiz_question_answered", { quizId: quiz.meta.id, questionId: question.id, optionId, source: "public_quiz" });

    const nextAnswers = [...answers, optionId];
    setAnswers(nextAnswers);

    if (questionIndex + 1 < total) {
      setQuestionIndex(questionIndex + 1);
      return;
    }

    // Last question -- submit for scoring (pure/stateless server-side
    // computation, no DB write -- see the score route's file comment).
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/career-profile/${quiz.meta.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: nextAnswers }),
      });
      if (!res.ok) throw new Error("submit failed");
      const data: { result: PublicQuizResult } = await res.json();
      savePublicQuizResult(data.result);
      trackEvent("career_quiz_completed", { quizId: quiz.meta.id, resultKey: data.result.resultKey, source: "public_quiz" });
      const progress = getPublicQuizProgress();
      const completedCount = CAREER_PROFILE_QUIZ_ORDER.filter((id) => progress[id]).length;
      trackEvent("career_profile_progress", { completedCount, totalCount: CAREER_PROFILE_QUIZ_ORDER.length, source: "public_quiz" });
      if (completedCount === CAREER_PROFILE_QUIZ_ORDER.length) trackEvent("career_profile_completed", { source: "public_quiz" });
      setResult(data.result);
    } catch {
      setSubmitError("Something went wrong scoring your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultReveal result={result} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}
        aria-hidden="true"
      />
      <DarkHeader back inlineTitle={quiz.meta.title} />

      <div className="px-5 pt-6">
        <p className="text-[11.5px] font-semibold text-white/50">
          Question {questionIndex + 1} of {total}
        </p>
        <div className="mt-2.5 flex gap-1.5">
          {quiz.questions.map((q, i) => (
            <div
              key={q.id}
              className="h-1.5 flex-1 rounded-full"
              style={{ background: i <= questionIndex ? "linear-gradient(135deg,#fbbf24,#f472b6)" : "rgba(255,255,255,0.12)" }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={question.id} initial="hidden" animate="show" exit="exit" variants={variants} className="mt-7">
            <h1 className="text-[21px] font-bold leading-snug text-white">{question.prompt}</h1>

            <div className="mt-6 space-y-3">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => chooseOption(option.id)}
                  disabled={submitting}
                  className="w-full rounded-[16px] p-4 text-left text-[14px] font-medium text-white/90 disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {submitError && <p className="mt-4 text-[12.5px] text-rose-300">{submitError}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ResultReveal({ result }: { result: PublicQuizResult }) {
  const router = useRouter();
  const progress = getPublicQuizProgress();
  const completedQuizIds = CAREER_PROFILE_QUIZ_ORDER.filter((id) => progress[id]);
  const completedCount = completedQuizIds.length;
  const totalCount = CAREER_PROFILE_QUIZ_ORDER.length;
  const isComplete = completedCount === totalCount;
  const remaining = CAREER_PROFILE_QUIZ_ORDER.filter((id) => !progress[id]);

  function openQuiz(quizId: string) {
    trackEvent("career_quiz_started", { quizId, source: "public_quiz_result_reveal" });
    router.push(`/quiz/${quizId}`);
  }

  return (
    <div className="min-h-screen px-5 pb-10 pt-6" style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}
        aria-hidden="true"
      />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
        <p className="text-center text-[13px] font-semibold uppercase tracking-wide text-amber-200/80">
          {result.resultLabel} DISCOVERED {result.emoji}
        </p>

        <div
          className="mt-4 rounded-[22px] p-7 text-center"
          style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)", border: "1px solid rgba(244,183,63,0.25)" }}
        >
          <div className="text-5xl">{result.emoji}</div>
          <h1 className="mt-3 text-[24px] font-bold text-white">{result.title}</h1>
          <p className="mx-auto mt-2.5 max-w-xs text-[14px] leading-relaxed text-white/70">{result.description}</p>
        </div>

        <div className="mt-6 rounded-[18px] p-5" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between text-[12px] font-semibold text-white/70">
            <span>Career Profile</span>
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
        </div>

        {isComplete ? (
          <button
            onClick={() => router.push("/quiz/reveal")}
            className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-pill py-3.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
          >
            <Sparkles size={15} /> Reveal my Career Profile Card
          </button>
        ) : (
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">Left to do</p>
            <div className="space-y-2">
              {remaining.map((quizId) => {
                const meta = CAREER_PROFILE_QUIZZES[quizId];
                return (
                  <button
                    key={quizId}
                    onClick={() => openQuiz(quizId)}
                    className="flex w-full items-center gap-3 rounded-[14px] p-3 text-left"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-base">{meta.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-white/85">{meta.title}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-white/35" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={() => router.push("/quiz")} className="mt-5 flex w-full items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-white/40">
          <ChevronLeft size={13} /> Back to all discoveries
        </button>
      </motion.div>
    </div>
  );
}
