import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";

// Backed by the `rate_limit_buckets` SQLite table (see lib/db.ts) instead of
// an in-memory Map. Strivo now runs as multiple clustered pm2 processes, so
// an in-memory counter would live separately in each process -- two
// processes would each let a request through "10 times in the last hour",
// letting 20 through in practice. SQLite is already shared across every
// process (same file, WAL mode), so it doubles as the shared counter store
// without needing a separate service like Redis.
//
// This still isn't a precise sliding-window limiter (fixed windows can let
// a burst through right at the boundary) -- it's "good enough" abuse
// protection for auth/cost-sensitive endpoints, same as before.

let lastSweep = 0;
function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60 * 1000) return; // sweep at most every 5 min, per-process
  lastSweep = now;
  const db = getDb();
  db.prepare(`DELETE FROM rate_limit_buckets WHERE reset_at <= ?`).run(nowIso());
}

/**
 * Fixed-window rate limit. Returns ok:false once `limit` calls have been
 * made for this key within `windowMs`. Cheap and good enough for
 * protecting auth/cost-sensitive endpoints from brute force and abuse --
 * not meant to be a precise sliding-window limiter.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  sweepExpired();
  const db = getDb();
  const now = Date.now();

  const existing = db.prepare(`SELECT count, reset_at FROM rate_limit_buckets WHERE key = ?`).get(key) as
    | { count: number; reset_at: string }
    | undefined;

  if (!existing || new Date(existing.reset_at).getTime() <= now) {
    const resetAt = new Date(now + windowMs).toISOString();
    db.prepare(
      `INSERT INTO rate_limit_buckets (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
    ).run(key, resetAt);
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((new Date(existing.reset_at).getTime() - now) / 1000) };
  }

  db.prepare(`UPDATE rate_limit_buckets SET count = count + 1 WHERE key = ?`).run(key);
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
