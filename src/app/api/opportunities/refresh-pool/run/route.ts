import { NextResponse } from "next/server";
import { isAdminAuthed, checkOpportunitiesRefreshSecret } from "@/lib/adminAuth";
import { joobleConfigured, searchJoobleJobs } from "@/lib/jooble";
import { upsertJobPosting, pruneStaleJobPostings, countActiveJobPostings } from "@/lib/repo/jobPostings";

// Fixed function x city grid -- the entire point of this being fixed
// (rather than generated per-user, which an earlier draft of this feature
// considered) is staying WAY inside Jooble's free-tier 500-REQUEST
// LIFETIME cap (see JOOBLE_API_KEY's comment in .env.example). One page
// per cell, one run = FUNCTIONS.length * CITIES.length = 48 calls. Trigger
// this by hand a handful of times while building/testing (well under the
// 500 budget); do NOT put it on a recurring schedule until Jooble's
// commercial pricing is sorted -- see the "protecting the 500 free calls"
// discussion this feature came out of.
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

const CITIES = ["Delhi NCR", "Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai"];

// Called manually from an admin session, or by hand via curl with the
// x-opportunities-refresh-secret header -- NOT wired to a crontab entry
// yet (see the comment on FUNCTIONS above for why). Best-effort per cell:
// one query failing (rate limit, transient network error) shouldn't abort
// the rest of the grid, same posture as every other /run route's per-user
// loop.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkOpportunitiesRefreshSecret(req.headers.get("x-opportunities-refresh-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!joobleConfigured()) {
    return NextResponse.json({ error: "JOOBLE_API_KEY not configured" }, { status: 500 });
  }

  let queriesRun = 0;
  let queriesFailed = 0;
  let jobsUpserted = 0;

  for (const fn of FUNCTIONS) {
    for (const city of CITIES) {
      queriesRun++;
      const jobs = await searchJoobleJobs(fn, city, 1);
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
