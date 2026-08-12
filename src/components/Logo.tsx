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
        <linearGradient id="strivo-logo-fill" x1="4" y1="26" x2="28" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f6ef7" />
        </linearGradient>
        <linearGradient id="strivo-logo-arrow" x1="18" y1="14" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f6ef7" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      {/* Three ascending bars — rising momentum */}
      <rect x="4" y="18" width="6" height="10" rx="2" fill="url(#strivo-logo-fill)" />
      <rect x="13" y="12" width="6" height="16" rx="2" fill="url(#strivo-logo-fill)" />
      <rect x="22" y="6" width="6" height="22" rx="2" fill="url(#strivo-logo-fill)" />
      {/* Upward arrow accent, echoing the rise of the bars */}
      <path
        d="M18.5 9.5 27 4l.9 8.4"
        stroke="url(#strivo-logo-arrow)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function LogoWithWordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="font-semibold text-ink" style={{ fontSize: size * 0.62 }}>
        Strivo
      </span>
    </div>
  );
}
