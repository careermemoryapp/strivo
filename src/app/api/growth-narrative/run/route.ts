import { NextResponse } from "next/server";
import { isAdminAuthed, checkGrowthNarrativeSecret } from "@/lib/adminAuth";
import { listUserIdsWithMemoriesSince, listOldestMemories, listNewestMemories } from "@/lib/repo/memories";
import { shouldGenerateGrowthNarrative, createGrowthNarrative } from "@/lib/repo/growthNarratives";
import { generateGrowthNarrative } from "@/lib/ai";
import { notifyUser } from "@/lib/notify";

// How many memories go into each side of the "earlier vs recent"
// comparison. Small enough to keep the AI call focused and cheap, large
// enough that one unusually thin or unusually dramatic memory doesn't
// single-handedly define the whole narrative.
const BATCH_SIZE = 6;

// Called on a monthly schedule by an external automation (same shape as
// the daily blog and weekly recap automations -- see
// GROWTH_NARRATIVE_SECRET's comment in lib/adminAuth.ts), or manually from
// an admin session. Unlike the weekly recap (which only needs "recorded
// something recently"), growth narratives need a broad candidate pool
// scanned via shouldGenerateGrowthNarrative's per-user eligibility check
// (total history + time/volume since the last one) -- there's no cheap SQL
// filter for "has enough history AND is due again," so this pulls every
// user who's EVER recorded anything and lets that function do the
// filtering. Fine at today's scale; would need real pagination if the user
// base gets large enough for that table scan to matter.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkGrowthNarrativeSecret(req.headers.get("x-growth-narrative-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The epoch as the lower bound pulls in literally every user who has
  // ever recorded a memory -- shouldGenerateGrowthNarrative (called per
  // user below) is the real filter, this is just how listUserIdsWithMemoriesSince
  // gets reused as a "distinct users with any memories" query.
  const userIds = listUserIdsWithMemoriesSince(new Date(0).toISOString());

  let narrativesSent = 0;
  let notEligible = 0;
  let skippedNoPattern = 0;

  for (const userId of userIds) {
    if (!shouldGenerateGrowthNarrative(userId)) {
      notEligible++;
      continue;
    }

    const earlyMemories = listOldestMemories(userId, BATCH_SIZE);
    const recentMemories = listNewestMemories(userId, BATCH_SIZE);
    if (earlyMemories.length === 0 || recentMemories.length === 0) continue;

    const narrativeText = await generateGrowthNarrative(earlyMemories, recentMemories);
    if (!narrativeText) {
      skippedNoPattern++;
      continue;
    }

    const allDates = [...earlyMemories, ...recentMemories].map((m) => m.created_at).sort();
    createGrowthNarrative({
      userId,
      narrativeText,
      memoryCountAtGeneration: earlyMemories.length + recentMemories.length,
      earliestMemoryDate: allDates[0],
      latestMemoryDate: allDates[allDates.length - 1],
    });

    // See lib/notify.ts -- writes the in-app notification and sends the
    // push together, one call instead of this route reaching for
    // sendPushToAllDevices directly.
    await notifyUser(userId, {
      type: "growth_narrative",
      title: "How you've grown",
      body: narrativeText,
      route: "/growth",
    });
    narrativesSent++;
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    narrativesSent,
    notEligible,
    skippedNoPattern,
  });
}
