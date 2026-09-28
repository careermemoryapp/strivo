import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { addToIosWaitlist } from "@/lib/repo/iosWaitlist";

// Public, unauthenticated -- same shape as
// api/public/career-profile/[quizId]/score/route.ts: a marketing-site
// visitor who isn't signed in (most of them, by definition, since they're
// still deciding whether to get the app) submits this straight from
// PlayStoreLink.tsx's "iOS coming soon" prompt. Deliberately no email
// confirmation/verification step here -- this collects intent to notify
// later, not an account; a mistyped address just means that one person
// doesn't hear back, nothing worse.
const schema = z.object({
  email: z.string().trim().email().max(320),
  location: z.string().trim().max(60).optional(),
  pagePath: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const limited = rateLimitOrResponse(`ios-waitlist:${requestIp(req)}`, 10, 60 * 60 * 1000);
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  addToIosWaitlist({
    email: parsed.data.email,
    location: parsed.data.location,
    pagePath: parsed.data.pagePath,
  });

  return NextResponse.json({ ok: true });
}
