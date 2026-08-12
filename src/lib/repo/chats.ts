import { getDb, newId, nowIso } from "@/lib/db";

export type Chat = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  last_message: string | null;
  memory_count: number;
  created_at: string;
  updated_at: string;
};

export function createChat(input: { userId: string; title: string; category: string }): Chat {
  const db = getDb();
  const id = newId("chat");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO chats (id, user_id, title, category, last_message, memory_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 0, ?, ?)`
  ).run(id, input.userId, input.title, input.category, ts, ts);
  return getChatById(input.userId, id)!;
}

// Scoped by user_id — see memories.ts comment on isolation.
export function getChatById(userId: string, id: string): Chat | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM chats WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Chat | undefined;
}

export function listChats(userId: string, opts: { search?: string; category?: string } = {}): Chat[] {
  const db = getDb();
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];
  if (opts.search && opts.search.trim()) {
    clauses.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(last_message,'')) LIKE ?)");
    const q = `%${opts.search.trim().toLowerCase()}%`;
    params.push(q, q);
  }
  if (opts.category && opts.category !== "All") {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  return db
    .prepare(`SELECT * FROM chats WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...(params as [])) as Chat[];
}

export function touchChat(userId: string, id: string, input: { lastMessage?: string; memoryCount?: number; title?: string }) {
  const db = getDb();
  const current = getChatById(userId, id);
  if (!current) return undefined;
  const last_message = input.lastMessage ?? current.last_message;
  const memory_count = input.memoryCount ?? current.memory_count;
  const title = input.title ?? current.title;
  db.prepare(
    `UPDATE chats SET last_message = ?, memory_count = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(last_message, memory_count, title, nowIso(), id, userId);
  return getChatById(userId, id);
}
