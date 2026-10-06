// Builds the JSX passed to next/og's ImageResponse for the shareable
// Founding Member card -- shared by
// app/api/founding-member/share-image/[shareId]/route.ts (the Download
// button / native-share file), app/fm/[shareId]/opengraph-image.tsx (what
// LinkedIn/X/WhatsApp/Instagram unfurl when the public share LINK is
// posted), and api/public/founding-member-preview-image/route.ts (the
// live "what you'd get" preview on the homepage). All three call this same
// function so none of them can ever visually drift apart -- same
// discipline as lib/careerCardImage.tsx, which this file deliberately
// mirrors rather than imports from: careerCardImage.tsx is working, tested
// code for a different feature (Career Wrapped), and its small SVG/style
// helpers aren't exported, so this duplicates the handful it needs
// (LogoMarkSvg, GlowOrb) rather than changing that file's exports just to
// share them.
//
// Satori (what next/og renders through) only understands inline styles and
// a constrained CSS subset -- same constraints documented in
// careerCardImage.tsx's file comment, which this mirrors exactly: explicit
// `display: "flex"` on every container, no blur filter (the glow look
// comes from radial-gradient falloff), no custom font loading. The laurel
// branches and seal are drawn as plain SVG paths (no CSS transform) for
// the same reason -- Satori's SVG support is the safe, well-trodden path;
// its CSS transform support is the riskier corner to lean on.
//
// Redesigned 2026-10-06 per direct founder feedback: "the card is not
// beautiful, just a boring card with the number... give me something that
// excites people, feels proud, number big." This card is the one artifact
// a founding member actually shows other people (LinkedIn, WhatsApp,
// Instagram), so it has to read as something worth posting, not a plain
// stat screenshot. The redesign leans into "certificate of membership"
// cues -- laurel branches, a gold medallion seal, a glowing halo behind
// the number, a corner-bracket frame around the whole card -- while
// keeping the number itself the single biggest, brightest thing on the
// canvas, exactly as asked.

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
// specific icon set, medal, or brand mark. Sits inside the gold medallion
// coin above the big number, marking it as an awarded badge rather than a
// plain statistic.
function SealGlyph({ size = 26, color = "#1c1533" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 1.5l2.1 2.1 2.9-.6 1 2.8 2.8 1-.6 2.9 2.1 2.1-2.1 2.1.6 2.9-2.8 1-1 2.8-2.9-.6L12 22.5l-2.1-2.1-2.9.6-1-2.8-2.8-1 .6-2.9-2.1-2.1 2.1-2.1-.6-2.9 2.8-1 1-2.8 2.9.6z"
        fill={color}
      />
    </svg>
  );
}

// A simple laurel branch -- the universal, centuries-old "achievement"
// motif (not a reproduction of any specific logo, icon set, or artwork),
// drawn as a plain SVG path plus ellipse leaves. `flip` mirrors the
// coordinates by hand (rather than relying on a CSS transform) so both
// branches render from the exact same shape data and stay pixel-identical,
// just reflected, flanking the big number like a medal's wreath.
function LaurelBranch({ size = 60, flip = false }: { size?: number; flip?: boolean }) {
  const leaves = [
    { cx: 33, cy: 7, rot: -28 },
    { cx: 28, cy: 18, rot: -40 },
    { cx: 25, cy: 30, rot: -54 },
    { cx: 23, cy: 42, rot: -68 },
    { cx: 24, cy: 54, rot: -82 },
    { cx: 27, cy: 65, rot: -96 },
  ];
  const mirror = (x: number) => 44 - x;
  const stemD = flip
    ? "M6 2C13 13 18 26 20 39C22 51 21 60 17 68"
    : "M38 2C31 13 26 26 24 39C22 51 23 60 27 68";
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 44 70" fill="none">
      <path d={stemD} stroke="#f4c969" strokeOpacity="0.95" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      {leaves.map((l, i) => {
        const cx = flip ? mirror(l.cx) : l.cx;
        const rot = flip ? -l.rot : l.rot;
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={l.cy}
            rx="10.5"
            ry="5.4"
            fill="#f4c969"
            fillOpacity={0.95 - i * 0.05}
            transform={`rotate(${rot} ${cx} ${l.cy})`}
          />
        );
      })}
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
// own, not a generic achievement-badge template. The big "#N" is still the
// entire point of the card -- everything else (laurels, medallion, glow
// halo, corner frame) exists only to make that number feel like something
// worth being proud of, not to compete with it for attention.
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
        background: "linear-gradient(160deg,#150e26 0%,#241a42 42%,#141f3e 100%)",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      <GlowOrb size={640} top={-220} right={-200} color="rgba(124,58,237,0.5)" />
      <GlowOrb size={560} bottom={-180} left={-160} color="rgba(56,90,220,0.42)" />
      <GlowOrb size={620} top={430} left={230} color="rgba(244,183,63,0.3)" />

      {/* Certificate-style corner frame -- the "this is worth keeping" cue
          around the whole card, echoed by the medallion/laurel treatment
          inside it. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 34,
          left: 34,
          width: 44,
          height: 44,
          borderTop: "2px solid rgba(244,183,63,0.45)",
          borderLeft: "2px solid rgba(244,183,63,0.45)",
          borderRadius: "10px 0 0 0",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 34,
          right: 34,
          width: 44,
          height: 44,
          borderTop: "2px solid rgba(244,183,63,0.45)",
          borderRight: "2px solid rgba(244,183,63,0.45)",
          borderRadius: "0 10px 0 0",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: 34,
          left: 34,
          width: 44,
          height: 44,
          borderBottom: "2px solid rgba(244,183,63,0.45)",
          borderLeft: "2px solid rgba(244,183,63,0.45)",
          borderRadius: "0 0 0 10px",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: 34,
          right: 34,
          width: 44,
          height: 44,
          borderBottom: "2px solid rgba(244,183,63,0.45)",
          borderRight: "2px solid rgba(244,183,63,0.45)",
          borderRadius: "0 0 10px 0",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMarkSvg size={34} />
          <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: 1.5 }}>
            STRIVO.AI
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(244,183,63,0.12)",
            border: "1px solid rgba(244,183,63,0.4)",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1.2,
            color: "#f4c969",
          }}
        >
          LIMITED TO {data.cap.toLocaleString("en-US")}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          marginTop: 26,
          borderRadius: 32,
          flexGrow: 1,
          justifyContent: "center",
          padding: "36px 40px",
          background: "linear-gradient(135deg, rgba(244,183,63,0.16), rgba(124,58,237,0.2))",
          border: "1px solid rgba(244,183,63,0.32)",
          boxShadow: "0 0 70px rgba(124,58,237,0.18)",
        }}
      >
        {/* Medallion seal */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            borderRadius: 72,
            background: "linear-gradient(145deg,#ffe9b0,#f4b73f 55%,#c8862a)",
            boxShadow: "0 0 44px rgba(244,183,63,0.6)",
          }}
        >
          <SealGlyph size={34} />
        </div>

        <div style={{ display: "flex", marginTop: 18, fontSize: 23, fontWeight: 700, color: "#f4c969", letterSpacing: 5 }}>
          FOUNDING MEMBER
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 32, gap: 24 }}>
          <div style={{ display: "flex", marginBottom: 46 }}>
            <LaurelBranch size={108} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: 210,
              fontWeight: 800,
              color: "#fffaf0",
              letterSpacing: -6,
              textShadow: "0 0 80px rgba(244,183,63,0.65), 0 0 26px rgba(244,183,63,0.55)",
            }}
          >
            <div style={{ display: "flex", fontSize: 98, fontWeight: 800, color: "rgba(244,201,105,0.9)", marginRight: 2 }}>
              #
            </div>
            {data.memberNumber}
          </div>
          <div style={{ display: "flex", marginBottom: 46 }}>
            <LaurelBranch size={108} flip />
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 26, fontSize: 44, fontWeight: 800, color: "#ffffff" }}>
          {data.firstName}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 16, gap: 12 }}>
          <div style={{ display: "flex", width: 5, height: 5, borderRadius: 5, background: "rgba(244,183,63,0.6)" }} />
          <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,0.64)" }}>
            one of the first {data.cap.toLocaleString("en-US")} people on Strivo, forever
          </div>
          <div style={{ display: "flex", width: 5, height: 5, borderRadius: 5, background: "rgba(244,183,63,0.6)" }} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 30,
            background: "rgba(124,58,237,0.18)",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 999,
            padding: "11px 24px",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: "rgba(230,222,255,0.85)",
          }}
        >
          Lifetime badge · yours even at a billion users
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
