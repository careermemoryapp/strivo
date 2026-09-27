import fs from "node:fs";
import path from "node:path";

// Caches the result of the last successful Clarity Data Export API pull
// (see lib/clarityReporting.ts) so the admin dashboard's "Daily insights"
// panel can show something instantly on every page load instead of
// re-hitting Clarity's API (10 requests/project/day, shared with any
// manual digging done directly on clarity.microsoft.com) every time
// someone opens /admin. Same convention as singular-installs-snapshot.json
// (lib/singularInstallsSnapshot.ts): a plain JSON file at the project
// root, gitignored, written on-demand by an admin clicking "Refresh" (see
// /api/admin/clarity-insights), not automatically -- there's no cron for
// this yet, so the snapshot can go stale; the UI shows checkedAt so that's
// visible rather than hidden.

export type ClarityInsightsSnapshot = {
  checkedAt: string; // ISO timestamp of the pull this snapshot reflects
  numOfDays: 1 | 2 | 3; // the Clarity API's own window size for that pull
  // Ready-to-render summary lines -- see clarityReporting.ts for how these
  // get built (one confirmed-shape metric parsed properly, everything else
  // rendered generically since Clarity's docs don't specify those fields).
  insights: string[];
  // The raw API response(s) behind `insights`, kept so a parsing
  // improvement later can be re-derived without spending another request
  // against the daily quota. Not rendered directly.
  raw: unknown;
};

const SNAPSHOT_FILE = path.join(process.cwd(), "clarity-insights-snapshot.json");

export function readClarityInsightsSnapshot(): ClarityInsightsSnapshot | null {
  let raw: string;
  try {
    raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as ClarityInsightsSnapshot;
  } catch {
    return null;
  }
}

export function writeClarityInsightsSnapshot(snapshot: ClarityInsightsSnapshot): void {
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf8");
}
