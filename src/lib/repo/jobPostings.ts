import { getDb, newId, nowIso } from "@/lib/db";
import type { AdzunaJob } from "@/lib/adzuna";

export type JobPosting = {
  id: string;
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  snippet: string | null;
  salary: string | null;
  source_url: string;
  function_tag: string | null;
  city_tag: string | null;
  posted_date: string | null;
  fetched_at: string;
  last_seen_at: string;
};

// Whether a job we've already vetted (see resolveDirectApplyUrl in
// lib/applyLinkResolver.ts) is already in the pool under this external_id.
// Checked BEFORE resolving a job's real apply link, so a refresh only ever
// spends a resolution request on a genuinely new posting -- re-seeing an
// already-known job across refreshes (very common; the same listing keeps
// matching the same query) costs nothing extra. See the caller in
// app/api/opportunities/refresh-pool/run.
export function externalIdExists(externalId: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM job_postings WHERE external_id = ? LIMIT 1`).get(externalId);
  return !!row;
}

// Upserts one Adzuna result into the shared pool (see job_postings'
// comment in lib/db.ts). Keyed on external_id, NOT our own id -- the same
// job can legitimately turn up again in a later refresh (still live) or
// under a different (function, city) grid cell (e.g. a Bengaluru "Product
// Strategy" listing also matching the "Strategy" query) -- either way it's
// one row, with last_seen_at bumped and function_tag/city_tag left as
// whichever cell inserted it first rather than overwritten, since both are
// purely informational (see the column comment in lib/db.ts).
//
// source_url is DELIBERATELY left out of the ON CONFLICT UPDATE -- it's
// set once, at first insert, to the already-resolved-and-vetted direct
// apply link (see resolveDirectApplyUrl), never the raw Adzuna redirect.
// Re-upserting an existing row must never silently put the unresolved
// Adzuna link back; only a genuinely new external_id goes through
// resolution at all (see externalIdExists above and the caller).
export function upsertJobPosting(job: AdzunaJob, functionTag: string, cityTag: string): void {
  const db = getDb();
  const id = newId("job");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO job_postings
       (id, external_id, title, company, location, snippet, salary, source_url, function_tag, city_tag, posted_date, fetched_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(external_id) DO UPDATE SET
       title = excluded.title,
       company = excluded.company,
       location = excluded.location,
       snippet = excluded.snippet,
       salary = excluded.salary,
       last_seen_at = excluded.last_seen_at`
  ).run(
    id,
    String(job.id),
    job.title.slice(0, 200),
    job.company ? job.company.slice(0, 200) : null,
    job.location ? job.location.slice(0, 200) : null,
    job.snippet ? job.snippet.slice(0, 2000) : null,
    job.salary || null,
    job.link,
    functionTag,
    cityTag,
    job.updated || null,
    ts,
    ts
  );
}

// The current pool -- anything seen in a refresh within the last
// STALE_AFTER_DAYS. Deliberately no per-user filtering here (that's
// lib/opportunities.ts's job); this is the raw candidate set matching
// draws from.
//
// Sized for the refresh-pool cadence, not a fixed "how old is too old"
// call -- that's a SEPARATE, per-job freshness check (see the 30-day
// filter in lib/opportunities.ts, driven by posted_date) that decides what
// a USER sees. This constant only decides what stays in the raw pool at
// all. refresh-pool/run now processes the function grid in paced CHUNKS
// (see that route's top comment), so any single function only actually
// gets re-queried (and its jobs' last_seen_at bumped) about once every
// ~14-16 days, not every run -- this has to comfortably outlive that gap.
// A value close to 15 would silently empty parts of the pool between a
// function's chunk-runs (found as a real bug when this was still a
// simple once-a-month design left over at 10 from when refresh ran daily/
// weekly: for most of a month listActiveJobPostings/countActiveJobPostings
// were returning nothing at all). 40 gives a large cushion for a late/
// skipped cron fire on top of the ~15-day cadence.
const STALE_AFTER_DAYS = 40;

export function listActiveJobPostings(limit = 500): JobPosting[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(`SELECT * FROM job_postings WHERE last_seen_at >= ? ORDER BY last_seen_at DESC LIMIT ?`)
    .all(cutoff, limit) as JobPosting[];
}

export function getJobPostingById(id: string): JobPosting | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM job_postings WHERE id = ?`).get(id) as JobPosting | undefined;
}

// Drops rows that haven't shown up in ANY refresh for a while -- the
// source listing is presumably gone/filled. Called at the end of
// refresh-pool/run, after that run's own upserts have already bumped
// last_seen_at for everything still live, so this only ever catches jobs
// that genuinely dropped out.
export function pruneStaleJobPostings(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(`DELETE FROM job_postings WHERE last_seen_at < ?`).run(cutoff);
  return Number(result.changes);
}

// Wipes the ENTIRE pool -- a one-time cleanup lever, not something a
// normal refresh ever calls. Exists because the pool that existed before
// the apply-link resolver (see lib/applyLinkResolver.ts) and the
// aggregator denylist were wired in is stuck bad: upsertJobPosting
// deliberately never overwrites source_url for a job whose external_id it
// already knows (see that function's own comment -- a resolved link is
// meant to be immutable), so an ordinary refresh-pool run leaves every
// pre-existing row's raw/unresolved Adzuna redirect (or straight LinkedIn/
// Naukri/etc. link) in place forever; only a genuinely NEW external_id
// ever gets resolved. Purging first makes the next refresh-pool run treat
// the whole pool as new again, so everything currently in it gets
// re-fetched, resolved, and filtered through the denylist properly.
// Cascades to user_opportunities and opportunity_feedback (both declared
// ON DELETE CASCADE against job_postings.id in lib/db.ts), so every user's
// cached ranked list is cleared too -- the next GET /api/opportunities for
// anyone recomputes from scratch once the pool is rebuilt. Triggered from
// the admin dashboard (see /api/admin/opportunities-purge), never on a
// schedule.
export function purgeAllJobPostings(): number {
  const db = getDb();
  const result = db.prepare(`DELETE FROM job_postings`).run();
  return Number(result.changes);
}

export function countActiveJobPostings(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const row = db.prepare(`SELECT COUNT(*) as c FROM job_postings WHERE last_seen_at >= ?`).get(cutoff) as {
    c: number;
  };
  return row.c;
}
