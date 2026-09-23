import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { purgeAllJobPostings } from "@/lib/repo/jobPostings";

// One-time cleanup lever for the admin dashboard's Opportunities section
// (see admin/page.tsx) -- wipes the shared job_postings pool so the very
// next refresh-pool run rebuilds it entirely through the apply-link
// resolver + aggregator denylist (see purgeAllJobPostings' own comment for
// why an ordinary refresh alone can never fix an already-bad pool). Never
// called automatically; the admin clicks it once, then clicks "Refresh job
// pool now" right after.
export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const removed = purgeAllJobPostings();
  return NextResponse.json({ removed });
}
