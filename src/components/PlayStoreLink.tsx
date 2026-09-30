"use client";

import { Play, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";
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
  sm: { badge: "gap-2 rounded-full px-5 py-2.5", icon: 15, sub: null, label: "text-sm" },
  md: { badge: "gap-2 rounded-full px-5 py-2.5", icon: 16, sub: "text-[10px]", label: "text-sm" },
  lg: { badge: "gap-2.5 rounded-full px-9 py-4 sm:px-11 sm:py-5", icon: 21, sub: "text-[11px] sm:text-xs", label: "text-lg sm:text-xl" },
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
  // GA4 click event still fires the same way either way. The QR modal below
  // encodes this exact same destination, so a scan still carries install
  // attribution.
  href?: string;
  size?: "sm" | "md" | "lg";
  // Margin/shadow/positioning on the button itself -- merged with the base
  // button classes below.
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  const destination = href ?? PLAY_STORE_URL;

  // Added 2026-09-29, direct founder call, after live-testing this exact
  // click path: on a desktop browser, clicking through to this same link
  // does NOT land on an "Install" button -- Google Play shows "Install on
  // more devices" instead, since desktop Chrome can't install an Android
  // APK directly, only queue one to a phone already signed into the same
  // Google account. For a first-time visitor that's a dead end, and GA4's
  // own device-category report showed desktop sessions outnumbering mobile
  // ~5-6:1 on strivo.ai -- so most clicks were very likely hitting that
  // wall. Founder's framing: "when people are clicking, at least they
  // should be able to download the app."
  //
  // Fix: detect whether this is an Android device (the only platform that
  // can actually install from this link) and, if not, swap the click's
  // effect from "navigate to a dead end" to "reveal a QR code" -- so the
  // click itself produces an install-capable next step (scan with an
  // actual phone) instead of a Play Store page with nothing to press. iOS
  // gets the same QR prompt: there's no Play Store there either, and
  // pointing at an actual phone is still the honest answer.
  // Determined once, lazily, in the `useState` initializer rather than an
  // effect -- `isAndroid` never feeds into what gets rendered (it's only
  // read inside `handleClick`), so there's no hydration-mismatch risk in
  // computing it on the client's first render pass instead of waiting for
  // a post-mount effect. `typeof navigator === "undefined"` covers the
  // server render (Node has no `navigator`); on the server this resolves
  // to `false`, same as the "not Android" branch, which is harmless since
  // nothing can be clicked before the page reaches a real browser anyway.
  const [isAndroid] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));
  const [showQr, setShowQr] = useState(false);

  // Rewritten 2026-09-29, second founder pass, from a screenshot + voice
  // note: the first version revealed the QR code inline, stacked directly
  // below the button. On the homepage hero that pushed it past the bottom
  // of the viewport -- the founder clicked "Get Strivo Free", saw nothing
  // change on screen, and assumed the button was broken. It only became
  // visible after scrolling, which isn't an instinct a first-time visitor
  // has after a click that looks like it did nothing.
  //
  // Fix: render the QR as a centered fixed-position modal instead of
  // inline content. `position: fixed` centers it in the viewport itself,
  // not relative to the button's position in the page flow -- so it's
  // guaranteed to land in view immediately on click, whether the button
  // clicked is the compact nav badge at the top of the page, the hero CTA,
  // or the sticky bottom bar. Closes on backdrop click, the X, or Escape.
  useEffect(() => {
    if (!showQr) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowQr(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showQr]);

  // Added 2026-09-29, same pass: StickyGetAppBar renders behind this modal
  // (lower z-index) so it doesn't stop being "sticky", but the modal's dark
  // blurred backdrop makes it barely legible under there -- easy to read as
  // "the sticky bar disappeared" rather than "it's behind the popup".
  // Broadcast the modal's open/closed state on `window` so StickyGetAppBar
  // (a sibling component with no shared parent state) can hide itself
  // cleanly while a QR modal -- from itself or any other PlayStoreLink on
  // the page -- is open, instead of sitting half-visible behind it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("strivo:qr-modal-toggle", { detail: { open: showQr } }));
  }, [showQr]);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    window.gtag?.("event", "google_play_click", {
      link_location: location,
      page_path: window.location.pathname,
    });
    if (!isAndroid) {
      e.preventDefault();
      setShowQr(true);
    }
  }

  return (
    <>
      <a
        href={destination}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
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
      {/* Rewritten 2026-09-30, found live: rendered inline here, this modal
          is a DOM descendant of whatever placement it's used from. For the
          sticky bar that's a problem specifically -- StickyGetAppBar hides
          itself (see its own 2026-09-29 comment) with a `translate`
          transform on its wrapper. Per the CSS spec, an ancestor with a
          `transform` becomes the containing block for any `position: fixed`
          descendant, so once the sticky bar started hiding, this modal's
          `fixed inset-0` stopped being "fixed to the viewport" and became
          fixed to that now-shrinking, fading wrapper instead -- the modal
          and the bar vanished together, exactly as reported ("it just
          totally disappears along with the bar and the QR code"). A portal
          straight to `document.body` sidesteps the whole class of bug: the
          modal is never a descendant of ANY placement's wrapper (hero, nav,
          sticky bar, blog CTA), so no ancestor's transform, opacity, or
          overflow can ever clip or reposition it again. Guarded on
          `document` because this file also renders on the server, where
          `document` doesn't exist -- harmless, since `showQr` starts false
          and nothing can be clicked before hydration anyway. */}
      {showQr &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
            onClick={() => setShowQr(false)}
          >
            <div
              className="relative flex w-full max-w-[300px] flex-col items-center gap-3 rounded-3xl border border-[#2a2a35] bg-[#100f17] p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowQr(false)}
                aria-label="Close"
                className="absolute right-4 top-4 text-[#8a8a99] transition-colors hover:text-white"
              >
                <X size={20} />
              </button>
              <p className="mt-2 text-center text-base font-bold leading-snug text-white">Scan with your phone to install</p>
              <p className="text-center text-xs leading-relaxed text-[#a0a0ac]">Open your phone&apos;s camera and point it at this code</p>
              <div className="mt-1 rounded-xl bg-white p-3">
                <QRCode value={destination} size={168} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
