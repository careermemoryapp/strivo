import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

vi.mock("@/lib/repo/support", () => ({
  listSupportMessages: vi.fn(),
  setSupportMessageStatus: vi.fn(),
}));

describe("GET /api/admin/support", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/support/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the message list once authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { listSupportMessages } = await import("@/lib/repo/support");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(listSupportMessages).mockReturnValue([
      {
        id: "support_1",
        user_id: "user_1",
        email: "a@example.com",
        subject: "Help",
        message: "Something's broken",
        status: "new",
        created_at: new Date().toISOString(),
      },
    ]);

    const { GET } = await import("@/app/api/admin/support/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].status).toBe("new");
  });
});

describe("PATCH /api/admin/support", () => {
  function patchRequest(body: unknown): Request {
    return new Request("https://strivo.ai/api/admin/support", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { PATCH } = await import("@/app/api/admin/support/route");
    const res = await PATCH(patchRequest({ id: "support_1", status: "resolved" }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid status value", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);

    const { PATCH } = await import("@/app/api/admin/support/route");
    const res = await PATCH(patchRequest({ id: "support_1", status: "archived" }));
    expect(res.status).toBe(400);
  });

  it("updates status and returns 404 if the message doesn't exist", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { setSupportMessageStatus } = await import("@/lib/repo/support");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(setSupportMessageStatus).mockReturnValue(undefined);

    const { PATCH } = await import("@/app/api/admin/support/route");
    const res = await PATCH(patchRequest({ id: "nope", status: "resolved" }));
    expect(res.status).toBe(404);
  });
});
