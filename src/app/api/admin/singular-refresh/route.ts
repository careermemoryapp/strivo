import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { fetchSingularInstalls, singularReportingConfigured } from "@/lib/singularReporting";
import { writeSingularInstallsSnapshot, type SingularInstallsSnapshot } from "@/lib/singularInstallsSnapshot";

// Admin-only, manually triggered (the "Refresh installs" button on the
// Growth Funnel section -- see admin/page.tsx). Runs Singular's full
// create-report -> poll -> download flow (can take anywhere from a few
// seconds to a couple of minutes -- see singularReporting.ts's own
// comment), then caches the result to singular-installs-snapshot.json so
// every later page load reads it instantly instead of re-running this.
//
// On failure, returns the actual error message from Singular (or from
// parsing its response) rather than a generic "something went wrong" --
// this is the first real run of an integration whose exact response shape
// wasn't fully confirmed against Singular's docs, so a specific error here
// is what lets it get fixed quickly instead of silently showing 0.
export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!singularReportingConfigured()) {
    return NextResponse.json({ error: "SINGULAR_REPORTING_API_KEY isn't set on the server yet." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(30, Math.max(1, Number(searchParams.get("days")) || 30));
  const source = searchParams.get("source") || "blog";

  try {
    const result = await fetchSingularInstalls(days, source);
    const snapshot: SingularInstallsSnapshot = {
      checkedAt: new Date().toISOString(),
      days,
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
