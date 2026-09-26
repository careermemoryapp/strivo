import { getDb } from "@/lib/db";
import { ga4Configured, fetchGa4Summary } from "@/lib/ga4";

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
};

export type GrowthFunnel = {
  days: number;
  stages: GrowthFunnelStage[];
  clicksByLocation: { location: string; count: number }[];
  singularConfigured: boolean;
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
  const ga4ok = ga4Configured();
  if (ga4ok) {
    try {
      const summary = await fetchGa4Summary(days);
      visitors = summary.sessions;
      clicked = summary.googlePlayClicks;
      clicksByLocation = summary.clicksByLocation;
    } catch (e) {
      // Degrade to "not configured"-looking (null) rather than crashing the
      // whole admin page -- same fail-open-to-a-blank-card convention as
      // every other optional integration on this dashboard (Sentry,
      // security status, etc.).
      console.error("Growth funnel: GA4 fetch failed:", e);
    }
  }

  // Singular's Reporting API isn't wired up yet -- deliberately left as
  // "not configured" (rather than a guessed integration) until there's a
  // real SINGULAR_REPORTING_API_KEY to make one verified test call
  // against. Singular's request/response shape needs to be confirmed
  // against an actual response before this reads real numbers into a page
  // the founder is making spend/messaging decisions from -- see the
  // conversation this was set up in. Swap this block for a real
  // fetchSingularInstalls() call (same shape as the GA4 block above) once
  // that's done.
  const installed: number | null = null;
  const singularConfigured = false;

  const stages: GrowthFunnelStage[] = [
    { label: "Website visitors", value: visitors, source: "GA4", configured: ga4ok, conversionFromPrevious: null },
    {
      label: 'Clicked "Get the app"',
      value: clicked,
      source: "GA4",
      configured: ga4ok,
      conversionFromPrevious: conversionRate(clicked, visitors),
    },
    {
      label: "Installed the app",
      value: installed,
      source: "Singular",
      configured: singularConfigured,
      conversionFromPrevious: conversionRate(installed, clicked),
    },
    {
      label: "Signed up",
      value: signedUp,
      source: "Strivo",
      configured: true,
      conversionFromPrevious: conversionRate(signedUp, installed),
    },
  ];

  return { days, stages, clicksByLocation, singularConfigured };
}
