import { NextResponse } from "next/server";
import { isAdminAuthed, checkOpportunitiesRefreshSecret } from "@/lib/adminAuth";
import { adzunaConfigured, searchAdzunaJobs } from "@/lib/adzuna";
import { upsertJobPosting, pruneStaleJobPostings, countActiveJobPostings } from "@/lib/repo/jobPostings";

// Fixed function x city grid -- the entire point of this being fixed
// (rather than generated per-user, which an earlier draft of this feature
// considered) is staying comfortably inside Adzuna's free-tier MONTHLY
// request cap (2,500/month as of writing -- see ADZUNA_APP_ID's comment in
// .env.example). One page per cell, one run = FUNCTIONS.length *
// CITIES.length = 80 calls. Unlike the earlier Jooble integration (a
// 500-request LIFETIME cap, which meant this route was manual-trigger-only
// during MVP), Adzuna's cap renews every month -- 80/day * 30 days = 2,400,
// a 100-request buffer -- so this IS meant to run on a daily schedule (a
// crontab entry on the server hitting this route once a day with the
// x-opportunities-refresh-secret header). Still callable by hand too, same
// as before.
const FUNCTIONS = [
  "Product Manager",
  "Strategy Manager",
  "Business Development",
  "Finance Manager",
  "Marketing Manager",
  "Sales Manager",
  "Operations Manager",
  "Data Analyst",
];

const CITIES = [
  "Delhi NCR",
  "Bengaluru",
  "Mumbai",
  "Pune",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
];

// Called on a daily crontab entry (see the comment on FUNCTIONS above),
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

  let queriesRun = 0;
  let queriesFailed = 0;
  let jobsUpserted = 0;

  for (const fn of FUNCTIONS) {
    for (const city of CITIES) {
      queriesRun++;
      const jobs = await searchAdzunaJobs(fn, city, 1);
      if (!jobs) {
        queriesFailed++;
        continue;
      }
      for (const job of jobs) {
        upsertJobPosting(job, fn, city);
        jobsUpserted++;
      }
    }
  }

  const removed = pruneStaleJobPostings();

  return NextResponse.json({
    queriesRun,
    queriesFailed,
    jobsUpserted,
    staleRemoved: removed,
    poolSize: countActiveJobPostings(),
  });
}
