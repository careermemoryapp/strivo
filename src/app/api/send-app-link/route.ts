import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAppLinkEmail } from "@/lib/email";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { SINGULAR_TRACKING_LINK } from "@/lib/config";

// Backs the "email me the link instead" option in the QR modal
// (PlayStoreLink.tsx) -- the companion fix to the 2026-09-29 QR fallback
// for desktop/iOS visitors, who are the large majority of strivo.ai
// traffic per GA4's device-category report and can't install straight
// from a click. See emailAppLink.ts for the full reasoning.
//
// Reachable without a signed-in session on purpose -- this is for
// first-time visitors who don't have an account yet, same as the public
// /api/analytics/event route.
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

// Deliberately NOT accepting a destination URL from the client. The only
// thing this route does is email a link to an address someone typed in --
// if the destination were client-controlled, this would double as an open
// mailer anyone could point at an arbitrary URL and an arbitrary victim's
// inbox, sent from Strivo's own verified domain. Always sending the one
// fixed, trusted Singular link (the same one PlayStoreLink's QR code
// encodes by default) closes that off entirely while still preserving
// install attribution.
const DOWNLOAD_URL = SINGULAR_TRACKING_LINK;

export async function POST(req: Request) {
  // Two layers: per-IP catches one person spamming the form, per-email
  // catches the form being used to repeatedly email one address (loosely
  // weighted as abuse-resistance, not precise anti-spam).
  const ip = requestIp(req);
  const limitedByIp = rateLimitOrResponse(`send-app-link:ip:${ip}`, 8, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email } = parsed.data;
  const limitedByEmail = rateLimitOrResponse(`send-app-link:email:${email}`, 3, 60 * 60 * 1000);
  if (limitedByEmail) return limitedByEmail;

  const sent = await sendAppLinkEmail({ toEmail: email, downloadUrl: DOWNLOAD_URL });
  if (!sent) {
    return NextResponse.json({ error: "Couldn't send that email. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
