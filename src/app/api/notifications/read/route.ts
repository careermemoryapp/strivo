import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/repo/notifications";

// id omitted (or absent from the body entirely) means "mark everything
// read" -- the "mark all read" action at the top of the list (see
// NotificationsClient.tsx). A specific id means just that one row, fired
// when the user taps an individual notification, right before following
// its route.
const schema = z.object({ id: z.string().trim().min(1).optional() });

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.id) {
    markNotificationRead(userId, parsed.data.id);
  } else {
    markAllNotificationsRead(userId);
  }

  return NextResponse.json({ ok: true });
}
