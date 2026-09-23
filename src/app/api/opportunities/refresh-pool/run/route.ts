import { NextResponse } from "next/server";
import { isAdminAuthed, checkOpportunitiesRefreshSecret } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs, type AdzunaJob } from "@/lib/adzuna";
import { resolveDirectApplyUrl, mapWithConcurrency } from "@/lib/applyLinkResolver";
import { OPPORTUNITY_CITIES } from "@/lib/geo";
import { upsertJobPosting, externalIdExists, pruneStaleJobPostings, countActiveJobPostings } from "@/lib/repo/jobPostings";
import { recordAdzunaCall, getAdzunaUsage } from "@/lib/repo/adzunaUsage";
import { getRefreshChunkIndex, advanceRefreshChunkIndex } from "@/lib/repo/refreshPoolState";

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
  // Dropped after resolution -- either the redirect wouldn't resolve within
  // the timeout, or it resolved to a marketplace/aggregator domain (see
  // resolveDirectApplyUrl's own comment for why those two collapse into one
  // outcome: both mean "don't show this").
  let filteredOut = 0;
  let filteredCapped = 0; // new posting, but this run already hit MAX_RESOLUTIONS_PER_RUN
  // Breakdown of WHY filteredOut jobs got dropped -- see
  // ApplyUrlResolution's own comment in lib/applyLinkResolver.ts for why
  // this exists. unresolved = fetch itself failed/timed out; aggregator =
  // resolved fine but landed on a denylisted domain (see
  // aggregatorDomainCounts for exactly which ones).
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
    filteredCapped += fresh.length - toResolve.length;
    resolutionsUsed += toResolve.length;

    await mapWithConcurrency(toResolve, RESOLVE_CONCURRENCY, async (job) => {
      const outcome = await resolveDirectApplyUrl(job.link);
      if (!outcome.url) {
        filteredOut++;
        if (outcome.reason === "aggregator") {
          aggregatorCount++;
          aggregatorDomainCounts.set(outcome.domain, (aggregatorDomainCounts.get(outcome.domain) ?? 0) + 1);
        } else {
          unresolvedCount++;
        }
        return;
      }
      upsertJobPosting({ ...job, link: outcome.url }, cell.fn, cell.city);
      jobsUpserted++;
      jobsNew++;
    });
  }

  const removed = pruneStaleJobPostings();
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
    filteredOut,
    // The breakdown behind filteredOut -- see the counters' own comments
    // above. topAggregatorDomains is sorted by count, most-hit first, so
    // "everything landed back on adzuna.in" (the resolver never actually
    // reaching a real HTTP redirect) is immediately visible instead of
    // looking identical to "these 150 genuinely were portal listings".
    unresolvedCount,
    aggregatorCount,
    topAggregatorDomains: Array.from(aggregatorDomainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, count]) => `${domain} (${count})`),
    filteredCapped,
    staleRemoved: removed,
    poolSize: countActiveJobPostings(),
    adzunaUsage: getAdzunaUsage(),
  });
}
