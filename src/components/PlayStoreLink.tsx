"use client";

import type { CSSProperties, ReactNode } from "react";
import { PLAY_STORE_URL } from "@/lib/config";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Every "Get the app" / Play Store link on the marketing site and blog goes
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
// Without this event, "people visit but don't download" was a guess, not a
// measured fact.
//
// One-time manual step after this is deployed and has received at least one
// real click: GA4 Admin -> Data display -> Events -> find `google_play_click`
// in the list (can take a few hours to first appear) -> toggle "Mark as key
// event". That flip can only be done in the GA4 UI, not from code.
export function PlayStoreLink({
  location,
  href,
  className,
  style,
  children,
}: {
  // Short, stable label for which specific link this is (e.g. "hero",
  // "nav", "blog_cta") -- lets GA4 tell the hero button apart from the nav
  // link apart from the blog CTA, instead of lumping every click together.
  location: string;
  // Optional override for the destination -- defaults to the plain Play
  // Store URL. Pass a Singular tracking link (see SINGULAR_BLOG_LINK in
  // lib/config.ts) for placements where install attribution matters; the
  // GA4 click event still fires the same way either way.
  href?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a
      href={href ?? PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={() => {
        window.gtag?.("event", "google_play_click", {
          link_location: location,
          page_path: window.location.pathname,
        });
      }}
    >
      {children}
    </a>
  );
}
