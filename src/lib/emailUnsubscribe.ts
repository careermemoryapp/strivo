import crypto from "node:crypto";

// One-click unsubscribe links need to work without a login (the recipient
// isn't necessarily signed into the app on the device they're reading
// email on), so instead of a session cookie this signs the user id itself
// -- same HMAC pattern as the admin session cookie in adminAuth.ts, reusing
// the same secret precedence (ADMIN_SESSION_SECRET, falling back to
// NEXTAUTH_SECRET) so there's no new env var to configure. Deliberately no
// hardcoded fallback: if neither secret is set, link generation fails
// closed rather than signing with a guessable value.

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function sign(value: string, key: string): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Token is just "<userId>.<hmac>", base64url-wrapped so it drops cleanly
// into a URL query string with no escaping surprises. No expiry -- an
// unsubscribe link staying valid forever is the correct behavior (unlike
// the admin session, where a stale token expiring is a feature).
export function createUnsubscribeToken(userId: string): string {
  const key = secret();
  if (!key) {
    throw new Error("Cannot create an unsubscribe token: set ADMIN_SESSION_SECRET or NEXTAUTH_SECRET.");
  }
  const sig = sign(userId, key);
  return Buffer.from(`${userId}.${sig}`).toString("base64url");
}

// Returns the userId if the token is genuine, or null if it's missing,
// malformed, tampered with, or the server has no secret configured.
export function verifyUnsubscribeToken(token: string | null): string | null {
  const key = secret();
  if (!key || !token) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.lastIndexOf(".");
  if (separatorIndex === -1) return null;
  const userId = decoded.slice(0, separatorIndex);
  const sig = decoded.slice(separatorIndex + 1);
  if (!userId || !sig) return null;
  if (!timingSafeStringEqual(sig, sign(userId, key))) return null;
  return userId;
}
