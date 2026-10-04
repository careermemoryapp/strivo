"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { PlayStoreLink } from "@/components/PlayStoreLink";

// A big, bottom-of-screen sticky "Get the app" bar. Added 2026-09-26 per a
// direct founder call, on top of the sticky-nav-button fix made earlier
// the same day (see the header comments in MarketingHome.tsx and the blog
// pages) -- that fix solved "no CTA visible at all" once someone scrolls;
// this solves the follow-up problem: the CTA that IS always visible (the
// small nav button) is easy to skim right past. This bar is deliberately
// bigger and higher-contrast, and only appears once it's actually needed --
// showing it immediately, stacked right under an already-visible hero
// button, would just be visual clutter.
//
// `triggerRef`, when passed, should point at the page's main hero CTA
// (e.g. the homepage's big pill button) -- this bar appears once that
// element scrolls out of view and hides again if the visitor scrolls back
// up to it. Pages with no equivalent hero CTA to key off (the blog list
// and blog post pages -- there's only ever the small nav button there)
// omit `triggerRef`, and the bar instead appears after a fixed scroll
// distance.
export function StickyGetAppBar({
  location,
  href,
  headline,
  incentive,
  triggerRef,
}: {
  location: string;
  href?: string;
  headline: string;
  // A real, concrete reason to act now -- shown as a second line under the
  // headline. Per a direct founder call (2026-09-26): the bar needed an
  // actual incentive, not just the tagline; the founder then explicitly
  // chose "free for the first 1,000 users" over the free-trial framing
  // (2026-09-26, same day) despite it not being counted/enforced anywhere
  // in the app -- his call to make and honor operationally, not a claim
  // this code verifies. If that ever needs to become a real, enforced
  // count (e.g. switching this off automatically past user #1,000), that's
  // a separate change to lib/repo/users.ts, not just this copy.
  incentive?: string;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  // Holds the scroll position the visitor was at when they tapped the X,
  // or null when not currently dismissed. Previously a plain boolean set
  // once and never cleared, so a single tap -- curious, accidental, or a
  // "not right now" that didn't mean "never" -- hid the bar for the rest
  // of the page view. On a long marketing page that's a real cost: it's
  // the only persistent "Get the App" reminder across everything below
  // the hero (how it works, use cases, the differentiator section,
  // pricing, FAQ). Changed 2026-10-04, as part of the same conversion
  // push that reordered the homepage's quiz section and added the two new
  // mid-page CTA bands: a dismissal now only suppresses the bar until the
  // visitor scrolls another ~500px away from where they closed it (see
  // REARM_DISTANCE_PX below), then it's eligible to reappear under the
  // exact same trigger logic as before. Not persisted across navigation,
  // same as the old behavior.
  const dismissedAtScrollYRef = useRef<number | null>(null);

  // Added 2026-09-29: any PlayStoreLink's QR install modal -- including
  // this bar's own "Get the App" button -- broadcasts a
  // `strivo:qr-modal-toggle` window event when it opens/closes (see the
  // comment in PlayStoreLink.tsx). Hide the bar for as long as one is open
  // instead of leaving it sitting dim behind the modal's blurred backdrop,
  // where a founder screenshot showed it reading as "the bar disappeared"
  // rather than "it's behind the popup".
  const [qrModalOpen, setQrModalOpen] = useState(false);
  useEffect(() => {
    function onToggle(e: Event) {
      setQrModalOpen((e as CustomEvent<{ open: boolean }>).detail.open);
    }
    window.addEventListener("strivo:qr-modal-toggle", onToggle);
    return () => window.removeEventListener("strivo:qr-modal-toggle", onToggle);
  }, []);

  useEffect(() => {
    // How far (in px) the visitor has to scroll past the point where they
    // dismissed the bar before it re-arms. Large enough that closing it
    // doesn't immediately pop back on the next scroll tick (that would
    // just read as broken/naggy), small enough that it's back well before
    // the next section's worth of content goes by unreminded.
    const REARM_DISTANCE_PX = 500;

    // Mirrors the IntersectionObserver's rootMargin below for the
    // triggerRef case; for the fallback case it's just the same 480px
    // threshold the old scroll handler used. Used both for normal
    // fallback-case show/hide and to decide what to show immediately
    // when a dismissal re-arms.
    function computeShouldShow(): boolean {
      if (triggerRef?.current) {
        return triggerRef.current.getBoundingClientRect().bottom < 72;
      }
      return window.scrollY > 480;
    }

    function reArmIfScrolledAway() {
      if (dismissedAtScrollYRef.current === null) return;
      if (Math.abs(window.scrollY - dismissedAtScrollYRef.current) <= REARM_DISTANCE_PX) return;
      dismissedAtScrollYRef.current = null;
      setVisible(computeShouldShow());
    }

    if (triggerRef?.current) {
      const el = triggerRef.current;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (dismissedAtScrollYRef.current === null) setVisible(!entry.isIntersecting);
        },
        { rootMargin: "-72px 0px 0px 0px" } // account for the sticky header's height
      );
      observer.observe(el);
      // The observer only fires on an actual intersection change, so it
      // won't notice a re-arm by itself (the hero stays equally
      // out-of-view the whole time) -- this listener handles re-arming
      // while scrolling continues.
      window.addEventListener("scroll", reArmIfScrolledAway, { passive: true });
      return () => {
        observer.disconnect();
        window.removeEventListener("scroll", reArmIfScrolledAway);
      };
    }
    // Fallback for pages with no hero CTA to key off -- show after
    // scrolling roughly one screen's worth down.
    function onScroll() {
      reArmIfScrolledAway();
      if (dismissedAtScrollYRef.current === null) setVisible(computeShouldShow());
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [triggerRef]);

  return (
    <div
      aria-hidden={!visible || qrModalOpen}
      className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-300 ${
        visible && !qrModalOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      {/* Mobile: a small floating rounded card with margin on all sides --
          unobtrusive, app-toast-like. Desktop (sm+): a full-width bar
          flush with the screen edges, so it reads as a real banner rather
          than something that looks lost in the middle of a wide screen --
          per a direct founder call (2026-09-26) after seeing this on a
          laptop. The content row inside stays capped at max-w-5xl and
          centered even on the full-width bar, so text and the button
          don't stretch awkwardly on very wide monitors. */}
      <div className="flex justify-center px-4 pb-4 sm:block sm:px-0 sm:pb-0">
        <div
          className="w-full max-w-md rounded-2xl border border-[#2a2a35] backdrop-blur sm:max-w-none sm:rounded-none sm:border-x-0 sm:border-b-0"
          style={{ background: "rgba(10,10,15,0.95)", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)" }}
        >
          <div className="flex flex-col gap-2.5 px-5 py-3.5 sm:mx-auto sm:max-w-5xl sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-10 sm:py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-white sm:text-base">{headline}</p>
              {incentive && <p className="mt-0.5 text-xs font-semibold text-[#c4b5fd] sm:text-sm">{incentive}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <PlayStoreLink location={location} href={href} size="sm" />
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  dismissedAtScrollYRef.current = window.scrollY;
                  setVisible(false);
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#6a6a75] transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
