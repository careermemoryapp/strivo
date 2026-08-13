import { cn } from "@/lib/utils";

// The Strivo mark: an ascending chevron/arrow built from three stacked bars
// of increasing height, symbolizing forward motion and growth ("strive").
// Two-tone gradient (purple -> blue) matches the brand-primary/secondary
// theme tokens. Used everywhere the app name/icon appears (headers, auth
// screens). Change the two stop colors here (or the theme tokens they
// reference) to re-skin the mark.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="strivo-logo-bg" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f6ef7" />
        </linearGradient>
        <linearGradient id="strivo-logo-fill" x1="4" y1="27" x2="27" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="strivo-logo-arrow" x1="17" y1="15" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <filter id="strivo-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#4c1d95" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* Rounded-square brand tile, like a proper app icon */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#strivo-logo-bg)" />

      <g filter="url(#strivo-logo-shadow)">
        {/* Three ascending bars — rising momentum */}
        <rect x="6.5" y="18" width="5" height="8.5" rx="1.8" fill="url(#strivo-logo-fill)" />
        <rect x="13.5" y="13" width="5" height="13.5" rx="1.8" fill="url(#strivo-logo-fill)" />
        <rect x="20.5" y="7.5" width="5" height="19" rx="1.8" fill="url(#strivo-logo-fill)" />
      </g>
      {/* Upward arrow accent, echoing the rise of the bars */}
      <path
        d="M17 10.2 25.5 5.3l.9 7.6"
        stroke="url(#strivo-logo-arrow)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function LogoWithWordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span
        className="font-extrabold text-ink tracking-tight"
        style={{ fontSize: size * 0.72, letterSpacing: "-0.02em" }}
      >
        Strivo
      </span>
    </div>
  );
}
