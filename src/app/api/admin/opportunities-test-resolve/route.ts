import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs } from "@/lib/adzuna";
import { resolveDirectApplyUrl } from "@/lib/applyLinkResolver";
import { recordAdzunaCall } from "@/lib/repo/adzunaUsage";

// A cheap, read-only probe -- ONE Adzuna query (1 call, not a 240-call
// chunk) plus resolving a handful of its results through the same
// resolveDirectApplyUrl every real refresh uses. Exists so the founder can
// check whether a resolver fix actually works without spending a real
// chunk's budget (and without advancing refresh_pool_state's cursor, or
// writing anything to job_postings -- this never calls upsertJobPosting).
// Added the same day a post-purge chunk filtered out 100% of its 150
// resolutions with nothing to explain why; waiting a full day just to find
// out whether a one-line fix worked wasn't worth it when 1 call safely
// answers the same question. Not on any schedule -- triggered by hand from
// the admin dashboard's "Test resolver" button.
export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adzunaConfigured()) {
    return NextResponse.json({ error: "ADZUNA_APP_ID/ADZUNA_APP_KEY not configured" }, { status: 500 });
  }

  // A fixed, high-volume cell -- chosen only to reliably return a handful
  // of results to test against, not for any product reason.
  const jobs = await searchAdzunaJobs("Product Manager", "Bengaluru", 1);
  recordAdzunaCall();
  if (!jobs) {
    return NextResponse.json({ error: "The Adzuna search itself failed -- see server logs for the underlying error." }, { status: 502 });
  }
  if (jobs.length === 0) {
    return NextResponse.json({ queried: 0, results: [] });
  }

  const sample = jobs.slice(0, 5);
  const results = await Promise.all(
    sample.map(async (job) => {
      const outcome = await resolveDirectApplyUrl(job.link);
      return {
        title: job.title,
        company: job.company,
        redirectUrl: job.link,
        ok: !!outcome.url,
        finalUrl: outcome.url ?? null,
        reason: outcome.url ? null : outcome.reason,
        domain: !outcome.url && outcome.reason === "aggregator" ? outcome.domain : null,
      };
    })
  );

  return NextResponse.json({ queried: jobs.length, results });
}
