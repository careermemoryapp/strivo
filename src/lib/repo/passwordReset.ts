import { getDb, newId, nowIso } from "@/lib/db";
import crypto from "node:crypto";

export function createResetToken(userId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const id = newId("prt");
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min
  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)`
  ).run(id, userId, token, expiresAt, nowIso());
  return { token, expiresAt };
}

export function consumeResetToken(token: string): { userId: string } | undefined {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0`)
    .get(token) as { id: string; user_id: string; expires_at: string } | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) return undefined;
  db.prepare(`UPDATE password_reset_tokens SET used = 1 WHERE id = ?`).run(row.id);
  return { userId: row.user_id };
}
