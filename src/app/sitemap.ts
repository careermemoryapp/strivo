import type { MetadataRoute } from "next";

// Auto-served at /sitemap.xml. Only the public marketing pages belong here
// — the signed-in app, admin panel, and auth screens aren't content Google
// should index, so they're deliberately left out (see robots.ts too).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://strivo.ai";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
