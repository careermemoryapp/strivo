import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getStoryBatch, listStoryBatchItems } from "@/lib/repo/storyBatches";
import { processStoryBatch } from "@/lib/storyBatchProcessor";
import { getMemoryById } from "@/lib/repo/memories";
import { safeJsonParse } from "@/lib/utils";

// Polled by the client (see app/(app)/record/page.tsx) while a batch is
// 'processing' -- a plain read, safe to stop calling (the app backgrounds)
// and safe to resume calling (the app foregrounds again) at any point,
// since it never drives the work itself. That's the actual fix for the
// founder-reported bug this batch system exists for: progress no longer
// depends on the client staying around (see story_batches' comment in
// lib/db.ts).
//
// Also doubles as the self-healing check: if this batch is still
// 'processing' and its claim has gone stale (see claimStoryBatch in
// lib/repo/storyBatches.ts), something interrupted the server-side work --
// most likely a deploy's pm2 reload landing mid-batch -- and this re-kicks
// processStoryBatch (again undetached) so the next poll sees it moving
// again, without the client having to do anything special.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const batch = getStoryBatch(userId, id);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  if (batch.status === "processing") {
    processStoryBatch(id).catch(() => {
      // Same backstop as POST /api/memories/batch -- claimStoryBatch inside
      // processStoryBatch is what actually decides whether this call does
      // anything (a no-op if another attempt is already active).
    });
  }

  const items = listStoryBatchItems(id);
  const completedCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;

  // Flattened across every 'done' item -- same aggregate the old client
  // loop built as it went (allMilestones in the pre-batch createMemory),
  // just assembled here instead since the client never sees each story's
  // individual save response anymore. Only meaningful once the whole batch
  // is done, same as the milestone popup only firing on the finished
  // success screen -- see the comment on story_batch_items.milestones.
  const milestones =
    batch.status === "completed" ? items.flatMap((i) => safeJsonParse<string[]>(i.milestones, [])) : [];

  return NextResponse.json({
    status: batch.status,
    total: batch.total,
    completedCount,
    failedCount,
    milestones,
    items: items.map((i) => {
      // Competencies come from the created memory row itself, not stored
      // redundantly on story_batch_items -- only relevant once an item is
      // 'done', for the same chip display the single-memory success screen
      // already uses (see splitMemories in app/(app)/record/page.tsx).
      const memory = i.status === "done" && i.memory_id ? getMemoryById(userId, i.memory_id) : null;
      return {
        title: i.title,
        status: i.status,
        memoryId: i.memory_id,
        competencies: memory ? safeJsonParse<string[]>(memory.competencies, []) : [],
      };
    }),
  });
}
