import { getDb } from "@/lib/db";
import { ONBOARDING_EVENTS } from "@/lib/config";

// Counts the ONBOARDING_EVENTS (see that array's comment in lib/config.ts)
// for the admin dashboard's "Onboarding" section -- added 2026-09-30 direct
// founder call, right after the Growth Funnel showed 12 installs but only 7
// signups with nothing explaining the gap. This is a SEPARATE, narrower
// funnel from growthFunnel.ts's "Installed the app" -> "Signed up" stages:
// those pull from Singular (real install attribution) and the users table
// respectively and are scoped to FUNNEL_TRACKING_START (2026-09-26). This
// one only has data from the moment this instrumentation actually shipped,
// which is later -- see ONBOARDING_TRACKING_START below -- so its own
// signup count is kept separate rather than reusing growthFunnel's, to stay
// an internally consistent cohort (all counted from the same instant).

// Hardcoded literal, NOT `new Date()` -- see FUNNEL_TRACKING_START's own
// comment in growthFunnel.ts for why: a runtime-computed constant would
// silently reset to "now" on every pm2 restart (i.e. every deploy), making
// this window drift forward on its own instead of staying fixed at the
// moment tracking actually started.
const ONBOARDING_TRACKING_START = new Date("2026-09-30T05:00:00.000Z");

export type OnboardingFunnelStep = {
  event: (typeof ONBOARDING_EVENTS)[number];
  label: string;
  count: number;
};

export type OnboardingFunnel = {
  trackingStartIso: string;
  steps: OnboardingFunnelStep[];
  signedUp: number;
};

// Human labels for the admin UI -- kept here (not in config.ts) since
// config.ts's array is the wire-format allow-list, not display copy.
const STEP_LABELS: Record<(typeof ONBOARDING_EVENTS)[number], string> = {
  onboarding_welcome_viewed: "Opened the app",
  onboarding_login_viewed: "Reached sign-in screen",
  onboarding_google_tapped: "Tapped Continue with Google",
  onboarding_google_browser_opened: "System browser opened",
  onboarding_google_browser_open_failed: "System browser failed to open",
  onboarding_resumed_incomplete: "Returned to app without finishing",
  onboarding_google_token_failed: "Sign-in failed, shown an error",
};

function countEventSince(eventName: string, sinceIso: string): number {
  const db = getDb();
  return (
    db
      .prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE event_name = ? AND created_at >= ?`)
      .get(eventName, sinceIso) as { c: number }
  ).c;
}

function signupsSince(sinceIso: string): number {
  const db = getDb();
  return (db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`).get(sinceIso) as { c: number }).c;
}

export function computeOnboardingFunnel(): OnboardingFunnel {
  const sinceIso = ONBOARDING_TRACKING_START.toISOString();

  // Deliberately NOT reordered to "funnel order" (welcome -> login -> tapped
  // -> ...) via sorting logic -- ONBOARDING_EVENTS is already written in that
  // order in config.ts, so mapping straight over it keeps this in sync with
  // that array without a second place to maintain the ordering.
  const steps: OnboardingFunnelStep[] = ONBOARDING_EVENTS.map((event) => ({
    event,
    label: STEP_LABELS[event],
    count: countEventSince(event, sinceIso),
  }));

  return {
    trackingStartIso: sinceIso,
    steps,
    signedUp: signupsSince(sinceIso),
  };
}
