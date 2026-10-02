import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { clearAllUserOpportunities } from "@/lib/repo/userOpportunities";

// Admin-only lever, added 2026-10-02 alongside a matching/ranking fix
// (opportunities.ts's buildProfileText + ai.ts's rankOpportunities system
// prompt -- see their own comments) that changes what every user's cached
// Opportunities list looks like going forward. Without this, each of the
// 94 users would only see the fix once their own CACHE_MAX_AGE_DAYS-old
// cache happened to expire -- this clears everyone's cached list at once so
// the very next tab-open recomputes with today's logic. Deliberately a GET,
// same as opportunities-debug above -- a one-off admin action hit directly
// by URL while signed into /admin, no dashboard button wired up for this
// (no founder ask for that yet). Does NOT touch job_postings itself -- see
// clearAllUserOpportunities' own comment in lib/repo/userOpportunities.ts
// for why that's deliberately a separate, much bigger lever ("Purge job
// pool" on the admin dashboard).
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const removed = clearAllUserOpportunities();
  return NextResponse.json({ removed });
}
