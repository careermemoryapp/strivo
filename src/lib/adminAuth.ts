import crypto from "node:crypto";
import { cookies } from "next/headers";

// A deliberately lightweight admin session, separate from the regular
// NextAuth user session — this gates the founder-only /admin dashboard
// behind a single shared password (set as ADMIN_PASSWORD in the server's
// environment), not a per-account login. The session cookie is a signed,
// stateless token (HMAC over an issued-at timestamp) so there's no
// sessions table to manage — verifying it is just recomputing the HMAC and
// comparing in constant time.

export const ADMIN_COOKIE_NAME = "strivo_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  // Falls back to NEXTAUTH_SECRET so this works out of the box in an
  // environment that already has that set, but a dedicated
  // ADMIN_SESSION_SECRET is recommended so rotating one doesn't log the
  // other out.
  return process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "strivo-admin-dev-secret";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Compares against ADMIN_PASSWORD from the environment. Returns false (not
// an error) if the env var isn't set at all, so a misconfigured deploy
// fails closed rather than open.
export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  return timingSafeStringEqual(password, expected);
}

export function createAdminSessionValue(): string {
  const payload = `admin:${Date.now()}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}.${sign(payload)}`;
}

function isValidAdminSessionValue(value: string | undefined): boolean {
  if (!value) return false;
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return false;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  if (!timingSafeStringEqual(sig, sign(payload))) return false;
  const match = payload.match(/^admin:(\d+)$/);
  if (!match) return false;
  return Date.now() - Number(match[1]) < MAX_AGE_SECONDS * 1000;
}

// Every /api/admin/* route (and the /admin dashboard's own data fetches)
// checks this before doing anything — same shape as requireUserId() for
// the regular user session, just reading a different cookie.
export async function isAdminAuthed(): Promise<boolean> {
  const jar = await cookies();
  return isValidAdminSessionValue(jar.get(ADMIN_COOKIE_NAME)?.value);
}

export const ADMIN_COOKIE_MAX_AGE = MAX_AGE_SECONDS;
