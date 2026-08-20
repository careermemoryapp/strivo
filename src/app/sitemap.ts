import type { MetadataRoute } from "next";
import { listBlogPosts } from "@/lib/repo/blogPosts";

// Auto-served at /sitemap.xml. Only the public marketing pages and
// published blog posts belong here — the signed-in app, admin panel, and
// auth screens aren't content Google should index, so they're deliberately
// left out (see robots.ts too). Blog posts are read live from the DB so a
// freshly published article shows up here without another deploy.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://strivo.ai";
  const now = new Date();
  const posts = listBlogPosts();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.created_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
