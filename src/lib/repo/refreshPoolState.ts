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

// Wraps back to 0 after the last chunk -- one full pass over every
// function completes, then the next invocation starts the next pass from
// the beginning. totalChunks is passed in (rather than hardcoded here) so
// this file doesn't need to know the grid's actual size.
export function advanceRefreshChunkIndex(totalChunks: number): void {
  const db = getDb();
  const next = (getRefreshChunkIndex() + 1) % totalChunks;
  db.prepare(
    `INSERT INTO refresh_pool_state (id, chunk_index, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET chunk_index = excluded.chunk_index, updated_at = excluded.updated_at`
  ).run(STATE_ID, next, nowIso());
}
