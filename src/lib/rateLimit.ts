import { NextResponse } from "next/server";

// Lightweight in-memory rate limiter. Strivo runs as a single pm2 process
// (no cluster mode), so a plain in-memory Map is a real, correct limiter
// here — not an approximation that breaks under multiple instances. If the
// deployment ever moves to multiple Node processes/instances, this should
// be swapped for a shared store (Redis) instead.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60 * 1000) return; // sweep at most every 5 min
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window rate limit. Returns ok:false once `limit` calls have been
 * made for this key within `windowMs`. Cheap and good enough for
 * protecting auth/cost-sensitive endpoints from brute force and abuse —
 * not meant to be a precise sliding-window limiter.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  sweepExpired();
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP behind the nginx reverse proxy. */
export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Convenience wrapper for API routes: checks the limit and, if exceeded,
 * returns a ready-to-send 429 NextResponse. Returns null when the request
 * is allowed to proceed.
 *
 * Usage:
 *   const limited = rateLimitOrResponse(`signup:${requestIp(req)}`, 5, 60 * 60 * 1000);
 *   if (limited) return limited;
 */
export function rateLimitOrResponse(key: string, limit: number, windowMs: number): NextResponse | null {
  const { ok, retryAfterSeconds } = checkRateLimit(key, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please try again in a bit." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
