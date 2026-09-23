import { getDb, newId, nowIso } from "@/lib/db";
import type { JobPosting } from "@/lib/repo/jobPostings";

export type UserOpportunity = {
  id: string;
  user_id: string;
  job_posting_id: string;
  rank: number;
  fit: "strong" | "good" | "possible" | null;
  reason: string | null;
  personalized: number; // 0/1 -- see the column comment in lib/db.ts
  memory_count_at_generation: number;
  generated_at: string;
};

export type UserOpportunityWithJob = UserOpportunity & { job: JobPosting };

export function getCachedOpportunities(userId: string): UserOpportunityWithJob[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT uo.*,
              jp.id as jp_id, jp.external_id, jp.title, jp.company, jp.location, jp.snippet,
              jp.salary, jp.source_url, jp.function_tag, jp.city_tag, jp.posted_date,
              jp.fetched_at, jp.last_seen_at
         FROM user_opportunities uo
         JOIN job_postings jp ON jp.id = uo.job_posting_id
        WHERE uo.user_id = ?
        ORDER BY uo.rank ASC`
    )
    .all(userId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    job_posting_id: r.job_posting_id as string,
    rank: r.rank as number,
    fit: r.fit as UserOpportunity["fit"],
    reason: r.reason as string | null,
    personalized: r.personalized as number,
    memory_count_at_generation: r.memory_count_at_generation as number,
    generated_at: r.generated_at as string,
    job: {
      id: r.jp_id as string,
      external_id: r.external_id as string,
      title: r.title as string,
      company: r.company as string | null,
      location: r.location as string | null,
      snippet: r.snippet as string | null,
      salary: r.salary as string | null,
      source_url: r.source_url as string,
      function_tag: r.function_tag as string | null,
      city_tag: r.city_tag as string | null,
      posted_date: r.posted_date as string | null,
      fetched_at: r.fetched_at as string,
      last_seen_at: r.last_seen_at as string,
    },
  }));
}

// Wipes the cache outright rather than writing a fresh (possibly stale)
// row -- used when something outside the normal cache-freshness checks in
// lib/opportunities.ts just changed and the NEXT GET /api/opportunities
// should recompute unconditionally, rather than trusting whatever's cached
// until it ages out. Currently only called from
// POST /api/opportunities/preferences: saving a new city/function/industry
// should be reflected the moment the user reopens the tab, not up to
// CACHE_MAX_AGE_DAYS later.
export function clearUserOpportunities(userId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM user_opportunities WHERE user_id = ?`).run(userId);
}

// Full replace, not a merge -- a fresh ranking supersedes the old one
// entirely (job order, fit labels and reasons can all shift once new
// memories or new pool jobs are in the mix), so there's nothing worth
// carrying forward row-by-row. Deliberately NOT wrapped in an explicit
// SQLite transaction (this codebase doesn't use them elsewhere -- see
// storyBatches.ts's batch insert for the same plain-loop pattern); a
// crash mid-write would at worst leave a stale/partial cache for one user,
// which the next getOpportunitiesForUser call re-generates.
export function replaceUserOpportunities(
  userId: string,
  items: { jobPostingId: string; rank: number; fit: "strong" | "good" | "possible" | null; reason: string | null }[],
  opts: { personalized: boolean; memoryCountAtGeneration: number }
): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(`DELETE FROM user_opportunities WHERE user_id = ?`).run(userId);
  const insert = db.prepare(
    `INSERT INTO user_opportunities
       (id, user_id, job_posting_id, rank, fit, reason, personalized, memory_count_at_generation, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    insert.run(
      newId("uopp"),
      userId,
      item.jobPostingId,
      item.rank,
      item.fit,
      item.reason,
      opts.personalized ? 1 : 0,
      opts.memoryCountAtGeneration,
      ts
    );
  }
}

export function recordOpportunityFeedback(input: {
  userId: string;
  jobPostingId: string;
  feedback: "relevant" | "not_for_me";
  reason: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO opportunity_feedback (id, user_id, job_posting_id, feedback, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("oppfb"), input.userId, input.jobPostingId, input.feedback, input.reason, nowIso());
}

// Job postings this user has already given feedback on, regardless of
// direction -- used by lib/opportunities.ts to avoid re-showing something
// they already said "not for me" to (or re-explaining one they already
// thumbs-upped) in the next ranking pass.
export function listFeedbackedJobIds(userId: string): Set<string> {
  const db = getDb();
  const rows = db.prepare(`SELECT DISTINCT job_posting_id FROM opportunity_feedback WHERE user_id = ?`).all(userId) as {
    job_posting_id: string;
  }[];
  return new Set(rows.map((r) => r.job_posting_id));
}
