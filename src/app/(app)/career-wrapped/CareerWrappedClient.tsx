"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Sparkles, TrendingUp, Lock, Compass, Plus, Share2, Award } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { trackEvent } from "@/lib/trackEvent";
import { CAREER_WRAPPED_THRESHOLDS, type CareerWrappedDataTier } from "@/lib/careerWrapped";

type Snapshot = {
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  memoryCount: number;
  strongestMuscle: string | null;
  growingMuscle: string | null;
  underrepresentedMuscle: string | null;
  // A punchy 2-4 word persona title -- see buildCareerArchetype in
  // lib/careerWrapped.ts. Round 4 product feedback: replaces the "Also
  // strong" and "Career breadth" cards with a single archetype card, so the
  // page shows exactly four insight cards (strongest, growing, under-
  // represented, archetype) matching the shareable card's own four beats.
  archetype: string;
  // The card's "headline read" on the person -- see buildCareerPersonaHeadline
  // in lib/careerWrapped.ts. Surfaced here too so the in-app page and the
  // shareable card never say something different about the same person.
  personaHeadline: string;
};

type Props = {
  firstName: string | null;
  tier: CareerWrappedDataTier;
  snapshot: Snapshot;
};

// Same fadeUp/stagger house motion language as NotificationsClient.tsx --
// see the audit note on that file for the exact easing/timing this app
// already uses elsewhere. Respecting prefers-reduced-motion is new to this
// codebase (nothing else checks it yet -- see the audit) -- done here via
// framer-motion's own useReducedMotion() hook rather than a bespoke
// media-query listener, and every card below falls back to a plain
// no-transform fade when it's set.
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = { show: { transition: { staggerChildren: 0.08 } } };
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

function strongestMuscleCopy(muscle: string, count: number): string {
  return `Across your memories, ${muscle} shows up more than anything else — ${count} moment${count === 1 ? "" : "s"} of real evidence, more than any other career muscle.`;
}
function growingMuscleCopy(muscle: string): string {
  return `You've captured noticeably more evidence of ${muscle} recently than in the period before it — a real, recent pattern, not a one-off.`;
}
function underrepresentedMuscleCopy(muscle: string): string {
  return `We found less evidence of ${muscle} in your memories so far. That doesn't mean it's not part of your work — just that it's underrepresented in what you've captured.`;
}

export function CareerWrappedClient({ firstName, tier, snapshot }: Props) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;
  const completedFiredRef = useRef(false);
  const lastCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    trackEvent("career_wrapped_opened", { tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  useEffect(() => {
    const el = lastCardRef.current;
    if (!el || completedFiredRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !completedFiredRef.current) {
          completedFiredRef.current = true;
          trackEvent("career_wrapped_completed", { tier });
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tier]);

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Career Wrapped" />

      <motion.div initial="hidden" animate="show" variants={stagger} className="px-5 pt-5 space-y-4">
        {tier === "empty" ? (
          <motion.div variants={variants}>
            <EmptyWrappedCard />
          </motion.div>
        ) : (
          <>
            <motion.div variants={variants}>
              <HeadlineCard firstName={firstName} snapshot={snapshot} />
            </motion.div>

            {snapshot.strongestMuscle ? (
              <motion.div variants={variants}>
                <InsightCard
                  icon={<Sparkles size={19} />}
                  eyebrow="Your strongest career muscle"
                  title={snapshot.strongestMuscle}
                  body={strongestMuscleCopy(snapshot.strongestMuscle, snapshot.memoryCount)}
                  gradient="linear-gradient(135deg,#2a2140,#3a2145)"
                  iconColor="text-amber-200"
                />
              </motion.div>
            ) : (
              <motion.div variants={variants}>
                <LockedCard tier={tier} memoryCount={snapshot.memoryCount} />
              </motion.div>
            )}

            {snapshot.growingMuscle && (
              <motion.div variants={variants}>
                <InsightCard
                  icon={<TrendingUp size={19} />}
                  eyebrow="Growing fastest"
                  title={snapshot.growingMuscle}
                  body={growingMuscleCopy(snapshot.growingMuscle)}
                  gradient="linear-gradient(135deg,#1e2a3a,#1f3a3a)"
                  iconColor="text-emerald-300"
                />
              </motion.div>
            )}

            {snapshot.underrepresentedMuscle && (
              <motion.div variants={variants}>
                <InsightCard
                  icon={<Compass size={19} />}
                  eyebrow="Underrepresented in your memories"
                  title={snapshot.underrepresentedMuscle}
                  body={underrepresentedMuscleCopy(snapshot.underrepresentedMuscle)}
                  gradient="linear-gradient(135deg,#2a2130,#3a2130)"
                  iconColor="text-rose-200"
                />
              </motion.div>
            )}

            {snapshot.archetype && (
              <motion.div variants={variants}>
                <InsightCard
                  icon={<Award size={19} />}
                  eyebrow="Your archetype"
                  title={snapshot.archetype}
                  body={snapshot.personaHeadline}
                  gradient="linear-gradient(135deg,#241a42,#2f1f52)"
                  iconColor="text-violet-200"
                />
              </motion.div>
            )}

            <motion.div variants={variants} ref={lastCardRef}>
              <RewardLoopCard onGenerateCard={() => router.push("/career-wrapped/card")} />
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[11.5px] leading-tight text-white/55">{label}</p>
    </div>
  );
}

function HeadlineCard({ firstName, snapshot }: { firstName: string | null; snapshot: Snapshot }) {
  return (
    <div className="rounded-[20px] p-6" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
        {firstName ? `${firstName}'s` : "Your"} Career
      </p>
      <div className="mt-4 grid grid-cols-2 gap-y-5">
        <StatBlock value={snapshot.winsCount} label="Wins captured" />
        <StatBlock value={snapshot.leadershipCount} label="Leadership moments" />
        <StatBlock value={snapshot.problemsSolvedCount} label="Problems solved" />
        <StatBlock value={snapshot.seniorStakeholderCount} label="Senior-stakeholder interactions" />
      </div>
      <p className="mt-5 border-t border-white/10 pt-4 text-[13px] leading-relaxed text-white/75">{snapshot.personaHeadline}</p>
    </div>
  );
}

function InsightCard({
  icon,
  eyebrow,
  title,
  body,
  gradient,
  iconColor,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  gradient: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-[20px] p-6" style={{ background: gradient }}>
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ${iconColor}`}>{icon}</div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">{eyebrow}</p>
      <p className="mt-1 text-[19px] font-bold text-white">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/70">{body}</p>
    </div>
  );
}

function LockedCard({ tier, memoryCount }: { tier: CareerWrappedDataTier; memoryCount: number }) {
  const remaining = Math.max(0, CAREER_WRAPPED_THRESHOLDS.minForPatterns - memoryCount);
  return (
    <div className="rounded-[20px] border border-dashed border-[#e0d9f0] bg-[#faf8fd] p-6 text-center">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#f2effa] text-[#8b5cf6]">
        <Lock size={17} />
      </div>
      <p className="text-sm font-semibold text-ink">Career muscles are still locked</p>
      <p className="mt-1 text-[12px] text-ink-soft">
        {tier === "basic"
          ? `Record ${remaining} more meaningful ${remaining === 1 ? "memory" : "memories"} and Strivo.ai will start finding your strongest patterns.`
          : "A few more memories and we'll be able to point out real patterns — strongest, growing, and underrepresented career muscles."}
      </p>
    </div>
  );
}

function RewardLoopCard({ onGenerateCard }: { onGenerateCard: () => void }) {
  const router = useRouter();
  return (
    <div className="rounded-[20px] border border-[#ece5f5] bg-surface p-6 text-center">
      <p className="text-sm font-semibold text-ink">Make your Career Wrapped smarter.</p>
      <p className="mt-1 text-[12px] text-ink-soft">
        The more meaningful career moments you capture, the clearer your career patterns become.
      </p>
      <button
        onClick={() => {
          trackEvent("career_wrapped_add_memory_clicked", { source: "career_wrapped_page" });
          router.push("/record");
        }}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-3 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
      >
        <Plus size={16} /> Add a career memory
      </button>
      <button
        onClick={onGenerateCard}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-pill py-3 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
      >
        <Share2 size={16} /> Generate My Career Card
      </button>
    </div>
  );
}

function EmptyWrappedCard() {
  const router = useRouter();
  return (
    <div className="rounded-[20px] p-6 text-center" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
      <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-amber-200">
        <Sparkles size={19} />
      </div>
      <p className="text-sm font-semibold text-white">Your Career Wrapped is taking shape.</p>
      <p className="mx-auto mt-1 max-w-[280px] text-[12px] text-white/60">
        Add a few career memories and Strivo.ai will start discovering patterns in your career.
      </p>
      <button
        onClick={() => {
          trackEvent("career_wrapped_add_memory_clicked", { source: "career_wrapped_page_empty" });
          router.push("/record");
        }}
        className="mx-auto mt-4 rounded-pill px-5 py-2.5 text-xs font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
      >
        Record a memory
      </button>
    </div>
  );
}
