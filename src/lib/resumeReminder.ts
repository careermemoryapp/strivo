import type { User } from "@/lib/repo/users";

// The "user did not upload a resume then, but wants to upload it later"
// gap: /first-record's "Skip for now" (and simply not touching the Resume
// tab) leaves someone with no resume on file and no reason to ever
// remember Settings > Resume exists. This is a RECURRING nudge (unlike
// engagement-nudge/category-insight's per-user tier cadence, this one has a
// single fixed rhythm): first nudge 3 days after signup, then every 10 days
// after THAT -- day 3, day 13, day 23, day 33... -- for as long as the
// person still has no resume on file. Stops permanently the moment
// resume_text is set (see /api/profile/resume), whether that's from this
// nudge working or the person uploading one on their own initiative.
const FIRST_REMINDER_AFTER_DAYS = 3;
const REPEAT_REMINDER_EVERY_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// resume_reminder_sent_at doubles as "last sent" here (not "ever sent") --
// null means never nudged yet, so the FIRST_REMINDER_AFTER_DAYS clock runs
// off account age; once it's set, every later check measures the
// REPEAT_REMINDER_EVERY_DAYS gap from that timestamp instead, same shape as
// last_engagement_nudge_at's cooldown logic in lib/engagement.ts.
export function isDueForResumeReminder(
  user: Pick<User, "resume_text" | "resume_reminder_sent_at" | "created_at">,
  now: Date = new Date()
): boolean {
  if (user.resume_text) return false; // already has one on file -- stop nudging for good

  if (!user.resume_reminder_sent_at) {
    const accountAgeMs = now.getTime() - new Date(user.created_at).getTime();
    return accountAgeMs >= FIRST_REMINDER_AFTER_DAYS * DAY_MS;
  }

  const sinceLastMs = now.getTime() - new Date(user.resume_reminder_sent_at).getTime();
  return sinceLastMs >= REPEAT_REMINDER_EVERY_DAYS * DAY_MS;
}

export const RESUME_REMINDER_TITLE = "Quick way to speed things up";
export const RESUME_REMINDER_BODY =
  "Upload your resume in Settings and Strivo already knows your background — no need to type it all out again.";
