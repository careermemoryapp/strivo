import { NextResponse } from "next/server";
import { isAdminAuthed, checkQuarterlyBenchmarkSecret } from "@/lib/adminAuth";
import { listUserIdsWithMemoriesSince, listMemoriesByDateRange, type Memory } from "@/lib/repo/memories";
import { createQuarterlyBenchmark, hasQuarterlyBenchmarkForQuarter, type QuarterStats } from "@/lib/repo/quarterlyBenchmarks";
import { getPushTokensForUser } from "@/lib/repo/pushTokens";
import { getUserById } from "@/lib/repo/users";
import { generateQuarterlyBenchmark } from "@/lib/ai";
import { sendPushToAllDevices } from "@/lib/push";
import { safeJsonParse } from "@/lib/utils";

// Strivo's target market is India — same IST convention duplicated across
// lib/retrieval.ts, lib/ai.ts, and the weekly-recap automation (see the
// comments there for the full reasoning; deliberately re-duplicated here
// too rather than shared, same as those).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type QuarterId = { year: number; q: number };

// The (year, quarter) a given instant falls into, judged by IST wall-clock
// month/year — consistent with every other date-boundary decision in this
// app.
function quarterOf(now: Date): QuarterId {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), q: Math.floor(ist.getUTCMonth() / 3) + 1 };
}

function priorQuarter({ year, q }: QuarterId): QuarterId {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}

// [startIso, endIso) for a given (year, quarter) in IST wall-clock terms,
// plus a human label ("Q3 2026") used both for display and as the
// idempotency key (see hasQuarterlyBenchmarkForQuarter) — a re-run for a
// quarter that already got a benchmark is a safe no-op per user, same
// pattern as the weekly recap's weekStartLabel.
function quarterBounds({ year, q }: QuarterId): { startIso: string; endIso: string; label: string } {
  const startMonth = (q - 1) * 3;
  const startUtcMs = Date.UTC(year, startMonth, 1, 0, 0, 0) - IST_OFFSET_MS;
  const endYear = q === 4 ? year + 1 : year;
  const endMonth = q === 4 ? 0 : startMonth + 3;
  const endUtcMs = Date.UTC(endYear, endMonth, 1, 0, 0, 0) - IST_OFFSET_MS;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
    label: `Q${q} ${year}`,
  };
}

function summarizeQuarter(memories: Memory[]): QuarterStats {
  const competencySet = new Set<string>();
  let competencyStories = 0;
  let metricStories = 0;
  for (const m of memories) {
    const competencies = safeJsonParse<string[]>(m.competencies, []);
    if (competencies.length > 0) competencyStories++;
    competencies.forEach((c) => competencySet.add(c));
    if (m.has_metric) metricStories++;
  }
  return { total: memories.length, competencyStories, distinctCompetencies: competencySet.size, metricStories };
}

// Called on a fixed quarterly schedule (1st of Jan/Apr/Jul/Oct) by an
// external automation (same shape as the blog/weekly-recap/growth-narrative
// automations — see QUARTERLY_BENCHMARK_SECRET's comment in
// lib/adminAuth.ts), or manually from an admin session. Benchmarks the
// quarter that JUST ended against the one before it, for every user who
// recorded something in both. Unlike generateGrowthNarrative (which stays
// silent when it can't find a real pattern), this never skips for "nothing
// interesting happened" — an unremarkable quarter still gets an honest,
// warm check-in (see generateQuarterlyBenchmark). Best-effort per user: one
// user's AI call failing doesn't stop the rest of the batch.
export async function POST(req: Request) {
  const authed =
    (await isAdminAuthed()) || checkQuarterlyBenchmarkSecret(req.headers.get("x-quarterly-benchmark-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // "now" sits in the quarter that just STARTED (this job runs on day 1),
  // so the quarter to benchmark is the one right before it, and the
  // comparison baseline is the one before that.
  const benchmarkQ = priorQuarter(quarterOf(now));
  const baselineQ = priorQuarter(benchmarkQ);
  const benchmark = quarterBounds(benchmarkQ);
  const baseline = quarterBounds(baselineQ);

  const userIds = listUserIdsWithMemoriesSince(benchmark.startIso);

  let benchmarksSent = 0;
  let alreadySentThisQuarter = 0;
  let skippedNoBaseline = 0;
  let skippedNoReflection = 0;

  for (const userId of userIds) {
    if (hasQuarterlyBenchmarkForQuarter(userId, benchmark.label)) {
      alreadySentThisQuarter++;
      continue;
    }

    const currentMemories = listMemoriesByDateRange(userId, benchmark.startIso, benchmark.endIso);
    if (currentMemories.length === 0) continue;

    const priorMemories = listMemoriesByDateRange(userId, baseline.startIso, baseline.endIso);
    if (priorMemories.length === 0) {
      // Nothing to compare against yet (their first real quarter with
      // Strivo) — skip silently rather than benchmarking against an empty
      // baseline.
      skippedNoBaseline++;
      continue;
    }

    const currentStats = summarizeQuarter(currentMemories);
    const priorStats = summarizeQuarter(priorMemories);
    const firstName = getUserById(userId)?.first_name ?? null;

    const reflection = await generateQuarterlyBenchmark(
      { ...currentStats, label: benchmark.label },
      { ...priorStats, label: baseline.label },
      currentMemories,
      firstName
    );
    if (!reflection) {
      skippedNoReflection++;
      continue;
    }

    createQuarterlyBenchmark({
      userId,
      quarterLabel: benchmark.label,
      priorQuarterLabel: baseline.label,
      reflectionText: reflection,
      current: currentStats,
      prior: priorStats,
    });

    const tokens = getPushTokensForUser(userId);
    if (tokens.length > 0) {
      await sendPushToAllDevices(tokens, {
        title: "Your quarter, you vs. you",
        body: reflection,
        route: "/benchmark",
      });
    }
    benchmarksSent++;
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    benchmarksSent,
    alreadySentThisQuarter,
    skippedNoBaseline,
    skippedNoReflection,
  });
}
