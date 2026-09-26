import fs from "node:fs";
import path from "node:path";

// Caches the result of the last successful Singular Reporting API pull (see
// lib/singularReporting.ts) so the admin Growth Funnel can show a real
// "Installed" number on every page load without re-running Singular's slow
// async create->poll->download flow each time. Same convention as
// live-security-status.json (lib/liveSecurityStatus.ts): a plain JSON file
// at the project root, gitignored, written by a background/on-demand job
// and read synchronously by the dashboard. Refreshed by an admin clicking
// "Refresh installs" (see /api/admin/singular-refresh), not automatically
// -- there's no cron for this yet, so the snapshot can go stale; the UI
// shows checkedAt so that's visible rather than hidden.

export type SingularInstallsSnapshot = {
  checkedAt: string;
  // "YYYY-MM-DD" -- the fixed date this pull measured from (see
  // growthFunnel.ts's FUNNEL_TRACKING_START), not a rolling day count.
  sinceDate: string;
  source: string;
  clicks: number;
  installs: number;
};

const SNAPSHOT_FILE = path.join(process.cwd(), "singular-installs-snapshot.json");

export function readSingularInstallsSnapshot(): SingularInstallsSnapshot | null {
  let raw: string;
  try {
    raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as SingularInstallsSnapshot;
  } catch {
    return null;
  }
}

export function writeSingularInstallsSnapshot(snapshot: SingularInstallsSnapshot): void {
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf8");
}
