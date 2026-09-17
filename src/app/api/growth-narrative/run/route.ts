import { NextResponse } from "next/server";
import { isAdminAuthed, checkGrowthNarrativeSecret } from "@/lib/adminAuth";
import { listUserIdsWithMemoriesSince, listOldestMemories, listNewestMemories } from "@/lib/repo/memories";
import { shouldGenerateGrowthNarrative, createGrowthNarrative } from "@/lib/repo/growthNarratives";
import { shouldGenerateSuggestedRoles, createSuggestedRoles } from "@/lib/repo/suggestedRoles";
import { generateGrowthNarrative, generateSuggestedRoles } from "@/lib/ai";
import { notifyUser } from "@/lib/notify";

// How many memories go into each side of the "earlier vs recent"
// comparison. Small enough to keep the AI call focused and cheap, large
// enough that one unusually thin or unusually dramatic memory doesn't
// single-handedly define the whole narrative.
const BATCH_SIZE = 6;

// How many of the user's most RECENT memories "Roles you're ready for"
// looks at -- current readiness, not the growth-narrative's earlier-vs-
// recent comparison, so this is one bigger recency-ordered sample rather
// than two small batches. Large enough to give the model real breadth to
// work with, still small enough to keep the AI call cheap.
const ROLE_SAMPLE_SIZE = 20;

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
//
// This route ALSO generates "Roles you're ready for" (Home screen) for
// every eligible user in the same pass -- see shouldGenerateSuggestedRoles/
// createSuggestedRoles in lib/repo/suggestedRoles.ts. Deliberately bolted
// onto this existing monthly cron hit rather than standing up a fourth
// automation with its own secret + crontab entry: the two features already
// want roughly the same "enough history, due again" cadence, and this way
// shipping roles needs zero new server-side setup (no new env var, no new
// crontab line) on top of what growth narratives already required. The two
// are otherwise fully independent -- separate eligibility check, separate
// AI call, separate table -- so either can change cadence later without
// touching the other.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkGrowthNarrativeSecret(req.headers.get("x-growth-narrative-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The epoch as the lower bound pulls in literally every user who has
  // ever recorded a memory -- shouldGenerateGrowthNarrative/
  // shouldGenerateSuggestedRoles (called per user below) are the real
  // filters, this is just how listUserIdsWithMemoriesSince gets reused as
  // a "distinct users with any memories" query.
  const userIds = listUserIdsWithMemoriesSince(new Date(0).toISOString());

  let narrativesSent = 0;
  let notEligible = 0;
  let skippedNoPattern = 0;

  let roleSuggestionsSent = 0;
  let roleSuggestionsNotEligible = 0;
  let roleSuggestionsSkippedNoFit = 0;

  for (const userId of userIds) {
    if (shouldGenerateGrowthNarrative(userId)) {
      const earlyMemories = listOldestMemories(userId, BATCH_SIZE);
      const recentMemories = listNewestMemories(userId, BATCH_SIZE);
      if (earlyMemories.length > 0 && recentMemories.length > 0) {
        const narrativeText = await generateGrowthNarrative(earlyMemories, recentMemories);
        if (narrativeText) {
          const allDates = [...earlyMemories, ...recentMemories].map((m) => m.created_at).sort();
          createGrowthNarrative({
            userId,
            narrativeText,
            memoryCountAtGeneration: earlyMemories.length + recentMemories.length,
            earliestMemoryDate: allDates[0],
            latestMemoryDate: allDates[allDates.length - 1],
          });

          // See lib/notify.ts -- writes the in-app notification and sends
          // the push together, one call instead of this route reaching for
          // sendPushToAllDevices directly.
          await notifyUser(userId, {
            type: "growth_narrative",
            title: "How you've grown",
            body: narrativeText,
            route: "/growth",
          });
          narrativesSent++;
        } else {
          skippedNoPattern++;
        }
      }
    } else {
      notEligible++;
    }

    // Independent of the growth-narrative outcome above -- see the
    // file-top comment for why this lives in the same route. No push
    // notification here (unlike growth narratives): this is meant to read
    // as an always-on Home reflection, the same treatment Career Wrapped
    // gets, not another digest competing for a notification.
    if (shouldGenerateSuggestedRoles(userId)) {
      const roleMemories = listNewestMemories(userId, ROLE_SAMPLE_SIZE);
      if (roleMemories.length > 0) {
        const roles = await generateSuggestedRoles(roleMemories);
        if (roles && roles.length > 0) {
          createSuggestedRoles({ userId, roles, memoryCountAtGeneration: roleMemories.length });
          roleSuggestionsSent++;
        } else {
          roleSuggestionsSkippedNoFit++;
        }
      }
    } else {
      roleSuggestionsNotEligible++;
    }
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    narrativesSent,
    notEligible,
    skippedNoPattern,
    roleSuggestionsSent,
    roleSuggestionsNotEligible,
    roleSuggestionsSkippedNoFit,
  });
}
