import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { countMemories, listMemoryDates } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { getRecentWeeklyRecap } from "@/lib/repo/weeklyRecaps";
import { getRecentGrowthNarrative } from "@/lib/repo/growthNarratives";
import { getRecentQuarterlyBenchmark } from "@/lib/repo/quarterlyBenchmarks";
import { getActiveCheckinForUser } from "@/lib/repo/pendingCheckins";
import { computeStreak } from "@/lib/utils";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import { getCareerWrappedDataTier, periodKeyForYear } from "@/lib/careerWrapped";

// Kept in sync with the identical constants in page.tsx (the Server
// Component's first-render fetch) -- see the comments there for why these
// windows exist.
const RECAP_VISIBLE_MS = 8 * 24 * 60 * 60 * 1000;
const GROWTH_VISIBLE_MS = 21 * 24 * 60 * 60 * 1000;
const BENCHMARK_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = getUserById(userId);
  const streak = computeStreak(listMemoryDates(userId));
  const memoryCount = countMemories(userId);
  const recentChats = listChats(userId).slice(0, 3);
  const recentRecap = getRecentWeeklyRecap(userId, RECAP_VISIBLE_MS);
  const recentGrowth = getRecentGrowthNarrative(userId, GROWTH_VISIBLE_MS);
  const recentBenchmark = getRecentQuarterlyBenchmark(userId, BENCHMARK_VISIBLE_MS);
  const activeCheckin = getActiveCheckinForUser(userId);
  const careerWrappedYear = new Date().getUTCFullYear();
  const careerWrapped = isFeatureEnabled("career_wrapped")
    ? getOrComputeCareerWrappedSnapshot(userId, periodKeyForYear(careerWrappedYear))
    : null;

  return NextResponse.json({
    user: user
      ? { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email }
      : null,
    streak,
    memoryCount,
    recentChats,
    recap: recentRecap ? { headline: recentRecap.headline } : null,
    growth: recentGrowth ? { text: recentGrowth.narrative_text } : null,
    benchmark: recentBenchmark
      ? { text: recentBenchmark.reflection_text, quarterLabel: recentBenchmark.quarter_label }
      : null,
    checkin: activeCheckin ? { id: activeCheckin.id, question: activeCheckin.question } : null,
    careerWrapped: careerWrapped
      ? {
          tier: getCareerWrappedDataTier(careerWrapped.memory_count_at_generation),
          year: careerWrappedYear,
          winsCount: careerWrapped.wins_count,
          leadershipCount: careerWrapped.leadership_count,
          problemsSolvedCount: careerWrapped.problems_solved_count,
          seniorStakeholderCount: careerWrapped.senior_stakeholder_count,
          strongestMuscle: careerWrapped.strongest_muscle,
        }
      : null,
    // True until the user has picked Monthly/Annual on the first-run trial
    // screen (see app/welcome-trial -- deliberately outside the (app) route
    // group/layout, see the comment there). The authoritative redirect now
    // happens server-side in app/(app)/layout.tsx, which covers every route
    // under (app), not just Home; this client-side check in Home is a
    // harmless redundant safety net, not the primary gate anymore.
    // Piggybacked on this response rather than a separate fetch since
    // /api/home already loads the user row.
    needsPlanChoice: user ? user.preferred_plan === null : false,
  });
}
