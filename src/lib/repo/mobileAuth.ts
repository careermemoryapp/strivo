import { getDb, newId, nowIso } from "@/lib/db";
import crypto from "node:crypto";

// Short window: this token only needs to live for the few seconds between
// "system browser finished Google sign-in" and "app's WebView loaded the
// consume URL". 2 minutes gives plenty of slack without leaving a
// long-lived credential lying around.
const TTL_MS = 1000 * 60 * 2;

export function createMobileAuthToken(sessionCookieValue: string): { token: string } {
  const db = getDb();
  const id = newId("mat");
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO mobile_auth_tokens (id, token, session_cookie_value, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)`
  ).run(id, token, sessionCookieValue, expiresAt, nowIso());
  return { token };
}

// Single-use: marks the token used the moment it's read, regardless of
// whether the cookie value turns out to still be valid, so a leaked/replayed
// deep link can't be redeemed twice.
export function consumeMobileAuthToken(token: string): { sessionCookieValue: string } | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM mobile_auth_tokens WHERE token = ? AND used = 0`).get(token) as
    | { id: string; session_cookie_value: string; expires_at: string }
    | undefined;
  if (!row) return undefined;
  db.prepare(`UPDATE mobile_auth_tokens SET used = 1 WHERE id = ?`).run(row.id);
  if (new Date(row.expires_at).getTime() < Date.now()) return undefined;
  return { sessionCookieValue: row.session_cookie_value };
}
