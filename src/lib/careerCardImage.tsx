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
// this is the only one left). Deliberately dense rather than the older,
// sparser version -- feedback was that a card with only 3 stats and 2
// muscle lines read as "very empty." Every field below still comes straight
// from the caller's already-computed CareerCardData -- see
// buildCareerCardInsights in lib/careerWrapped.ts for how the insights
// array itself is derived (deterministic, no AI call, no fabrication).
//
// Satori (what next/og renders through) only understands inline styles and
// a constrained CSS subset -- no Tailwind classes, `display: "flex"` set
// explicitly on every container (no default block layout) -- same
// constraints already documented in src/app/opengraph-image.tsx, the
// existing precedent this mirrors. No custom font loading, same as that
// file -- falls back to Satori's default system font.

export type CareerCardData = {
  title: string; // e.g. "Shikhar's Career"
  periodLabel: string; // "All Time" today; kept for when a year filter returns
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  seniorStakeholderCount: number;
  strongestMuscle: string | null;
  growingMuscle: string | null;
  underrepresentedMuscle: string | null;
  // Up to 3 short, already-composed sentences -- see buildCareerCardInsights.
  // Rendered as-is; this file does no copywriting of its own.
  insights: string[];
};

// Single design now -- kept as a type (rather than inlining "A" everywhere)
// so the DB column, share-creation code, and any future re-introduction of
// alternate styles don't need a wider change.
export type CareerCardTemplate = "A";

export const CAREER_CARD_SIZE = { width: 1080, height: 1350 };

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

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "44%" }}>
      <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: "#ffffff" }}>{value}</div>
      <div style={{ display: "flex", marginTop: 2, fontSize: 20, color: "rgba(255,255,255,0.55)" }}>{label}</div>
    </div>
  );
}

function MuscleLine({ eyebrow, value }: { eyebrow: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>
        {eyebrow}
      </div>
      <div style={{ display: "flex", marginTop: 2, fontSize: 30, fontWeight: 800, color: "#ffffff" }}>{value}</div>
    </div>
  );
}

function InsightLine({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ display: "flex", width: 7, height: 7, marginTop: 9, borderRadius: 4, background: "#f4b73f" }} />
      <div style={{ display: "flex", flex: 1, fontSize: 22, lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>{text}</div>
    </div>
  );
}

// The one and only card design -- clean, dark, professional (matches the
// app's own DarkHeader tone; see the file comment above for why the other
// two candidate styles were dropped).
function TemplateA(data: CareerCardData) {
  const hasMuscleLines = data.strongestMuscle || data.growingMuscle || data.underrepresentedMuscle;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 68,
        background: "linear-gradient(135deg,#221a38,#2f1f3d)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#f4b73f", letterSpacing: 3 }}>
          CAREER WRAPPED
        </div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 52, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>
          {data.title}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 26, columnGap: 24 }}>
        <StatCell label="Wins captured" value={data.winsCount} />
        <StatCell label="Leadership moments" value={data.leadershipCount} />
        <StatCell label="Problems solved" value={data.problemsSolvedCount} />
        <StatCell label="Senior-stakeholder interactions" value={data.seniorStakeholderCount} />
      </div>

      {hasMuscleLines && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data.strongestMuscle && <MuscleLine eyebrow="STRONGEST CAREER MUSCLE" value={data.strongestMuscle} />}
          {data.growingMuscle && <MuscleLine eyebrow="GROWING FASTEST" value={data.growingMuscle} />}
          {data.underrepresentedMuscle && <MuscleLine eyebrow="UNDERREPRESENTED" value={data.underrepresentedMuscle} />}
        </div>
      )}

      {data.insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>
            KEY INSIGHTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.insights.map((text) => (
              <InsightLine key={text} text={text} />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMarkSvg size={30} />
        <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
          Generated by Strivo.ai
        </div>
      </div>
    </div>
  );
}

export function buildCareerCardElement(data: CareerCardData) {
  return <TemplateA {...data} />;
}
