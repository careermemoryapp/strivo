import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

vi.mock("@/lib/securityStatus", () => ({
  getStaticSecurityChecklist: vi.fn(),
  readDependencyAudit: vi.fn(),
}));

describe("GET /api/admin/security-status", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/security-status/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the checklist and dependency audit once authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { getStaticSecurityChecklist, readDependencyAudit } = await import("@/lib/securityStatus");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(getStaticSecurityChecklist).mockReturnValue([
      { id: "rate-limiting", label: "AI-cost rate limiting", status: "protected", detail: "..." },
      { id: "staging", label: "Staging environment", status: "planned", detail: "..." },
    ]);
    vi.mocked(readDependencyAudit).mockReturnValue({
      scannedAt: "2026-08-22T00:00:00.000Z",
      totals: { critical: 0, high: 1, moderate: 0, low: 0, info: 0, total: 1 },
      vulnerablePackages: [{ name: "xlsx", severity: "high", fixAvailable: false }],
    });

    const { GET } = await import("@/app/api/admin/security-status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checklist).toHaveLength(2);
    expect(body.checklist[1].status).toBe("planned");
    expect(body.dependencyAudit.totals.total).toBe(1);
    expect(body.dependencyAudit.vulnerablePackages[0].name).toBe("xlsx");
  });

  it("reports no dependency scan yet as null, not an error", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { getStaticSecurityChecklist, readDependencyAudit } = await import("@/lib/securityStatus");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(getStaticSecurityChecklist).mockReturnValue([]);
    vi.mocked(readDependencyAudit).mockReturnValue(null);

    const { GET } = await import("@/app/api/admin/security-status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dependencyAudit).toBeNull();
  });
});
