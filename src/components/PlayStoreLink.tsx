"use client";

import { Play, Clock } from "lucide-react";
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
//
// One-time manual step after this is deployed and has received at least one
// real click: GA4 Admin -> Data display -> Events -> find `google_play_click`
// in the list (can take a few hours to first appear) -> toggle "Mark as key
// event". That flip can only be done in the GA4 UI, not from code.
//
// iOS/App Store handling -- rewritten 2026-09-28, direct founder call: an
// earlier version of this component detected iOS/iPadOS visitors and swapped
// the whole button for an email-capture "join the waitlist" popup. The
// founder's follow-up call that same day was explicit -- no popup. Instead,
// EVERY visitor (regardless of device) now sees two badges side by side
// wherever this used to render one button: a working "Play Store" link, and
// a non-clickable "App Store -- Coming soon" badge next to it. Simpler than
// device detection (nothing to get wrong across browsers/OSes), and honest
// about both platforms to everyone rather than guessing from the user agent.
// The iOS waitlist email-capture backend (ios_waitlist table, addToIosWaitlist,
// /api/ios-waitlist) is left in place unused rather than torn out -- it's
// inert (nothing calls it) and cheap to revive later if a waitlist prompt
// ever comes back in some other form; it does not run or collect anything on
// its own.
//
// `size` controls the badges' scale so this drops cleanly into every
// placement's existing prominence: "lg" for the homepage hero, "md" for the
// sticky bar and blog end-of-post CTA, "sm" for compact nav bars. "sm" also
// drops the two-line "Available on / Play Store" eyebrow layout for a
// single-line "Play Store" badge -- two full-height stacked badges don't fit
// next to the logo and Blog link at phone width without wrapping the whole
// header (confirmed with a local screenshot at 390px before this was added).
//
// Colors/shape -- restyled 2026-09-28, direct founder call ("give a feel of
// ... wherever there is a button of Play Store and Apple Store"): rounded
// rectangles (not full pills) on a near-black badge, matching the general
// silhouette real app-store download badges share, without reproducing
// either company's actual logo or wordmark artwork (that's Google's/Apple's
// trademarked mark, not something to copy pixel-for-pixel). Both badges
// share the same dark family so they read as a matched pair; Play Store
// stays full-brightness/white text since it's live, App Store drops to
// dimmed text and a dashed border since it isn't clickable yet -- the
// "coming soon" state should look visually quieter, not just say it.
const SIZE = {
  sm: {
    badge: "gap-1 rounded-lg px-2.5 py-1.5",
    wrapperGap: "gap-1.5",
    icon: 12,
    eyebrow: null,
    label: "text-xs",
  },
  md: {
    badge: "gap-2 rounded-lg px-5 py-2.5",
    wrapperGap: "gap-2.5",
    icon: 15,
    eyebrow: "text-[8px]",
    label: "text-sm",
  },
  lg: {
    badge: "gap-2.5 rounded-xl px-6 py-3.5 sm:px-8 sm:py-4",
    wrapperGap: "gap-2.5",
    icon: 18,
    eyebrow: "text-[8px] sm:text-[9px]",
    label: "text-sm sm:text-base",
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
  // Optional override for the Play Store badge's destination -- defaults to
  // the plain Play Store URL. Pass a Singular tracking link (see
  // SINGULAR_TRACKING_LINK in lib/config.ts) for placements where install
  // attribution matters; the GA4 click event still fires the same way
  // either way.
  href?: string;
  size?: "sm" | "md" | "lg";
  // Applied to the OUTER wrapper (both badges) -- spacing/margin/shadow,
  // not per-badge sizing. Use `size` for how big the badges themselves are.
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  return (
    <div className={`inline-flex flex-wrap items-center justify-center ${s.wrapperGap} ${className ?? ""}`} style={style}>
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
        className={`inline-flex items-center border border-white/15 bg-black text-white transition-transform hover:-translate-y-0.5 hover:border-white/30 active:scale-[0.98] ${s.badge}`}
      >
        <Play size={s.icon} fill="#4ade80" stroke="#4ade80" strokeWidth={1} />
        {s.eyebrow ? (
          <span className="flex flex-col items-start leading-none">
            <span className={`font-semibold uppercase tracking-wide text-white/60 ${s.eyebrow}`}>Available on</span>
            <span className={`font-bold ${s.label}`}>Play Store</span>
          </span>
        ) : (
          <span className={`font-bold ${s.label}`}>Play Store</span>
        )}
      </a>
      <div
        aria-disabled="true"
        className={`inline-flex cursor-default items-center border border-dashed border-white/15 bg-black text-[#6a6672] ${s.badge}`}
      >
        <Clock size={s.icon} strokeWidth={1.75} />
        {s.eyebrow ? (
          <span className="flex flex-col items-start leading-none">
            <span className={`font-semibold uppercase tracking-wide opacity-70 ${s.eyebrow}`}>Coming soon on</span>
            <span className={`font-bold ${s.label}`}>App Store</span>
          </span>
        ) : (
          // Compact "sm" badge -- shortened from "App Store · Soon" (measured
          // too wide to fit beside "Play Store" without wrapping in the
          // homepage nav at a 390px-wide phone; confirmed with a local
          // screenshot before landing on this shorter label).
          <span className={`font-bold ${s.label}`}>iOS soon</span>
        )}
      </div>
    </div>
  );
}
