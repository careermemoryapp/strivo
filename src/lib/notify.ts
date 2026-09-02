import { createNotification } from "@/lib/repo/notifications";
import { isNotificationTypeEnabled } from "@/lib/repo/notificationPrefs";
import { getPushTokensForUser } from "@/lib/repo/pushTokens";
import { sendPushToAllDevices } from "@/lib/push";

// The single place every automatic, self-generated message to a user goes
// through -- weekly recap, growth narrative, quarterly benchmark, proactive
// check-ins, the underplayed-win callout, and admin nudges (see each
// route's app/api/.../run or app/api/admin/nudge). Before this existed,
// every one of those routes called sendPushToAllDevices directly, which
// meant the ONLY record of what was said was whatever landed on the phone's
// notification tray -- gone forever if push wasn't enabled, the phone was
// silenced, or the person just didn't see it in time. Routing everything
// through here instead means the in-app notification center (see
// lib/repo/notifications.ts and app/(app)/notifications) is a complete,
// permanent history, and the push is just the live "ping" on top of it --
// exactly the same content either way, written once instead of duplicated
// at every call site.
//
// Deliberately writes the notification row unconditionally (even if the
// user has no registered device / push disabled), then only attempts the
// push if they actually have a token -- so someone who's never enabled
// notifications still sees everything Strivo has to say to them the next
// time they open the app, they just don't get pinged live for it.
// Returns whether a push was actually attempted (i.e. the user had at least
// one registered device token) -- the in-app notification row is written
// either way, so this is only useful to a caller that wants to report on
// push reach specifically (see app/api/checkins/run, which already tracked
// a `pushed` count before this helper existed).
//
// Checks the per-type preference (see lib/repo/notificationPrefs.ts, backed
// by the Settings > Notifications toggles) before doing anything else -- a
// disabled type is skipped ENTIRELY: no notification row, no push. This is
// the one gate every one of the 7 notification types passes through, so
// turning a category off in Settings genuinely stops it everywhere at once
// rather than just hiding it from the list.
export async function notifyUser(
  userId: string,
  input: { type: string; title?: string; body: string; route?: string }
): Promise<{ pushed: boolean }> {
  if (!isNotificationTypeEnabled(userId, input.type)) {
    return { pushed: false };
  }

  createNotification({
    userId,
    type: input.type,
    title: input.title ?? null,
    body: input.body,
    route: input.route ?? null,
  });

  const tokens = getPushTokensForUser(userId);
  if (tokens.length > 0) {
    await sendPushToAllDevices(tokens, { title: input.title, body: input.body, route: input.route });
    return { pushed: true };
  }
  return { pushed: false };
}
