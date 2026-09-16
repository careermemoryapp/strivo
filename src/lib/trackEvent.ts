import type { CAREER_WRAPPED_EVENTS } from "@/lib/config";

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
export function trackEvent(eventName: (typeof CAREER_WRAPPED_EVENTS)[number], properties?: Record<string, unknown>): void {
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
