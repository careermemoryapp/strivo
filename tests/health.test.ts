import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dbDir: string;

beforeAll(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-health-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("reports ok with a reachable database, and reveals no internal details", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    // Nothing beyond status/database/time -- no version, stack, or config.
    expect(Object.keys(body).sort()).toEqual(["database", "status", "time"]);
  });
});
