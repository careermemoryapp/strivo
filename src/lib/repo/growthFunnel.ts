import { getDb } from "@/lib/db";
import { ga4Configured, fetchGa4Summary } from "@/lib/ga4";
import { readSingularInstallsSnapshot } from "@/lib/singularInstallsSnapshot";

// The blog-to-signup growth funnel shown on the admin dashboard (see
// GrowthFunnel section in admin/page.tsx) -- one row per stage, each
// pulling from whichever system actually measures it:
//   Website visitors        <- GA4 (sessions)
//   Clicked "Get the app"   <- GA4 (google_play_click event, see
//                              PlayStoreLink.tsx)
//   Installed the app       <- Singular (install attribution via Play
//                              Install Referrer) -- NOT wired up yet, see
//                              the comment on `installed` below
//   Signed up                <- Strivo's own users table (always available,
//                              no external API needed)
// GA4 structurally cannot see an install or anything that happens after
// someone leaves for the Play Store -- that's the whole reason Singular
// exists in this funnel at all (see lib/singular.ts's top comment).

// This used to be a rolling "last 30 days" window. Per a direct founder
// call (2026-09-26): that mixed in months of pre-tracking website traffic
// (from before the "Get the app" click event and the Singular link
// existed) against only a sliver of days that actually had click/install
// tracking wired up -- so the click-through and install rates looked
// near-zero, not because visitors weren't converting, but because almost
// none of the counted visitors could have possibly clicked or installed in
// the first place. Measuring from a FIXED point forward instead means the
// ratios become real and grow more meaningful every day, rather than
// staying permanently diluted by pre-tracking history. This funnel is
// deliberately narrower than "all-time" -- it's "what's happening now that
// we can actually attribute end to end".
//
// GA4 and Singular's APIs both work in whole calendar days (no
// hour/minute-level date range), so for those two sources "since this
// moment" really means "since this calendar date" -- a few hours of
// same-day traffic from before this was set up may still be counted in
// the visitors/clicks numbers on day one. Signups (our own DB) don't have
// that limitation and are filtered to the exact timestamp below.
const FUNNEL_TRACKING_START = new Date("2026-09-26T15:00:00.000Z");
const FUNNEL_TRACKING_START_DATE = FUNNEL_TRACKING_START.toISOString().slice(0, 10); // "2026-09-26" -- YYYY-MM-DD, for GA4/Singular's day-granularity date ranges

// Exported so the Singular refresh route (and its daily cron trigger) can
// default to the exact same start date as GA4/signups below, without
// duplicating this constant.
export function funnelTrackingStartDate(): string {
  return FUNNEL_TRACKING_START_DATE;
}

export type GrowthFunnelStage = {
  label: string;
  value: number | null; // null = source not connected yet
  source: "GA4" | "Singular" | "Strivo";
  configured: boolean;
  // Fraction (0-1) of the PREVIOUS stage that reached this one. null for
  // the first stage, or whenever either stage's source isn't connected.
  conversionFromPrevious: number | null;
  // Fraction (0-1) of the FIRST stage (visitors) that reached this one --
  // computed independently of the stage-to-stage chain above, so it still
  // means something even when a stage in between (Installed) isn't wired
  // up yet. This is what actually draws the funnel shape (bar width) and
  // gives an honest "of all visitors" number the admin can act on even
  // with a gap in the middle.
  pctOfVisitors: number | null;
};

export type GrowthFunnel = {
  // How many calendar days it's been since trackingStartDate (min 1) --
  // kept mainly for the "still early, rates will firm up" caveat in the UI.
  days: number;
  // "2026-09-26" -- the fixed date this funnel started measuring from (see
  // FUNNEL_TRACKING_START above). Shown on the dashboard instead of "last
  // N days" so it's clear this is a fixed point, not a rolling window.
  trackingStartDate: string;
  stages: GrowthFunnelStage[];
  clicksByLocation: { location: string; count: number }[];
  visitorsBySource: { source: string; count: number }[];
  singularConfigured: boolean;
  // When the "Installed" number was last refreshed (see
  // singularInstallsSnapshot.ts) -- null when no successful refresh has
  // run yet. Unlike the other stages, this doesn't update on every page
  // load, so the UI needs to show its own freshness honestly.
  installedCheckedAt: string | null;
};

function signupsSinceTrackingStart(): number {
  const db = getDb();
  return (
    db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`).get(FUNNEL_TRACKING_START.toISOString()) as {
      c: number;
    }
  ).c;
}

function daysSinceTrackingStart(): number {
  return Math.max(1, Math.ceil((Date.now() - FUNNEL_TRACKING_START.getTime()) / 86400000));
}

function conversionRate(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return curr / prev;
}

export async function computeGrowthFunnel(): Promise<GrowthFunnel> {
  const signedUp = signupsSinceTrackingStart();
  const days = daysSinceTrackingStart();

  let visitors: number | null = null;
  let clicked: number | null = null;
  let clicksByLocation: { location: string; count: number }[] = [];
  let visitorsBySource: { source: string; count: number }[] = [];
  const ga4ok = ga4Configured();
  if (ga4ok) {
    try {
      const summary = await fetchGa4Summary(FUNNEL_TRACKING_START_DATE);
      visitors = summary.sessions;
      clicked = summary.googlePlayClicks;
      clicksByLocation = summary.clicksByLocation;
      visitorsBySource = summary.visitorsBySource;
    } catch (e) {
      // Degrade to "not configured"-looking (null) rather than crashing the
      // whole admin page -- same fail-open-to-a-blank-card convention as
      // every other optional integration on this dashboard (Sentry,
      // security status, etc.).
      console.error("Growth funnel: GA4 fetch failed:", e);
    }
  }

  // Singular's Reporting API is async (create report -> poll -> download,
  // can take seconds to minutes -- see singularReporting.ts), so it isn't
  // fetched live on every page load like GA4/the DB queries above. Instead
  // an admin triggers a refresh (POST /api/admin/singular-refresh) and the
  // result is cached here -- see singularInstallsSnapshot.ts. "Configured"
  // means a successful refresh has run at least once, not just that the API
  // key is present, since a snapshot is what this stage actually needs to
  // show a number at all.
  const snapshot = readSingularInstallsSnapshot();
  const installed = snapshot?.installs ?? null;
  const singularConfigured = snapshot !== null;
  const installedCheckedAt = snapshot?.checkedAt ?? null;

  const stages: GrowthFunnelStage[] = [
    {
      label: "Website visitors",
      value: visitors,
      source: "GA4",
      configured: ga4ok,
      conversionFromPrevious: null,
      pctOfVisitors: visitors !== null ? 1 : null,
    },
    {
      label: 'Clicked "Get the app"',
      value: clicked,
      source: "GA4",
      configured: ga4ok,
      conversionFromPrevious: conversionRate(clicked, visitors),
      pctOfVisitors: conversionRate(clicked, visitors),
    },
    {
      label: "Installed the app",
      value: installed,
      source: "Singular",
      configured: singularConfigured,
      conversionFromPrevious: conversionRate(installed, clicked),
      pctOfVisitors: conversionRate(installed, visitors),
    },
    {
      label: "Signed up",
      value: signedUp,
      source: "Strivo",
      configured: true,
      conversionFromPrevious: conversionRate(signedUp, installed),
      pctOfVisitors: conversionRate(signedUp, visitors),
    },
  ];

  return {
    days,
    trackingStartDate: FUNNEL_TRACKING_START_DATE,
    stages,
    clicksByLocation,
    visitorsBySource,
    singularConfigured,
    installedCheckedAt,
  };
}
