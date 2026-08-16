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
