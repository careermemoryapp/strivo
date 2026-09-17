import {
  getStoryBatchById,
  getNextPendingItem,
  markStoryBatchItemDone,
  markStoryBatchItemFailed,
  claimStoryBatch,
  touchStoryBatch,
  markStoryBatchCompleted,
} from "@/lib/repo/storyBatches";
import { persistOneMemory, generateMetadataAndEmbedding, fallbackTitle } from "@/lib/memoryCreation";
import { getUserById } from "@/lib/repo/users";
import { listProjects } from "@/lib/repo/projects";

// The actual per-story work for a split document's batch -- see the
// story_batches comment in lib/db.ts for the full "why". Called two ways:
// (1) detached (not awaited) right after POST /api/memories/batch creates
// the batch rows, so the HTTP response to the client goes out immediately
// and this keeps running on the server regardless of what the client does
// next; (2) re-triggered, also detached, from GET /api/memories/batch/[id]
// whenever that poll notices a 'processing' batch whose claim has gone
// stale (see claimStoryBatch) -- this is what recovers a batch that was
// orphaned by something rarer, like a pm2 reload landing mid-batch during
// a deploy.
//
// Deliberately NOT awaited by either caller: this file's own promise chain
// is the thing that keeps running after the request that started it has
// already responded. Every error path below is caught internally (a failed
// item is marked 'failed' and the loop moves on) specifically so this
// promise never rejects somewhere nothing is listening for it.
export async function processStoryBatch(batchId: string): Promise<void> {
  if (!claimStoryBatch(batchId)) {
    // Someone else (an earlier detached call, or another process) already
    // holds an active claim on this batch -- nothing to do here.
    return;
  }

  try {
    const batch = getStoryBatchById(batchId);
    if (!batch) return;

    // Best-effort, same as the single-memory POST /api/memories path --
    // a lookup miss just means praise/reflectiveQuestion fall back to no
    // name for this batch's stories.
    const firstName = getUserById(batch.user_id)?.first_name ?? null;

    for (;;) {
      // Re-fetch the next pending item each iteration rather than
      // snapshotting the whole list up front -- mirrors the original
      // client-driven loop's behavior exactly (each story was its own POST
      // /api/memories request) and means a batch resumed after an
      // orphaned claim picks up wherever the earlier attempt left off,
      // never redoing an item already marked done/failed.
      const item = getNextPendingItem(batchId);
      if (!item) break;

      // Heartbeat the claim before each item -- see touchStoryBatch's own
      // comment. Keeps a slow batch from being re-claimed by a concurrent
      // status poll while a story's AI calls are still in flight.
      touchStoryBatch(batchId);

      try {
        // Re-read existing projects each iteration too, same reasoning:
        // the original per-request endpoint always fetched this fresh, so
        // a project suggested/created earlier in THIS batch is visible to
        // later stories in it, not just to stories from other uploads.
        const existingProjects = listProjects(batch.user_id);
        const existingProjectNames = existingProjects.map((p) => p.name);
        const title = item.title.trim() || fallbackTitle(item.content);

        const { metadata, embedding } = await generateMetadataAndEmbedding(
          item.content,
          title,
          firstName,
          existingProjectNames
        );
        const { memory, milestones } = await persistOneMemory({
          userId: batch.user_id,
          transcript: item.content,
          initialTitle: title,
          userProvidedTitle: item.title,
          source: "file",
          metadata,
          embedding,
        });
        markStoryBatchItemDone(item.id, memory.id, milestones);
      } catch (err) {
        markStoryBatchItemFailed(item.id, err instanceof Error ? err.message : "Failed to save this story");
      }
    }

    markStoryBatchCompleted(batchId);
  } catch {
    // Nothing left to safely do here -- any individual item failure is
    // already caught and recorded above, so reaching this outer catch
    // means something broke around the loop itself (e.g. the batch row
    // vanished mid-run). Leave the batch as 'processing': the stale claim
    // will let a later status poll pick it back up and try again rather
    // than silently declaring it complete when it wasn't.
  }
}
