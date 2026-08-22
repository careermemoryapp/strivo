import { afterEach, describe, expect, it, vi } from "vitest";

describe("sentry lib", () => {
  const originalToken = process.env.SENTRY_API_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.SENTRY_API_TOKEN;
    } else {
      process.env.SENTRY_API_TOKEN = originalToken;
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sentryConfigured reflects whether SENTRY_API_TOKEN is set", async () => {
    delete process.env.SENTRY_API_TOKEN;
    const { sentryConfigured } = await import("@/lib/sentry");
    expect(sentryConfigured()).toBe(false);

    process.env.SENTRY_API_TOKEN = "test-token";
    vi.resetModules();
    const mod = await import("@/lib/sentry");
    expect(mod.sentryConfigured()).toBe(true);
  });

  it("fetchRecentSentryIssues throws a clear error when not configured", async () => {
    delete process.env.SENTRY_API_TOKEN;
    const { fetchRecentSentryIssues } = await import("@/lib/sentry");
    await expect(fetchRecentSentryIssues()).rejects.toThrow(/not configured/i);
  });

  it("fetchRecentSentryIssues maps the Sentry API response and sends the auth header", async () => {
    process.env.SENTRY_API_TOKEN = "test-token";
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "1",
          shortId: "STRIVO-1",
          title: "TypeError: boom",
          culprit: "src/app/api/memories/route.ts",
          level: "error",
          count: "5",
          userCount: 2,
          lastSeen: "2026-08-22T00:00:00.000Z",
          firstSeen: "2026-08-01T00:00:00.000Z",
          permalink: "https://strivo-4i.sentry.io/issues/1/",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchRecentSentryIssues } = await import("@/lib/sentry");
    const issues = await fetchRecentSentryIssues(10);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: "1", shortId: "STRIVO-1", count: 5 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("is%3Aunresolved");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  it("fetchRecentSentryIssues throws when Sentry responds with an error status", async () => {
    process.env.SENTRY_API_TOKEN = "test-token";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { fetchRecentSentryIssues } = await import("@/lib/sentry");
    await expect(fetchRecentSentryIssues()).rejects.toThrow(/401/);
  });
});
