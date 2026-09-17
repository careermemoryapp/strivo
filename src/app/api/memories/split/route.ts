import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { splitDocumentIntoStories } from "@/lib/ai";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { isTrialExpired } from "@/lib/repo/users";

// Below this many characters, a file upload essentially never turns out to
// be a genuine multi-story collection (a one-page job description, a
// certificate, a short cover letter) -- skip the AI call entirely for
// those, rather than spending latency/cost checking something that was
// never going to split. Long, story-rich documents (the 35-page
// career-history case this was built for) clear this easily.
const MIN_CHARS_FOR_SPLIT_CHECK = 3000;

const splitSchema = z.object({
  transcript: z.string().trim().min(1),
});

// A deliberately tiny, standalone endpoint -- ONE AI call, no DB writes at
// all -- kept separate from POST /api/memories on purpose. This used to be
// the first step of a single giant request that then went on to create
// every split-out story in the same request (looping through up to 30
// sequential metadata+embedding AI-call pairs). On a genuinely story-rich
// document that request could run long enough for the reverse proxy in
// front of the app to give up and hand the client its own HTML error page
// mid-upload, even though the document had, in fact, finished saving
// server-side (confirmed 2026-09-17 -- a 35-story upload came back with
// "Unexpected token '<' ... is not valid JSON" on the client while every
// story had actually been written to the DB). Splitting the flow in two --
// this endpoint just detects and returns the story list, and the client
// then calls the existing, already-fast single-memory POST /api/memories
// once per story (see createMemory in app/(app)/record/page.tsx) -- means
// no single request ever does more than one memory's worth of AI work, so
// there's nothing left for a proxy timeout to catch mid-flight.
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  // One AI call per request -- generous cap, since this only ever fires
  // once per document upload (a normal user never gets near it).
  const limited = rateLimitOrResponse(`memory-split:${userId}`, 40, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = splitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { transcript } = parsed.data;
  if (transcript.length < MIN_CHARS_FOR_SPLIT_CHECK) {
    return NextResponse.json({ stories: [] });
  }

  const storySegments = await splitDocumentIntoStories(transcript);
  return NextResponse.json({ stories: storySegments && storySegments.length >= 2 ? storySegments : [] });
}
