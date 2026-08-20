import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dbDir: string;
let rateLimit: typeof import("@/lib/rateLimit");

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-ratelimit-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
  rateLimit = await import("@/lib/rateLimit");
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then blocks", () => {
    const key = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit.checkRateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit.checkRateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the time window has passed", () => {
    const key = `test:${crypto.randomUUID()}`;
    // Window short enough to expire quickly, but long enough that the two
    // synchronous calls below (each a real SQLite round trip) both land
    // inside it rather than the window already lapsing between them.
    const windowMs = 150;
    expect(rateLimit.checkRateLimit(key, 1, windowMs).ok).toBe(true);
    expect(rateLimit.checkRateLimit(key, 1, windowMs).ok).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(rateLimit.checkRateLimit(key, 1, windowMs).ok).toBe(true);
        resolve(undefined);
      }, windowMs + 50);
    });
  });

  it("tracks separate keys independently", () => {
    const keyA = `test:${crypto.randomUUID()}`;
    const keyB = `test:${crypto.randomUUID()}`;
    rateLimit.checkRateLimit(keyA, 1, 60_000);
    expect(rateLimit.checkRateLimit(keyA, 1, 60_000).ok).toBe(false); // A is now exhausted
    expect(rateLimit.checkRateLimit(keyB, 1, 60_000).ok).toBe(true); // B is untouched
  });

  // This is the regression test for the exact bug we fixed: before, the
  // limiter was a plain in-memory Map, which meant each pm2 cluster process
  // had its own separate counter -- two processes would each let N requests
  // through, so a "10/hour" limit was really "10/hour per process". Now it's
  // backed by the shared SQLite file, so a brand new module instance (with
  // none of the previous instance's local JS state -- simulating a second
  // pm2 process) must still see the count that instance already recorded.
  it("stays correct across separate module instances (simulated separate pm2 processes)", async () => {
    const key = `test:${crypto.randomUUID()}`;

    // "Process A": two of three allowed calls.
    expect(rateLimit.checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimit.checkRateLimit(key, 3, 60_000).ok).toBe(true);

    // Simulate a second pm2 process: fresh module state, same DB file.
    vi.resetModules();
    const rateLimitProcessB: typeof import("@/lib/rateLimit") = await import("@/lib/rateLimit");

    // Only one call should be left before hitting the shared limit of 3.
    expect(rateLimitProcessB.checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimitProcessB.checkRateLimit(key, 3, 60_000).ok).toBe(false);
  });
});
