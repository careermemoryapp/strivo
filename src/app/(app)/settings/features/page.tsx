"use client";

import { useRouter } from "next/navigation";
import {
  Sparkles, Copy, MessageCircleQuestion, Award, LayoutGrid, CalendarDays, TrendingUp, Scale, ChevronRight,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Card } from "@/components/Card";

// The "in the moment" features -- these show up right on the Record
// success screen, every time they genuinely apply, so there's no separate
// page to link to. Listed here mainly so someone who hasn't triggered one
// yet (no competency detected, or a trivial memory with no metric) knows
// they exist and aren't broken.
const IN_THE_MOMENT = [
  {
    icon: Sparkles,
    title: "A genuine reaction, not just a save",
    desc: "When a story shows real Leadership, Problem-Solving, or a similar quality, Strivo says so specifically -- including when it's really about effort or persistence, not just a clean win.",
  },
  {
    icon: Copy,
    title: "A resume line, already written",
    desc: "A polished, ready-to-copy resume bullet built from what you just said, with any real numbers pulled straight from the transcript.",
  },
  {
    icon: MessageCircleQuestion,
    title: "One good question back",
    desc: "A short, genuinely curious follow-up -- optional, skippable, and if you answer it, it folds right into the memory instead of just sitting on screen.",
  },
  {
    icon: Award,
    title: "Small, earned milestones",
    desc: "First story in a new competency, round memory counts, first story backed by a real number -- one-time moments, not a streak you have to keep up.",
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
    when: "Available from your very first memory -- fills in as you go",
    desc: "Which competencies you've got strong stories for, and which are still thin -- framed as growth to capture, not a checklist you're failing.",
    route: "/memories/coverage",
  },
  {
    icon: CalendarDays,
    title: "Your Week in Stories",
    when: "After your first active week -- then weekly, as a notification",
    desc: "A short recap of your best 2-3 stories from the past week and what they show about you.",
    route: "/recap",
  },
  {
    icon: TrendingUp,
    title: "How You've Grown",
    when: "Once you've got real history (roughly a dozen+ memories over some weeks) -- then about monthly",
    desc: "Your earliest stories compared to your latest ones, with a genuine pattern reflected back -- who you're becoming, not just what you did once.",
    route: "/growth",
  },
  {
    icon: Scale,
    title: "You vs. You",
    when: "Once you've got two full quarters of history -- then every quarter",
    desc: "An honest check-in comparing this quarter to the last one -- real numbers plus a genuine reflection, never a gamified scoreboard.",
    route: "/benchmark",
  },
];

export default function FeaturesPage() {
  const router = useRouter();

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Features" />

      <div className="px-5 pt-5 space-y-6">
        <p className="text-sm text-ink-soft leading-relaxed">
          Strivo doesn&apos;t just store what you record -- it actively looks for the human story in
          it. Some of that happens the moment you save something. Some of it builds up
          automatically the more history you have, and arrives as a notification when it&apos;s
          ready -- you don&apos;t have to come looking for it. This page is just so you know what to
          expect.
        </p>

        <div>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">
            Right when you record
          </h2>
          <div className="space-y-2.5">
            {IN_THE_MOMENT.map((f) => (
              <Card key={f.title} className="flex items-start gap-3 border-[#f0ecf7]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2effa] text-[#8b5cf6]">
                  <f.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{f.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{f.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">
            Builds automatically, over time
          </h2>
          <div className="space-y-2.5">
            {OVER_TIME.map((f) => (
              <button key={f.title} onClick={() => router.push(f.route)} className="block w-full text-left">
                <Card className="flex items-start gap-3 border-[#f0ecf7]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2effa] text-[#8b5cf6]">
                    <f.icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-[#8b5cf6]">{f.when}</p>
                    <p className="mt-1 text-xs text-ink-soft leading-relaxed">{f.desc}</p>
                  </div>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-[#cec7dd]" />
                </Card>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
