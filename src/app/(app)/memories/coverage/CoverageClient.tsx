"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles, Plus, ArrowRight, ChevronDown } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";

type CoverageEntry = { name: string; count: number };

// With the competency taxonomy now 20+ items (see COMPETENCY_OPTIONS in
// lib/ai.ts), showing every single empty one as its own amber card would
// turn "worth building up" into a wall of prompts -- exactly the nagging-
// checklist feeling this page is designed to avoid. Capping the visible
// list keeps it a short, inviting nudge; the remainder are summarized in
// one line instead of disappearing silently.
const GAP_DISPLAY_LIMIT = 6;

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
            experience rather than a flat alphabetical list. */}
        {covered.length > 0 && (
          <div>
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Sparkles size={13} className="text-[#8b5cf6]" /> Your strongest stories
            </p>
            <div className="space-y-2.5">
              {covered.map((c) => (
                <div key={c.name} className="rounded-[13px] border border-[#f0ecf7] bg-surface p-3.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="text-xs font-semibold text-[#8b5cf6]">
                      {c.count} {c.count === 1 ? "story" : "stories"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-[#f2effa]">
                    <div
                      className="h-full rounded-pill"
                      style={{
                        width: `${Math.max(8, Math.round((c.count / maxCount) * 100))}%`,
                        background: "linear-gradient(90deg,#a78bfa,#60a5fa)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gaps, framed as growth rather than a nagging checklist -- each
            one is an invitation with a direct path to fix it (Record),
            not a red warning. */}
        {empty.length > 0 && (
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Worth building up</p>
            <div className="space-y-2.5">
              {(gapsExpanded ? empty : empty.slice(0, GAP_DISPLAY_LIMIT)).map((c) => (
                <button
                  key={c.name}
                  onClick={() => router.push("/record")}
                  className="flex w-full items-center justify-between gap-3 rounded-[13px] border border-amber-200 bg-amber-50 p-3.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-700">{c.name}</p>
                    <p className="mt-0.5 text-xs text-amber-700/80">
                      No stories yet — even a small example counts.
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-amber-700">
                    <Plus size={13} /> Record
                  </span>
                </button>
              ))}
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
