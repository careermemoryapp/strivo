import { NextResponse } from "next/server";
import { isAdminAuthed, checkCheckinSecret } from "@/lib/adminAuth";
import { getDueCheckins, expireStaleCheckins, markCheckinActive } from "@/lib/repo/pendingCheckins";
import { getPushTokensForUser } from "@/lib/repo/pushTokens";
import { sendPushToAllDevices } from "@/lib/push";

// Same IST convention duplicated across lib/ai.ts, lib/retrieval.ts, and
// every other automation route in this app -- see those for the full
// reasoning; deliberately re-duplicated here too rather than shared.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateString(now: Date): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

// How far past its target_date a check-in can sit before this job stops
// treating it as "still worth surfacing" and quietly expires it instead
// (see expireStaleCheckins) -- covers the case where the job doesn't run
// for a while. Resurrecting "how did your interview go?" three weeks late
// would feel broken, not thoughtful.
const CHECKIN_STALE_DAYS = 10;

function daysAgoIso(now: Date, days: number): string {
  return istDateString(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

// Called once a day by an external automation (same shape as the blog/
// weekly-recap/growth-narrative/quarterly-benchmark automations -- see
// CHECKIN_SECRET's comment in lib/adminAuth.ts), or manually from an admin
// session. This is the "proactive check-ins" feature's whole reason for
// being: it's what lets Strivo follow up on something the user mentioned
// was coming up, completely unprompted -- neither ChatGPT nor Claude can do
// this at all, since they forget the moment a chat ends. Every check-in was
// already extracted at memory-creation time (see futureCheckin in
// generateMemoryMetadata, lib/ai.ts); this job's only job is to notice when
// target_date has arrived and actually surface it -- via a real push
// notification, and via getActiveCheckinForUser for anyone who opens the
// app without tapping the push (see the Home teaser in HomeClient.tsx).
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkCheckinSecret(req.headers.get("x-checkin-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayIso = istDateString(now);
  const staleCutoffIso = daysAgoIso(now, CHECKIN_STALE_DAYS);

  // Stale ones first -- so a check-in that's both due AND past the stale
  // cutoff never gets picked up by getDueCheckins below (its lower bound is
  // the same staleCutoffIso, so this ordering isn't strictly required for
  // correctness, but running it first keeps the two queries' intent
  // obviously non-overlapping rather than relying on matching bounds).
  const expiredCount = expireStaleCheckins(staleCutoffIso);

  const due = getDueCheckins(todayIso, staleCutoffIso);

  let activated = 0;
  let pushed = 0;

  for (const checkin of due) {
    markCheckinActive(checkin.id);
    activated++;

    const tokens = getPushTokensForUser(checkin.user_id);
    if (tokens.length > 0) {
      await sendPushToAllDevices(tokens, {
        title: "One more thing —",
        body: checkin.question,
        route: `/check-in/${checkin.id}`,
      });
      pushed++;
    }
    // No push token registered is fine, not an error -- the check-in is
    // still 'active' now, so it'll show up as a Home teaser (see
    // getActiveCheckinForUser) the next time they open the app.
  }

  return NextResponse.json({ ok: true, dueConsidered: due.length, activated, pushed, expiredCount });
}
