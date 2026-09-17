import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { isTrialExpired } from "@/lib/repo/users";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { createStoryBatch } from "@/lib/repo/storyBatches";
import { processStoryBatch } from "@/lib/storyBatchProcessor";

const MAX_STORIES = 30;

const batchSchema = z.object({
  stories: z
    .array(
      z.object({
        title: z.string().trim().max(120),
        content: z.string().trim().min(1),
      })
    )
    .min(2)
    .max(MAX_STORIES),
});

// Replaces the client's old "loop through POST /api/memories once per
// story" approach for a split document (see the split route's own comment
// for the full history). This endpoint does NO AI work itself -- it just
// writes the batch + its item rows (see story_batches in lib/db.ts) and
// returns immediately, then kicks off the real per-story AI work via
// processStoryBatch WITHOUT awaiting it, so that work keeps running on the
// server after this response has already gone out. The client is meant to
// call this once (right after POST /api/memories/split returns >= 2
// stories) and then poll GET /api/memories/batch/[id] for progress -- see
// app/(app)/record/page.tsx.
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { stories } = parsed.data;

  // Same two buckets POST /api/memories itself uses, weighted by story
  // count -- this batch is about to create up to `stories.length` real
  // memories, each with its own pair of OpenAI calls, so it should cost
  // exactly that many units of the same per-user/per-IP hourly budget, not
  // just 1 for the whole batch (see checkRateLimit's weight parameter in
  // lib/rateLimit.ts).
  const limited = rateLimitOrResponse(`memory-create:${userId}`, 60, 60 * 60 * 1000, stories.length);
  if (limited) return limited;
  const limitedByIp = rateLimitOrResponse(`memory-create-ip:${requestIp(req)}`, 300, 60 * 60 * 1000, stories.length);
  if (limitedByIp) return limitedByIp;

  const batch = createStoryBatch(userId, stories);

  // Deliberately not awaited -- see this function's own comment for why.
  processStoryBatch(batch.id).catch(() => {
    // processStoryBatch already catches and records every failure it can
    // attribute to a specific item; this is just a final backstop so a
    // truly unexpected throw here never becomes an unhandled rejection.
  });

  return NextResponse.json({ batchId: batch.id, total: batch.total });
}
