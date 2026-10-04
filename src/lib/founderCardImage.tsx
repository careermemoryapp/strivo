// Builds the JSX passed to next/og's ImageResponse for the shareable
// Founding Member card -- shared by
// app/api/founding-member/share-image/[shareId]/route.ts (the Download
// button / native-share file) and app/fm/[shareId]/opengraph-image.tsx
// (what LinkedIn/X/WhatsApp/Instagram unfurl when the public share LINK is
// posted). Both call this same function so the two can never visually
// drift apart -- same discipline as lib/careerCardImage.tsx, which this
// file deliberately mirrors rather than imports from: careerCardImage.tsx
// is working, tested code for a different feature (Career Wrapped), and
// its small SVG/style helpers aren't exported, so this duplicates the
// handful it needs (LogoMarkSvg, GlowOrb) rather than changing that file's
// exports just to share them.
//
// Satori (what next/og renders through) only understands inline styles and
// a constrained CSS subset -- same constraints documented in
// careerCardImage.tsx's file comment, which this mirrors exactly: explicit
// `display: "flex"` on every container, no blur filter (the glow look
// comes from radial-gradient falloff), no custom font loading.

export type FoundingMemberCardData = {
  firstName: string;
  memberNumber: number;
  cap: number;
  joinedDateLabel: string; // e.g. "October 2026"
};

export const FOUNDING_MEMBER_CARD_SIZE = { width: 1080, height: 1350 };

function LogoMarkSvg({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="fm-g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f6ef7" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#fm-g)" />
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
  );
}

// A six-point badge/seal glyph -- original shape, not a reproduction of any
// specific icon set, medal, or brand mark. Marks the number hero as an
// awarded badge rather than a plain statistic.
function SealGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 1.5l2.1 2.1 2.9-.6 1 2.8 2.8 1-.6 2.9 2.1 2.1-2.1 2.1.6 2.9-2.8 1-1 2.8-2.9-.6L12 22.5l-2.1-2.1-2.9.6-1-2.8-2.8-1 .6-2.9-2.1-2.1 2.1-2.1-.6-2.9 2.8-1 1-2.8 2.9.6z"
        fill="#1c1533"
      />
    </svg>
  );
}

function GlowOrb({ size, top, left, right, bottom, color }: { size: number; top?: number; left?: number; right?: number; bottom?: number; color: string }) {
  const position: Record<string, number> = {};
  if (top !== undefined) position.top = top;
  if (left !== undefined) position.left = left;
  if (right !== undefined) position.right = right;
  if (bottom !== undefined) position.bottom = bottom;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        width: size,
        height: size,
        ...position,
        borderRadius: size,
        background: `radial-gradient(circle, ${color} 0%, rgba(0,0,0,0) 72%)`,
      }}
    />
  );
}

// The one and only design -- same dark violet/blue/gold palette as the
// rest of the brand (StickyGetAppBar, the homepage hero, careerCardImage's
// Career Card), so a Founding Member card reads as unmistakably Strivo's
// own, not a generic achievement-badge template. Structurally simple on
// purpose: a huge "#N" is the entire point of the card -- there's no stat
// grid or insight list to balance against it the way Career Wrapped's card
// has to, so most of the canvas is given to one enormous number and the
// name beneath it.
function FoundingMemberCard(data: FoundingMemberCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        flexDirection: "column",
        padding: 60,
        background: "linear-gradient(150deg,#1a1330 0%,#241a42 45%,#1a2247 100%)",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      <GlowOrb size={640} top={-220} right={-200} color="rgba(124,58,237,0.55)" />
      <GlowOrb size={560} bottom={-180} left={-160} color="rgba(56,90,220,0.45)" />
      <GlowOrb size={420} top={260} right={-140} color="rgba(244,183,63,0.16)" />

      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <LogoMarkSvg size={34} />
        <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: 1.5 }}>
          STRIVO.AI
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          marginTop: 30,
          borderRadius: 32,
          flexGrow: 1,
          justifyContent: "center",
          padding: "40px 40px",
          background: "linear-gradient(135deg, rgba(244,183,63,0.2), rgba(124,58,237,0.22))",
          border: "1px solid rgba(244,183,63,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(244,183,63,0.16)",
            border: "1px solid rgba(244,183,63,0.4)",
            borderRadius: 999,
            padding: "10px 22px",
          }}
        >
          <SealGlyph size={18} />
          <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "#f4b73f", letterSpacing: 3 }}>
            FOUNDING MEMBER
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginTop: 30,
            fontSize: 190,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: -4,
          }}
        >
          <div style={{ display: "flex", fontSize: 90, fontWeight: 800, color: "rgba(255,255,255,0.5)", marginRight: 4 }}>
            #
          </div>
          {data.memberNumber}
        </div>

        <div style={{ display: "flex", marginTop: 8, fontSize: 36, fontWeight: 800, color: "#ffffff" }}>
          {data.firstName}
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 19, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>
          one of the first {data.cap.toLocaleString("en-US")} people on Strivo
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", position: "relative", gap: 16, marginTop: 24 }}>
        <div style={{ display: "flex", width: "100%", height: 1, background: "rgba(255,255,255,0.12)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
            Joined {data.joinedDateLabel}
          </div>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
            strivo.ai
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildFoundingMemberCardElement(data: FoundingMemberCardData) {
  return <FoundingMemberCard {...data} />;
}
