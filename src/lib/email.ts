import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import * as Sentry from "@sentry/nextjs";
import { createUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { personalize, renderMarkdownLiteToHtml, renderMarkdownLiteToText, wrapBrandedEmail } from "@/lib/emailTemplate";
import { renderWelcomeEmailHtml, renderWelcomeEmailText } from "@/lib/emailWelcome";

// Sends outbound email via AWS SES. Uses the standard AWS SDK env vars
// (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) so it picks up
// credentials the same way any AWS SDK client would. SES_FROM_EMAIL is the
// verified SES identity we send from; SES_TO_EMAIL is where inbound
// inquiries land (both default to hello@strivo.ai — same inbox).
const REGION = process.env.AWS_REGION || "us-east-1";
const FROM_ADDRESS = process.env.SES_FROM_EMAIL || "hello@strivo.ai";
const TO_EMAIL = process.env.SES_TO_EMAIL || "hello@strivo.ai";

// Recipients previously saw just the raw address ("hello@strivo.ai") as
// the sender, which most mail clients render as the literal local-part
// "hello" with no company name attached. Wrapping it in a display name
// (RFC 5322 "Name <email>" form, which SES's Source field accepts
// directly) makes every email -- support replies, password resets, and
// campaigns alike -- show up as "Strivo" in the inbox instead.
const FROM_EMAIL = `Strivo <${FROM_ADDRESS}>`;

// Exported so the admin campaign-send route can warn upfront ("SES isn't
// configured yet") instead of discovering it partway through a send loop.
export function sesConfigured(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
}

// Best-effort origin for building absolute links (unsubscribe) inside
// campaign emails. Falls back to the production domain if not set --
// emails are never sent from a preview/staging deploy in practice, but
// this keeps the link correct even if that ever changes.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";

let client: SESClient | null = null;
function getClient(): SESClient {
  if (!client) client = new SESClient({ region: REGION });
  return client;
}

export async function sendSupportEmail(params: {
  fromUserEmail: string;
  subject?: string;
  message: string;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping email send.");
    return false;
  }

  const subjectLine = params.subject?.trim()
    ? `[Strivo Support] ${params.subject.trim()}`
    : "[Strivo Support] New inquiry";

  const body = `From: ${params.fromUserEmail}\n\n${params.message}`;

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [TO_EMAIL] },
        ReplyToAddresses: [params.fromUserEmail],
        Message: {
          Subject: { Data: subjectLine, Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      })
    );
    return true;
  } catch (e) {
    console.error("Failed to send support email via SES:", e);
    Sentry.captureException(e);
    return false;
  }
}

// Sends the password-reset link to the account owner's own email address
// (not to the shared support inbox). This replaces the earlier MVP
// shortcut of returning the reset link directly in the API response —
// that shortcut let anyone reset any account's password just by knowing
// the email address, since no email delivery was actually required to
// complete the flow. Returns false (rather than throwing) if SES isn't
// configured or the send fails, so callers can log/monitor without
// crashing the request.
export async function sendPasswordResetEmail(params: { toEmail: string; resetUrl: string }): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — cannot send password reset email.");
    return false;
  }

  const body = `We got a request to reset your Strivo password.\n\nReset it here (this link expires soon and can only be used once):\n${params.resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`;

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: "Reset your Strivo password", Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      })
    );
    return true;
  } catch (e) {
    console.error("Failed to send password reset email via SES:", e);
    Sentry.captureException(e);
    return false;
  }
}

// Sends one marketing/broadcast email to one recipient -- see
// /api/admin/email-campaign for the loop that calls this once per
// recipient (never batched into one SES call across real users, both for
// privacy and because each recipient needs their own unsubscribe link).
// {{firstName}} in the subject/body markdown is personalized per
// recipient before rendering. Returns false (never throws) on failure so
// a single bad address can't abort the rest of a campaign send.
// Sends the one-time automatic welcome email fired the moment a brand-new
// user account is created (see the signIn callback in lib/auth.ts, which
// calls this un-awaited/fire-and-forget right after createUser() so a
// slow or failed send can never delay or block the sign-in response).
// Deliberately separate from sendCampaignEmail: this isn't a marketing
// send (no unsubscribe link, no segment, no admin-composed content) --
// it's a fixed, transactional message using its own template
// (renderWelcomeEmailHtml/Text in emailWelcome.ts). Never throws; returns
// false on any failure so the caller can log without risking the signup
// flow itself.
export async function sendWelcomeEmail(params: { toEmail: string; firstName: string }): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping welcome email.");
    return false;
  }

  const name = params.firstName.trim() || "there";

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: "Welcome to Strivo", Charset: "UTF-8" },
          Body: {
            Html: { Data: renderWelcomeEmailHtml(name), Charset: "UTF-8" },
            Text: { Data: renderWelcomeEmailText(name), Charset: "UTF-8" },
          },
        },
      })
    );
    console.log(`Welcome email sent to ${params.toEmail} via SES.`);
    return true;
  } catch (e) {
    console.error(`Failed to send welcome email to ${params.toEmail} via SES:`, e);
    Sentry.captureException(e);
    return false;
  }
}

export async function sendCampaignEmail(params: {
  toEmail: string;
  toUserId: string;
  firstName: string;
  subject: string;
  bodyMarkdown: string;
  bannerImageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  accentColor?: string | null;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping campaign email.");
    return false;
  }

  const subject = personalize(params.subject, params.firstName);
  const bodyMarkdown = personalize(params.bodyMarkdown, params.firstName);
  const unsubscribeUrl = `${APP_ORIGIN}/api/email/unsubscribe?t=${createUnsubscribeToken(params.toUserId)}`;
  const html = wrapBrandedEmail({
    bodyHtml: renderMarkdownLiteToHtml(bodyMarkdown),
    unsubscribeUrl,
    accentColor: params.accentColor,
    bannerImageUrl: params.bannerImageUrl,
    buttonText: params.buttonText,
    buttonUrl: params.buttonUrl,
  });
  // Plain-text fallback: the banner image has no text equivalent (skipped
  // entirely), but the button becomes a plain "text — url" line so the
  // call-to-action still comes through for clients that render Text over
  // Html.
  const buttonLine =
    params.buttonText?.trim() && params.buttonUrl?.trim() ? `\n${params.buttonText.trim()}: ${params.buttonUrl.trim()}\n` : "";
  const text = `${renderMarkdownLiteToText(bodyMarkdown)}\n${buttonLine}\n---\nUnsubscribe from marketing emails: ${unsubscribeUrl}`;

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      })
    );
    return true;
  } catch (e) {
    console.error(`Failed to send campaign email to ${params.toEmail} via SES:`, e);
    Sentry.captureException(e);
    return false;
  }
}
