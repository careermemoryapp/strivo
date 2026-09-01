import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getNotificationPrefs, setNotificationPref } from "@/lib/repo/notificationPrefs";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";

// Backs the Settings > Notifications toggles (see
// app/(app)/settings/notifications/NotificationPrefsClient.tsx).
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ prefs: getNotificationPrefs(userId) });
}

const schema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  setNotificationPref(userId, parsed.data.type as NotificationType, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}
