import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config";
import { getBlogPostBySlug } from "@/lib/repo/blogPosts";

// Branded cover graphic per blog post — used both as the link-preview image
// (WhatsApp/LinkedIn/Twitter) and as the actual cover shown inline on the
// blog listing and post pages (see the <img src={`/blog/${slug}/opengraph-image`}>
// references there). No photo-realistic AI image generator is wired up, so
// this is a designed graphic (title + category + brand mark on the dark
// theme) rather than a photo — rendered at request time with next/og, so a
// freshly published post gets a cover immediately with no extra step.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BlogPostOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  const title = post?.title ?? APP_NAME;
  const category = post?.category ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0f",
          padding: 72,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -160,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.4), rgba(79,110,247,0.15) 45%, transparent 75%)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
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
          <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
            {APP_NAME.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          {category && (
            <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa", letterSpacing: 3, marginBottom: 20 }}>
              {category.toUpperCase()}
            </div>
          )}
          <div
            style={{
              fontSize: title.length > 60 ? 48 : 58,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
