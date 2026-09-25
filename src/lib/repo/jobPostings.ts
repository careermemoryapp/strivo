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
  // This job's own classification against the closed OPPORTUNITY_
  // INDUSTRIES_LIST/OPPORTUNITY_SENIORITY_LIST vocabularies (lib/config.ts)
  // -- see classifyJobPostings in lib/ai.ts for how these get set, and
  // classified_at's own comment in lib/db.ts for why "unclassified" is
  // tracked separately rather than inferred from these being null (the
  // classifier can legitimately return null for both, meaning "genuinely
  // inconclusive," which is different from "never attempted").
  industry_tag: string | null;
  seniority_tag: string | null;
  classified_at: string | null;
  // This posting's company's logo domain, looked up ONCE PER COMPANY (see
  // the column's own comment in lib/db.ts and lookupCompanyLogoDomain in
  // lib/logoLookup.ts) -- null means either "never attempted"
  // (logo_looked_up_at also null -- see listJobsNeedingLogoLookup) or
  // "attempted, no logo found for this company" (logo_looked_up_at set).
  logo_domain: string | null;
  logo_looked_up_at: string | null;
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

// Writes the result of one classifyJobPostings (lib/ai.ts) call back onto
// a posting -- always called exactly once per posting, whatever the model
// returned, INCLUDING when both industry and seniority come back null
// (genuinely inconclusive). classified_at is what actually marks this
// posting as "done" (see listUnclassifiedActiveJobPostings below and that
// column's own comment in lib/db.ts) -- skipping this call for a null/null
// result would leave the posting looking permanently unclassified and
// re-spend a classification call on it every single refresh-pool run
// forever, for a job that was never going to resolve.
export function setJobClassification(id: string, industry: string | null, seniority: string | null): void {
  const db = getDb();
  db.prepare(`UPDATE job_postings SET industry_tag = ?, seniority_tag = ?, classified_at = ? WHERE id = ?`).run(
    industry,
    seniority,
    nowIso(),
    id
  );
}

// Postings in the active pool that classifyJobPostings has never run
// against yet (see classified_at's own comment for why that's tracked
// separately from industry_tag being null). Called from
// app/api/opportunities/refresh-pool/run each chunk -- this naturally
// covers BOTH brand-new postings just upserted this run AND any older row
// still sitting unclassified from before this feature existed, without
// needing a separate one-off backfill route: the backlog just works itself
// down a bounded batch at a time on every future chunk run until it's
// empty, the same "no single invocation needs to do everything" shape
// refresh-pool/run already uses for the function x city grid itself.
export function listUnclassifiedActiveJobPostings(limit: number): JobPosting[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM job_postings WHERE last_seen_at >= ? AND classified_at IS NULL ORDER BY last_seen_at DESC LIMIT ?`
    )
    .all(cutoff, limit) as JobPosting[];
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

// Writes the result of one lookupCompanyLogoDomain (lib/logoLookup.ts)
// call back onto a posting -- see logo_looked_up_at's own comment in
// lib/db.ts for why this is set exactly once per posting, whatever the
// lookup returned (including null, a genuine "no logo found").
export function setJobLogo(id: string, logoDomain: string | null): void {
  const db = getDb();
  db.prepare(`UPDATE job_postings SET logo_domain = ?, logo_looked_up_at = ? WHERE id = ?`).run(
    logoDomain,
    nowIso(),
    id
  );
}

// Postings in the active pool whose company logo has never been looked up
// -- same "naturally works down both new postings AND any older backlog"
// shape as listUnclassifiedActiveJobPostings above, called from
// app/api/opportunities/refresh-pool/run each chunk.
export function listJobsNeedingLogoLookup(limit: number): JobPosting[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM job_postings WHERE last_seen_at >= ? AND logo_looked_up_at IS NULL ORDER BY last_seen_at DESC LIMIT ?`
    )
    .all(cutoff, limit) as JobPosting[];
}

// A COMPANY-level, not posting-level, question: has ANY OTHER posting from
// this same company already had its logo looked up? If so, reuse that
// result (whether it found a real domain or genuinely found nothing)
// instead of spending a second logo.dev Search API request on a company
// the pool has already asked about -- the same employer routinely has
// several open roles in the pool at once (matched by different function/
// city grid cells), and a logo is purely a company-level fact, unlike
// industry/seniority classification which genuinely can vary posting to
// posting. Returns undefined (not null) when no prior attempt exists for
// this company at all, so the caller can tell "reuse this" apart from
// "go look it up." COLLATE NOCASE so "Kotak Mahindra Bank" and "kotak
// mahindra bank" (Adzuna's own casing is inconsistent across listings)
// are treated as the same company. Doesn't fully prevent two postings
// from the SAME brand-new company both firing a lookup when they land in
// the same concurrent batch (neither has written a result yet when the
// other checks) -- accepted as a rare, low-cost duplicate rather than
// adding cross-request locking for it; see the caller in refresh-pool/run.
export function findResolvedLogoDomainForCompany(company: string): { domain: string | null } | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT logo_domain FROM job_postings
        WHERE company = ? COLLATE NOCASE AND logo_looked_up_at IS NOT NULL
        ORDER BY logo_looked_up_at DESC LIMIT 1`
    )
    .get(company) as { logo_domain: string | null } | undefined;
  return row ? { domain: row.logo_domain } : undefined;
}

export function countActiveJobPostings(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const row = db.prepare(`SELECT COUNT(*) as c FROM job_postings WHERE last_seen_at >= ?`).get(cutoff) as {
    c: number;
  };
  return row.c;
}
