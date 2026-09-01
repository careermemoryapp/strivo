import { NextResponse } from "next/server";
import { isAdminAuthed, checkWeeklyRecapSecret } from "@/lib/adminAuth";
import { listUserIdsWithMemoriesSince, listMemoriesByDateRange } from "@/lib/repo/memories";
import { createWeeklyRecap, hasWeeklyRecapForWeek, type RecapStory } from "@/lib/repo/weeklyRecaps";
import { generateWeeklyRecap } from "@/lib/ai";
import { notifyUser } from "@/lib/notify";

// Strivo's target market is India — same IST convention as
// lib/retrieval.ts and lib/ai.ts (see comments there for the full
// reasoning). Duplicated here rather than imported since it's a tiny fixed
// constant, same as the other two files.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The UTC instant for "7 days ago, at IST midnight" — the start of the
// rolling window this recap covers, anchored to IST wall-clock days so it
// lines up with how "this week" would actually read to a user in India,
// not a UTC day boundary that could be off by several hours either way.
function sevenDaysAgoIstMidnightUtc(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 7) - IST_OFFSET_MS);
}

// Called on a weekly schedule by an external automation (same shape as the
// daily blog-writing automation — see BLOG_AUTOMATION_SECRET's comment in
// lib/adminAuth.ts for why this uses its own separate secret rather than
// reusing ADMIN_PASSWORD or BLOG_AUTOMATION_SECRET), or manually from an
// admin session. For every user who recorded at least one memory in the
// past 7 days and hasn't already gotten a recap for this exact week, picks
// their best 2-3 stories via AI, saves the recap, and sends a push
// notification linking into /recap. Best-effort per user: one user's AI
// call failing doesn't stop the rest of the batch.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkWeeklyRecapSecret(req.headers.get("x-weekly-recap-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = sevenDaysAgoIstMidnightUtc(now);
  const windowStartIso = windowStart.toISOString();
  // YYYY-MM-DD — the per-week dedupe key stored on each recap row (see
  // hasWeeklyRecapForWeek). Two runs within the same rolling week resolve
  // to the same label since they both compute "7 days ago" against roughly
  // the same `now`, so a re-run (retry, accidental double-trigger) is a
  // safe no-op per user rather than a duplicate push.
  const weekStartLabel = windowStartIso.slice(0, 10);

  const userIds = listUserIdsWithMemoriesSince(windowStartIso);

  let recapsSent = 0;
  let alreadySentThisWeek = 0;
  let skippedNoStandoutStory = 0;

  for (const userId of userIds) {
    if (hasWeeklyRecapForWeek(userId, weekStartLabel)) {
      alreadySentThisWeek++;
      continue;
    }

    const memories = listMemoriesByDateRange(userId, windowStartIso, now.toISOString());
    if (memories.length === 0) continue;

    const recap = await generateWeeklyRecap(memories);
    if (!recap) {
      skippedNoStandoutStory++;
      continue;
    }

    const memoriesById = new Map(memories.map((m) => [m.id, m]));
    const stories: RecapStory[] = [];
    for (const s of recap.stories) {
      const memory = memoriesById.get(s.memoryId);
      if (memory) stories.push({ memoryId: memory.id, title: memory.title, blurb: s.blurb });
    }
    if (stories.length === 0) {
      skippedNoStandoutStory++;
      continue;
    }

    createWeeklyRecap({ userId, weekStart: weekStartLabel, headline: recap.headline, stories });

    // Writes the in-app notification (see app/(app)/notifications) and
    // sends the push together -- see lib/notify.ts for why both go through
    // one call now instead of this route reaching for sendPushToAllDevices
    // directly.
    await notifyUser(userId, {
      type: "weekly_recap",
      title: "Your week in stories",
      body: recap.headline,
      route: "/recap",
    });
    recapsSent++;
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    recapsSent,
    alreadySentThisWeek,
    skippedNoStandoutStory,
  });
}
