// Builds the JSX passed to next/og's ImageResponse for the shareable Career
// PROFILE Card -- the quiz-answer-based card, deliberately separate from
// lib/careerCardImage.tsx (the memory-evidence-based Career WRAPPED card).
// Same dark gradient canvas as that card's family, but laid out as five
// equal, full-bleed bands stacked to fill the entire canvas edge to edge
// (see the "Product feedback" comment further down) rather than a floating
// panel with margins -- each band names the archetype AND says why, via
// the archetype's own one-line description.
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
  // The archetype's own "why" line (CareerProfileArchetype.description) --
  // product feedback wanted each row to say why, not just name the
  // archetype. Always generic to the archetype, never this user's actual
  // memories -- Career Profile stays quiz-answer-based, never blended with
  // Career Wrapped's memory evidence (see lib/careerProfile.ts).
  description: string;
};

export type CareerProfileCardData = {
  title: string; // e.g. "Shikhar's Career Profile"
  rows: CareerProfileCardRow[]; // always 5, in CAREER_PROFILE_QUIZ_ORDER order
};

// Taller than a standard 4:5 social crop (1080x1350) -- product feedback
// wanted bigger type and a real paragraph per row with nothing cramped, and
// there wasn't room for both inside 1350. 1500 for the five bands (see
// BAND_HEIGHT below) gives each band the extra headroom that needs without
// shrinking anything back down, plus HEADER_HEIGHT on top for the card's
// name -- product feedback wanted that big and clearly visible, not the
// small top-left label the first band used to carry. Still well within
// normal share-image proportions for a direct download/WhatsApp/LinkedIn/X
// share (this was never cropped to Instagram's feed grid).
const HEADER_HEIGHT = 200;
export const CAREER_PROFILE_CARD_SIZE = { width: 1080, height: 1500 + HEADER_HEIGHT };

// Converts a hex color to an rgba() string at the given alpha -- used to
// derive every tint/wash/border below from one base color per quiz instead
// of hand-picking a matching rgba for each, which is how these tend to
// drift out of sync with each other over time.
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// One accent color per quiz -- product feedback wanted this to read as an
// attractive, shareable infographic rather than a plain document, and a
// single amber accent on every row was a big part of why it read as flat.
// Each band now gets its own color identity (icon chip, eyebrow, numeral
// badge, and a soft corner wash on the band's own background).
const ROW_ACCENTS: Record<string, string> = {
  career_superpower: "#fbbf24", // amber
  corporate_character: "#38bdf8", // sky blue
  corporate_red_flag: "#fb7185", // rose
  ai_era_advantage: "#a78bfa", // violet
  career_mode: "#34d399", // emerald
};
const DEFAULT_ACCENT = "#fbbf24";

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
function BoltGlyph({ size = 26, color = "#f4b73f" }: { size?: number; color?: string }) {
  // Career Superpower
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill={color} />
    </svg>
  );
}
function EyeGlyph({ size = 26, color = "#f4b73f" }: { size?: number; color?: string }) {
  // Corporate Character
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5c5.5 0 9.5 5 10.5 7-1 2-5 7-10.5 7S2.5 14 1.5 12C2.5 10 6.5 5 12 5z" stroke={color} strokeWidth={1.8} fill="none" />
      <circle cx="12" cy="12" r="3.2" fill={color} />
    </svg>
  );
}
function FlagGlyph({ size = 26, color = "#f4b73f" }: { size?: number; color?: string }) {
  // Corporate Red Flag
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3v18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <path d="M6 4h13l-3.2 4.2L19 12.4H6z" fill={color} />
    </svg>
  );
}
function NodesGlyph({ size = 26, color = "#f4b73f" }: { size?: number; color?: string }) {
  // AI-Era Career Advantage -- abstract network/orchestration motif
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 18 12 6l6 12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="6" r="2.6" fill={color} />
      <circle cx="6" cy="18" r="2.6" fill={color} />
      <circle cx="18" cy="18" r="2.6" fill={color} />
    </svg>
  );
}
function CompassGlyph({ size = 26, color = "#f4b73f" }: { size?: number; color?: string }) {
  // Career Mode
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={1.8} fill="none" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" fill={color} />
    </svg>
  );
}

const QUIZ_GLYPHS: Record<string, (props: { size?: number; color?: string }) => ReturnType<typeof BoltGlyph>> = {
  career_superpower: BoltGlyph,
  corporate_character: EyeGlyph,
  corporate_red_flag: FlagGlyph,
  ai_era_advantage: NodesGlyph,
  career_mode: CompassGlyph,
};

// Product feedback (round 2): round 1 read as a plain document -- gray body
// text too small, every row the same monochrome amber-on-dark, nothing that
// made someone want to actually share it. Fix: a distinct accent color per
// quiz (ROW_ACCENTS) washes each band's own corner, colors its icon chip
// and numeral badge, and the "why" paragraph is bigger and brighter. Taller
// canvas (see CAREER_PROFILE_CARD_SIZE) gives the bigger type room to
// breathe without going back to feeling cramped.
const BAND_HEIGHT = (CAREER_PROFILE_CARD_SIZE.height - HEADER_HEIGHT) / 5; // 300 * 5 = 1500, exact, no remainder

// Keeps a row's "why" line from overflowing its band on an unusually long
// entry -- every current archetype description (see lib/careerProfile.ts)
// runs well under this, so it's a safety net, not the normal case. Satori
// has no reliable line-clamp, so this caps it by character count instead.
function truncateDescription(text: string, max = 320): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// The card's name, big and centered -- product feedback was that the old
// small top-left label buried inside the first band wasn't "clearly
// visible," so this is now its own full-width header strip above the five
// bands (see HEADER_HEIGHT). Centered eyebrow + centered name, same purple
// glow treatment the marketing site's own quiz-teaser section uses, so a
// card someone screenshots or shares immediately reads as "whose profile
// this is" before anything else on the page.
function Header({ cardTitle }: { cardTitle: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: HEADER_HEIGHT,
        flexShrink: 0,
        padding: "0 64px",
        background: "radial-gradient(circle at 50% 0%, rgba(124,58,237,0.35) 0%, rgba(0,0,0,0) 65%)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMarkSvg size={28} />
        <div style={{ display: "flex", fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "rgba(196,181,253,0.85)" }}>
          CAREER PROFILE
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: "100%",
          marginTop: 14,
          fontSize: 56,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.12,
          textAlign: "center",
          justifyContent: "center",
        }}
      >
        {cardTitle}
      </div>
    </div>
  );
}

// One full-bleed band -- a colored icon chip, eyebrow, archetype title, its
// full "why" paragraph in large, bright type, and a colored numeral badge.
// Each element pulls from this row's own ROW_ACCENTS color, so the five
// bands read as five distinct, colorful sections of one infographic rather
// than a uniform gray list. The first band also carries the card's title
// (who this is) and the last carries the Strivo.ai footer, both fit inside
// that band's own height rather than given separate bands of their own.
function Band({ row, index }: { row: CareerProfileCardRow; index: number }) {
  const Glyph = QUIZ_GLYPHS[row.quizId] ?? BoltGlyph;
  const accent = ROW_ACCENTS[row.quizId] ?? DEFAULT_ACCENT;
  const isLast = index === 4;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: BAND_HEIGHT,
        flexShrink: 0,
        padding: "0 56px",
        // A soft wash of this row's own accent color in the top-right
        // corner, fading back to transparent (so the dark base canvas
        // shows through everywhere else) -- gives each band its own color
        // identity without losing contrast for the text sitting on top.
        background: `radial-gradient(circle at 100% 0%, ${hexToRgba(accent, 0.24)} 0%, rgba(0,0,0,0) 62%)`,
        borderBottom: isLast ? "none" : `1px solid ${hexToRgba(accent, 0.22)}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexGrow: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 92,
            height: 92,
            flexShrink: 0,
            borderRadius: 26,
            background: `linear-gradient(135deg, ${hexToRgba(accent, 0.32)}, ${hexToRgba(accent, 0.12)})`,
            border: `1px solid ${hexToRgba(accent, 0.5)}`,
          }}
        >
          <Glyph size={40} color={accent} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {/* The category label ("CAREER SUPERPOWER", "CORPORATE RED FLAG",
              etc.) -- product feedback was that this needed to be bigger
              and bolder so it's immediately clear what each section is
              even before reading the specific result. Given its own
              colored badge (not just colored text) so it reads as a
              category tag, distinct from the archetype title below it. */}
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              fontSize: 23,
              fontWeight: 800,
              color: accent,
              letterSpacing: 1.2,
              background: hexToRgba(accent, 0.16),
              border: `1.5px solid ${hexToRgba(accent, 0.45)}`,
              borderRadius: 10,
              padding: "6px 14px",
            }}
          >
            {row.eyebrow}
          </div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 38, fontWeight: 800, color: "#ffffff", lineHeight: 1.08 }}>
            {row.title}
          </div>
          {!!row.description && (
            <div style={{ display: "flex", marginTop: 11, fontSize: 22, fontWeight: 500, color: "rgba(255,255,255,0.86)", lineHeight: 1.44 }}>
              {truncateDescription(row.description)}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            width: 58,
            height: 58,
            borderRadius: 29,
            background: hexToRgba(accent, 0.14),
            border: `1.5px solid ${hexToRgba(accent, 0.55)}`,
            fontSize: 21,
            fontWeight: 800,
            color: accent,
          }}
        >
          {index + 1}
        </div>
      </div>

      {isLast && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LogoMarkSvg size={20} />
            <div style={{ display: "flex", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>Generated by Strivo.ai</div>
          </div>
          <div style={{ display: "flex", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.38)" }}>Discover yours → strivo.ai</div>
        </div>
      )}
    </div>
  );
}

// The one Career Profile Card design -- five full-bleed bands, edge to
// edge, filling the entire canvas (see the file comment above).
function TemplateA(data: CareerProfileCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(150deg,#1a1330 0%,#241a42 45%,#1a2247 100%)",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      <Header cardTitle={data.title} />
      {data.rows.map((row, i) => (
        <Band key={row.quizId} row={row} index={i} />
      ))}
    </div>
  );
}

export function buildCareerProfileCardElement(data: CareerProfileCardData) {
  return <TemplateA {...data} />;
}
