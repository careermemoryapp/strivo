import { NextResponse } from "next/server";
import { isAdminAuthed, checkSingularRefreshSecret } from "@/lib/adminAuth";
import { fetchSingularInstalls, singularReportingConfigured } from "@/lib/singularReporting";
import { writeSingularInstallsSnapshot, type SingularInstallsSnapshot } from "@/lib/singularInstallsSnapshot";
import { funnelTrackingStartDate } from "@/lib/repo/growthFunnel";

// Triggered two ways: the founder's own logged-in browser session (the
// "Refresh installs" button on the admin Growth Funnel -- see
// admin/page.tsx) OR a daily crontab entry on the server authenticating
// with the x-singular-refresh-secret header (see checkSingularRefreshSecret
// -- same dual-auth shape as /api/opportunities/refresh-pool/run). Runs
// Singular's full create-report -> poll -> download flow (can take anywhere
// from a few seconds to a couple of minutes -- see singularReporting.ts's
// own comment), then caches the result to singular-installs-snapshot.json
// so every later page load reads it instantly instead of re-running this.
//
// On failure, returns the actual error message from Singular (or from
// parsing its response) rather than a generic "something went wrong" --
// this is the first real integration whose exact response shape wasn't
// fully confirmed against Singular's docs, so a specific error here is what
// lets it get fixed quickly instead of silently showing a stale/wrong
// number. A cron-triggered failure lands in the server's own logs
// (console.error below) since there's no browser there to show it to.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkSingularRefreshSecret(req.headers.get("x-singular-refresh-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!singularReportingConfigured()) {
    return NextResponse.json({ error: "SINGULAR_REPORTING_API_KEY isn't set on the server yet." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  // Matches the same fixed start date as GA4/signups (see
  // growthFunnel.ts's FUNNEL_TRACKING_START) by default -- a `since`
  // override is still accepted for ad-hoc checks, but the daily cron and
  // the dashboard's own button both rely on the default.
  const sinceDate = searchParams.get("since") || funnelTrackingStartDate();
  const source = searchParams.get("source") || "blog";

  try {
    const result = await fetchSingularInstalls(sinceDate, source);
    const snapshot: SingularInstallsSnapshot = {
      checkedAt: new Date().toISOString(),
      sinceDate,
      source,
      clicks: result.clicks,
      installs: result.installs,
    };
    writeSingularInstallsSnapshot(snapshot);
    return NextResponse.json({ snapshot, rowCount: result.rows.length });
  } catch (e) {
    console.error("Singular refresh failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Singular refresh failed." }, { status: 502 });
  }
}
