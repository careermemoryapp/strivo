import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { resolveDirectApplyUrl, resolverProxyConfigured, mapWithConcurrency } from "@/lib/applyLinkResolver";
import { isAggregatorDomain } from "@/lib/config";
import {
  listJobsNeedingLinkBackfill,
  countJobsNeedingLinkBackfill,
  applyBackfillResult,
} from "@/lib/repo/jobPostings";

// One-time (repeat-until-done) backfill for the admin dashboard's
// Opportunities section -- see backfill_checked_at's comment in lib/db.ts
// for the full "why": RESOLVER_PROXY_URL (added 2026-10-03) only changes
// how BRAND NEW postings get resolved going forward (app/api/
// opportunities/refresh-pool/run only ever resolves a job the first time
// its external_id is ever seen -- see upsertJobPosting's own comment on
// why source_url is deliberately never overwritten there). Everything
// already sitting in job_postings from before the proxy existed keeps
// whatever link it was given back when this server was IP-blocked for
// close to 100% of resolution attempts -- it won't fix itself until that
// row happens to get purged and re-discovered as "new," which could be
// weeks away. This route re-runs resolution on the EXISTING source_url of
// already-stored postings, using the now-working proxy, so a founder can
// see the fix actually land in today's pool instead of waiting on natural
// churn.
//
// Only ever resolves rows whose CURRENT source_url is still on the
// aggregator denylist (isAggregatorDomain) -- a row that already resolved
// to a direct employer link (rare pre-proxy, but possible) is left alone
// and just marked checked, same as this file's own history of "attempted
// marker kept separate from the result" (classified_at, logo_looked_up_at).
// A row that still comes back aggregator/unresolved after this attempt
// (most commonly a sponsored/Appcast-routed listing that lands on
// Adzuna's own page by DESIGN, not by IP block -- see the founder-
// confirmed finding in admin/page.tsx's resolver-test history) is marked
// checked too, so a later click doesn't keep re-spending a resolution
// request on a listing that will never resolve past Adzuna's own landing
// page -- that's not a bug, it's the same "land on Adzuna, tap their own
// Apply button" flow the founder already confirmed works and explicitly
// accepted.
//
// Bounded per call, same reasoning (and same numbers) as refresh-pool/
// run's MAX_RESOLUTIONS_PER_RUN/RESOLVE_CONCURRENCY -- a burst of
// thousands of simultaneous outbound requests in one HTTP call would both
// blow well past any reasonable request timeout and risk the exact
// burst-pattern blocking that got the earlier Jooble integration flagged.
// The admin clicks this repeatedly (like "Refresh job pool now (next
// chunk)") until remaining hits 0.
const MAX_BACKFILL_PER_RUN = 150;
const RESOLVE_CONCURRENCY = 8;

export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!resolverProxyConfigured()) {
    return NextResponse.json(
      { error: "RESOLVER_PROXY_URL isn't configured -- add it to the server's .env and redeploy first (see \"Apply-link resolver proxy\" above)." },
      { status: 400 }
    );
  }

  const batch = listJobsNeedingLinkBackfill(MAX_BACKFILL_PER_RUN);

  let resolvedDirectCount = 0;
  let stillAggregatorCount = 0;
  let unresolvedCount = 0;
  let alreadyDirectCount = 0; // row's existing link wasn't actually an aggregator link -- just marked checked, nothing to resolve
  const topDomains = new Map<string, number>();

  await mapWithConcurrency(batch, RESOLVE_CONCURRENCY, async (posting) => {
    if (!isAggregatorDomain(posting.source_url)) {
      alreadyDirectCount++;
      applyBackfillResult(posting.id, null);
      return;
    }
    const outcome = await resolveDirectApplyUrl(posting.source_url);
    if (outcome.url) {
      resolvedDirectCount++;
      applyBackfillResult(posting.id, outcome.url);
    } else {
      applyBackfillResult(posting.id, null);
      if (outcome.reason === "aggregator") {
        stillAggregatorCount++;
        topDomains.set(outcome.domain, (topDomains.get(outcome.domain) ?? 0) + 1);
      } else {
        unresolvedCount++;
      }
    }
  });

  const topAggregatorDomains = [...topDomains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => `${domain} (${count})`);

  return NextResponse.json({
    batchSize: batch.length,
    resolvedDirectCount,
    stillAggregatorCount,
    unresolvedCount,
    alreadyDirectCount,
    topAggregatorDomains,
    remaining: countJobsNeedingLinkBackfill(),
  });
}
