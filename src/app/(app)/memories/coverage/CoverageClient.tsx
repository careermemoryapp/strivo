"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles, Plus, ArrowRight, ChevronDown } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";

type StoryRef = { id: string; title: string };
type CoverageEntry = { name: string; count: number; stories: StoryRef[] };

// With the competency taxonomy now 20+ items (see COMPETENCY_OPTIONS in
// lib/ai.ts), showing every single empty one as its own card would turn
// "worth building up" into a wall of prompts -- exactly the nagging-
// checklist feeling this page is designed to avoid. Capping the visible
// list keeps it a short, inviting nudge; the remainder are summarized in
// one line instead of disappearing silently (see the expand button below).
const GAP_DISPLAY_LIMIT = 6;

// How many actual story chips to show per covered competency before
// collapsing the rest into a "+N more" note -- keeps a competency with a
// dozen stories from turning its card into its own scroll region.
const STORY_CHIP_LIMIT = 4;

// Six colors, cycled by index (index % 6) across BOTH the "strongest
// stories" and "worth building up" lists -- what was previously a flat wall
// of identical amber cards now reads as a real spread of distinct
// strengths/gaps at a glance, not a monotone checklist. Colors are the same
// accent palette already used elsewhere in the app (Features page, Home
// teasers) rather than new ones invented just for this page.
const PALETTE = ["#8b5cf6", "#3b82f6", "#f59e0b", "#14b8a6", "#f43f5e", "#6366f1"];

// One short, concrete example per competency (see COMPETENCY_OPTIONS in
// lib/ai.ts) -- shown in place of the old flat "No stories yet" line so an
// empty competency reads as "here's what would count" rather than just a
// gap. Keyed by the exact competency name; a fallback covers any future
// addition to COMPETENCY_OPTIONS that doesn't have its own line yet.
const COMPETENCY_HINTS: Record<string, string> = {
  Leadership: "A time you guided others, made a call under pressure, or stepped up without being asked.",
  "Ownership & Initiative": "Something you took on and saw through, without waiting to be told.",
  "Problem-Solving": "A tricky issue you worked through — even if it took a few tries.",
  "Collaboration & Teamwork": "A time you worked closely with others toward a shared goal.",
  Communication: "A time you explained something clearly, presented, or got a message across well.",
  "Conflict Resolution": "A disagreement or tough conversation you navigated.",
  "Mentorship & Coaching": "A time you helped someone else learn, grow, or improve.",
  "Innovation & Creativity": "An idea or approach you came up with that wasn't the obvious one.",
  "Adaptability & Resilience": "A change or setback you adjusted to, or kept going through.",
  "Strategic Thinking": "A time you planned ahead or weighed trade-offs before deciding.",
  "Stakeholder Focus": "A time you managed expectations for a client, customer, or leadership.",
  "Results & Impact": "A clear outcome you delivered or a measurable difference you made.",
  "Technical & Hard Skills": "A real technical, domain, or craft skill you applied to get something done.",
  "AI & Tools Fluency": "A time AI, automation, or a notable tool helped you move faster or better.",
  "Data-Driven Decision Making": "A decision you made or supported using real data.",
  "Product & Business Thinking": "A time you thought about user or business impact, not just the task.",
  "Negotiation & Influence": "A time you persuaded someone or influenced how something turned out.",
  "Time & Priority Management": "A time you juggled competing priorities and made the right call.",
  "Crisis Management": "Something urgent or high-pressure you handled well.",
  "Learning Agility": "A time you picked something up fast, or learned from a mistake.",
  "Customer & User Empathy": "A time you understood and acted on what someone actually needed.",
  "Risk & Quality Management": "A time you caught an issue early or made sure something was done right.",
};

function hintFor(name: string): string {
  return COMPETENCY_HINTS[name] ?? "Even a small, specific example counts here.";
}

// "Story Bank" — the point of this page is to turn "you might not realize
// this is a good example" (see the praise popup on the Record page) into
// something the user can look at on their own terms: which behavioral
// interview competencies they already have strong stories for, and which
// ones are still empty. Framed as a portfolio to build up, not a checklist
// they're failing -- the "worth building up" section below reads as an
// invitation ("even a small example counts"), never as a red/urgent warning.
export function CoverageClient({ coverage }: { coverage: CoverageEntry[] }) {
  const router = useRouter();
  const [gapsExpanded, setGapsExpanded] = useState(false);

  const covered = coverage.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const empty = coverage.filter((c) => c.count === 0);
  const maxCount = Math.max(1, ...covered.map((c) => c.count));
  const coveredCount = covered.length;
  const totalCount = coverage.length;

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Story Bank" inlineSubtitle="Your interview-ready stories, by competency" />

      <div className="px-5 pt-5 space-y-5">
        {/* Overall coverage summary — a quick "how much of my story bank is
            actually built out" read, using the same purple gradient bar
            language as the rest of the app rather than a generic progress
            widget. */}
        <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-[#8b5cf6]"
              style={{ boxShadow: "0 3px 8px rgba(60,50,90,0.1)" }}
            >
              <Trophy size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-[#3c3650]">
                {coveredCount} of {totalCount} competencies covered
              </p>
              <p className="text-xs text-[#8a82a8]">
                {coveredCount === 0
                  ? "Record a few memories and your strongest stories will start showing up here."
                  : coveredCount === totalCount
                    ? "You've got at least one story for every competency — nice work."
                    : `${totalCount - coveredCount} left to build up — see below.`}
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-pill bg-white/70">
            <div
              className="h-full rounded-pill"
              style={{
                width: `${Math.round((coveredCount / totalCount) * 100)}%`,
                background: "linear-gradient(90deg,#a78bfa,#60a5fa)",
              }}
            />
          </div>
        </div>

        {/* Strongest stories — sorted by count so the user sees their
            biggest strengths first, like a leaderboard of their own
            experience rather than a flat alphabetical list. Each
            competency gets its own color (see PALETTE) and its actual
            stories as clickable chips underneath, same idea as "Relevant
            Memories" in chat -- tapping one goes straight to that memory
            instead of just showing a number. */}
        {covered.length > 0 && (
          <div>
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Sparkles size={13} className="text-[#8b5cf6]" /> Your strongest stories
            </p>
            <div className="space-y-2.5">
              {covered.map((c, i) => {
                const color = PALETTE[i % PALETTE.length];
                const shown = c.stories.slice(0, STORY_CHIP_LIMIT);
                const extra = c.stories.length - shown.length;
                return (
                  <div
                    key={c.name}
                    className="rounded-[13px] border p-3.5"
                    style={{ borderColor: `${color}33`, background: `${color}0C` }}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold" style={{ color }}>
                        {c.name}
                      </span>
                      <span className="text-xs font-semibold" style={{ color }}>
                        {c.count} {c.count === 1 ? "story" : "stories"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-white/70">
                      <div
                        className="h-full rounded-pill"
                        style={{
                          width: `${Math.max(8, Math.round((c.count / maxCount) * 100))}%`,
                          background: color,
                        }}
                      />
                    </div>
                    {shown.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {shown.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => router.push(`/memories/${s.id}`)}
                            className="max-w-[220px] truncate rounded-full px-2.5 py-1 text-[10.5px] font-medium"
                            style={{ background: "rgba(255,255,255,0.75)", color }}
                          >
                            {s.title}
                          </button>
                        ))}
                        {extra > 0 && (
                          <span
                            className="flex items-center px-1.5 text-[10.5px] font-medium"
                            style={{ color: `${color}99` }}
                          >
                            +{extra} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gaps, framed as growth rather than a nagging checklist -- each
            one is an invitation with a direct path to fix it (Record), not
            a red warning. Each card gets its own color from the same
            PALETTE the covered section uses, and the body line is now a
            concrete example of what would count (see COMPETENCY_HINTS)
            instead of a flat "No stories yet" repeated 20 times. */}
        {empty.length > 0 && (
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Worth building up</p>
            <div className="space-y-2.5">
              {(gapsExpanded ? empty : empty.slice(0, GAP_DISPLAY_LIMIT)).map((c, i) => {
                const color = PALETTE[i % PALETTE.length];
                return (
                  <button
                    key={c.name}
                    onClick={() => router.push("/record")}
                    className="flex w-full items-center justify-between gap-3 rounded-[13px] border p-3.5 text-left"
                    style={{ borderColor: `${color}40`, background: `${color}0C` }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color }}>
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed" style={{ color, opacity: 0.75 }}>
                        {hintFor(c.name)}
                      </p>
                    </div>
                    <span
                      className="flex shrink-0 items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-xs font-semibold"
                      style={{ color }}
                    >
                      <Plus size={13} /> Record
                    </span>
                  </button>
                );
              })}
            </div>
            {empty.length > GAP_DISPLAY_LIMIT && !gapsExpanded && (
              <button
                onClick={() => setGapsExpanded(true)}
                className="mt-2.5 flex items-center gap-1 px-1 text-xs font-semibold text-[#8b5cf6]"
              >
                +{empty.length - GAP_DISPLAY_LIMIT} more competenc{empty.length - GAP_DISPLAY_LIMIT === 1 ? "y" : "ies"} to
                explore
                <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => router.push("/record")}
          className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
        >
          Record a memory <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
