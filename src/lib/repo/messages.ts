import { getDb, newId, nowIso } from "@/lib/db";

export type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  sender: "user" | "ai";
  content: string;
  retrieved_memories: string | null; // JSON array of memory ids
  status: "sent" | "error" | "pending";
  created_at: string;
  embedding: string | null; // JSON.stringify(number[]) -- see db.ts migration comment
};

export function createMessage(input: {
  chatId: string;
  userId: string;
  sender: "user" | "ai";
  content: string;
  retrievedMemories?: string[];
  status?: "sent" | "error" | "pending";
}): Message {
  const db = getDb();
  const id = newId("msg");
  db.prepare(
    `INSERT INTO messages (id, chat_id, user_id, sender, content, retrieved_memories, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.chatId,
    input.userId,
    input.sender,
    input.content,
    input.retrievedMemories ? JSON.stringify(input.retrievedMemories) : null,
    input.status ?? "sent",
    nowIso()
  );
  return getMessageById(input.userId, id)!;
}

export function getMessageById(userId: string, id: string): Message | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM messages WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Message | undefined;
}

// Scoped by both chat_id AND user_id so a message list can never leak
// across users even if a chat id were guessed. Capped at the most recent
// 500 messages (same safety-net pattern as listChats in chats.ts) -- fetched
// newest-first with a LIMIT, then reversed back to the chronological order
// callers expect. Deliberately DESC-then-reverse rather than a plain
// ASC+LIMIT: an ASC cap would silently drop the newest messages (the ones
// actually being read/replied to) off the end of a very long chat instead
// of the oldest ones, which is the wrong direction to trim.
export function listMessages(userId: string, chatId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 500`)
    .all(chatId, userId) as Message[];
  return rows.reverse();
}

export function updateMessageStatus(userId: string, id: string, status: Message["status"]) {
  const db = getDb();
  db.prepare(`UPDATE messages SET status = ? WHERE id = ? AND user_id = ?`).run(status, id, userId);
}

// Fire-and-forget target from chatService.ts, called AFTER a user message
// has already been saved and (usually) already replied to -- see the
// embedding comment on the messages table in lib/db.ts for why this exists.
// No-ops silently if the message was deleted out from under it (chat
// deletion) rather than throwing, since nothing is waiting on this write.
export function updateMessageEmbedding(id: string, embedding: number[]) {
  const db = getDb();
  db.prepare(`UPDATE messages SET embedding = ? WHERE id = ?`).run(JSON.stringify(embedding), id);
}

// The candidate pool for cross-chat message recall (see
// retrieveRelevantMessages in lib/retrieval.ts). Scoped to sender='user'
// only -- the AI's own prior replies aren't "something the user said" and
// recalling them back at the user as if they were would be strange, plus it
// would double the embedding volume for no benefit. excludeChatId leaves out
// the CURRENT conversation: those messages are already in the model's
// context via the normal history array (see chatService.ts), so surfacing
// them again here would just be redundant, not additive. Ordered
// newest-first with a cap, same reasoning as listMessages' LIMIT 500 -- an
// account with years of chat history shouldn't make every single turn scan
// an ever-growing table.
// Every message across every chat this user has, both sender=user AND
// sender=ai -- unlike listMessages (one chat) and listMessagesWithEmbeddings
// (user-only, excludes one chat, cross-chat recall candidate pool), this is
// specifically for the admin data-export route (see
// /api/admin/users/[id]/export): a GDPR/CCPA portability export has to be
// the user's whole conversation history, not a subset. Unbounded (no LIMIT)
// for the same reason listMemories is unbounded -- an export that silently
// truncated would be a real compliance problem, not just a UX one.
// Oldest-first so the exported JSON reads in the order it actually happened.
export function listAllMessagesForUser(userId: string): Message[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC`)
    .all(userId) as Message[];
}

export function listMessagesWithEmbeddings(
  userId: string,
  excludeChatId: string,
  limit = 500
): Message[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE user_id = ? AND chat_id != ? AND sender = 'user' AND embedding IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, excludeChatId, limit) as Message[];
}
