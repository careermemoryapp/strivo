"use client";

import { Play } from "lucide-react";
import type { CSSProperties } from "react";
import { PLAY_STORE_URL } from "@/lib/config";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Every "Get the app" placement on the marketing site and blog renders
// through this component instead of a raw <a href={PLAY_STORE_URL}>. It
// fires a `google_play_click` GA4 event on click, tagged with WHICH link was
// clicked (location) and the page it was clicked from.
//
// Added 2026-09-26: this is the missing instrumentation flagged in the
// traffic-vs-downloads diagnosis that day -- GA4 was showing real visits
// (thousands of sessions) but 0 key events, so there was no way to tell
// whether visitors were even clicking through toward the Play Store, let
// alone installing once they got there (GA4 can't see the install itself --
// that only shows up in Play Console's own acquisition/referrer reports).
// One-time manual step after this is deployed and has received at least one
// real click: GA4 Admin -> Data display -> Events -> find `google_play_click`
// in the list (can take a few hours to first appear) -> toggle "Mark as key
// event". That flip can only be done in the GA4 UI, not from code.
//
// Rewritten 2026-09-29, direct founder call: the two-badge (Play Store +
// "App Store -- Coming soon") layout from 2026-09-28 was flagged as a likely
// cause of the funnel's ~1% click-through -- next to a dimmed, non-clickable
// "coming soon" badge of the same size and color, the live Play Store badge
// itself read as just another static store-logo lockup, not an actual
// button. Two changes: (1) the App Store badge is gone -- Strivo is Android
// -only today, and showing a second, unusable badge next to the real one was
// actively hurting the one that works, not just adding clutter; (2) this is
// now ONE deliberately button-shaped CTA -- solid brand-gradient fill,
// drop shadow, a bold "Get Strivo Free" label (not just a store-badge
// wordmark) with a small "Android only" line underneath, so it reads the
// same as every other primary action button on the page (e.g. "Take the
// free quiz ->") instead of as platform-badge chrome. `location`/`href`/
// `size`/`google_play_click` all work exactly as before -- only the visual
// treatment changed, so every call site (hero, nav, sticky bar, blog CTA)
// picked this up automatically.
//
// `size` controls the button's scale so this drops cleanly into every
// placement's existing prominence: "lg" for the homepage hero, "md" for the
// sticky bar and blog end-of-post CTA, "sm" for compact nav bars. "sm" drops
// the two-line "Get Strivo Free / Android only" layout for a single-line
// "Get the App" label -- the full two-line version doesn't fit next to the
// logo and Blog link at phone width without wrapping the header (confirmed
// with a local screenshot at 390px before this was added).
// Sizes bumped 2026-09-29 (direct founder feedback: "make the button a bit
// broader... make it bigger") -- both the compact nav badge and the hero
// button read as too small relative to the rest of the page.
const SIZE = {
  sm: {
    badge: "gap-2 rounded-full px-5 py-2.5",
    icon: 15,
    sub: null,
    label: "text-sm",
  },
  md: {
    badge: "gap-2 rounded-full px-5 py-2.5",
    icon: 16,
    sub: "text-[10px]",
    label: "text-sm",
  },
  lg: {
    badge: "gap-2.5 rounded-full px-9 py-4 sm:px-11 sm:py-5",
    icon: 21,
    sub: "text-[11px] sm:text-xs",
    label: "text-lg sm:text-xl",
  },
} as const;

export function PlayStoreLink({
  location,
  href,
  size = "md",
  className,
  style,
}: {
  // Short, stable label for which specific placement this is (e.g. "hero",
  // "nav", "blog_cta") -- lets GA4 tell the hero button apart from the nav
  // link apart from the blog CTA, instead of lumping every click together.
  location: string;
  // Optional override for the button's destination -- defaults to the plain
  // Play Store URL. Pass a Singular tracking link (see SINGULAR_TRACKING_LINK
  // in lib/config.ts) for placements where install attribution matters; the
  // GA4 click event still fires the same way either way.
  href?: string;
  size?: "sm" | "md" | "lg";
  // Margin/shadow/positioning on the button itself -- merged with the base
  // button classes below.
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  return (
    <a
      href={href ?? PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        window.gtag?.("event", "google_play_click", {
          link_location: location,
          page_path: window.location.pathname,
        });
      }}
      className={`inline-flex items-center text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${s.badge} ${className ?? ""}`}
      style={{
        background: "linear-gradient(135deg,#7c3aed,#4f6ef7)",
        boxShadow: "0 10px 28px rgba(124,58,237,0.4)",
        ...style,
      }}
    >
      <Play size={s.icon} fill="#ffffff" stroke="#ffffff" strokeWidth={1} />
      {s.sub ? (
        <span className="flex flex-col items-start leading-none">
          <span className={`font-bold ${s.label}`}>Get Strivo Free</span>
          <span className={`mt-0.5 font-semibold uppercase tracking-wide text-white/75 ${s.sub}`}>Android only</span>
        </span>
      ) : (
        <span className={`font-bold ${s.label}`}>Get the App</span>
      )}
    </a>
  );
}
