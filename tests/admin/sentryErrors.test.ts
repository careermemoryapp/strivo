import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  sentryConfigured: vi.fn(),
  fetchRecentSentryIssues: vi.fn(),
}));

describe("GET /api/admin/sentry-errors", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/sentry-errors/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports not configured when SENTRY_API_TOKEN isn't set", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { sentryConfigured } = await import("@/lib/sentry");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(sentryConfigured).mockReturnValue(false);

    const { GET } = await import("@/app/api/admin/sentry-errors/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.issues).toEqual([]);
  });

  it("returns unresolved issues once configured", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { sentryConfigured, fetchRecentSentryIssues } = await import("@/lib/sentry");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(sentryConfigured).mockReturnValue(true);
    vi.mocked(fetchRecentSentryIssues).mockResolvedValue([
      {
        id: "1",
        shortId: "STRIVO-1",
        title: "TypeError: x is not a function",
        culprit: "src/app/api/chats/route.ts",
        level: "error",
        count: 12,
        userCount: 3,
        lastSeen: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
        permalink: "https://strivo-4i.sentry.io/issues/1/",
      },
    ]);

    const { GET } = await import("@/app/api/admin/sentry-errors/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].shortId).toBe("STRIVO-1");
  });

  it("degrades gracefully (502, empty list) when Sentry itself is unreachable", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { sentryConfigured, fetchRecentSentryIssues } = await import("@/lib/sentry");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(sentryConfigured).mockReturnValue(true);
    vi.mocked(fetchRecentSentryIssues).mockRejectedValue(new Error("network down"));

    const { GET } = await import("@/app/api/admin/sentry-errors/route");
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.issues).toEqual([]);
  });
});
