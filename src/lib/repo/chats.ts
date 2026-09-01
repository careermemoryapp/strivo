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

// Chats with zero messages (e.g. opened from a quick action but abandoned
// before the user typed anything) are noise, not real conversations — they
// should never show up in the Chats list or Home's "continue" section.
// We hard-delete ones that have sat empty for a while so the DB doesn't
// accumulate clutter, and we always filter out empty chats from listChats
// regardless of age so the UI never shows one.
function pruneStaleEmptyChats(userId: string) {
  const db = getDb();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare(
    `DELETE FROM chats
     WHERE user_id = ? AND created_at < ?
       AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.chat_id = chats.id)`
  ).run(userId, cutoff);
}

export function listChats(userId: string, opts: { search?: string; category?: string } = {}): Chat[] {
  pruneStaleEmptyChats(userId);
  const db = getDb();
  const clauses = ["user_id = ?", "EXISTS (SELECT 1 FROM messages WHERE messages.chat_id = chats.id)"];
  const params: unknown[] = [userId];
  if (opts.search && opts.search.trim()) {
    // Beyond title/last_message: also matches if ANY message inside the
    // chat contains the term, not just the most recent one. Without this, a
    // chat where the user asked about something 20 messages ago (and the
    // conversation has since moved on to something else) was invisible to
    // search even though the actual content the user is trying to find is
    // sitting right there in the transcript -- last_message only reflects
    // whatever was said most recently, which is often unrelated by then.
    clauses.push(
      "(LOWER(title) LIKE ? OR LOWER(COALESCE(last_message,'')) LIKE ? OR EXISTS (SELECT 1 FROM messages msg WHERE msg.chat_id = chats.id AND LOWER(msg.content) LIKE ?))"
    );
    const q = `%${opts.search.trim().toLowerCase()}%`;
    params.push(q, q, q);
  }
  if (opts.category && opts.category !== "All") {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  // Sane upper bound so one very long-lived account can't make this query
  // (or the list it renders) grow unbounded. Always newest-first, so
  // capping here never hides anything a user would actually be looking
  // for -- it just stops showing chats from years ago on this screen.
  return db
    .prepare(`SELECT * FROM chats WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 500`)
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
