import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config";

// Auto-wired by Next.js into <meta property="og:image"> (and used as the
// Twitter card fallback image) for every page that doesn't define its own
// opengraph-image — so the homepage, and any page without a more specific
// override, gets this same branded 1200x630 card when shared on
// WhatsApp/iMessage/LinkedIn/Twitter/Slack etc. Rendered at request time
// with next/og (Satori), not a static file, so it can't go stale.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            left: "50%",
            transform: "translateX(-50%)",
            width: 900,
            height: 500,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.45), rgba(79,110,247,0.2) 45%, transparent 75%)",
            display: "flex",
          }}
        />
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none" style={{ position: "relative" }}>
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
        <div
          style={{
            marginTop: 32,
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            position: "relative",
          }}
        >
          {APP_NAME.toUpperCase()}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 32,
            color: "#a0a0ac",
            position: "relative",
          }}
        >
          Never forget the story that gets you the offer.
        </div>
      </div>
    ),
    { ...size }
  );
}
