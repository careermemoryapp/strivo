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

// Admin-only: these messages were previously only visible via the SES
// email that gets sent alongside createSupportMessage above -- if that
// email ever fails to send or arrive (unverified domain, spam filter,
// etc.), the message still exists here and was otherwise invisible. Newest
// first, since that's what the admin dashboard wants to triage.
export function listSupportMessages(limit = 100): SupportMessage[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM support_messages ORDER BY created_at DESC LIMIT ?`).all(limit) as SupportMessage[];
}

export function setSupportMessageStatus(id: string, status: "new" | "resolved"): SupportMessage | undefined {
  const db = getDb();
  db.prepare(`UPDATE support_messages SET status = ? WHERE id = ?`).run(status, id);
  return db.prepare(`SELECT * FROM support_messages WHERE id = ?`).get(id) as SupportMessage | undefined;
}
