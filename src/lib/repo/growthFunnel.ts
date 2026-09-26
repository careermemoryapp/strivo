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
  days: number;
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

function signupsInWindow(days: number): number {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return (db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`).get(since) as { c: number }).c;
}

function conversionRate(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return curr / prev;
}

export async function computeGrowthFunnel(days = 30): Promise<GrowthFunnel> {
  const signedUp = signupsInWindow(days);

  let visitors: number | null = null;
  let clicked: number | null = null;
  let clicksByLocation: { location: string; count: number }[] = [];
  let visitorsBySource: { source: string; count: number }[] = [];
  const ga4ok = ga4Configured();
  if (ga4ok) {
    try {
      const summary = await fetchGa4Summary(days);
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

  return { days, stages, clicksByLocation, visitorsBySource, singularConfigured, installedCheckedAt };
}
