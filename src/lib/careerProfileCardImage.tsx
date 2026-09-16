// Builds the JSX passed to next/og's ImageResponse for the shareable Career
// PROFILE Card -- the quiz-answer-based card, deliberately separate from
// lib/careerCardImage.tsx (the memory-evidence-based Career WRAPPED card).
// Same visual family (dark gradient/glass canvas, same footer treatment) so
// the two read as siblings from one brand system, but this one is
// structurally simpler by design (see the Home redesign plan's "Proposed
// Career Profile Card" mockup): five equal-weight result rows, no stats, no
// paragraphs -- built to be scannable at social-feed size.
//
// Shared by app/api/career-profile/card-preview/route.ts (the live in-app
// preview before anything is generated), app/api/career-profile/
// share-image/[shareId]/route.ts (the Download button / native-share file),
// and app/cp/[shareId]/opengraph-image.tsx (what LinkedIn/X/WhatsApp unfurl
// when the public share link is posted) -- all three call this same
// function so they can never visually drift out of sync, exactly like
// careerCardImage.tsx's own three call sites.
//
// Satori constraints carried over unchanged from careerCardImage.tsx: no
// Tailwind classes, `display: "flex"` set explicitly on every container, no
// blur filters (glow orbs are radial gradients fading to transparent), and
// -- learned the hard way while building the Career Wrapped card -- never
// wrap sibling content in a React Fragment nested a level deeper than its
// parent flex column; Satori/Yoga mis-measures the fragment's children as a
// narrow overflowing column instead of stretching them full width. Every
// row below is a direct, flat sibling of its container for exactly that
// reason.

export type CareerProfileCardRow = {
  quizId: string; // CareerProfileQuizId -- looked up against QUIZ_GLYPHS below for the row's icon
  eyebrow: string; // e.g. "CAREER SUPERPOWER" -- CareerProfileQuizMeta.resultLabel
  title: string; // e.g. "Strategic Problem Solver" -- the archetype title, "The "/"Owner Mode" etc as-is
};

export type CareerProfileCardData = {
  title: string; // e.g. "Shikhar's Career Profile"
  rows: CareerProfileCardRow[]; // always 5, in CAREER_PROFILE_QUIZ_ORDER order
};

export const CAREER_PROFILE_CARD_SIZE = { width: 1080, height: 1350 };

function LogoMarkSvg({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="cp-g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f6ef7" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#cp-g)" />
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

// Per-quiz row glyphs -- original, abstract single-color SVG shapes, NOT
// unicode emoji. Satori's emoji rendering fetches each glyph as an SVG from
// an external CDN (twemoji by default) at render time; that's an extra
// network round-trip per emoji per render with no local fallback if the
// fetch fails or is blocked, which careerCardImage.tsx already avoids
// entirely (see StarGlyph/QuoteGlyph there) by drawing its own inline
// glyphs instead. Same fix here, one simple original shape per quiz so the
// row keeps a distinct, recognizable icon without depending on the network.
function BoltGlyph() {
  // Career Superpower
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#f4b73f" />
    </svg>
  );
}
function EyeGlyph() {
  // Corporate Character
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <path d="M12 5c5.5 0 9.5 5 10.5 7-1 2-5 7-10.5 7S2.5 14 1.5 12C2.5 10 6.5 5 12 5z" stroke="#f4b73f" strokeWidth={1.8} fill="none" />
      <circle cx="12" cy="12" r="3.2" fill="#f4b73f" />
    </svg>
  );
}
function FlagGlyph() {
  // Corporate Red Flag
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <path d="M6 3v18" stroke="#f4b73f" strokeWidth={2} strokeLinecap="round" />
      <path d="M6 4h13l-3.2 4.2L19 12.4H6z" fill="#f4b73f" />
    </svg>
  );
}
function NodesGlyph() {
  // AI-Era Career Advantage -- abstract network/orchestration motif
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <path d="M6 18 12 6l6 12" stroke="#f4b73f" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="6" r="2.6" fill="#f4b73f" />
      <circle cx="6" cy="18" r="2.6" fill="#f4b73f" />
      <circle cx="18" cy="18" r="2.6" fill="#f4b73f" />
    </svg>
  );
}
function CompassGlyph() {
  // Career Mode
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke="#f4b73f" strokeWidth={1.8} fill="none" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" fill="#f4b73f" />
    </svg>
  );
}

const QUIZ_GLYPHS: Record<string, () => ReturnType<typeof BoltGlyph>> = {
  career_superpower: BoltGlyph,
  corporate_character: EyeGlyph,
  corporate_red_flag: FlagGlyph,
  ai_era_advantage: NodesGlyph,
  career_mode: CompassGlyph,
};

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

const GLASS_PANEL: Record<string, string | number> = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.14)",
};

// One result row -- icon chip, eyebrow label, bold title. A flat sibling in
// the panel's children array (see the file comment on why this matters).
function ResultRow({ row }: { row: CareerProfileCardRow }) {
  const Glyph = QUIZ_GLYPHS[row.quizId] ?? BoltGlyph;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: 16,
          background: "rgba(255,255,255,0.09)",
        }}
      >
        <Glyph />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: "#f4b73f", letterSpacing: 1.5 }}>{row.eyebrow}</div>
        <div style={{ display: "flex", marginTop: 4, fontSize: 27, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>{row.title}</div>
      </div>
    </div>
  );
}

function RowDivider() {
  return <div style={{ display: "flex", width: "100%", height: 1, background: "rgba(255,255,255,0.12)" }} />;
}

// The one Career Profile Card design -- dark gradient canvas matching
// Career Wrapped's TemplateA tone, structurally simpler: an eyebrow +
// title header, then five equal-weight rows with dividers between them,
// then the same footer treatment as the Wrapped card.
function TemplateA(data: CareerProfileCardData) {
  // Flattened, not a Fragment: dividers are interleaved directly into the
  // rows array so every element handed to the panel below is a direct,
  // equal-depth sibling (see the file comment's Satori/Yoga warning).
  const rowElements = data.rows.flatMap((row, i) => {
    const nodes = [];
    if (i > 0) nodes.push(<RowDivider key={`divider-${row.eyebrow}`} />);
    nodes.push(<ResultRow key={row.eyebrow} row={row} />);
    return nodes;
  });

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

      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            alignItems: "center",
            fontSize: 20,
            fontWeight: 700,
            color: "#f4b73f",
            letterSpacing: 3,
            background: "rgba(244,183,63,0.14)",
            border: "1px solid rgba(244,183,63,0.3)",
            borderRadius: 999,
            padding: "8px 18px",
          }}
        >
          CAREER PROFILE
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 46, fontWeight: 800, color: "#ffffff", lineHeight: 1.12 }}>
          {data.title}
        </div>
      </div>

      <div
        style={{
          ...GLASS_PANEL,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          position: "relative",
          gap: 26,
          borderRadius: 26,
          padding: "40px 36px",
          marginTop: 30,
        }}
      >
        {rowElements}
      </div>

      <div style={{ display: "flex", flexDirection: "column", position: "relative", gap: 20, marginTop: 22 }}>
        <div style={{ display: "flex", width: "100%", height: 1, background: "rgba(255,255,255,0.12)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoMarkSvg size={28} />
            <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
              Generated by Strivo.ai
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>Discover yours → strivo.ai</div>
        </div>
      </div>
    </div>
  );
}

export function buildCareerProfileCardElement(data: CareerProfileCardData) {
  return <TemplateA {...data} />;
}
