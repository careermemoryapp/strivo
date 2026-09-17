"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Sparkles, ShieldCheck } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { APP_NAME } from "@/lib/config";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_PROFILE_QUIZ_ORDER } from "@/lib/careerProfile";
import { getPublicQuizProgress, isPublicQuizProgressComplete, clearPublicQuizProgress } from "@/lib/publicQuizProgress";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

// The last step of the public /quiz flow: a visitor who has finished all 5
// quizzes names their card (optional -- the card just reads "Your Career
// Profile" without one) and generates the actual shareable link/image.
// Deliberately no "preview before generating" step like the in-app
// CareerProfileCardClient.tsx has -- that preview comes from a per-user
// stored card, which doesn't exist yet here (there's no account), and
// adding a second, throwaway public preview render just to mirror it isn't
// worth the extra surface. Generating goes straight to the real,
// permanent card at /cp/[shareId] -- the same page and image endpoints the
// in-app flow already uses, completely unchanged.
export function PublicCareerProfileRevealClient() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;

  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reads localStorage on mount only (client-only value, avoids a
    // server/client hydration mismatch) -- not a render loop, same pattern
    // as CookieConsent.tsx's getStoredConsent() read.
    const progress = getPublicQuizProgress();
    if (!isPublicQuizProgressComplete(progress)) {
      router.replace("/quiz");
      return;
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setReady(true);
    trackEvent("career_profile_card_revealed", { source: "public_quiz" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, and the redirect only needs to run once too
  }, []);

  async function handleGenerate() {
    const progress = getPublicQuizProgress();
    if (!isPublicQuizProgressComplete(progress)) {
      router.replace("/quiz");
      return;
    }
    const results = CAREER_PROFILE_QUIZ_ORDER.map((quizId) => {
      const r = progress[quizId]!;
      return { quizId: r.quizId, resultKey: r.resultKey };
    });

    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/public/career-profile/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || undefined, results }),
      });
      if (!res.ok) throw new Error("share failed");
      const data: { shareId: string; url: string } = await res.json();
      trackEvent("career_profile_card_generated", { source: "public_quiz" });
      // Progress has done its job (it produced the permanent card) -- clear
      // it so a return visit to /quiz starts a fresh round rather than
      // showing a "5/5 -- reveal again" state for an already-shared card.
      clearPublicQuizProgress();
      router.push(`/cp/${data.shareId}`);
    } catch {
      setError("Something went wrong generating your card. Please try again.");
      setGenerating(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen pb-10" style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "linear-gradient(180deg,#1a1330 0%,#241a42 60%,#1a2247 100%)" }}
        aria-hidden="true"
      />
      <DarkHeader back inlineTitle="Career Profile Card" />

      <motion.div initial="hidden" animate="show" variants={variants} className="px-5 pt-6">
        <h1 className="text-[19px] font-bold text-white">✨ Your Career Profile is ready</h1>
        <p className="mt-1 text-[12.5px] text-white/55">All 5 discoveries are in. Give your card a name, then generate your shareable link.</p>

        <label className="mt-5 block">
          <span className="text-[11.5px] font-semibold text-white/50">Your name (optional)</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Priya"
            className="mt-1.5 w-full rounded-[14px] px-4 py-3 text-[14px] text-white placeholder:text-white/30"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <span className="mt-1.5 block text-[11px] text-white/35">
            Shown on the card as &ldquo;{displayName.trim() || "Your"}&rsquo;s Career Profile&rdquo;
          </span>
        </label>

        <div className="mt-4 rounded-[16px] border border-emerald-400/20 bg-emerald-400/10 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            <ShieldCheck size={13} /> Just your 5 results
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-100/70">
            Your Career Profile is based on your quiz answers only, and no account is needed to generate or share it.
          </p>
        </div>

        {error && <p className="mt-4 text-[12.5px] text-rose-300">{error}</p>}

        <Button onClick={handleGenerate} loading={generating} className="mt-5 w-full">
          <Sparkles size={15} /> {generating ? "Generating…" : "Generate my Career Profile Card"}
        </Button>

        <p className="mt-4 text-center text-[11px] text-white/35">
          Want the real thing, built from your actual career? Get {APP_NAME}.ai and try Career Wrapped.
        </p>
      </motion.div>
    </div>
  );
}
