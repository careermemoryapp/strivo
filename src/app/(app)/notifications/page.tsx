import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listNotifications } from "@/lib/repo/notifications";
import { NotificationsClient } from "./NotificationsClient";

// The permanent, complete history of every automatic message Strivo has
// ever sent this user -- weekly recap, growth narrative, quarterly
// benchmark, proactive check-ins, the underplayed-win callout, and admin
// nudges (see lib/notify.ts's notifyUser, the single place every one of
// those writes a row here at the same moment it sends the phone push).
// This is what the bell icon on Home (see HomeClient.tsx) links to.
export default async function NotificationsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const notifications = listNotifications(userId);

  return (
    <NotificationsClient
      // node:sqlite rows aren't plain objects, so they can't cross the
      // Server -> Client boundary as-is -- see the matching comment in
      // home/page.tsx / chats/[id]/page.tsx.
      notifications={notifications.map((n) => ({ ...n }))}
    />
  );
}
