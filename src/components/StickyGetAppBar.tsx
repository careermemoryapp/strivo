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
  triggerRef,
}: {
  location: string;
  href?: string;
  headline: string;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  // Tracks whether the visitor has dismissed the bar this page view --
  // reset on navigation (new component instance), not persisted, so it
  // isn't permanently hidden after one close.
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (triggerRef?.current) {
      const el = triggerRef.current;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!dismissedRef.current) setVisible(!entry.isIntersecting);
        },
        { rootMargin: "-72px 0px 0px 0px" } // account for the sticky header's height
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
    // Fallback for pages with no hero CTA to key off -- show after
    // scrolling roughly one screen's worth down.
    function onScroll() {
      if (!dismissedRef.current) setVisible(window.scrollY > 480);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [triggerRef]);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div
        className="flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border border-[#2a2a35] px-5 py-3.5 backdrop-blur"
        style={{ background: "rgba(10,10,15,0.92)", boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}
      >
        <p className="text-sm font-semibold leading-tight text-white">{headline}</p>
        <div className="flex shrink-0 items-center gap-2">
          <PlayStoreLink
            location={location}
            href={href}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0a0a0f] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Get the app →
          </PlayStoreLink>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              dismissedRef.current = true;
              setVisible(false);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#6a6a75] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
