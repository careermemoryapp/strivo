import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getOpportunityFeedbackStats } from "@/lib/repo/userOpportunities";

// Read-only 👍/👎 totals for the admin dashboard's Opportunities section --
// a direct founder ask, after shipping the Fit/Not a fit buttons on the
// Opportunities tab with no way to see how many of each had actually come
// in. Loaded on page mount alongside opportunities-status, same pattern.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getOpportunityFeedbackStats());
}
