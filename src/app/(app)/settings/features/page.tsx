"use client";

import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import {
  Sparkles, Copy, MessageCircleQuestion, Award, LayoutGrid, CalendarDays, TrendingUp, Scale, ChevronRight, Zap,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

// Each item gets its OWN accent rather than one repeated violet chip for
// everything -- most matching the color that feature actually wears
// elsewhere in the app (praise = amber like the Record popup, milestones =
// indigo like the milestone badge, growth = violet like /growth, benchmark
// = emerald like /benchmark) so this page doubles as a little preview of
// where each thing lives, not just a flat bulleted list.
const IN_THE_MOMENT = [
  {
    icon: Sparkles,
    title: "A genuine reaction, not just a save",
    desc: "When a story shows real Leadership, Problem-Solving, or a similar quality, Strivo says so specifically -- including when it's really about effort or persistence, not just a clean win.",
    color: "#f59e0b",
  },
  {
    icon: Copy,
    title: "A resume line, already written",
    desc: "A polished, ready-to-copy resume bullet built from what you just said, with any real numbers pulled straight from the transcript.",
    color: "#3b82f6",
  },
  {
    icon: MessageCircleQuestion,
    title: "One good question back",
    desc: "A short, genuinely curious follow-up -- optional, skippable, and if you answer it, it folds right into the memory instead of just sitting on screen.",
    color: "#8b5cf6",
  },
  {
    icon: Award,
    title: "Small, earned milestones",
    desc: "First story in a new competency, round memory counts, first story backed by a real number -- one-time moments, not a streak you have to keep up.",
    color: "#6366f1",
  },
];

// The features that build up automatically -- the whole reason this page
// exists. Each one has a real, always-visible page (so it's never just a
// broken-looking empty state someone stumbles into with no context) plus an
// honest note on when it actually shows up, since none of these appear on
// day one.
const OVER_TIME = [
  {
    icon: LayoutGrid,
    title: "Story Bank",
    when: "from your very first memory",
    desc: "Which competencies you've got strong stories for, and which are still thin -- framed as growth to capture, not a checklist you're failing.",
    route: "/memories/coverage",
    color: "#14b8a6",
  },
  {
    icon: CalendarDays,
    title: "Your Week in Stories",
    when: "weekly, after an active week",
    desc: "A short recap of your best 2-3 stories from the past week and what they show about you.",
    route: "/recap",
    color: "#6366f1",
  },
  {
    icon: TrendingUp,
    title: "How You've Grown",
    when: "roughly monthly, once you've got history",
    desc: "Your earliest stories compared to your latest ones, with a genuine pattern reflected back -- who you're becoming, not just what you did once.",
    route: "/growth",
    color: "#7c6ff0",
  },
  {
    icon: Scale,
    title: "You vs. You",
    when: "every quarter",
    desc: "An honest check-in comparing this quarter to the last one -- real numbers plus a genuine reflection, never a gamified scoreboard.",
    route: "/benchmark",
    color: "#10b981",
  },
];

export default function FeaturesPage() {
  const router = useRouter();

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Features" />

      <div className="px-5 pt-5 space-y-7">
        {/* Energetic hero, in place of a plain intro paragraph -- same
            gradient-card language as /growth and /benchmark, so this reads
            as "one of the good pages" from the first glance rather than a
            settings sub-page. */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="relative overflow-hidden rounded-[20px] p-5"
          style={{ background: "linear-gradient(135deg,#2a1550,#1c1435 60%,#150c2e)" }}
        >
          <div
            className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35), transparent 70%)" }}
          />
          <div className="relative flex items-center gap-2">
            <Zap size={15} className="text-[#c9bdf0]" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#c9bdf0]">The human side</p>
          </div>
          <p className="relative mt-2 text-[17px] font-bold leading-snug text-white">
            Strivo doesn&apos;t just store what you say — it notices.
          </p>
          <p className="relative mt-2 text-[12.5px] leading-relaxed text-white/70">
            Some of it reacts the second you hit save. The rest builds up quietly, the more you
            use it, and lands as a notification when it&apos;s ready — you never have to come
            looking for it.
          </p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger}>
          <div className="mb-2.5 flex items-center gap-2 px-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#a78bfa", boxShadow: "0 0 6px #a78bfa" }} />
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#8a82a8]">Right when you record</h2>
          </div>
          <div className="space-y-2.5">
            {IN_THE_MOMENT.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                whileTap={{ scale: 0.98 }}
                className="flex items-start gap-3 rounded-[16px] border border-[#f0ecf7] bg-surface p-4"
                style={{ boxShadow: "0 2px 10px rgba(60,50,90,0.05)" }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${f.color}1F`, color: f.color, boxShadow: `0 4px 12px ${f.color}33` }}
                >
                  <f.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Small connecting flourish between the two groups -- a miniature
            echo of the animated "left becomes right" flow on the marketing
            site, so the same idea (in-the-moment turning into ongoing)
            shows up here too, just compact enough for a phone screen. */}
        <div className="flex items-center justify-center gap-1.5 py-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i % 2 === 0 ? "#a78bfa" : "#34d399" }}
              animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>

        <motion.div initial="hidden" animate="show" variants={stagger}>
          <div className="mb-2.5 flex items-center gap-2 px-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#8a82a8]">Builds automatically, over time</h2>
          </div>
          <div className="space-y-2.5">
            {OVER_TIME.map((f) => (
              <motion.button
                key={f.title}
                variants={fadeUp}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push(f.route)}
                className="flex w-full items-start gap-3 rounded-[16px] border border-[#f0ecf7] bg-surface p-4 text-left"
                style={{ boxShadow: "0 2px 10px rgba(60,50,90,0.05)" }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${f.color}1F`, color: f.color, boxShadow: `0 4px 12px ${f.color}33` }}
                >
                  <f.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: `${f.color}1F`, color: f.color }}
                    >
                      {f.when}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{f.desc}</p>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 text-[#cec7dd]" />
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
