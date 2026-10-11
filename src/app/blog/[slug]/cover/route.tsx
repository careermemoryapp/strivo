import { ImageResponse } from "next/og";
import { categoryAccent } from "@/lib/blogCategoryStyle";
import { APP_NAME } from "@/lib/config";
import { getBlogPostBySlug } from "@/lib/repo/blogPosts";

// Plain branded cover art for the in-page thumbnails on the blog index
// (featured card + grid), the article's own hero image, and RelatedPosts --
// added 2026-10-11, direct founder feedback from a live screenshot ("the
// image is not correct... headline is cutting"). Those spots were all
// reusing opengraph-image.tsx, which is built for link previews on
// WhatsApp/LinkedIn/Twitter and bakes the full title + category into the
// 1200x630 canvas. That's fine when the whole canvas is shown untouched in
// a link preview, but a card here only shows PART of that image (the
// featured card crops it to a square-ish half-width box via
// `object-cover`), cutting straight through the baked-in title text --
// right next to the SAME title already rendering as real, uncropped HTML
// text beside or below it. This route is just the brand mark + a soft
// category-colored glow, no text at all, so it can be cropped to any
// shape without ever losing or duplicating anything.
//
// opengraph-image.tsx itself is untouched -- it's still what social
// platforms pick up for real link-preview cards, where the baked-in title
// is the point.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  const accent = categoryAccent(post?.category ?? "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -180,
            width: 760,
            height: 760,
            borderRadius: 9999,
            background: `radial-gradient(ellipse at center, ${accent}66, ${accent}1a 45%, transparent 75%)`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -240,
            left: -200,
            width: 680,
            height: 680,
            borderRadius: 9999,
            background: "radial-gradient(ellipse at center, rgba(79,110,247,0.28), transparent 70%)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
          <svg width="76" height="76" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f6ef7" />
              </linearGradient>
            </defs>
            <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#g)" />
            <circle cx="7.5" cy="22.5" r="2" fill="#ffffff" fillOpacity="0.6" />
            <circle cx="14" cy="17.2" r="2.3" fill="#ffffff" fillOpacity="0.85" />
            <circle cx="19" cy="20.2" r="2" fill="#ffffff" fillOpacity="0.7" />
            <path
              d="M7.5 22.5 14 17.2 19 20.2 25.5 9.3"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M25.5 5.8 26.8 8.9 30 10.2 26.8 11.5 25.5 14.6 24.2 11.5 21 10.2 24.2 8.9Z" fill="#ffffff" />
          </svg>
          <div style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
            {APP_NAME.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
