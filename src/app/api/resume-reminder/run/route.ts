import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isAdminAuthed, checkResumeReminderSecret } from "@/lib/adminAuth";
import { listAllUserIds, setResumeReminderSentAt, getUserById } from "@/lib/repo/users";
import { isDueForResumeReminder, RESUME_REMINDER_TITLE, RESUME_REMINDER_BODY } from "@/lib/resumeReminder";
import { notifyUser } from "@/lib/notify";

// Called once a day by an external automation (same shape as
// checkins/weekly-recap/growth-narrative/quarterly-benchmark/underplayed-win/
// engagement-nudge/category-insight -- see RESUME_REMINDER_SECRET's comment
// in lib/adminAuth.ts), or manually from an admin session. Recurring nudge
// (see isDueForResumeReminder, lib/resumeReminder.ts -- first at day 3, then
// every 10 days after that) for anyone who skipped uploading a resume at
// /first-record and still hasn't added one -- points them at
// Settings > Resume. Stops for good once resume_text is set. Reuses the
// existing "nudge" notification type (same one app/api/admin/nudge and the
// engagement-nudge automation use) so it's covered by the same Settings
// toggle rather than adding a new one just for this.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkResumeReminderSecret(req.headers.get("x-resume-reminder-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const userIds = listAllUserIds();

  let considered = 0;
  let due = 0;
  let pushed = 0;

  for (const userId of userIds) {
    considered++;
    const user = getUserById(userId);
    if (!user || !isDueForResumeReminder(user, now)) continue;

    due++;
    try {
      const { pushed: didPush } = await notifyUser(userId, {
        type: "nudge",
        title: RESUME_REMINDER_TITLE,
        body: RESUME_REMINDER_BODY,
        route: "/settings/resume",
      });
      if (didPush) pushed++;
      // Stamped regardless of whether a device was actually reachable -- the
      // in-app notification row was still written either way (see
      // notifyUser), and this is a one-time nudge, so "already sent" should
      // stick even if nobody had a registered device to push to.
      setResumeReminderSentAt(userId, now.toISOString());
    } catch (e) {
      console.error("Resume reminder failed for user:", userId, e);
      Sentry.captureException(e);
    }
  }

  return NextResponse.json({ ok: true, considered, due, pushed });
}
