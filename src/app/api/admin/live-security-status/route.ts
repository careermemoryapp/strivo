import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { readLiveSecurityStatus } from "@/lib/liveSecurityStatus";

// Admin-only. Surfaces the result of the last live security check run
// (scripts/live-security-check.js, via cron) -- checks against the actual
// running site (cert expiry, headers, health, admin auth, dependency
// scan), not just the static protections built into the code.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ liveStatus: readLiveSecurityStatus() });
}
