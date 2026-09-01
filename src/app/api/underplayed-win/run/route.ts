import { NextResponse } from "next/server";
import { isAdminAuthed, checkUnderplayedWinSecret } from "@/lib/adminAuth";
import { listUserIdsWithMemoriesSince, listSelfMinimizedCandidates } from "@/lib/repo/memories";
import { shouldSurfaceUnderplayedWin, createUnderplayedWinCallout } from "@/lib/repo/underplayedWins";
import { generateUnderplayedWinCallout } from "@/lib/ai";
import { notifyUser } from "@/lib/notify";
import { getUserById } from "@/lib/repo/users";

// How many unsurfaced flagged memories to hand the model per user -- enough
// that it has a real choice if a backlog has built up, small enough to keep
// the call cheap and focused. See listSelfMinimizedCandidates in
// lib/repo/memories.ts.
const CANDIDATE_BATCH_SIZE = 5;

// Called on a periodic schedule (recommended: daily) by an external
// automation, same shape as the growth-narrative and weekly-recap jobs (see
// UNDERPLAYED_WIN_SECRET's comment in lib/adminAuth.ts), or manually from an
// admin session. This is the "someone's actually proud of you" push -- the
// one human-angle feature that re-reads PAST memories looking for a specific
// moment the user undersold, rather than summarizing recent activity or
// finding a broad trend (contrast with weekly-recap/run and
// growth-narrative/run). shouldSurfaceUnderplayedWin gates cadence per user
// (rare by design -- see the comment there); listSelfMinimizedCandidates
// gates content (only memories flagged at save time, never reused).
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkUnderplayedWinSecret(req.headers.get("x-underplayed-win-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same "epoch as lower bound" trick as growth-narrative/run: pulls in
  // every user who's ever recorded anything, and shouldSurfaceUnderplayedWin
  // + the candidate query below do the real filtering per user.
  const userIds = listUserIdsWithMemoriesSince(new Date(0).toISOString());

  let calloutsSent = 0;
  let notEligible = 0;
  let noCandidates = 0;
  let skippedNoneStrongEnough = 0;

  for (const userId of userIds) {
    if (!shouldSurfaceUnderplayedWin(userId)) {
      notEligible++;
      continue;
    }

    const candidates = listSelfMinimizedCandidates(userId, CANDIDATE_BATCH_SIZE);
    if (candidates.length === 0) {
      noCandidates++;
      continue;
    }

    const firstName = getUserById(userId)?.first_name ?? null;
    const result = await generateUnderplayedWinCallout(candidates, firstName);
    if (!result) {
      skippedNoneStrongEnough++;
      continue;
    }

    createUnderplayedWinCallout({
      userId,
      memoryId: result.memoryId,
      messageText: result.message,
    });

    // See lib/notify.ts -- writes the in-app notification (see
    // app/(app)/notifications) and sends the push together. Deliberately no
    // title -- see the tone note in generateUnderplayedWinCallout (lib/ai.ts).
    // Every other automatic notification in this app (weekly recap, growth
    // narrative, quarterly benchmark) leads with a bolded headline; this one
    // is meant to read like a plain, unannounced observation instead of
    // another notification with a banner on it, so the message body IS the
    // whole thing -- both in the push and in the notification list row.
    // Deep-links straight to the memory it's about, same pattern as
    // checkins/run's `/check-in/${id}` route.
    await notifyUser(userId, {
      type: "underplayed_win",
      body: result.message,
      route: `/memories/${result.memoryId}`,
    });
    calloutsSent++;
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    calloutsSent,
    notEligible,
    noCandidates,
    skippedNoneStrongEnough,
  });
}
