import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
  isAdminAuthed: vi.fn(),
}));

vi.mock("@/lib/repo/blogPosts", () => ({
  listBlogPosts: vi.fn(),
}));

describe("GET /api/admin/blog", () => {
  it("requires an admin session -- 401 when not authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    vi.mocked(isAdminAuthed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/admin/blog/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns recent posts, capped to 10, once authed", async () => {
    const { isAdminAuthed } = await import("@/lib/adminAuth");
    const { listBlogPosts } = await import("@/lib/repo/blogPosts");
    vi.mocked(isAdminAuthed).mockResolvedValue(true);
    vi.mocked(listBlogPosts).mockReturnValue([
      {
        id: "blog_1",
        slug: "how-to-ace-an-interview",
        title: "How to Ace an Interview",
        meta_title: "How to Ace an Interview",
        meta_description: "...",
        category: "Interview Prep",
        excerpt: "...",
        content_html: "<p>...</p>",
        keywords: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const { GET } = await import("@/app/api/admin/blog/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(listBlogPosts).toHaveBeenCalledWith({ limit: 10 });
  });
});
