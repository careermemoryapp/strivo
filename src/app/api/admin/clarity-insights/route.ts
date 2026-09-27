import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { clarityReportingConfigured, fetchClarityInsights } from "@/lib/clarityReporting";
import { readClarityInsightsSnapshot, writeClarityInsightsSnapshot, type ClarityInsightsSnapshot } from "@/lib/clarityInsightsSnapshot";

// Admin-only. Powers the "Daily insights" panel on the admin dashboard (see
// admin/page.tsx) -- GET returns whatever was cached last (instant, no
// external call, safe to call on every page load); POST triggers a real
// Clarity Data Export API pull and re-caches it.
//
// POST is rate-limited server-side to roughly once a day -- separate from
// (and tighter than) Clarity's own 10-requests/project/day cap -- so an
// admin repeatedly clicking "Refresh" can't burn through that shared
// budget (the same token/project is also used for manual digging directly
// on clarity.microsoft.com). The frontend button disables itself based on
// the same cooldown, but this check is the real enforcement.
const MIN_HOURS_BETWEEN_REFRESHES = 20;

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    snapshot: readClarityInsightsSnapshot(),
    configured: clarityReportingConfigured(),
  });
}

export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!clarityReportingConfigured()) {
    return NextResponse.json({ error: "CLARITY_API_TOKEN isn't set on the server yet." }, { status: 400 });
  }

  const existing = readClarityInsightsSnapshot();
  if (existing) {
    const hoursSince = (Date.now() - new Date(existing.checkedAt).getTime()) / 3_600_000;
    if (hoursSince < MIN_HOURS_BETWEEN_REFRESHES) {
      const nextAt = new Date(new Date(existing.checkedAt).getTime() + MIN_HOURS_BETWEEN_REFRESHES * 3_600_000);
      return NextResponse.json(
        {
          error: `Already refreshed recently — Clarity only allows a handful of pulls a day. Try again after ${nextAt.toLocaleString()}.`,
        },
        { status: 429 }
      );
    }
  }

  try {
    const { insights, raw, numOfDays } = await fetchClarityInsights();
    const snapshot: ClarityInsightsSnapshot = { checkedAt: new Date().toISOString(), numOfDays, insights, raw };
    writeClarityInsightsSnapshot(snapshot);
    return NextResponse.json({ snapshot });
  } catch (e) {
    console.error("Clarity insights refresh failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Clarity refresh failed." }, { status: 502 });
  }
}
