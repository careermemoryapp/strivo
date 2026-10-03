import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { countActiveJobPostings, countJobsNeedingLinkBackfill, countUnclassifiedActiveJobPostings } from "@/lib/repo/jobPostings";
import { getAdzunaUsage } from "@/lib/repo/adzunaUsage";
import { resolverProxyConfigured } from "@/lib/applyLinkResolver";
import { aiConfigured } from "@/lib/ai";
import { logoDevConfigured } from "@/lib/logoLookup";

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
    // See backfill_checked_at's comment in lib/db.ts -- how many already-
    // stored postings the "Backfill existing links" button still hasn't
    // looked at, shown on the admin dashboard as a progress indicator.
    jobsNeedingBackfill: countJobsNeedingLinkBackfill(),
    // Added 2026-10-03 -- see countUnclassifiedActiveJobPostings' own
    // comment in lib/repo/jobPostings.ts for the founder report this
    // answers ("out of 14,000, why only 5 matches"). aiConfigured/
    // logoDevConfigured are surfaced alongside it because a large
    // unclassifiedBacklog number means something different depending on
    // whether classification is even turned on at all (missing
    // OPENAI_API_KEY -- backlog will NEVER shrink on its own) versus just
    // genuinely still working through a real backlog (key is set --
    // backlog shrinks by up to 150/chunk run, see refresh-pool/run).
    unclassifiedBacklog: countUnclassifiedActiveJobPostings(),
    aiConfigured: aiConfigured(),
    logoDevConfigured: logoDevConfigured(),
  });
}
