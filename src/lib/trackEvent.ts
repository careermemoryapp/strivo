import type { CAREER_PROFILE_EVENTS, CAREER_WRAPPED_EVENTS } from "@/lib/config";

// The full set of trackable event names -- the union of every feature's own
// allow-list array (see each array's comment in lib/config.ts for why the
// list is split per-feature rather than one flat list). Add a new feature's
// array to this union, not to either existing array, when the next surface
// needs its own events.
type TrackableEventName = (typeof CAREER_WRAPPED_EVENTS)[number] | (typeof CAREER_PROFILE_EVENTS)[number];

// Client-safe fire-and-forget event logger -- posts to
// app/api/analytics/event/route.ts, which persists into the analytics_events
// table (see lib/repo/analyticsEvents.ts and that table's comment in
// lib/db.ts). This exists specifically because components/Analytics.tsx
// deliberately keeps GA4 out of every (app)/admin route and the native
// shell, so there was previously no working destination at all for an
// in-product event fired from inside Career Wrapped. Safe to call from a
// logged-out context too (the public /cw/[shareId] share page) -- the route
// itself resolves the session, this helper never needs to know it.
//
// Never awaited by callers, same "the user isn't waiting on this" principle
// as the embedText/generateChatTitle fire-and-forget calls in
// chatService.ts -- a failed event log should never block or visibly affect
// anything the user is doing.
export function trackEvent(eventName: TrackableEventName, properties?: Record<string, unknown>): void {
  try {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, properties }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Fire-and-forget -- never let a tracking call throw into caller code.
  }
}
