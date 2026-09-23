import { NextResponse } from "next/server";
import { isAdminAuthed, checkOpportunitiesRefreshSecret } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs, type AdzunaJob } from "@/lib/adzuna";
import { resolveDirectApplyUrl, mapWithConcurrency } from "@/lib/applyLinkResolver";
import { OPPORTUNITY_CITIES } from "@/lib/geo";
import { upsertJobPosting, externalIdExists, pruneStaleJobPostings, countActiveJobPostings } from "@/lib/repo/jobPostings";

// Fixed function x city grid -- the entire point of this being fixed
// (rather than generated per-user) is staying comfortably inside Adzuna's
// REAL free-tier cap: 1,000 calls/MONTH (confirmed against Adzuna's own
// pricing page -- NOT 2,500, an earlier wrong figure in this file's
// history). One page per cell, one run = FUNCTIONS.length *
// OPPORTUNITY_CITIES.length = 975 calls. This route is meant to run on a
// crontab entry ONCE A MONTH -- a direct founder call: job listings aren't
// something people check for minute-to-minute freshness, they'd rather
// have a much BROADER pool than a frequently-refreshed narrow one. 975 * 1
// = 975/month, a 25-call buffer for manual runs. Still callable by hand
// too, same as before.
//
// Per a direct founder call: city coverage stays FIXED (see
// OPPORTUNITY_CITIES in lib/geo.ts -- 15 hand-picked major cities, not "as
// many as possible"), and the query budget goes toward much broader
// FUNCTION coverage instead -- 40 -> 65 functions here, 15 cities, 975/run
// (65 * 15). Seniority is deliberately NOT encoded into these query
// strings (no "Senior Product Manager" vs "Associate Product Manager" as
// separate cells, and no extra Adzuna call spent on it) -- Adzuna already
// returns a spread of levels for a plain title, and matching a specific
// person's seniority against that spread happens per-user in
// rankOpportunities (lib/ai.ts), which is an OpenAI call, not an Adzuna
// one -- it runs whenever a user's own ranking needs recomputing, entirely
// separate from this route's budget.
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
];

const CITIES = OPPORTUNITY_CITIES;

// How many brand-new (never-before-seen external_id) postings this run
// will spend an apply-link resolution request on -- see
// lib/applyLinkResolver.ts. Bounded so a run that suddenly turns up a huge
// backlog of new listings (e.g. the very first run after broadening the
// grid) can't balloon into thousands of outbound HTTP requests to
// third-party sites in one shot; anything over the cap just gets picked up
// on a LATER run instead, since the same Adzuna query tends to keep
// returning the same listings run to run. Raised from 300 (the twice-a-
// month version of this route) to 600 now that this only runs once a
// month -- a full month's worth of new postings across a much bigger grid
// is a bigger backlog, and "picked up next run" now means "next month,"
// not "in two weeks," so it's worth spending more of this run's time
// clearing it.
const MAX_RESOLUTIONS_PER_RUN = 600;
// At most this many resolution requests in flight at once, across the
// whole run -- a burst of hundreds of simultaneous requests from one
// server IP is exactly what got the earlier Jooble integration blocked by
// Cloudflare; staying modest here is deliberate, not just being slow for
// its own sake.
const RESOLVE_CONCURRENCY = 8;
// How many Adzuna queries run at once. Adzuna's own docs don't publish a
// hard per-second rate limit, so this stays conservative rather than
// finding out the hard way.
const QUERY_CONCURRENCY = 5;

type QueryCell = { fn: string; city: string };

// Called on a monthly crontab entry (see the comment on FUNCTIONS above),
// or by hand from an admin session / curl with the
// x-opportunities-refresh-secret header. Best-effort per cell: one query
// failing (rate limit, transient network error) shouldn't abort the rest
// of the grid, same posture as every other /run route's per-user loop.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkOpportunitiesRefreshSecret(req.headers.get("x-opportunities-refresh-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adzunaConfigured()) {
    return NextResponse.json({ error: "ADZUNA_APP_ID/ADZUNA_APP_KEY not configured" }, { status: 500 });
  }

  let queriesFailed = 0;
  let jobsUpserted = 0; // includes both brand-new and already-known (refreshed) postings
  let jobsNew = 0;
  // Dropped after resolution -- either the redirect wouldn't resolve within
  // the timeout, or it resolved to a marketplace/aggregator domain (see
  // resolveDirectApplyUrl's own comment for why those two collapse into one
  // outcome: both mean "don't show this").
  let filteredOut = 0;
  let filteredCapped = 0; // new posting, but this run already hit MAX_RESOLUTIONS_PER_RUN

  const cells: QueryCell[] = [];
  for (const fn of FUNCTIONS) for (const city of CITIES) cells.push({ fn, city });

  const cellResults = await mapWithConcurrency(cells, QUERY_CONCURRENCY, async (cell) => {
    const jobs = await searchAdzunaJobs(cell.fn, cell.city, 1);
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
      const finalUrl = await resolveDirectApplyUrl(job.link);
      if (!finalUrl) {
        filteredOut++;
        return;
      }
      upsertJobPosting({ ...job, link: finalUrl }, cell.fn, cell.city);
      jobsUpserted++;
      jobsNew++;
    });
  }

  const removed = pruneStaleJobPostings();

  return NextResponse.json({
    queriesRun: cells.length,
    queriesFailed,
    jobsUpserted,
    jobsNew,
    filteredOut,
    filteredCapped,
    staleRemoved: removed,
    poolSize: countActiveJobPostings(),
  });
}
