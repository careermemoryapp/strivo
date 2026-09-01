import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { listNotifications, countUnreadNotifications } from "@/lib/repo/notifications";

// Backs the bell icon + /notifications list (see app/(app)/home/HomeClient.tsx
// and app/(app)/notifications/NotificationsClient.tsx). unreadCount is
// returned alongside the list itself rather than making the client compute
// it from the rows (which would break the moment pagination/limiting means
// not every unread row is in the current page).
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = listNotifications(userId);
  const unreadCount = countUnreadNotifications(userId);
  return NextResponse.json({ notifications, unreadCount });
}
