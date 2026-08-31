import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo } from "@/lib/repo/users";
import { countMemories, listMemoryDates } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { getRecentWeeklyRecap } from "@/lib/repo/weeklyRecaps";
import { getRecentGrowthNarrative } from "@/lib/repo/growthNarratives";
import { getRecentQuarterlyBenchmark } from "@/lib/repo/quarterlyBenchmarks";
import { getActiveCheckinForUser } from "@/lib/repo/pendingCheckins";
import { computeStreak } from "@/lib/utils";
import { HomeClient } from "./HomeClient";

// How recent a weekly recap has to be to still show on Home -- a recap is
// meant to feel like "hey, here's your week," so one from a month ago
// lingering on Home forever would read as stale/broken rather than a
// reason to open the app. Generous enough that someone who doesn't open
// the app every single day still sees it, without it overstaying its
// welcome. Push notifications (see app/api/weekly-recap/run) are the
// primary way people are meant to discover a new recap — this is just a
// secondary surface for anyone who opens the app without tapping the push.
const RECAP_VISIBLE_MS = 8 * 24 * 60 * 60 * 1000;

// Growth narratives are generated far less often than weekly recaps (see
// shouldGenerateGrowthNarrative in lib/repo/growthNarratives.ts -- roughly
// monthly at most), so it gets a longer visibility window on Home to match
// -- otherwise most people would never see it here at all between one
// generation and the next.
const GROWTH_VISIBLE_MS = 21 * 24 * 60 * 60 * 1000;

// Quarterly benchmarks are generated at most 4 times a year, so this gets
// the most generous window of the three -- long enough that anyone who
// checks Home even occasionally after the quarterly push still sees it,
// without stretching so long it overlaps into the NEXT quarter's benchmark.
const BENCHMARK_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

// Server Component: fetches everything Home needs here, before anything is
// sent to the browser, instead of shipping an empty client component that
// fetches it all itself over /api/home on mount. See ChatDetailClient.tsx
// for the full reasoning.
//
// The old /api/home response also carried `needsPlanChoice` so Home could
// redirect to /welcome-trial client-side as a first-run check. That's no
// longer needed here: (app)/layout.tsx already does that same check
// server-side, for every route under (app), before this page ever renders
// — see the comment there. Home's copy of the check was already documented
// as a redundant safety net by that point, not the primary gate.
export default async function HomePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const user = getUserById(userId);
  const streak = computeStreak(listMemoryDates(userId));
  const memoryCount = countMemories(userId);
  const recentChats = listChats(userId).slice(0, 3);
  // Trial-ending banner (see HomeClient.tsx): only meaningful info here is
  // status + daysLeft, so we don't hand the whole SubscriptionInfo shape
  // across the Server -> Client boundary for no reason.
  const subscription = user ? getSubscriptionInfo(user) : null;

  const recentRecap = getRecentWeeklyRecap(userId, RECAP_VISIBLE_MS);
  const recentGrowth = getRecentGrowthNarrative(userId, GROWTH_VISIBLE_MS);
  const recentBenchmark = getRecentQuarterlyBenchmark(userId, BENCHMARK_VISIBLE_MS);
  // No visibility-window constant here unlike recap/growth/benchmark above
  // -- an active check-in isn't a time-boxed digest, it stays on Home until
  // the user actually answers or dismisses it (see /api/checkins/run, which
  // is what flips a row to 'active' in the first place).
  const activeCheckin = getActiveCheckinForUser(userId);

  return (
    <HomeClient
      initialData={{
        user: user
          ? { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email }
          : null,
        streak,
        memoryCount,
        // node:sqlite rows aren't plain objects, so they can't cross the
        // Server -> Client boundary as-is -- see the matching comment in
        // chats/[id]/page.tsx.
        recentChats: recentChats.map((c) => ({ ...c })),
        trial:
          subscription && subscription.status === "trial"
            ? { daysLeft: subscription.daysLeft ?? 0 }
            : null,
        // Only the headline, not the full stories -- Home just needs enough
        // to tease the card; tapping it goes to /recap for the rest.
        recap: recentRecap ? { headline: recentRecap.headline } : null,
        // Just the narrative text -- tapping the teaser goes to /growth for
        // the full framing (date range compared, etc.).
        growth: recentGrowth ? { text: recentGrowth.narrative_text } : null,
        // Just the reflection text + labels -- tapping the teaser goes to
        // /benchmark for the full quarter-vs-quarter numbers.
        benchmark: recentBenchmark
          ? { text: recentBenchmark.reflection_text, quarterLabel: recentBenchmark.quarter_label }
          : null,
        // Just the question -- tapping the teaser goes to /check-in/[id]
        // for the actual answer flow.
        checkin: activeCheckin ? { id: activeCheckin.id, question: activeCheckin.question } : null,
      }}
    />
  );
}
