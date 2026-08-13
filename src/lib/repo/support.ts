import { getDb, newId, nowIso } from "@/lib/db";

export type SupportMessage = {
  id: string;
  user_id: string;
  email: string;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
};

export function createSupportMessage(input: {
  userId: string;
  email: string;
  subject?: string;
  message: string;
}): SupportMessage {
  const db = getDb();
  const id = newId("support");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO support_messages (id, user_id, email, subject, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`
  ).run(id, input.userId, input.email, input.subject ?? null, input.message, ts);
  return db.prepare(`SELECT * FROM support_messages WHERE id = ?`).get(id) as SupportMessage;
}
