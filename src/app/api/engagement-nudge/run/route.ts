import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isAdminAuthed, checkEngagementNudgeSecret } from "@/lib/adminAuth";
import { listAllUserIds, setLastEngagementNudgeAt, getUserById } from "@/lib/repo/users";
import { computeEngagementTier, isDueForEngagementNudge, pickEngagementMessage } from "@/lib/engagement";
import { notifyUser } from "@/lib/notify";

// Called once a day by an external automation (same shape as
// checkins/weekly-recap/growth-narrative/quarterly-benchmark/underplayed-win
// -- see ENGAGEMENT_NUDGE_SECRET's comment in lib/adminAuth.ts), or manually
// from an admin session. This is the "engagement-aware nudge cadence"
// feature's whole reason for being: instead of every user getting the same
// re-engagement message on the same schedule (or none at all until the
// founder manually composes one -- see app/api/admin/nudge), each user's
// actual recording pattern (see computeEngagementTier, lib/engagement.ts)
// decides whether they get nudged today, how often, and in what tone --
// someone recording daily is left alone entirely, someone quiet for three
// weeks gets a much less frequent (but not silent) reminder. Sends via the
// existing "nudge" notification type (same one app/api/admin/nudge uses) --
// from the user's point of view this is still just "a message from Strivo,"
// automated or not, and reusing the type means one Settings toggle already
// covers both without adding a new one.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkEngagementNudgeSecret(req.headers.get("x-engagement-nudge-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const userIds = listAllUserIds();

  let considered = 0;
  let due = 0;
  let pushed = 0;
  const tierCounts: Record<string, number> = {};

  for (const userId of userIds) {
    considered++;
    const info = computeEngagementTier(userId, now);
    tierCounts[info.tier] = (tierCounts[info.tier] ?? 0) + 1;

    const user = getUserById(userId);
    if (!isDueForEngagementNudge(info, user?.last_engagement_nudge_at ?? null, now)) continue;

    const message = pickEngagementMessage(info);
    if (!message) continue; // "power" tier -- never actually reaches here given cadenceDays 0, but stay defensive.

    due++;
    try {
      const { pushed: didPush } = await notifyUser(userId, {
        type: "nudge",
        title: message.title,
        body: message.body,
        route: "/record",
      });
      if (didPush) pushed++;
      // Stamped regardless of whether a device was actually reachable --
      // the in-app notification row was still written either way (see
      // notifyUser), so from this job's cadence perspective the user WAS
      // reached; a missing push token isn't a reason to nudge again sooner.
      setLastEngagementNudgeAt(userId, now.toISOString());
    } catch (e) {
      console.error("Engagement nudge failed for user:", userId, e);
      Sentry.captureException(e);
    }
  }

  return NextResponse.json({ ok: true, considered, due, pushed, tierCounts });
}
