import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed, checkBlogAutomationSecret } from "@/lib/adminAuth";
import { createBlogPost, listBlogPostTitles, BLOG_CATEGORIES } from "@/lib/repo/blogPosts";

// GET is unauthenticated — the daily automation calls this first to see
// what's already been published, so it doesn't repeat a topic. Titles/
// categories only, nothing sensitive.
export async function GET() {
  return NextResponse.json({ posts: listBlogPostTitles() });
}

const schema = z.object({
  title: z.string().trim().min(10).max(160),
  metaTitle: z.string().trim().min(10).max(70),
  metaDescription: z.string().trim().min(50).max(200),
  category: z.enum(BLOG_CATEGORIES),
  excerpt: z.string().trim().min(20).max(300),
  contentHtml: z.string().trim().min(200),
  keywords: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  // Either the founder's own admin session (publishing manually from a
  // browser) or the automation's dedicated secret header authorizes this —
  // see checkBlogAutomationSecret's comment for why that's a separate
  // credential rather than reusing ADMIN_PASSWORD.
  const authed = (await isAdminAuthed()) || checkBlogAutomationSecret(req.headers.get("x-blog-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid post." }, { status: 400 });
  }

  const post = createBlogPost(parsed.data);
  return NextResponse.json({ post: { slug: post.slug, title: post.title, url: `https://strivo.ai/blog/${post.slug}` } });
}
