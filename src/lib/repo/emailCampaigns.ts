import { getDb, newId, nowIso } from "@/lib/db";
import { getSubscriptionInfo } from "@/lib/repo/users";
import type { User } from "@/lib/repo/users";

// Audience segments for broadcast campaign email -- deliberately mirrors
// the plan-choice vocabulary used everywhere else (welcome-trial, admin
// Users table, settings/subscription) so "paid monthly" here means the
// same thing it means there. Note there's no real "cancelled" segment yet:
// Strivo doesn't have a genuine cancellation event to key off until Google
// Play Billing webhooks are wired up (see task tracker #115) -- "expired"
// (trial ran out, never converted) is the closest real signal available
// today. Once real billing lands, add "cancelled" here the same way.
export type EmailSegment = "all" | "trial" | "paid_monthly" | "paid_annual" | "expired";

export const EMAIL_SEGMENTS: EmailSegment[] = ["all", "trial", "paid_monthly", "paid_annual", "expired"];

export type EmailRecipient = { id: string; email: string; firstName: string };

type CandidateRow = Pick<
  User,
  "id" | "email" | "first_name" | "subscription_status" | "trial_ends_at" | "preferred_plan" | "email_opt_out"
>;

function matchesSegment(segment: EmailSegment, row: CandidateRow): boolean {
  if (segment === "all") return true;
  const info = getSubscriptionInfo(row);
  if (segment === "trial") return info.status === "trial";
  if (segment === "expired") return info.status === "expired";
  if (segment === "paid_monthly") return info.status === "active" && info.preferredPlan === "monthly";
  if (segment === "paid_annual") return info.status === "active" && info.preferredPlan === "annual";
  return false;
}

// Excludes anyone who's clicked the unsubscribe link (see
// /api/email/unsubscribe) at the SQL level, before any segment filtering
// even runs -- an opted-out user can never end up in any campaign
// audience, regardless of which segment an admin picks.
function candidateRows(): CandidateRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, email, first_name, subscription_status, trial_ends_at, preferred_plan, email_opt_out
       FROM users WHERE email_opt_out = 0`
    )
    .all() as CandidateRow[];
}

export function recipientsForSegment(segment: EmailSegment): EmailRecipient[] {
  return candidateRows()
    .filter((row) => matchesSegment(segment, row))
    .map((row) => ({ id: row.id, email: row.email, firstName: row.first_name }));
}

// One pass over the (opt-out-excluded) user table computing every
// segment's count at once, rather than the admin composer's live counter
// triggering five separate full scans.
export function countsForAllSegments(): Record<EmailSegment, number> {
  const rows = candidateRows();
  const counts = {} as Record<EmailSegment, number>;
  for (const segment of EMAIL_SEGMENTS) {
    counts[segment] = rows.filter((row) => matchesSegment(segment, row)).length;
  }
  return counts;
}

export type EmailCampaign = {
  id: string;
  subject: string;
  body: string;
  segment: EmailSegment;
  recipient_count: number;
  banner_image_url: string | null;
  button_text: string | null;
  button_url: string | null;
  accent_color: string | null;
  created_at: string;
};

// History row is written up front, before any actual sending happens (see
// the fire-and-forget send loop in the API route) -- so a campaign always
// shows up in "Previously sent" immediately, and the recorded
// recipient_count reflects who *should* have received it even if some
// individual sends fail partway through. Design fields (banner/button/
// color) are stored alongside the subject/body so history accurately
// reflects what was actually sent, not just the text content.
export function createCampaign(input: {
  subject: string;
  body: string;
  segment: EmailSegment;
  recipientCount: number;
  bannerImageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  accentColor: string | null;
}): EmailCampaign {
  const db = getDb();
  const id = newId("campaign");
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO email_campaigns (id, subject, body, segment, recipient_count, banner_image_url, button_text, button_url, accent_color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.subject,
    input.body,
    input.segment,
    input.recipientCount,
    input.bannerImageUrl,
    input.buttonText,
    input.buttonUrl,
    input.accentColor,
    created_at
  );
  return {
    id,
    subject: input.subject,
    body: input.body,
    segment: input.segment,
    recipient_count: input.recipientCount,
    banner_image_url: input.bannerImageUrl,
    button_text: input.buttonText,
    button_url: input.buttonUrl,
    accent_color: input.accentColor,
    created_at,
  };
}

export function listRecentCampaigns(limit = 10): EmailCampaign[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM email_campaigns ORDER BY created_at DESC LIMIT ?`).all(limit) as EmailCampaign[];
}
