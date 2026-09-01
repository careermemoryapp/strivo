import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getNotificationPrefs } from "@/lib/repo/notificationPrefs";
import { NotificationPrefsClient } from "./NotificationPrefsClient";

// Settings > Notifications -- per-type on/off switches for the 6 kinds of
// automatic notification (see lib/notificationTypes.ts and notifyUser in
// lib/notify.ts, which is what actually checks these before sending
// anything). This is the screen the "Notifications" row under Preferences
// used to mark "Coming soon" (see settings/page.tsx).
export default async function NotificationPreferencesPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const prefs = getNotificationPrefs(userId);

  return <NotificationPrefsClient initialPrefs={prefs} />;
}
