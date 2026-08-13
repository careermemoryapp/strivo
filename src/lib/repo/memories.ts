import { getDb, newId, nowIso } from "@/lib/db";

export type Memory = {
  id: string;
  user_id: string;
  title: string;
  transcript: string;
  summary: string | null;
  category: string | null;
  tags: string | null; // JSON string array
  embedding: string | null; // JSON number array
  metadata_status: "pending" | "ready" | "failed";
  source: "voice" | "text" | "file";
  key_points: string | null; // JSON string array
  summary_feedback: "yes" | "no" | null;
  created_at: string;
  updated_at: string;
};

export function createMemory(input: {
  userId: string;
  title: string;
  transcript: string;
  source: "voice" | "text" | "file";
}): Memory {
  const db = getDb();
  const id = newId("mem");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO memories (id, user_id, title, transcript, summary, category, tags, embedding, metadata_status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 'pending', ?, ?, ?)`
  ).run(id, input.userId, input.title, input.transcript, input.source, ts, ts);
  return getMemoryById(input.userId, id)!;
}

// IMPORTANT: every read is scoped by user_id. This is the enforcement point
// for per-user data isolation — a memory can never be fetched by a user who
// doesn't own it, even if they know/guess its id.
export function getMemoryById(userId: string, id: string): Memory | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Memory | undefined;
}

export function listMemories(
  userId: string,
  opts: { search?: string; sort?: "newest" | "oldest" } = {}
): Memory[] {
  const db = getDb();
  const order = opts.sort === "oldest" ? "ASC" : "DESC";
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim().toLowerCase()}%`;
    return db
      .prepare(
        `SELECT * FROM memories
         WHERE user_id = ?
           AND (LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(transcript) LIKE ? OR LOWER(COALESCE(tags,'')) LIKE ?)
         ORDER BY created_at ${order}`
      )
      .all(userId, q, q, q, q) as Memory[];
  }
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at ${order}`)
    .all(userId) as Memory[];
}

export function listMemoriesWithEmbeddings(userId: string): Memory[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND embedding IS NOT NULL`
    )
    .all(userId) as Memory[];
}

export function updateMemoryMetadata(
  userId: string,
  id: string,
  input: Partial<
    Pick<Memory, "title" | "transcript" | "summary" | "category" | "tags" | "embedding" | "metadata_status" | "key_points" | "summary_feedback">
  >
): Memory | undefined {
  const db = getDb();
  const current = getMemoryById(userId, id);
  if (!current) return undefined;
  const title = input.title ?? current.title;
  const transcript = input.transcript ?? current.transcript;
  const summary = input.summary ?? current.summary;
  const category = input.category ?? current.category;
  const tags = input.tags ?? current.tags;
  const embedding = input.embedding ?? current.embedding;
  const metadata_status = input.metadata_status ?? current.metadata_status;
  const key_points = input.key_points ?? current.key_points;
  const summary_feedback = input.summary_feedback ?? current.summary_feedback;
  db.prepare(
    `UPDATE memories SET title = ?, transcript = ?, summary = ?, category = ?, tags = ?, embedding = ?, metadata_status = ?, key_points = ?, summary_feedback = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(title, transcript, summary, category, tags, embedding, metadata_status, key_points, summary_feedback, nowIso(), id, userId);
  return getMemoryById(userId, id);
}

export function deleteMemory(userId: string, id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`).run(id, userId);
}

export function countMemories(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ?`)
    .get(userId) as { c: number };
  return row.c;
}

// Distinct creation dates (YYYY-MM-DD, local to server) for streak calc.
export function listMemoryDates(userId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT DISTINCT substr(created_at, 1, 10) as d FROM memories WHERE user_id = ? ORDER BY d DESC`)
    .all(userId) as { d: string }[];
  return rows.map((r) => r.d);
}
