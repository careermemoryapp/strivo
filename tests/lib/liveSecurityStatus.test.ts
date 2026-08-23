import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  default: { readFileSync: vi.fn() },
}));

describe("readLiveSecurityStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the check script hasn't run yet", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { readLiveSecurityStatus } = await import("@/lib/liveSecurityStatus");
    expect(readLiveSecurityStatus()).toBeNull();
  });

  it("returns null when the file exists but isn't valid JSON", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("not json");

    const { readLiveSecurityStatus } = await import("@/lib/liveSecurityStatus");
    expect(readLiveSecurityStatus()).toBeNull();
  });

  it("parses a valid snapshot", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        checkedAt: "2026-08-23T00:00:00.000Z",
        baseUrl: "https://strivo.ai",
        checks: [
          { id: "ssl-certificate", label: "SSL certificate", status: "pass", detail: "Valid until ..." },
          { id: "https-redirect", label: "HTTP redirects to HTTPS", status: "pass", detail: "..." },
        ],
      })
    );

    const { readLiveSecurityStatus } = await import("@/lib/liveSecurityStatus");
    const result = readLiveSecurityStatus();

    expect(result).not.toBeNull();
    expect(result?.baseUrl).toBe("https://strivo.ai");
    expect(result?.checks).toHaveLength(2);
    expect(result?.checks[0].status).toBe("pass");
  });
});
