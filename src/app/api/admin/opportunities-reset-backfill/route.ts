import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { resetLinkBackfillProgress } from "@/lib/repo/jobPostings";

// One-time lever for the admin dashboard's Opportunities section -- see
// resetLinkBackfillProgress's own comment in lib/repo/jobPostings.ts for
// the full "why": the apply-link backfill's own "already checked" marker
// doesn't know WHAT it was checked for, so when the backfill's own logic
// gets upgraded (e.g. 2026-10-03, adding the "is this listing actually
// still available" check on top of the original "does this link resolve"
// check), postings already marked checked under the OLD logic are
// silently never reconsidered under the new one -- "Backfill existing
// links" would just report "all done!" having never actually run the new
// check against most of the pool. This clears that marker so the next
// backfill pass starts over, whole-pool, under whatever the backfill's
// current logic is. Not something to click routinely -- only after a real
// change to what the backfill checks for.
export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reset = resetLinkBackfillProgress();
  return NextResponse.json({ reset });
}
