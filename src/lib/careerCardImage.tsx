// Builds the JSX passed to next/og's ImageResponse for a shareable Career
// Card -- shared by app/api/career-wrapped/share-image/[shareId]/route.ts
// (the Download button / native-share file) and app/cw/[shareId]/
// opengraph-image.tsx (what LinkedIn/X/WhatsApp unfurl when the public
// share LINK is posted, since none of those platforms accept a raw image
// upload via a web share intent -- see the sharing plan in the Career
// Wrapped audit). Both call this same function so the two can never
// visually drift out of sync.
//
// Satori (what next/og renders through) only understands inline styles and
// a constrained CSS subset -- no Tailwind classes, `display: "flex"` set
// explicitly on every container (no default block layout) -- same
// constraints already documented in src/app/opengraph-image.tsx, the
// existing precedent this mirrors. No custom font loading, same as that
// file -- falls back to Satori's default system font.

export type CareerCardData = {
  title: string; // e.g. "Shikhar's 2026 Career" or "Your 2026 Career"
  periodLabel: string; // "2026" or "All Time"
  winsCount: number;
  leadershipCount: number;
  problemsSolvedCount: number;
  strongestMuscle: string | null;
  growingMuscle: string | null;
};

export type CareerCardTemplate = "A" | "B" | "C";

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

// Template A -- clean professional/premium (dark, matches the app's own
// DarkHeader tone).
function TemplateA(data: CareerCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg,#221a38,#2f1f3d)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#f4b73f", letterSpacing: 2 }}>
          {data.periodLabel.toUpperCase()} CAREER
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 56, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>
          {data.title}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <StatRow label="Wins captured" value={data.winsCount} />
        <StatRow label="Leadership moments" value={data.leadershipCount} />
        <StatRow label="Problems solved" value={data.problemsSolvedCount} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {data.strongestMuscle && <MuscleLine eyebrow="STRONGEST CAREER MUSCLE" value={data.strongestMuscle} />}
        {data.growingMuscle && <MuscleLine eyebrow="GROWING FASTEST" value={data.growingMuscle} />}
      </div>

      <Attribution light />
    </div>
  );
}

// Template B -- bold "Wrapped" style, vibrant gradient, bigger numbers, more
// visual personality. Deliberately not Spotify's own colors/typography --
// this takes the IDEA of an annual personal summary, not its protected
// visual identity.
function TemplateB(data: CareerCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(160deg,#fb923c,#f472b6 45%,#a855f7 90%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "rgba(28,10,40,0.65)", letterSpacing: 2 }}>
          {data.periodLabel.toUpperCase()}
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 68, fontWeight: 900, color: "#1c0a28", lineHeight: 1.05 }}>
          {data.title}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <BigStat label="Wins captured" value={data.winsCount} />
        <BigStat label="Leadership moments" value={data.leadershipCount} />
        <BigStat label="Problems solved" value={data.problemsSolvedCount} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {data.strongestMuscle && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "20px 26px",
              borderRadius: 20,
              background: "rgba(28,10,40,0.16)",
            }}
          >
            <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "rgba(28,10,40,0.6)" }}>
              STRONGEST CAREER MUSCLE
            </div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 36, fontWeight: 800, color: "#1c0a28" }}>
              {data.strongestMuscle}
            </div>
          </div>
        )}
      </div>

      <Attribution light={false} />
    </div>
  );
}

// Template C -- minimal, light "career intelligence" card.
function TemplateC(data: CareerCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#ffffff",
        fontFamily: "sans-serif",
        border: "1px solid #ece9f5",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#7c3aed", letterSpacing: 2 }}>
          {data.periodLabel.toUpperCase()} CAREER
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 52, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
          {data.title}
        </div>
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        <MinimalStat label="Wins" value={data.winsCount} />
        <MinimalStat label="Leadership" value={data.leadershipCount} />
        <MinimalStat label="Problems solved" value={data.problemsSolvedCount} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {data.strongestMuscle && <MuscleLine dark eyebrow="STRONGEST CAREER MUSCLE" value={data.strongestMuscle} />}
        {data.growingMuscle && <MuscleLine dark eyebrow="GROWING FASTEST" value={data.growingMuscle} />}
      </div>

      <Attribution light={false} dark />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#ffffff" }}>{value}</div>
      <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.6)" }}>{label}</div>
    </div>
  );
}
function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
      <div style={{ display: "flex", fontSize: 56, fontWeight: 900, color: "#1c0a28" }}>{value}</div>
      <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "rgba(28,10,40,0.7)" }}>{label}</div>
    </div>
  );
}
function MinimalStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 48, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      <div style={{ display: "flex", fontSize: 20, color: "#5b6478" }}>{label}</div>
    </div>
  );
}
function MuscleLine({ eyebrow, value, dark }: { eyebrow: string; value: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: dark ? "#94a0b8" : "rgba(255,255,255,0.45)" }}>
        {eyebrow}
      </div>
      <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: dark ? "#0f172a" : "#ffffff" }}>{value}</div>
    </div>
  );
}

function Attribution({ light, dark }: { light: boolean; dark?: boolean }) {
  const textColor = dark ? "#5b6478" : light ? "rgba(255,255,255,0.55)" : "rgba(28,10,40,0.6)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <LogoMarkSvg size={30} />
      <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: textColor }}>Generated by Strivo.ai</div>
    </div>
  );
}

export function buildCareerCardElement(data: CareerCardData, template: CareerCardTemplate) {
  if (template === "B") return <TemplateB {...data} />;
  if (template === "C") return <TemplateC {...data} />;
  return <TemplateA {...data} />;
}
