import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { synthesizeSpeech } from "@/lib/ai";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { isTrialExpired } from "@/lib/repo/users";

// Needs real fetch/Buffer handling talking to OpenAI, not the edge runtime
// -- same reasoning as api/memories/transcribe/route.ts.
export const runtime = "nodejs";

// OpenAI's tts-1 hard cap is 4096 characters per request -- capped a little
// under that so our own error message fires before OpenAI's less friendly
// one would.
const MAX_CHARS = 4000;

// This is only ever hit as a *fallback* -- ChatBubble.tsx's speak button
// tries the browser's free speechSynthesis first and only calls this route
// when that silently fails (mainly some Android WebViews). So traffic here
// should be a small fraction of total "Listen" taps, not every one.
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same trial-expiry backstop as every other OpenAI-backed route -- see
  // api/memories/transcribe/route.ts for why this needs to live here too,
  // not just on the page.
  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  // Admin kill switch (see lib/repo/featureFlags.ts) -- lets the founder
  // pause this instantly if OpenAI is down or spending is running away,
  // without a redeploy. The free speechSynthesis path in ChatBubble.tsx
  // still works fine with this off; only the fallback is affected.
  if (!isFeatureEnabled("chat_tts")) {
    return NextResponse.json(
      { error: "Reading replies aloud isn't supported here right now." },
      { status: 503 }
    );
  }

  // Each call costs real money against the OpenAI API. Generous headroom
  // since this route should only ever see fallback traffic, not every tap.
  const limited = rateLimitOrResponse(`speak:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  // Defense-in-depth on top of the per-user limit above.
  const limitedByIp = rateLimitOrResponse(`speak-ip:${requestIp(req)}`, 200, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: "That reply is too long to read aloud in one go." }, { status: 400 });
  }

  const audio = await synthesizeSpeech(text);
  if (!audio) {
    return NextResponse.json({ error: "Couldn't generate audio for that reply. Please try again." }, { status: 502 });
  }

  // NextResponse's BodyInit typing doesn't accept a Node Buffer directly
  // (it resolves to the URLSearchParams overload and rejects it) -- a plain
  // Uint8Array view over the same bytes satisfies it with no copy.
  return new NextResponse(new Uint8Array(audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      // Private (per-user, auth-gated response) rather than a shared/CDN
      // cache -- just lets a quick double-tap on the same reply reuse the
      // browser's own cache instead of re-billing OpenAI.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
