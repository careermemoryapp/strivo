"use client";

import { useRouter } from "next/navigation";
import { Scale, ArrowRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

type QuarterStats = { total: number; competencyStories: number; distinctCompetencies: number; metricStories: number };
type Benchmark = {
  quarterLabel: string;
  priorQuarterLabel: string;
  reflectionText: string;
  current: QuarterStats;
  prior: QuarterStats;
  createdAt: string;
};

const ROWS: { key: keyof QuarterStats; label: string }[] = [
  { key: "total", label: "Memories captured" },
  { key: "competencyStories", label: "Stories with a real competency" },
  { key: "distinctCompetencies", label: "Distinct competencies covered" },
  { key: "metricStories", label: "Stories backed by a number" },
];

// A small up/down/flat glyph, not a percentage or a colored "score" — the
// point of "You vs. You" is an honest quarterly check-in, not a gamified
// scoreboard, so the delta is informational rather than judged as
// good/bad (more competency stories isn't automatically "better" than
// fewer, for instance).
function Delta({ current, prior }: { current: number; prior: number }) {
  if (current === prior) return <Minus size={13} className="text-[#a8a2bd]" />;
  if (current > prior) return <ArrowUp size={13} className="text-emerald-500" />;
  return <ArrowDown size={13} className="text-[#a8a2bd]" />;
}

// Teal/emerald rather than the violet used by /growth or the indigo used by
// /recap -- this is meant to read as its own distinct kind of moment (a
// grounded, numbers-plus-reflection benchmark) rather than a variation on
// either of those.
export function BenchmarkClient({ benchmark }: { benchmark: Benchmark | null }) {
  const router = useRouter();

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="You vs. You" />

      <div className="px-5 pt-5">
        {!benchmark ? (
          <EmptyState
            icon={<Scale size={22} />}
            title="Nothing to show yet"
            description="Every quarter, once you've got a bit of history, we'll compare it honestly to the one before it -- real numbers, plus a genuine reflection, not a scoreboard."
            action={<Button onClick={() => router.push("/record")}>Record a memory</Button>}
          />
        ) : (
          <>
            <div
              className="rounded-[18px] border border-[#cdeee0] p-5"
              style={{ background: "linear-gradient(135deg,#f0fbf6,#eef8fb)" }}
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-emerald-600"
                style={{ boxShadow: "0 6px 16px rgba(16,185,129,0.18)" }}
              >
                <Scale size={19} />
              </div>
              <p className="text-[16px] leading-relaxed text-[#2f3d38]">{benchmark.reflectionText}</p>
              <p className="mt-4 text-[11px] font-medium text-[#7d9089]">
                {benchmark.quarterLabel} vs {benchmark.priorQuarterLabel}
              </p>
            </div>

            <div className="mt-5 rounded-[16px] border border-[#ece5f5] bg-surface p-4">
              <div className="mb-3 grid grid-cols-[1fr,auto,auto] gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                <span></span>
                <span className="text-right">{benchmark.priorQuarterLabel}</span>
                <span className="text-right">{benchmark.quarterLabel}</span>
              </div>
              <div className="space-y-2.5">
                {ROWS.map((row) => (
                  <div key={row.key} className="grid grid-cols-[1fr,auto,auto] items-center gap-2">
                    <span className="text-[12.5px] text-ink-soft">{row.label}</span>
                    <span className="text-right text-[12.5px] text-[#a8a2bd]">{benchmark.prior[row.key]}</span>
                    <span className="flex items-center justify-end gap-1 text-right text-[13px] font-semibold text-ink">
                      <Delta current={benchmark.current[row.key]} prior={benchmark.prior[row.key]} />
                      {benchmark.current[row.key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => router.push("/memories")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#34d399,#60a5fa)" }}
            >
              See all your memories <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
