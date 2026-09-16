// Builds the JSX passed to next/og's ImageResponse for the shareable Career
// Card -- shared by app/api/career-wrapped/share-image/[shareId]/route.ts
// (the Download button / native-share file), app/api/career-wrapped/
// card-preview/route.ts (the in-app live preview before anything is
// generated), and app/cw/[shareId]/opengraph-image.tsx (what LinkedIn/X/
// WhatsApp unfurl when the public share LINK is posted, since none of those
// platforms accept a raw image upload via a web share intent -- see the
// sharing plan in the Career Wrapped audit). All three call this same
// function so none of them can visually drift out of sync.
//
// Only one design now (originally offered 3 selectable templates -- product
// feedback was that the picker added a step for no reason, since this dark
// style already matches the rest of the app, so the picker was removed and
// this is the only one left). This is the SECOND density pass: the first
// pass (4 stats + up to 3 muscle lines + key insights) still read as "very
// empty" with a lot of dead vertical space once justifyContent:"space-between"
// spread only 1-2 populated sections across the full canvas height -- see the
// redesign notes below for what changed.
//
// Satori (what next/og renders through) only understands inline styles and
// a constrained CSS subset -- no Tailwind classes, `display: "flex"` set
// explicitly on every container (no default block layout) -- same
// constraints already documented in src/app/opengraph-image.tsx, the
// existing precedent this mirrors. No custom font loading, same as that
// file -- falls back to Satori's default system font. Satori has no
// `filter`/`backdrop-filter` support, so the "glow" / depth look below is
// built entirely from layered radial-gradient backgrounds (a gradient that
// fades to transparent reads as a soft blurred orb without needing an
// actual blur) rather than any blur filter.

export type CareerCardData = {
  title: string; // e.g. "Shikhar's Career"
  periodLabel: string; // "All Time" today; kept for when a year filter returns
  // A punchy 2-4 word persona title -- see buildCareerArchetype in
  // lib/careerWrapped.ts. The card's hero -- what makes this feel like an
  // identity worth posting rather than a stats dump (product feedback,
  // round 4: "add one archetype", "so that people proudly share it on
  // LinkedIn").
  archetype: string;
  strongestMuscle: string | null;
  // A single headline "read" on the person -- see buildCareerPersonaHeadline
  // in lib/careerWrapped.ts. This is the card's centerpiece insight.
  personaHeadline: string;
  // 2-3 short, forward-looking "what this person can aim for" lines -- see
  // buildCareerAchievementPotential in lib/careerWrapped.ts. Deliberately
  // NOT count-based ("1 leadership moment captured") -- product feedback,
  // round 4: that phrasing reads as "internal user" data, not something
  // worth sharing publicly. Rendered as-is; this file does no copywriting.
  achievementPotential: string[];
};

// Single design now -- kept as a type (rather than inlining "A" everywhere)
// so the DB column, share-creation code, and any future re-introduction of
// alternate styles don't need a wider change.
export type CareerCardTemplate = "A";

export const CAREER_CARD_SIZE = { width: 1080, height: 1350 };

const INK = "#1c1533";

function LogoMarkSvg({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="cw-g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f6ef7" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#cw-g)" />
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

// A small star glyph -- original shape, not a reproduction of any specific
// icon set or brand -- marks the archetype hero badge below.
function StarGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6L12 17.7l-5.8 3.1 1.1-6.6-4.8-4.7 6.6-.9z" fill={INK} />
    </svg>
  );
}

// A soft, borderless "orb" of light -- Satori has no blur filter, so the
// blurred look comes entirely from the gradient's own falloff to transparent.
function GlowOrb({ size, top, left, right, bottom, color }: { size: number; top?: number; left?: number; right?: number; bottom?: number; color: string }) {
  // Satori's style resolver expects every present key to be a real value --
  // an `undefined` entry (from only some of top/left/right/bottom being
  // passed) throws deep inside its CSS parser, so only the provided sides
  // are spread into the style object at all.
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

// A translucent "glass" tile -- the shared look behind every stat cell and
// aspect chip, so the card reads as one deliberate system of panels instead
// of loose floating text (the "very empty" feedback on the first version).
const GLASS_PANEL: Record<string, string | number> = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.14)",
};

function InsightLine({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ display: "flex", width: 7, height: 7, marginTop: 8, borderRadius: 4, background: "#f4b73f", flexShrink: 0 }} />
      <div style={{ display: "flex", flex: 1, fontSize: 20, lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>{text}</div>
    </div>
  );
}

// A big quote-mark glyph -- purely decorative, marks "THE READ" panel below
// as an editorial pull-quote rather than another data row.
function QuoteGlyph() {
  return (
    <svg width={34} height={26} viewBox="0 0 34 26" fill="none">
      <path
        d="M0 26V16.6C0 7 5.9 1.1 14 0l1.7 4.3C10 6 7.3 9.4 7 14.3h7v11.7H0zm18.6 0V16.6c0-9.6 5.9-15.5 14-16.6l1.7 4.3c-5.7 1.7-8.4 5.1-8.7 10h7v11.7H18.6z"
        fill="#f4b73f"
        fillOpacity={0.5}
      />
    </svg>
  );
}

// The one and only card design -- clean, dark, richly-layered purple/blue
// (matches the app's own DarkHeader tone; see the file comment above for why
// the other two candidate styles were dropped).
//
// THIRD design pass. The first two passes (stat grid + up to 5 muscle chips
// + count-based insight bullets) were rejected outright in product
// feedback round 4: "not something I would like to share on LinkedIn" --
// raw counts ("1 leadership moment captured") read as private/internal data,
// not something worth posting. This pass is a structural rewrite, not a
// tweak: everything count-based is gone. The card is now exactly four
// beats -- an archetype hero (the punchy identity someone would post), the
// strongest muscle behind it, "THE READ" (the persona headline), and
// "ACHIEVEMENT POTENTIAL" (2-3 forward-looking lines on what this skillset
// positions them to aim for) -- brief by design ("you don't have to make
// such a long card, it can be brief but meaningful").
//
// The "never leave dead space" structural fix from earlier passes carries
// over: the header and the archetype hero have fixed, content-driven
// heights, and the THE-READ/ACHIEVEMENT-POTENTIAL panel alone carries
// `flexGrow: 1` with `justifyContent: "center"` -- it always expands to
// consume exactly whatever vertical space is left before the footer, so the
// card fills the full 1080x1350 canvas on a two-line headline with 2 bullets
// just as well as a longer one with 3.
function TemplateA(data: CareerCardData) {
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
          CAREER WRAPPED
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 46, fontWeight: 800, color: "#ffffff", lineHeight: 1.12 }}>
          {data.title}
        </div>
      </div>

      {/* Archetype hero -- the card's headline identity, the one line
          someone would actually want next to their name on LinkedIn. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          marginTop: 28,
          borderRadius: 26,
          padding: "34px 34px 30px",
          background: "linear-gradient(135deg, rgba(244,183,63,0.22), rgba(124,58,237,0.22))",
          border: "1px solid rgba(244,183,63,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "linear-gradient(135deg,#fbd38d,#f4b73f)",
            }}
          >
            <StarGlyph />
          </div>
          <div style={{ display: "flex", fontSize: 15.5, fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: 1.5 }}>
            YOUR ARCHETYPE
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 58, fontWeight: 800, color: "#ffffff", lineHeight: 1.08 }}>
          {data.archetype}
        </div>
        {data.strongestMuscle && (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              marginTop: 18,
              fontSize: 17,
              fontWeight: 600,
              color: "rgba(255,255,255,0.75)",
              background: "rgba(255,255,255,0.09)",
              borderRadius: 999,
              padding: "8px 18px",
            }}
          >
            Strongest muscle: {data.strongestMuscle}
          </div>
        )}
      </div>

      <div
        style={{
          ...GLASS_PANEL,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          position: "relative",
          gap: 20,
          borderRadius: 24,
          padding: "32px 34px",
          marginTop: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <QuoteGlyph />
          <div style={{ display: "flex", fontSize: 15.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
            THE READ
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: "#ffffff", lineHeight: 1.32 }}>
          {data.personaHeadline}
        </div>

        {data.achievementPotential.length > 0 && (
          <div style={{ display: "flex", width: "100%", height: 1, background: "rgba(255,255,255,0.12)", marginTop: 6 }} />
        )}
        {data.achievementPotential.length > 0 && (
          <div style={{ display: "flex", fontSize: 15.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
            ACHIEVEMENT POTENTIAL
          </div>
        )}
        {data.achievementPotential.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.achievementPotential.map((text) => (
              <InsightLine key={text} text={text} />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", position: "relative", gap: 20, marginTop: 22 }}>
        <div style={{ display: "flex", width: "100%", height: 1, background: "rgba(255,255,255,0.12)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMarkSvg size={28} />
          <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
            Generated by Strivo.ai
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildCareerCardElement(data: CareerCardData) {
  return <TemplateA {...data} />;
}
