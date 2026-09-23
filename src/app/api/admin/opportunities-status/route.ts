import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { countActiveJobPostings } from "@/lib/repo/jobPostings";
import { getAdzunaUsage } from "@/lib/repo/adzunaUsage";

// Read-only status for the admin dashboard's Opportunities section
// (admin/page.tsx) -- loaded on page mount so the founder can see, before
// touching either button, whether it's safe to click "Refresh job pool
// now" this month without needing to run it first. poolSize and
// adzunaUsage are the same figures refresh-pool/run's own response
// includes, just available without spending a run to see them.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ poolSize: countActiveJobPostings(), adzunaUsage: getAdzunaUsage() });
}
