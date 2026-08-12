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
// across users even if a chat id were guessed.
export function listMessages(userId: string, chatId: string): Message[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC`)
    .all(chatId, userId) as Message[];
}

export function updateMessageStatus(userId: string, id: string, status: Message["status"]) {
  const db = getDb();
  db.prepare(`UPDATE messages SET status = ? WHERE id = ? AND user_id = ?`).run(status, id, userId);
}
