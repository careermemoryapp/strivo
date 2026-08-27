import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { transcribeAudio } from "@/lib/ai";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { isTrialExpired } from "@/lib/repo/users";

// Needs real fetch/File handling talking to OpenAI, not the edge runtime.
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI's own per-file limit for audio transcription

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Backstop for the (app)/layout.tsx page-level redirect -- see the same
  // check in api/memories/route.ts for why this needs to live here too,
  // not just on the page.
  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  // Admin kill switch (see lib/repo/featureFlags.ts) -- lets the founder
  // pause transcription/upload immediately if OpenAI is down or spending is
  // running away, without a redeploy.
  if (!isFeatureEnabled("uploads")) {
    return NextResponse.json(
      { error: "Voice transcription is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  // Each call costs real money against the OpenAI API — cap per-user abuse
  // (e.g. a compromised session or buggy client looping requests).
  const limited = rateLimitOrResponse(`transcribe:${userId}`, 30, 60 * 60 * 1000);
  if (limited) return limited;

  // Defense-in-depth on top of the per-user limit above.
  const limitedByIp = rateLimitOrResponse(`transcribe-ip:${requestIp(req)}`, 150, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long to transcribe in one go." }, { status: 400 });
  }

  const text = await transcribeAudio(audio);
  if (text === null) {
    return NextResponse.json(
      { error: "Couldn't transcribe that recording. Please try again." },
      { status: 502 }
    );
  }
  return NextResponse.json({ text });
}
