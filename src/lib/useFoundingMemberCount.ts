"use client";

import { useEffect, useState } from "react";

export type FoundingMemberStats = { count: number; cap: number };

// Fetches the real, live count behind every "Free for the first 1,000
// users" / "N founding members so far" line on the marketing homepage (see
// MarketingHome.tsx's hero/closing-CTA incentive lines, the sticky bar's
// `incentive` prop, and FoundingMemberShowcase) from the public,
// unauthenticated /api/public/founding-member-count endpoint. Previously
// that copy was a static, unenforced claim (see the file comment on
// FOUNDING_MEMBER_CAP in lib/config.ts) -- this makes it a real, ticking
// number instead.
//
// Deliberately client-only (this whole marketing page is "use client"
// already) rather than fetched server-side in page.tsx: the count moves
// as people sign up, and the page itself is heavily cached/static at the
// edge for performance, so a server-rendered number would go stale the
// moment it's cached. A plain client fetch on mount keeps the page's own
// caching untouched and just means the number pops in a beat after first
// paint, same trade-off every other client-side-fetched bit on this page
// (the opportunities-tab location detection, etc.) already makes. Exported
// (not just the formatted strings below) so FoundingMemberShowcase can
// compute "you'd be #N" and render the live preview image URL directly,
// not just a pre-formatted sentence.
export function useFoundingMemberStats(): FoundingMemberStats | null {
  const [stats, setStats] = useState<FoundingMemberStats | null>(null);
  useEffect(() => {
    // cache: "no-store" -- belt-and-suspenders alongside the route's own
    // `dynamic = "force-dynamic"` (see founding-member-count/route.ts):
    // without this, the BROWSER's own HTTP cache can still serve a stale
    // response for this exact URL on a later page load even once the
    // server itself stops caching, which looked identical to the server
    // being stale from the outside ("the number is still the same").
    fetch("/api/public/founding-member-count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.count === "number" && typeof data.cap === "number") setStats(data);
      })
      .catch(() => {
        // Stays null -- callers fall back to the static copy below.
      });
  }, []);
  return stats;
}

// The one short-form line every CTA placement actually renders (hero
// subtext, closing CTA, sticky bar) -- kept in one place so none of them
// can ever show three different phrasings of the same number. Falls back
// to the original static claim (unchanged wording) for the brief window
// before the fetch resolves, or if it fails outright -- never a loading
// flicker or a broken "undefined founding members" string.
//
// Leads with REMAINING spots ("Only 653 left"), not how many have joined
// so far -- changed 2026-10-04 after a direct founder follow-up: the
// progress framing ("347 have joined") is social proof, which mainly
// reassures someone who's already decided to act; it does little for a
// cold visitor who hasn't decided anything yet. Scarcity ("only X left,
// then gone for good") is the stronger lever for THAT person specifically
// -- it's a reason to act now rather than bookmark-and-leave, which is the
// actual problem being solved here (2% of visitors clicking through).
export function useFoundingMemberIncentiveText(): string {
  const stats = useFoundingMemberStats();
  if (!stats) return "Free for the first 1,000 users";
  if (stats.count >= stats.cap) {
    return `All ${stats.cap.toLocaleString("en-US")} founding member spots are taken`;
  }
  const remaining = stats.cap - stats.count;
  return `Only ${remaining.toLocaleString("en-US")} Founding Member spots left — you'd be #${stats.count + 1}`;
}
