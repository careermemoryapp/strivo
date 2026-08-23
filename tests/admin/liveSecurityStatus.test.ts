import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

vi.mock("@/lib/liveSecurityStatus", () => ({
  readLiveSecurityStatus: vi.fn(),
}));

describe("GET /api/admin/live-security-status", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/live-security-status/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the last live check snapshot once authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { readLiveSecurityStatus } = await import("@/lib/liveSecurityStatus");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(readLiveSecurityStatus).mockReturnValue({
      checkedAt: "2026-08-23T00:00:00.000Z",
      baseUrl: "https://strivo.ai",
      checks: [{ id: "ssl-certificate", label: "SSL certificate", status: "pass", detail: "..." }],
    });

    const { GET } = await import("@/app/api/admin/live-security-status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liveStatus.checks).toHaveLength(1);
    expect(body.liveStatus.checks[0].status).toBe("pass");
  });

  it("reports no check run yet as null, not an error", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { readLiveSecurityStatus } = await import("@/lib/liveSecurityStatus");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(readLiveSecurityStatus).mockReturnValue(null);

    const { GET } = await import("@/app/api/admin/live-security-status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.liveStatus).toBeNull();
  });
});
