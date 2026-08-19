import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { createNudge, listRecentNudges } from "@/lib/repo/nudges";
import { listPushTokensForSegment, countDevicesForSegment, type NudgeSegment } from "@/lib/repo/pushTokens";
import { sendPushToAllDevices } from "@/lib/push";

const SEGMENTS: NudgeSegment[] = ["all", "recent_missed_today", "inactive"];

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Live device counts per segment, shown next to each option in the
  // composer so the admin knows roughly how many phones they're about to
  // reach before hitting send.
  const audienceCounts = Object.fromEntries(SEGMENTS.map((s) => [s, countDevicesForSegment(s)])) as Record<
    NudgeSegment,
    number
  >;
  return NextResponse.json({ recent: listRecentNudges(), audienceCounts });
}

const schema = z.object({
  title: z.string().trim().min(1, "Add a headline before sending.").max(60),
  message: z.string().trim().min(1).max(300),
  segment: z.enum(["all", "recent_missed_today", "inactive"]).default("all"),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Add a headline and message before sending." },
      { status: 400 }
    );
  }
  // createNudge is purely a history log now (see repo/nudges.ts) — there's
  // no more in-app Home banner, so this button only ever sends the real
  // notification-bar push below.
  const nudge = createNudge(parsed.data);

  // Fire the real notification-bar push, scoped to whichever audience
  // segment was picked (see repo/pushTokens.ts). Best effort and
  // non-blocking on failure — see sendPushToAllDevices, which already
  // no-ops cleanly if Firebase isn't configured yet. The `route` data
  // field is what the app uses (see usePushRegistration.ts's
  // action-performed listener) to send people straight to the Record page
  // when they tap the notification, instead of just opening the app to
  // Home.
  sendPushToAllDevices(listPushTokensForSegment(parsed.data.segment), {
    title: nudge.title ?? undefined,
    body: nudge.message,
    route: "/record",
  }).catch((e) => console.error("Nudge push send failed:", e));

  return NextResponse.json({ sent: nudge });
}
