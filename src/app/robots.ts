import type { MetadataRoute } from "next";

// Auto-served at /robots.txt by Next.js's file convention. Lets Google
// crawl the public marketing pages (/, /privacy, /terms) but keeps it out
// of the signed-in app (/app), the admin panel, and raw API routes — none
// of which are meaningful search results and some of which we'd rather not
// advertise the existence of.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/app/", "/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: "https://strivo.ai/sitemap.xml",
  };
}
