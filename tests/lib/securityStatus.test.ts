import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  adminTotpConfigured: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  sentryConfigured: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

describe("getStaticSecurityChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks error monitoring and admin MFA as protected once their env vars are set", async () => {
    const { adminTotpConfigured } = await import("@/lib/adminAuth");
    const { sentryConfigured } = await import("@/lib/sentry");
    vi.mocked(adminTotpConfigured).mockReturnValue(true);
    vi.mocked(sentryConfigured).mockReturnValue(true);

    const { getStaticSecurityChecklist } = await import("@/lib/securityStatus");
    const checklist = getStaticSecurityChecklist();

    expect(checklist.find((c) => c.id === "error-monitoring")?.status).toBe("protected");
    expect(checklist.find((c) => c.id === "admin-mfa")?.status).toBe("protected");
    // Staging is a real, known gap -- always planned, not dynamic.
    expect(checklist.find((c) => c.id === "staging")?.status).toBe("planned");
  });

  it("marks error monitoring and admin MFA as planned when not configured", async () => {
    const { adminTotpConfigured } = await import("@/lib/adminAuth");
    const { sentryConfigured } = await import("@/lib/sentry");
    vi.mocked(adminTotpConfigured).mockReturnValue(false);
    vi.mocked(sentryConfigured).mockReturnValue(false);

    const { getStaticSecurityChecklist } = await import("@/lib/securityStatus");
    const checklist = getStaticSecurityChecklist();

    expect(checklist.find((c) => c.id === "error-monitoring")?.status).toBe("planned");
    expect(checklist.find((c) => c.id === "admin-mfa")?.status).toBe("planned");
  });
});

describe("readDependencyAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no scan has ever been written", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { readDependencyAudit } = await import("@/lib/securityStatus");
    expect(readDependencyAudit()).toBeNull();
  });

  it("returns null when the file exists but isn't valid JSON", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("not json");

    const { readDependencyAudit } = await import("@/lib/securityStatus");
    expect(readDependencyAudit()).toBeNull();
  });

  it("parses npm audit's real shape into severity totals and a package list", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        vulnerabilities: {
          xlsx: { severity: "high", fixAvailable: false },
          uuid: { severity: "moderate", fixAvailable: true },
        },
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 },
        },
      })
    );
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date("2026-08-22T12:00:00.000Z") } as ReturnType<
      typeof fs.statSync
    >);

    const { readDependencyAudit } = await import("@/lib/securityStatus");
    const result = readDependencyAudit();

    expect(result).not.toBeNull();
    expect(result?.totals).toEqual({ info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 });
    expect(result?.vulnerablePackages).toHaveLength(2);
    expect(result?.vulnerablePackages.find((p) => p.name === "xlsx")).toEqual({
      name: "xlsx",
      severity: "high",
      fixAvailable: false,
    });
    expect(result?.scannedAt).toBe("2026-08-22T12:00:00.000Z");
  });

  it("treats a clean scan (zero vulnerabilities) as a valid, empty result -- not null", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        vulnerabilities: {},
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
      })
    );
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date("2026-08-22T12:00:00.000Z") } as ReturnType<
      typeof fs.statSync
    >);

    const { readDependencyAudit } = await import("@/lib/securityStatus");
    const result = readDependencyAudit();

    expect(result).not.toBeNull();
    expect(result?.totals.total).toBe(0);
    expect(result?.vulnerablePackages).toEqual([]);
  });
});
