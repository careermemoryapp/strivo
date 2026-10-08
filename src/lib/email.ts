import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import * as Sentry from "@sentry/nextjs";
import { createUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { personalize, renderCampaignBodyHtml, htmlToPlainText, wrapBrandedEmail } from "@/lib/emailTemplate";
import { renderWelcomeEmailHtml, renderWelcomeEmailText } from "@/lib/emailWelcome";
import { renderFoundingMemberWelcomeEmailHtml, renderFoundingMemberWelcomeEmailText } from "@/lib/emailFoundingMemberWelcome";
import { renderGiftEmailHtml, renderGiftEmailText, type GiftPlan } from "@/lib/emailGift";
import { renderProductUpdateEmailHtml, renderProductUpdateEmailText } from "@/lib/emailProductUpdate";
import { getOrCreateFoundingMemberShare } from "@/lib/repo/foundingMember";
import { FOUNDING_MEMBER_CAP } from "@/lib/config";

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

// Sent automatically the moment a brand-new signup lands inside the first
// FOUNDING_MEMBER_CAP accounts (see the signIn callback in lib/auth.ts,
// which checks dbUser.founding_member_number !== null right after
// createUser() and fires this un-awaited/fire-and-forget alongside
// sendWelcomeEmail -- founder's own words, 2026-10-08: "as soon as
// somebody registered within the first 1000, they receive a mail of
// becoming the founding member"). Deliberately separate from
// sendWelcomeEmail: that one explains how the product works for everyone;
// this one is the special-status notification, with the recipient's own
// real card, sent only to the subset who actually qualify.
//
// toUserId must already be known to have a founding_member_number (the
// caller's job to check -- see repo/users.ts' createUser()) -- but this
// still defends itself: getOrCreateFoundingMemberShare returns null for
// anyone who somehow doesn't qualify, and this bails out rather than
// sending a card-less "Founding Member" email with a broken image. Never
// throws; returns false on any failure (including "doesn't qualify") so
// the caller can log without risking the signup flow itself.
export async function sendFoundingMemberWelcomeEmail(params: {
  toEmail: string;
  toUserId: string;
  firstName: string;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping founding member welcome email.");
    return false;
  }

  const share = getOrCreateFoundingMemberShare(params.toUserId);
  if (!share) {
    console.error(`sendFoundingMemberWelcomeEmail called for ${params.toUserId}, who has no founding_member_number — skipping.`);
    return false;
  }

  const name = params.firstName.trim() || "there";
  const cardUrl = `${APP_ORIGIN}/api/founding-member/share-image/${share.id}`;
  const emailParams = { firstName: name, memberNumber: share.member_number, cap: FOUNDING_MEMBER_CAP, cardUrl };

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: `You're officially Strivo Founding Member #${share.member_number}`, Charset: "UTF-8" },
          Body: {
            Html: { Data: renderFoundingMemberWelcomeEmailHtml(emailParams), Charset: "UTF-8" },
            Text: { Data: renderFoundingMemberWelcomeEmailText(emailParams), Charset: "UTF-8" },
          },
        },
      })
    );
    console.log(`Founding member welcome email sent to ${params.toEmail} (#${share.member_number}) via SES.`);
    return true;
  } catch (e) {
    console.error(`Failed to send founding member welcome email to ${params.toEmail} via SES:`, e);
    Sentry.captureException(e);
    return false;
  }
}

// Sent the moment an admin grants a comped Strivo Plus account (see
// /api/admin/users/[id]/route.ts's PATCH handler, triggered by the Grant
// Monthly/Grant Yearly buttons in the admin panel). Deliberately separate
// from sendWelcomeEmail/sendCampaignEmail: it's transactional, tied to one
// specific admin action, and uses its own template (emailGift.ts) whose
// wording mirrors the in-app "gifted" messaging on
// settings/subscription/page.tsx. Never throws; returns false on any
// failure so a failed send can't block the admin's grant action itself.
export async function sendGiftEmail(params: {
  toEmail: string;
  firstName: string;
  plan: GiftPlan;
  priceLabel: string;
  renewalDateIso: string;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping gift email.");
    return false;
  }

  const name = params.firstName.trim() || "there";
  const planName = params.plan === "annual" ? "Annual" : "Monthly";

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: `You've been gifted Strivo Plus (${planName})`, Charset: "UTF-8" },
          Body: {
            Html: {
              Data: renderGiftEmailHtml({
                firstName: name,
                plan: params.plan,
                priceLabel: params.priceLabel,
                renewalDateIso: params.renewalDateIso,
              }),
              Charset: "UTF-8",
            },
            Text: {
              Data: renderGiftEmailText({
                firstName: name,
                plan: params.plan,
                priceLabel: params.priceLabel,
                renewalDateIso: params.renewalDateIso,
              }),
              Charset: "UTF-8",
            },
          },
        },
      })
    );
    console.log(`Gift email sent to ${params.toEmail} via SES.`);
    return true;
  } catch (e) {
    console.error(`Failed to send gift email to ${params.toEmail} via SES:`, e);
    Sentry.captureException(e);
    return false;
  }
}

// Sent once a day per user by the Product Updates drip cron (see
// /api/product-update-drip/run) -- each recipient gets whichever Product
// Updates post is next in THEIR OWN sequence (see
// listUsersDueForProductUpdateDrip/markProductUpdateSent in repo/users.ts),
// with the full article body embedded in the email itself rather than just
// a link, per the founder's explicit call that a mere "read more" link
// wouldn't get opened. Subject is literally the post's title. Respects the
// same email_opt_out unsubscribe flag every other campaign/marketing send
// does (filtered at the query level in listUsersDueForProductUpdateDrip,
// same as recipientsForSegment() in emailCampaigns.ts) -- also carries a
// real per-user unsubscribe link in the footer like every other marketing
// email. Never throws; returns false on any failure so one bad send can't
// abort the rest of the day's batch.
export async function sendProductUpdateEmail(params: {
  toEmail: string;
  toUserId: string;
  firstName: string;
  postTitle: string;
  postExcerpt: string;
  postContentHtml: string;
  postUrl: string;
  // From the post's cta_label/cta_path columns (see repo/blogPosts.ts) --
  // both undefined for posts published before this existed, or any post
  // the writing automation didn't set them on. Falls back to a generic
  // "Open Strivo" -> /home CTA in that case rather than requiring every
  // caller to duplicate that fallback.
  ctaLabel?: string;
  ctaPath?: string;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping product update email.");
    return false;
  }

  const name = params.firstName.trim() || "there";
  const unsubscribeUrl = `${APP_ORIGIN}/api/email/unsubscribe?t=${createUnsubscribeToken(params.toUserId)}`;
  const ctaLabel = params.ctaLabel?.trim() || "Open Strivo";
  const ctaUrl = `${APP_ORIGIN}${params.ctaPath?.trim() || "/home"}`;

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [params.toEmail] },
        Message: {
          Subject: { Data: params.postTitle, Charset: "UTF-8" },
          Body: {
            Html: {
              Data: renderProductUpdateEmailHtml({
                firstName: name,
                postTitle: params.postTitle,
                postExcerpt: params.postExcerpt,
                postContentHtml: params.postContentHtml,
                postUrl: params.postUrl,
                unsubscribeUrl,
                ctaLabel,
                ctaUrl,
              }),
              Charset: "UTF-8",
            },
            Text: {
              Data: renderProductUpdateEmailText({
                firstName: name,
                postTitle: params.postTitle,
                postExcerpt: params.postExcerpt,
                postContentHtml: params.postContentHtml,
                postUrl: params.postUrl,
                unsubscribeUrl,
                ctaLabel,
                ctaUrl,
              }),
              Charset: "UTF-8",
            },
          },
        },
      })
    );
    console.log(`Product update email sent to ${params.toEmail} via SES.`);
    return true;
  } catch (e) {
    console.error(`Failed to send product update email to ${params.toEmail} via SES:`, e);
    Sentry.captureException(e);
    return false;
  }
}

export async function sendCampaignEmail(params: {
  toEmail: string;
  toUserId: string;
  firstName: string;
  subject: string;
  bodyHtml: string;
  bannerImageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  accentColor?: string | null;
}): Promise<boolean> {
  if (!sesConfigured()) {
    console.error("SES not configured (missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping campaign email.");
    return false;
  }

  // Per-recipient Founding Member badge -- added 2026-10-06, direct founder
  // request: "send mail to founding member with their badge in the email."
  // getOrCreateFoundingMemberShare returns null for anyone without a
  // founding_member_number (everyone outside the "founding_member" segment,
  // see EMAIL_SEGMENTS in repo/emailCampaigns.ts), in which case
  // {{foundingMemberCardUrl}} falls back to the generic, non-personalized
  // public preview image rather than a broken <img> -- this function has no
  // way to know which segment an admin picked, so it has to stay correct
  // even if {{foundingMemberCardUrl}} ends up in a body sent to "all".
  // {{foundingMemberNumber}} is the plain number alone, for copy like
  // "You're Founding Member #{{foundingMemberNumber}}" -- empty string (not
  // "null") when the recipient doesn't have one, so the sentence can be
  // written to read sensibly either way rather than printing "null".
  const foundingShare = getOrCreateFoundingMemberShare(params.toUserId);
  const foundingCardUrl = foundingShare
    ? `${APP_ORIGIN}/api/founding-member/share-image/${foundingShare.id}`
    : `${APP_ORIGIN}/api/public/founding-member-preview-image`;
  const foundingNumber = foundingShare ? String(foundingShare.member_number) : "";

  function withFoundingMemberTokens(input: string): string {
    return input
      .replace(/\{\{foundingMemberCardUrl\}\}/g, foundingCardUrl)
      .replace(/\{\{foundingMemberNumber\}\}/g, foundingNumber);
  }

  const subject = withFoundingMemberTokens(personalize(params.subject, params.firstName));
  const bodyHtml = withFoundingMemberTokens(personalize(params.bodyHtml, params.firstName));
  const unsubscribeUrl = `${APP_ORIGIN}/api/email/unsubscribe?t=${createUnsubscribeToken(params.toUserId)}`;
  const html = wrapBrandedEmail({
    bodyHtml: renderCampaignBodyHtml(bodyHtml),
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
  const text = `${htmlToPlainText(bodyHtml)}\n${buttonLine}\n---\nUnsubscribe from marketing emails: ${unsubscribeUrl}`;

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
