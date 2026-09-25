import { NextResponse } from "next/server";
import { isAdminAuthed, checkOpportunitiesRefreshSecret } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs, type AdzunaJob } from "@/lib/adzuna";
import { resolveDirectApplyUrl, mapWithConcurrency } from "@/lib/applyLinkResolver";
import { OPPORTUNITY_CITIES } from "@/lib/geo";
import {
  upsertJobPosting,
  externalIdExists,
  pruneStaleJobPostings,
  countActiveJobPostings,
  listUnclassifiedActiveJobPostings,
  setJobClassification,
  listJobsNeedingLogoLookup,
  findResolvedLogoDomainForCompany,
  setJobLogo,
} from "@/lib/repo/jobPostings";
import { recordAdzunaCall, getAdzunaUsage } from "@/lib/repo/adzunaUsage";
import { getRefreshChunkIndex, advanceRefreshChunkIndex } from "@/lib/repo/refreshPoolState";
import { classifyJobPostings, aiConfigured } from "@/lib/ai";
import { lookupCompanyLogoDomain, logoDevConfigured } from "@/lib/logoLookup";

// Fixed function x city grid, PACED IN CHUNKS -- a direct founder call,
// worked through with exact numbers, after finding that a single sweep of
// the whole grid (975+ calls) comfortably fits Adzuna's 2,500/MONTH cap
// but blows straight through its 250/DAY and 1,000/WEEK ones (all four
// limits are Adzuna's own, from https://developer.adzuna.com/docs/
// terms_of_service). So this route no longer queries every function on
// every invocation -- it queries ONE CHUNK of CHUNK_SIZE functions (all
// OPPORTUNITY_CITIES.length cities) and remembers where it left off (see
// lib/repo/refreshPoolState.ts), advancing to the next chunk each time
// it's called. The math, worked through end to end:
//   - CHUNK_SIZE (16) x 15 cities = 240 calls per invocation -- under the
//     250/day cap with a small margin.
//   - FUNCTIONS.length (80) / CHUNK_SIZE (16) = 5 chunks make one full
//     pass over every function -- 5 x 240 = 1,200 calls per pass.
//   - The crontab entry (see docs/README, or ask -- it's given as an exact
//     schedule) fires on 10 specific days a month, grouped 1/3/5/7/9 and
//     15/17/19/21/23 -- two passes a month, spaced so no run-day is ever
//     more than 4 chunks from another within any 7-day window (4 x 240 =
//     960, under the 1,000/week cap), and 10 x 240 = 2,400/month, under
//     the 2,500/month cap.
// A missed or late firing doesn't break this -- the cursor just resumes
// at whatever chunk comes next whenever this route is next called,
// instead of being tied to a specific calendar date.
//
// Per a direct founder call: city coverage stays FIXED (see
// OPPORTUNITY_CITIES in lib/geo.ts -- 15 hand-picked major cities, not "as
// many as possible"), and the query budget goes toward broader FUNCTION
// coverage instead -- grown 65 -> 80 alongside this chunking change.
// Seniority is deliberately NOT encoded into these query strings (no
// "Senior Product Manager" vs "Associate Product Manager" as separate
// cells, and no extra Adzuna call spent on it) -- Adzuna already returns a
// spread of levels for a plain title, and matching a specific person's
// seniority against that spread happens per-user in rankOpportunities
// (lib/ai.ts), which is an OpenAI call, not an Adzuna one -- it runs
// whenever a user's own ranking needs recomputing, entirely separate from
// this route's budget.
const FUNCTIONS = [
  "Product Manager",
  "Strategy Manager",
  "Business Development",
  "Finance Manager",
  "Marketing Manager",
  "Sales Manager",
  "Operations Manager",
  "Data Analyst",
  "Project Manager",
  "Business Analyst",
  "Consultant",
  "Human Resources Manager",
  "Supply Chain Manager",
  "Investment Analyst",
  "Customer Success Manager",
  "Account Manager",
  "Program Manager",
  "Research Analyst",
  "Procurement Manager",
  "Category Manager",
  "Risk Manager",
  "Corporate Communications Manager",
  "Software Engineer",
  "Legal Counsel",
  "Financial Analyst",
  "Digital Marketing Manager",
  "Brand Manager",
  "Product Designer",
  "Content Manager",
  "Talent Acquisition Manager",
  "Training and Development Manager",
  "Compliance Manager",
  "Quality Assurance Manager",
  "Manufacturing Manager",
  "Logistics Manager",
  "Retail Manager",
  "Public Relations Manager",
  "Event Manager",
  "Data Scientist",
  "Administration Manager",
  "Business Intelligence Analyst",
  "Credit Analyst",
  "Treasury Manager",
  "Internal Audit Manager",
  "Tax Manager",
  "Store Manager",
  "Merchandising Manager",
  "E-commerce Manager",
  "Growth Manager",
  "Partnerships Manager",
  "Channel Sales Manager",
  "Warehouse Manager",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Site Engineer",
  "Architect",
  "Interior Designer",
  "UI/UX Designer",
  "DevOps Engineer",
  "IT Manager",
  "Network Engineer",
  "Recruiter",
  "Underwriter",
  "Actuary",
  // Added alongside the chunking change (65 -> 80) -- several of these
  // (Automobile Engineer, Production Manager, Plant Manager, Maintenance
  // Engineer) also directly help automotive-industry matches, per a
  // direct founder ask.
  "Automobile Engineer",
  "Production Manager",
  "Plant Manager",
  "Maintenance Engineer",
  "Design Engineer",
  "R&D Engineer",
  "Field Sales Executive",
  "Key Account Manager",
  "Insurance Manager",
  "Wealth Manager",
  "Relationship Manager",
  "Data Engineer",
  "Machine Learning Engineer",
  "QA Engineer",
  "Technical Writer",
]; // 80 total -- must stay a multiple of CHUNK_SIZE (16) or the chunking math above breaks

const CITIES = OPPORTUNITY_CITIES;

// See the top-of-file comment for the exact math this size was chosen
// from -- CHUNK_SIZE x CITIES.length must stay comfortably under 250 (the
// daily cap).
const CHUNK_SIZE = 16;
const TOTAL_CHUNKS = FUNCTIONS.length / CHUNK_SIZE;

// How many brand-new (never-before-seen external_id) postings this
// invocation will spend an apply-link resolution request on -- see
// lib/applyLinkResolver.ts. Bounded so a chunk that turns up a big backlog
// of new listings can't balloon into hundreds of outbound HTTP requests to
// third-party sites in one shot; anything over the cap just gets picked up
// on a LATER chunk instead. Sized down from 600 (the old whole-grid-in-
// one-run version of this route) now that one invocation is ~1/5th the
// size.
const MAX_RESOLUTIONS_PER_RUN = 150;
// At most this many resolution requests in flight at once -- a burst of
// hundreds of simultaneous requests from one server IP is exactly what
// got the earlier Jooble integration blocked by Cloudflare; staying
// modest here is deliberate, not just being slow for its own sake.
const RESOLVE_CONCURRENCY = 8;
// How many Adzuna queries run at once. Adzuna's own docs don't publish a
// hard per-second rate limit, so this stays conservative rather than
// finding out the hard way.
const QUERY_CONCURRENCY = 5;

// Industry/seniority classification (see classifyJobPostings in lib/ai.ts)
// for the Opportunities tab's structured matching (lib/opportunities.ts) --
// deliberately NOT part of the Adzuna call budget this whole file is
// careful to stay under (see the top-of-file comment): this is pure OpenAI
// cost, spent once per posting ever, not per Adzuna query. Bounded per run
// the same way apply-link resolution is bounded above -- a chunk that turns
// up a big backlog can't balloon into an unbounded number of OpenAI calls
// in one invocation; whatever's left over just gets picked up on a LATER
// chunk (see listUnclassifiedActiveJobPostings, which always returns the
// oldest-still-unclassified backlog first, so this naturally works down
// both this run's new postings AND any pre-existing backlog together).
const CLASSIFY_BATCH_SIZE = 25;
const MAX_CLASSIFY_BATCHES_PER_RUN = 6; // up to 150 postings classified per invocation

// Company logo lookup (lib/logoLookup.ts) -- same "bounded per run, backlog
// works itself down over later chunks" shape as classification above, and
// likewise pure logo.dev cost, no relation to the Adzuna budget this file
// is otherwise careful about. Concurrency kept modest (unlike
// RESOLVE_CONCURRENCY's Cloudflare-flagging concern above, this is simply
// good manners toward a third-party API on logo.dev's own free tier).
const MAX_LOGO_LOOKUPS_PER_RUN = 150;
const LOGO_LOOKUP_CONCURRENCY = 5;

type QueryCell = { fn: string; city: string };

// Called on the crontab schedule described above, or by hand from an
// admin session / curl with the x-opportunities-refresh-secret header --
// EVERY call (cron or manual) processes exactly one chunk and advances
// the cursor, so there's only one code path to reason about regardless of
// who triggers it. Best-effort per cell within the chunk: one query
// failing (rate limit, transient network error) shouldn't abort the rest
// of the chunk.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkOpportunitiesRefreshSecret(req.headers.get("x-opportunities-refresh-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adzunaConfigured()) {
    return NextResponse.json({ error: "ADZUNA_APP_ID/ADZUNA_APP_KEY not configured" }, { status: 500 });
  }

  const chunkIndex = getRefreshChunkIndex();
  const chunkFunctions = FUNCTIONS.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);

  let queriesFailed = 0;
  let jobsUpserted = 0; // includes both brand-new and already-known (refreshed) postings
  let jobsNew = 0;
  // A new posting is now ALWAYS shown, one of two ways -- see the
  // resolution loop below for why jobs are no longer dropped:
  // resolvedDirectCount = server-side resolution actually succeeded (a
  // verified employer/ATS page); rawRedirectCount = it didn't (or wasn't
  // attempted, past MAX_RESOLUTIONS_PER_RUN), so the job is shown with
  // Adzuna's own redirect link as-is, for the person's own browser to
  // follow when they click Apply.
  let resolvedDirectCount = 0;
  let rawRedirectCount = 0;
  // Breakdown of WHY a resolution attempt (not every rawRedirectCount job
  // -- only the ones actually attempted, see toResolve below) didn't
  // return a verified URL -- see ApplyUrlResolution's own comment in
  // lib/applyLinkResolver.ts. unresolved = fetch itself failed/timed out;
  // aggregator = resolved fine but landed on a denylisted domain (see
  // aggregatorDomainCounts for exactly which ones -- in practice, almost
  // always adzuna.in itself; see this file's own history below).
  let unresolvedCount = 0;
  let aggregatorCount = 0;
  const aggregatorDomainCounts = new Map<string, number>();

  const cells: QueryCell[] = [];
  for (const fn of chunkFunctions) for (const city of CITIES) cells.push({ fn, city });

  const cellResults = await mapWithConcurrency(cells, QUERY_CONCURRENCY, async (cell) => {
    const jobs = await searchAdzunaJobs(cell.fn, cell.city, 1);
    // Recorded regardless of outcome -- a failed request (including a 429
    // that exhausted its retries in searchAdzunaJobs) still went out over
    // the network and plausibly still counts against Adzuna's own limits.
    // See lib/repo/adzunaUsage.ts.
    recordAdzunaCall();
    if (!jobs) {
      queriesFailed++;
      return null;
    }
    return { cell, jobs };
  });

  let resolutionsUsed = 0;

  for (const result of cellResults) {
    if (!result) continue;
    const { cell, jobs } = result;

    // Split into "already known" (cheap -- just refresh last_seen_at) and
    // "brand new" (needs an apply-link resolution before it's trusted).
    const known: AdzunaJob[] = [];
    const fresh: AdzunaJob[] = [];
    for (const job of jobs) {
      if (externalIdExists(String(job.id))) known.push(job);
      else fresh.push(job);
    }

    for (const job of known) {
      upsertJobPosting(job, cell.fn, cell.city);
      jobsUpserted++;
    }

    const toResolve = fresh.slice(0, Math.max(0, MAX_RESOLUTIONS_PER_RUN - resolutionsUsed));
    const skippedByCap = fresh.slice(toResolve.length); // still shown -- see below, just without a resolution attempt
    resolutionsUsed += toResolve.length;

    // Every fresh job gets shown one way or another -- see this file's own
    // history for why. Confirmed via the admin dashboard's "Test resolver"
    // probe (three ways: plain, with a Referer header, with a Referer +
    // session cookie picked up from adzuna.in's own homepage) that Adzuna
    // blocks THIS SERVER's attempts to follow its own redirect_url with an
    // identical 403 "Access Denied" every time, regardless of how the
    // request is dressed up -- even genuine Chrome TLS impersonation
    // (impit) didn't get through. That points at something about this
    // server itself (most likely its IP) rather than anything fixable in
    // the request. A real person's own browser, on their own device,
    // doesn't share that problem -- so per a direct founder call, made
    // after seeing this evidence, a job whose link can't be verified
    // server-side is no longer dropped. It's shown with Adzuna's own
    // redirect link, same as one that DID resolve, and the person's own
    // browser follows it when they tap Apply. The one thing this gives up:
    // Strivo can no longer GUARANTEE every job leads straight to the
    // employer's own page -- occasionally that redirect could still land
    // on a marketplace/portal listing, same as it always did before the
    // company-page-only filtering existed. resolveDirectApplyUrl is still
    // attempted first (below) because it costs little and self-heals for
    // free if Adzuna's behavior, or this server's IP reputation, ever
    // changes -- when it does succeed, that verified direct URL is what
    // gets shown instead of the raw redirect.
    await mapWithConcurrency(toResolve, RESOLVE_CONCURRENCY, async (job) => {
      const outcome = await resolveDirectApplyUrl(job.link);
      if (outcome.url) {
        upsertJobPosting({ ...job, link: outcome.url }, cell.fn, cell.city);
        resolvedDirectCount++;
      } else {
        upsertJobPosting(job, cell.fn, cell.city);
        rawRedirectCount++;
        if (outcome.reason === "aggregator") {
          aggregatorCount++;
          aggregatorDomainCounts.set(outcome.domain, (aggregatorDomainCounts.get(outcome.domain) ?? 0) + 1);
        } else {
          unresolvedCount++;
        }
      }
      jobsUpserted++;
      jobsNew++;
    });

    // Past MAX_RESOLUTIONS_PER_RUN -- shown too, just without spending an
    // outbound resolution request on them this run (that cap exists to
    // bound how many simultaneous requests hit third-party sites in one
    // invocation, not to gate whether a job appears -- see this file's top
    // comment on RESOLVE_CONCURRENCY and the earlier Jooble/Cloudflare
    // incident it references).
    for (const job of skippedByCap) {
      upsertJobPosting(job, cell.fn, cell.city);
      rawRedirectCount++;
      jobsUpserted++;
      jobsNew++;
    }
  }

  const removed = pruneStaleJobPostings();

  // See the constants' own comment above -- this backfills BOTH this run's
  // brand-new postings and any older backlog still sitting unclassified,
  // a bounded batch at a time, every chunk run, until the whole pool is
  // caught up. Gated on aiConfigured() specifically because
  // setJobClassification marks a posting as permanently "attempted" (see
  // classified_at's own comment in lib/db.ts) -- without this check, a run
  // during any window where OPENAI_API_KEY happens to be unset would
  // classifyJobPostings-returns-nothing its way through the ENTIRE backlog,
  // stamping every posting industry_tag=null/seniority_tag=null/
  // classified_at=now and permanently skipping it, rather than genuinely
  // being retried once the key is back.
  let jobsClassified = 0;
  if (aiConfigured()) {
    const toClassify = listUnclassifiedActiveJobPostings(CLASSIFY_BATCH_SIZE * MAX_CLASSIFY_BATCHES_PER_RUN);
    for (let i = 0; i < toClassify.length; i += CLASSIFY_BATCH_SIZE) {
      const batch = toClassify.slice(i, i + CLASSIFY_BATCH_SIZE);
      const classified = await classifyJobPostings(
        batch.map((job) => ({ id: job.id, title: job.title, company: job.company, snippet: job.snippet }))
      );
      for (const job of batch) {
        const result = classified.get(job.id);
        // Still written even when THIS call came back empty (a transient
        // API failure, not a missing key -- see the aiConfigured() gate
        // above) -- see classified_at's own comment in lib/db.ts for why a
        // genuinely-attempted-but-inconclusive posting still has to be
        // marked done rather than retried forever.
        setJobClassification(job.id, result?.industry ?? null, result?.seniority ?? null);
        jobsClassified++;
      }
    }
  }

  // Company logo lookup (lib/logoLookup.ts) -- same bounded-backlog shape
  // and same "gate on the key being configured" reasoning as the
  // classification pass above (logoDevConfigured() false must never
  // permanently stamp the whole backlog as "attempted, no logo"). For
  // each posting, first check whether some OTHER posting from the same
  // company already has a result (findResolvedLogoDomainForCompany) --
  // reuse it for free; only actually call logo.dev for a company this
  // pool has never asked about before.
  let jobsLogoLookedUp = 0;
  let jobsLogoReused = 0;
  if (logoDevConfigured()) {
    const toLookup = listJobsNeedingLogoLookup(MAX_LOGO_LOOKUPS_PER_RUN);
    await mapWithConcurrency(toLookup, LOGO_LOOKUP_CONCURRENCY, async (job) => {
      if (!job.company) {
        setJobLogo(job.id, null);
        jobsLogoLookedUp++;
        return;
      }
      const prior = findResolvedLogoDomainForCompany(job.company);
      if (prior !== undefined) {
        setJobLogo(job.id, prior.domain);
        jobsLogoReused++;
        return;
      }
      const domain = await lookupCompanyLogoDomain(job.company);
      setJobLogo(job.id, domain);
      jobsLogoLookedUp++;
    });
  }

  advanceRefreshChunkIndex(TOTAL_CHUNKS);

  return NextResponse.json({
    chunkIndex, // 0-based -- which chunk this invocation just processed
    totalChunks: TOTAL_CHUNKS,
    functionsThisChunk: chunkFunctions,
    nextChunkIndex: (chunkIndex + 1) % TOTAL_CHUNKS,
    queriesRun: cells.length,
    queriesFailed,
    jobsUpserted,
    jobsNew,
    // Every new job is shown now -- resolvedDirectCount got a verified
    // employer/ATS URL from resolution; rawRedirectCount is shown with
    // Adzuna's own redirect link instead (resolution failed, or was
    // skipped past MAX_RESOLUTIONS_PER_RUN -- see the resolution loop's
    // own comment for why). unresolvedCount/aggregatorCount/
    // topAggregatorDomains only describe the rawRedirectCount jobs where
    // resolution was actually attempted, not the ones skipped by the cap.
    resolvedDirectCount,
    rawRedirectCount,
    unresolvedCount,
    aggregatorCount,
    topAggregatorDomains: Array.from(aggregatorDomainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, count]) => `${domain} (${count})`),
    staleRemoved: removed,
    poolSize: countActiveJobPostings(),
    // How many postings this invocation ran industry/seniority
    // classification on (new + backlog combined) -- see the constants'
    // comment above. 0 whenever aiConfigured() is false, distinguishable
    // from "backlog was already empty" only by also checking poolSize.
    jobsClassified,
    // How many postings this invocation looked up a company logo for --
    // jobsLogoLookedUp actually called logo.dev (or had no company name to
    // look up at all), jobsLogoReused got its result for free from another
    // posting at the same company already looked up in an earlier run. 0
    // for both whenever logoDevConfigured() is false.
    jobsLogoLookedUp,
    jobsLogoReused,
    adzunaUsage: getAdzunaUsage(),
  });
}
