import { getDb, nowIso } from "@/lib/db";

// Tracks which chunk of the function grid app/api/opportunities/
// refresh-pool/run should process NEXT -- see that route and the
// refresh_pool_state comment in lib/db.ts for why this exists (pacing
// calls under Adzuna's daily/weekly limits, not just the monthly one).
// Single row, id fixed as "opportunities".

const STATE_ID = "opportunities";

export function getRefreshChunkIndex(): number {
  const db = getDb();
  const row = db.prepare(`SELECT chunk_index FROM refresh_pool_state WHERE id = ?`).get(STATE_ID) as
    | { chunk_index: number }
    | undefined;
  return row?.chunk_index ?? 0;
}

// Atomically claims the NEXT chunk to process AND advances the stored
// pointer, in one synchronous read-modify-write -- replaces the old
// separate getRefreshChunkIndex() (read, at the top of the route) /
// advanceRefreshChunkIndex() (write, only after ~240 Adzuna calls plus
// classification/logo work had all finished) pair, which had a real race:
// two overlapping invocations of the route -- a double click, a page
// refresh-and-reclick while the first request was still running (nothing
// disabled the button across a reload), or a manual click landing at the
// same moment as the cron -- would both read the SAME "current" chunk
// index near-instantly (before either had written anything back), so both
// spent 240 calls querying the SAME chunk (Adzuna returning mostly jobs
// already in the pool, hence calls going up with no growth in pool size --
// exactly a founder-reported symptom) while the chunk that should have run
// next got silently skipped. Doing the claim in ONE synchronous SQL
// statement (UPDATE ... RETURNING, no `await` anywhere inside this
// function) closes that window: node:sqlite calls are synchronous, so
// nothing else can interleave in the middle of it the way it can across
// the many `await`s in the rest of the route. Call this ONCE, at the very
// top of the route handler, before any async work.
//
// Returns the chunk index THIS call should process (the pointer's value
// before this claim), while leaving the stored value already advanced to
// (that + 1) % totalChunks for whoever claims next -- so a second,
// overlapping request that claims a moment later gets a DIFFERENT chunk
// instead of racing on the same one.
export function claimNextRefreshChunkIndex(totalChunks: number): number {
  const db = getDb();
  const ts = nowIso();
  const row = db
    .prepare(
      `INSERT INTO refresh_pool_state (id, chunk_index, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         chunk_index = (refresh_pool_state.chunk_index + 1) % ?,
         updated_at = excluded.updated_at
       RETURNING chunk_index`
    )
    .get(STATE_ID, 1 % totalChunks, ts, totalChunks) as { chunk_index: number };
  return (row.chunk_index - 1 + totalChunks) % totalChunks;
}
