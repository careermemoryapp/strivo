import { getDb, newId, nowIso } from "@/lib/db";

export type UnderplayedWinCallout = {
  id: string;
  user_id: string;
  memory_id: string;
  message_text: string;
  created_at: string;
};

// How rare this needs to be to still feel like a genuine, spontaneous
// "someone noticed" moment instead of a recurring notification -- see the
// design note in generateUnderplayedWinCallout (lib/ai.ts). Deliberately
// longer than the weekly recap's cadence and in the same ballpark as the
// growth narrative's re-trigger window (see MIN_DAYS_FOR_RETRIGGER in
// growthNarratives.ts), since both are "rare and earned" features -- but
// this one has no volume-based re-trigger at all (unlike growth narratives'
// "8 new memories" shortcut): a real backlog of unsurfaced candidates simply
// waits its turn rather than firing early just because there's a lot piled
// up, so it never fires twice in the same short window even for a very
// active user.
const MIN_DAYS_BETWEEN_CALLOUTS = 12;

export function createUnderplayedWinCallout(input: {
  userId: string;
  memoryId: string;
  messageText: string;
}): UnderplayedWinCallout {
  const db = getDb();
  const id = newId("upw");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO underplayed_win_callouts (id, user_id, memory_id, message_text, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.memoryId, input.messageText, ts);
  return db.prepare(`SELECT * FROM underplayed_win_callouts WHERE id = ?`).get(id) as UnderplayedWinCallout;
}

// IMPORTANT: scoped by user_id, same invariant as every other repo read in
// this app.
export function getLatestUnderplayedWinCallout(userId: string): UnderplayedWinCallout | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM underplayed_win_callouts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as UnderplayedWinCallout | undefined;
}

// Cheap per-user pre-filter for the daily/periodic automation (see
// app/api/underplayed-win/run) -- checked BEFORE spending an AI call on a
// candidate batch, same shape as shouldGenerateGrowthNarrative in
// growthNarratives.ts. Whether there's actually a good candidate this cycle
// is a separate question, answered by listSelfMinimizedCandidates
// (lib/repo/memories.ts) plus generateUnderplayedWinCallout (lib/ai.ts) --
// this only answers "is this user even eligible to be surfaced one right
// now."
export function shouldSurfaceUnderplayedWin(userId: string): boolean {
  const latest = getLatestUnderplayedWinCallout(userId);
  if (!latest) return true;
  const daysSinceLast = (Date.now() - new Date(latest.created_at).getTime()) / (24 * 60 * 60 * 1000);
  return daysSinceLast >= MIN_DAYS_BETWEEN_CALLOUTS;
}
