import { getDb, newId, nowIso } from "@/lib/db";

// See the story_batches/story_batch_items comment in lib/db.ts for why this
// table pair exists. This module is the storage layer only -- the actual
// per-story AI work lives in lib/storyBatchProcessor.ts, and the HTTP
// surface is POST /api/memories/batch + GET /api/memories/batch/[id].

export type StoryBatchStatus = "processing" | "completed";
export type StoryBatchItemStatus = "pending" | "done" | "failed";

export type StoryBatch = {
  id: string;
  user_id: string;
  status: StoryBatchStatus;
  total: number;
  claimed_at: string | null;
  created_at: string;
  completed_at: string | null;
};

export type StoryBatchItem = {
  id: string;
  batch_id: string;
  ordinal: number;
  title: string;
  content: string;
  status: StoryBatchItemStatus;
  memory_id: string | null;
  milestones: string | null; // JSON string array -- see the column comment in lib/db.ts
  error: string | null;
};

// How long a claim on a batch is honored before another process is allowed
// to pick it back up -- see claimStoryBatch below. Well above how long one
// story's AI calls (metadata + embedding) normally take, so a batch that's
// genuinely still being worked never gets stolen out from under itself
// (processStoryBatch re-claims/"touches" the lease before each item -- see
// its own comment); short enough that a batch orphaned by a mid-processing
// server restart gets picked back up again within one polite wait, the
// next time anyone checks its status.
const CLAIM_STALE_MS = 25_000;

export function createStoryBatch(userId: string, stories: { title: string; content: string }[]): StoryBatch {
  const db = getDb();
  const id = newId("batch");
  const ts = nowIso();
  db.prepare(`INSERT INTO story_batches (id, user_id, status, total, created_at) VALUES (?, ?, 'processing', ?, ?)`).run(
    id,
    userId,
    stories.length,
    ts
  );
  const insertItem = db.prepare(
    `INSERT INTO story_batch_items (id, batch_id, ordinal, title, content, status) VALUES (?, ?, ?, ?, ?, 'pending')`
  );
  stories.forEach((story, i) => {
    insertItem.run(newId("bitem"), id, i, story.title, story.content);
  });
  return getStoryBatch(userId, id)!;
}

export function getStoryBatch(userId: string, id: string): StoryBatch | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM story_batches WHERE id = ? AND user_id = ?`).get(id, userId) as StoryBatch | undefined;
}

// Unscoped by user -- only ever called from inside processStoryBatch itself
// (lib/storyBatchProcessor.ts), which already knows the batch id it was
// asked to process and isn't answering a user's HTTP request.
export function getStoryBatchById(id: string): StoryBatch | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM story_batches WHERE id = ?`).get(id) as StoryBatch | undefined;
}

export function listStoryBatchItems(batchId: string): StoryBatchItem[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM story_batch_items WHERE batch_id = ? ORDER BY ordinal ASC`).all(batchId) as StoryBatchItem[];
}

export function getNextPendingItem(batchId: string): StoryBatchItem | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM story_batch_items WHERE batch_id = ? AND status = 'pending' ORDER BY ordinal ASC LIMIT 1`)
    .get(batchId) as StoryBatchItem | undefined;
}

export function markStoryBatchItemDone(itemId: string, memoryId: string, milestones: string[]) {
  const db = getDb();
  db.prepare(`UPDATE story_batch_items SET status = 'done', memory_id = ?, milestones = ? WHERE id = ?`).run(
    memoryId,
    JSON.stringify(milestones),
    itemId
  );
}

export function markStoryBatchItemFailed(itemId: string, error: string) {
  const db = getDb();
  db.prepare(`UPDATE story_batch_items SET status = 'failed', error = ? WHERE id = ?`).run(error.slice(0, 500), itemId);
}

// Claims this batch for processing on the current server process, honoring
// CLAIM_STALE_MS above -- returns true if the caller now owns it (safe to
// start/resume processing), false if someone else claimed it recently
// enough that it's presumably still being actively worked.
export function claimStoryBatch(id: string): boolean {
  const db = getDb();
  const now = Date.now();
  const staleBefore = new Date(now - CLAIM_STALE_MS).toISOString();
  const result = db
    .prepare(
      `UPDATE story_batches SET claimed_at = ? WHERE id = ? AND status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)`
    )
    .run(new Date(now).toISOString(), id, staleBefore);
  return Number(result.changes ?? 0) === 1;
}

// Heartbeat for whoever currently owns the claim -- called before each item
// in processStoryBatch's loop so a slow batch doesn't get re-claimed out
// from under itself by a status poll arriving mid-item (see CLAIM_STALE_MS
// above). Unconditional on purpose: only the process that successfully won
// claimStoryBatch's initial claim calls this in its own loop, so there's no
// concurrent-owner race to guard against here in normal operation.
export function touchStoryBatch(id: string) {
  const db = getDb();
  db.prepare(`UPDATE story_batches SET claimed_at = ? WHERE id = ?`).run(nowIso(), id);
}

export function markStoryBatchCompleted(id: string) {
  const db = getDb();
  db.prepare(`UPDATE story_batches SET status = 'completed', completed_at = ? WHERE id = ?`).run(nowIso(), id);
}

// The most recent still-processing batch for this user, if any -- lets
// Record resurface "still saving stories from your last upload" (and
// silently resume polling it) even if the client lost track of the batch
// id itself -- a fresh page load, a different device, localStorage
// cleared. See the batchId recovery check in app/(app)/record/page.tsx.
export function getActiveStoryBatchForUser(userId: string): StoryBatch | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM story_batches WHERE user_id = ? AND status = 'processing' ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as StoryBatch | undefined;
}
