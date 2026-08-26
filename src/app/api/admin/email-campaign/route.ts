import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import {
  countsForAllSegments,
  createCampaign,
  listRecentCampaigns,
  recipientsForSegment,
  EMAIL_SEGMENTS,
  type EmailSegment,
} from "@/lib/repo/emailCampaigns";
import { sendCampaignEmail, sesConfigured } from "@/lib/email";

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Live audience counts per segment, shown next to each option in the
  // composer -- same idea as the nudge composer's per-segment device
  // counts, just computed from subscription state instead of push tokens.
  return NextResponse.json({
    recent: listRecentCampaigns(),
    audienceCounts: countsForAllSegments(),
    sesConfigured: sesConfigured(),
  });
}

// Banner/button/color are all optional design fields -- empty string or
// missing means "don't render that part," so ".or(z.literal(\"\"))" lets
// the composer submit an empty input without tripping url()/regex
// validation, and the empty string is normalized to null right after
// parsing (see `|| null` below) rather than stored as "".
const schema = z.object({
  subject: z.string().trim().min(1, "Add a subject line before sending.").max(150),
  bodyMarkdown: z.string().trim().min(1, "Add a message body before sending.").max(10000),
  segment: z.enum(EMAIL_SEGMENTS as [EmailSegment, ...EmailSegment[]]).default("all"),
  bannerImageUrl: z.string().trim().url("Banner image must be a valid https:// URL.").or(z.literal("")).optional(),
  buttonText: z.string().trim().max(40, "Button text is too long.").or(z.literal("")).optional(),
  buttonUrl: z.string().trim().url("Button link must be a valid https:// URL.").or(z.literal("")).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #8b5cf6.")
    .or(z.literal(""))
    .optional(),
});

const SEND_DELAY_MS = 250;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Add a subject and message before sending." },
      { status: 400 }
    );
  }

  const recipients = recipientsForSegment(parsed.data.segment);
  const bannerImageUrl = parsed.data.bannerImageUrl || null;
  const buttonText = parsed.data.buttonText || null;
  const buttonUrl = parsed.data.buttonUrl || null;
  const accentColor = parsed.data.accentColor || null;

  // History row is written synchronously, before any sending happens --
  // same reasoning as nudges: the campaign shows up in "Previously sent"
  // right away, and recipient_count reflects the audience at send time
  // even if some individual sends fail below.
  const campaign = createCampaign({
    subject: parsed.data.subject,
    body: parsed.data.bodyMarkdown,
    segment: parsed.data.segment,
    recipientCount: recipients.length,
    bannerImageUrl,
    buttonText,
    buttonUrl,
    accentColor,
  });

  // Fire-and-forget: sent one recipient at a time (never batched into one
  // SES call across real users -- privacy, and each person needs their own
  // unsubscribe link) with a small delay between sends to stay comfortably
  // under typical SES rate limits. Not awaited, so the HTTP response
  // returns immediately instead of holding the request open for however
  // long a few hundred sequential sends takes.
  (async () => {
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const ok = await sendCampaignEmail({
        toEmail: recipient.email,
        toUserId: recipient.id,
        firstName: recipient.firstName,
        subject: parsed.data.subject,
        bodyMarkdown: parsed.data.bodyMarkdown,
        bannerImageUrl,
        buttonText,
        buttonUrl,
        accentColor,
      });
      if (ok) sent++;
      else failed++;
      await sleep(SEND_DELAY_MS);
    }
    console.log(`Email campaign ${campaign.id}: sent ${sent}, failed ${failed} (of ${recipients.length}).`);
  })().catch((e) => {
    console.error("Email campaign send loop failed:", e);
    Sentry.captureException(e);
  });

  return NextResponse.json({ campaign });
}
