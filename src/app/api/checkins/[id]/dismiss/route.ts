import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getPendingCheckinById, markCheckinDismissed } from "@/lib/repo/pendingCheckins";

// "Not now" -- lets a check-in be cleared without answering it, so it stops
// showing on Home and doesn't count against MAX_OPEN_CHECKINS (see
// app/api/memories/route.ts) forever. No body needed; this is a pure status
// change.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const checkin = getPendingCheckinById(userId, id);
  if (!checkin) return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
  if (checkin.status !== "active" && checkin.status !== "pending") {
    return NextResponse.json({ error: "This check-in has already been resolved." }, { status: 400 });
  }

  markCheckinDismissed(userId, checkin.id);
  return NextResponse.json({ ok: true });
}
