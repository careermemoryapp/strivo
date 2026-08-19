import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getActiveNudge, createNudge, clearActiveNudge, listRecentNudges } from "@/lib/repo/nudges";
import { listAllPushTokens } from "@/lib/repo/pushTokens";
import { sendPushToAllDevices } from "@/lib/push";

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ active: getActiveNudge() ?? null, recent: listRecentNudges() });
}

const schema = z.object({
  title: z.string().trim().max(60).optional(),
  message: z.string().trim().min(1).max(300),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Add a message before sending." }, { status: 400 });
  }
  const nudge = createNudge(parsed.data);

  // Fire the real notification-bar push alongside the in-app banner. Best
  // effort and non-blocking on failure — see sendPushToAllDevices, which
  // already no-ops cleanly if Firebase isn't configured yet.
  sendPushToAllDevices(listAllPushTokens(), { title: nudge.title ?? undefined, body: nudge.message }).catch((e) =>
    console.error("Nudge push send failed:", e)
  );

  return NextResponse.json({ active: nudge });
}

export async function DELETE() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  clearActiveNudge();
  return NextResponse.json({ ok: true });
}
