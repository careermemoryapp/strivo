import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs } from "@/lib/adzuna";
import { debugResolveFinalUrlVariants, resolveDirectApplyUrl } from "@/lib/applyLinkResolver";
import { recordAdzunaCall } from "@/lib/repo/adzunaUsage";
import { externalIdExists, upsertJobPosting, countActiveJobPostings } from "@/lib/repo/jobPostings";

// A cheap probe -- ONE Adzuna query (1 call, not a 240-call chunk) plus
// resolving a handful of its results through the same resolveDirectApplyUrl
// every real refresh uses. Exists so the founder can check whether a
// resolver fix actually works without spending a real chunk's budget (and
// without advancing refresh_pool_state's cursor -- that stays untouched, so
// this never steals from a real chunk's place in the rotation).
// Added the same day a post-purge chunk filtered out 100% of its 150
// resolutions with nothing to explain why; waiting a full day just to find
// out whether a one-line fix worked wasn't worth it when 1 call safely
// answers the same question. Not on any schedule -- triggered by hand from
// the admin dashboard's "Test resolver" button.
//
// DOES call upsertJobPosting now (it didn't originally -- see this file's
// own git history) -- a direct founder ask, after a same-day chunk showed
// Pool size stuck at 0 and there was no cheap way to confirm the save path
// itself (as opposed to just the resolution verdict) actually works without
// burning a full chunk's 240-call budget or waiting for the next daily
// quota reset. Uses the exact same upsert logic as the real refresh route
// (resolved link if resolution succeeded, Adzuna's own raw redirect link
// otherwise -- never dropped), on the same small sample this route already
// queries, so a founder can confirm end-to-end in seconds: 1 call, sample
// jobs land in job_postings, Pool size visibly ticks up.
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
      // Same upsert this route's own comment describes: whether or not
      // resolution succeeded, the job is saved -- resolved link when it
      // did, Adzuna's own raw redirect link when it didn't -- mirroring
      // app/api/opportunities/refresh-pool/run's real behavior exactly, so
      // this probe actually exercises the save path, not just the
      // resolution verdict. `saved` reports whether this call is what put
      // it there (false for a job this sample already knew about --
      // last_seen_at still gets bumped, same as a real chunk would).
      const alreadyKnown = externalIdExists(String(job.id));
      upsertJobPosting(outcome.url ? { ...job, link: outcome.url } : job, "Product Manager", "Bengaluru");
      return {
        title: job.title,
        company: job.company,
        redirectUrl: job.link,
        ok: !!outcome.url,
        finalUrl: outcome.url ?? null,
        reason: outcome.url ? null : outcome.reason,
        domain: !outcome.url && outcome.reason === "aggregator" ? outcome.domain : null,
        saved: !alreadyKnown,
      };
    })
  );

  // Raw diagnostic on just the first sample job -- three variants (plain /
  // with a Referer header / with a Referer + a cookie picked up from
  // Adzuna's own homepage first), so a still-failing run shows WHY (a real
  // Cloudflare interstitial vs. an IP-level block vs. a missing-session
  // block) instead of just another "landed on adzuna.in". Only one job,
  // not all five -- this is a debug probe, not something that needs to
  // characterize the whole sample, and three variants x five jobs is a lot
  // of extra requests for one button click.
  const debug = sample.length > 0 ? await debugResolveFinalUrlVariants(sample[0].link) : null;

  return NextResponse.json({ queried: jobs.length, results, debug, poolSizeAfter: countActiveJobPostings() });
}
