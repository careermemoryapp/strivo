import { cn } from "@/lib/utils";

// The Strivo mark: your captured memories (the small dots) tracing an
// upward path that resolves into a bright four-point spark — the AI turning
// personal experience into growth and insight. Two-tone gradient tile
// (purple -> blue) matches the brand-primary/secondary theme tokens. Used
// everywhere the app name/icon appears (headers, auth screens). Change the
// two stop colors here (or the theme tokens they reference) to re-skin.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
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
        <filter id="strivo-logo-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#1e1b4b" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Rounded-square brand tile, like a proper app icon */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#strivo-logo-bg)" />

      <g filter="url(#strivo-logo-shadow)">
        {/* Three captured memories, rising */}
        <circle cx="7.5" cy="22.5" r="2" fill="#ffffff" fillOpacity="0.6" />
        <circle cx="14" cy="17.2" r="2.3" fill="#ffffff" fillOpacity="0.85" />
        <circle cx="19" cy="20.2" r="2" fill="#ffffff" fillOpacity="0.7" />
        {/* Path connecting them, rising toward the insight */}
        <path
          d="M7.5 22.5 14 17.2 19 20.2 25.5 9.3"
          stroke="#ffffff"
          strokeOpacity="0.9"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* The AI spark — insight generated from those memories */}
        <path
          d="M25.5 5.8 26.8 8.9 30 10.2 26.8 11.5 25.5 14.6 24.2 11.5 21 10.2 24.2 8.9Z"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}

export function LogoWithWordmark({ size = 32, className }: { size?: number; className?: string }) {
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
