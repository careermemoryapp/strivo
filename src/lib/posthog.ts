import posthog from "posthog-js";

// Product analytics/retention tracking -- deliberately scoped to the
// signed-in app only (native app + browser, once someone's actually
// logged in), never the marketing site. That's the opposite placement
// from Analytics.tsx's Google Analytics, which is marketing-site-only and
// explicitly excluded from the signed-in app and /admin (see that file's
// comment) -- GA has nothing useful to measure against people who are
// already logged in, while retention/usage is exactly what only shows up
// once someone IS logged in. Wired in from Providers.tsx's
// ProductAnalytics component, gated on session status, rather than by
// pathname -- a pathname check was already proven unreliable here once
// (see Analytics.tsx's comment on the (app) route group bug), and session
// status is the more direct signal for "is this a real signed-in user"
// anyway.
//
// Users are identified by their internal Strivo user id only -- never
// email or name -- matching how Sentry's Sentry.setUser({ id }) is scoped
// in Providers.tsx.
let initialized = false;

export function initPostHog() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    // No key configured (e.g. local dev, or a deploy that hasn't set the
    // env var yet) -- skip entirely rather than initializing against
    // nothing. Never blocks the app either way.
    return;
  }
  initialized = true;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // Only ever called post-login (see Providers.tsx), so there's no
    // anonymous pre-login traffic here to worry about deduplicating --
    // this just avoids PostHog creating a full "person" profile before
    // identify() below attaches the real user id.
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
  });
}

// Call once per sign-in (see Providers.tsx) -- ties subsequent events to
// this user's internal id so retention/usage can be tracked per-user,
// without ever sending PostHog an email or name.
export function identifyPostHogUser(userId: string) {
  if (!initialized) return;
  posthog.identify(userId);
}

// Call on sign-out -- clears the identified user and starts a fresh
// anonymous distinct id, so a shared/reused device doesn't keep
// attributing the next person's activity to whoever was previously
// logged in (same reasoning as Sentry.setUser(null) on logout).
export function resetPostHog() {
  if (!initialized) return;
  posthog.reset();
}
