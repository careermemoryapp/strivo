import fs from "node:fs";
import path from "node:path";

export type LiveCheckStatus = "pass" | "warn" | "fail";

export type LiveCheck = {
  id: string;
  label: string;
  status: LiveCheckStatus;
  detail: string;
};

export type LiveSecurityStatus = {
  checkedAt: string;
  baseUrl: string;
  checks: LiveCheck[];
};

const STATUS_FILE = path.join(process.cwd(), "live-security-status.json");

// Reads the snapshot scripts/live-security-check.js writes each time it
// runs (via cron -- see that file's header comment for the schedule and
// for how this differs from the static checklist in securityStatus.ts and
// from Sentry). These are checks that actually hit the live, running site
// -- SSL expiry, whether security headers are still present, whether the
// health endpoint responds -- things that can silently drift after a
// deploy without any code change, and that Sentry would never catch since
// nothing throws an exception when they happen. Returns null if the check
// script hasn't run yet.
export function readLiveSecurityStatus(): LiveSecurityStatus | null {
  let raw: string;
  try {
    raw = fs.readFileSync(STATUS_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as LiveSecurityStatus;
  } catch {
    return null;
  }
}
