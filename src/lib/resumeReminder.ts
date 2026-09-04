import type { User } from "@/lib/repo/users";

// The "user did not upload a resume then, but wants to upload it later"
// gap: /first-record's "Skip for now" (and simply not touching the Resume
// tab) leaves someone with no resume on file and no reason to ever
// remember Settings > Resume exists. This is a ONE-TIME nudge pointing
// them there -- not a recurring cooldown like the engagement-nudge/
// category-insight automations, which re-evaluate a still-true pattern
// repeatedly. Once someone's been told once, telling them again forever
// (as long as they still haven't uploaded one) would just be nagging.

// Give people a few days to actually explore the app before suggesting a
// resume upload -- nudging on day 0/1 would compete with (and probably lose
// to) every other first-run prompt already happening then.
const REMINDER_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isDueForResumeReminder(user: Pick<User, "resume_text" | "resume_reminder_sent_at" | "created_at">, now: Date = new Date()): boolean {
  if (user.resume_text) return false; // already has one on file
  if (user.resume_reminder_sent_at) return false; // already nudged once, ever
  const accountAgeMs = now.getTime() - new Date(user.created_at).getTime();
  return accountAgeMs >= REMINDER_AFTER_DAYS * DAY_MS;
}

export const RESUME_REMINDER_TITLE = "Quick way to speed things up";
export const RESUME_REMINDER_BODY =
  "Upload your resume in Settings and Strivo already knows your background — no need to type it all out again.";
