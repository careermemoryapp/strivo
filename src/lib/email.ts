import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Sends outbound email via AWS SES. Uses the standard AWS SDK env vars
// (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) so it picks up
// credentials the same way any AWS SDK client would. SES_FROM_EMAIL is the
// verified SES identity we send from; SES_TO_EMAIL is where inbound
// inquiries land (both default to hello@strivo.ai — same inbox).
const REGION = process.env.AWS_REGION || "us-east-1";
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "hello@strivo.ai";
const TO_EMAIL = process.env.SES_TO_EMAIL || "hello@strivo.ai";

function sesConfigured(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
}

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
    return false;
  }
}
