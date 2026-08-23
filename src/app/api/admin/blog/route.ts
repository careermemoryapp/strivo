import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { listBlogPosts } from "@/lib/repo/blogPosts";

// Admin-only. The daily writing automation (see /api/blog/publish and the
// scheduled task that calls it) publishes unattended -- this gives the
// founder a quick way to sanity-check what it's actually been putting out,
// without navigating away to the public /blog pages.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ posts: listBlogPosts({ limit: 10 }) });
}
