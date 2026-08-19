import { getDb, newId, nowIso } from "@/lib/db";

export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: string;
};

// A token is unique per app-install-on-device, so re-registering the same
// token (app reopened, permission re-granted) just re-points it at
// whichever user is currently signed in rather than erroring or
// duplicating rows — handles device handoff/reinstall for free.
export function savePushToken(userId: string, token: string, platform: string): void {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM push_tokens WHERE token = ?`).get(token) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE push_tokens SET user_id = ?, platform = ? WHERE token = ?`).run(userId, platform, token);
    return;
  }
  db.prepare(`INSERT INTO push_tokens (id, user_id, token, platform, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    newId("pushtok"),
    userId,
    token,
    platform,
    nowIso()
  );
}

export function listAllPushTokens(): string[] {
  const db = getDb();
  return (db.prepare(`SELECT token FROM push_tokens`).all() as { token: string }[]).map((r) => r.token);
}

// Called when FCM reports a token as no longer valid (app uninstalled,
// notifications revoked at the OS level, etc.) so it stops being sent to.
export function deletePushTokens(tokens: string[]): void {
  if (tokens.length === 0) return;
  const db = getDb();
  const placeholders = tokens.map(() => "?").join(",");
  db.prepare(`DELETE FROM push_tokens WHERE token IN (${placeholders})`).run(...tokens);
}
