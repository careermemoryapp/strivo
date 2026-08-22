import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dbDir: string;

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

beforeAll(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-admin-health-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("GET /api/admin/health", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/health/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns detailed diagnostics once authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);

    const { GET } = await import("@/app/api/admin/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.database.ok).toBe(true);
    expect(typeof body.database.responseMs).toBe("number");
    expect(typeof body.process.uptimeSeconds).toBe("number");
    expect(typeof body.process.memoryMb.heapUsed).toBe("number");
  });
});
