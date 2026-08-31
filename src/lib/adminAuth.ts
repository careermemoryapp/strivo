import crypto from "node:crypto";
import { cookies } from "next/headers";
import { verifyTotp } from "@/lib/totp";

// A deliberately lightweight admin session, separate from the regular
// NextAuth user session — this gates the founder-only /admin dashboard
// behind a single shared password (set as ADMIN_PASSWORD in the server's
// environment), not a per-account login. The session cookie is a signed,
// stateless token (HMAC over an issued-at timestamp) so there's no
// sessions table to manage — verifying it is just recomputing the HMAC and
// comparing in constant time.

export const ADMIN_COOKIE_NAME = "strivo_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Deliberately no hardcoded fallback string here. If neither env var is
// set, admin sessions must fail closed (nobody can create or verify one)
// rather than silently sign with a value that's sitting in plain text in
// this file and every clone of this repo -- a hardcoded fallback secret is
// the same class of bug as a default database password.
function sessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
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

// Second factor: a 6-digit authenticator-app code, checked against
// ADMIN_TOTP_SECRET. Deliberately opt-in during rollout -- if that env var
// isn't set yet, this returns true (no second factor required) so deploying
// this code doesn't immediately lock anyone out before they've had a chance
// to actually set up their authenticator app. Once ADMIN_TOTP_SECRET is set,
// every login requires a valid code.
export function checkAdminTotp(code: string | undefined): boolean {
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!secret) return true;
  if (!code) return false;
  return verifyTotp(secret, code);
}

export function adminTotpConfigured(): boolean {
  return !!process.env.ADMIN_TOTP_SECRET;
}

// Throws (rather than silently signing with a guessable value) if the
// server is misconfigured with no secret available at all -- the admin
// login route lets that surface as a 500 instead of ever issuing a forgeable
// session.
export function createAdminSessionValue(): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("Cannot create an admin session: set ADMIN_SESSION_SECRET or NEXTAUTH_SECRET.");
  }
  const payload = `admin:${Date.now()}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}.${sign(payload, secret)}`;
}

function isValidAdminSessionValue(value: string | undefined): boolean {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return false;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  if (!timingSafeStringEqual(sig, sign(payload, secret))) return false;
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

// A second, separate credential (BLOG_AUTOMATION_SECRET) for the daily
// blog-writing automation to authenticate with, instead of reusing the
// founder's own admin password. Deliberately its own env var so rotating
// it (e.g. if it ever leaked) doesn't also log the founder out of /admin,
// and so the automation's blast radius if compromised is limited to
// publishing blog posts rather than full admin access. Checked via a
// request header (`x-blog-secret`) since the automation is a script, not a
// browser with cookies. See /api/blog/publish.
export function checkBlogAutomationSecret(secret: string | null): boolean {
  const expected = process.env.BLOG_AUTOMATION_SECRET;
  if (!expected || !secret) return false;
  return timingSafeStringEqual(secret, expected);
}

// Same idea as checkBlogAutomationSecret, for the weekly recap automation
// (see /api/weekly-recap/run) — a separate credential from both
// ADMIN_PASSWORD and BLOG_AUTOMATION_SECRET so none of the three share
// blast radius if one leaks. Checked via a request header
// (`x-weekly-recap-secret`).
export function checkWeeklyRecapSecret(secret: string | null): boolean {
  const expected = process.env.WEEKLY_RECAP_SECRET;
  if (!expected || !secret) return false;
  return timingSafeStringEqual(secret, expected);
}

// Same idea again, for the monthly growth-narrative automation (see
// /api/growth-narrative/run) — its own credential, separate from
// ADMIN_PASSWORD, BLOG_AUTOMATION_SECRET, and WEEKLY_RECAP_SECRET. Checked
// via a request header (`x-growth-narrative-secret`).
export function checkGrowthNarrativeSecret(secret: string | null): boolean {
  const expected = process.env.GROWTH_NARRATIVE_SECRET;
  if (!expected || !secret) return false;
  return timingSafeStringEqual(secret, expected);
}

// Same idea again, for the quarterly "You vs. You" benchmark automation
// (see /api/quarterly-benchmark/run) — its own credential, separate from
// every other secret above. Checked via a request header
// (`x-quarterly-benchmark-secret`).
export function checkQuarterlyBenchmarkSecret(secret: string | null): boolean {
  const expected = process.env.QUARTERLY_BENCHMARK_SECRET;
  if (!expected || !secret) return false;
  return timingSafeStringEqual(secret, expected);
}
