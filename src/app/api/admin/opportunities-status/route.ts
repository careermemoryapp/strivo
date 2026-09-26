import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { countActiveJobPostings } from "@/lib/repo/jobPostings";
import { getAdzunaUsage } from "@/lib/repo/adzunaUsage";
import { resolverProxyConfigured } from "@/lib/applyLinkResolver";

// Read-only status for the admin dashboard's Opportunities section
// (admin/page.tsx) -- loaded on page mount so the founder can see, before
// touching either button, whether it's safe to click "Refresh job pool
// now" this month without needing to run it first. poolSize and
// adzunaUsage are the same figures refresh-pool/run's own response
// includes, just available without spending a run to see them.
// resolverProxyConfigured surfaces whether RESOLVER_PROXY_URL is set (see
// applyLinkResolver.ts) -- without this, there was no way to tell from the
// admin page whether a "still shows Adzuna's link" report meant the proxy
// env var never got added/deployed, vs. it's set but the proxy itself
// isn't actually getting past Adzuna's block (the latter needs a "Test
// resolver" click to tell apart, this just answers the former instantly).
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    poolSize: countActiveJobPostings(),
    adzunaUsage: getAdzunaUsage(),
    resolverProxyConfigured: resolverProxyConfigured(),
  });
}
