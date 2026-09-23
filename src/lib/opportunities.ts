// Orchestration for the Opportunities tab -- the piece that decides
// personalized-vs-generic and turns the cheap job_postings pool (see
// lib/repo/jobPostings.ts, filled by app/api/opportunities/refresh-pool/run)
// plus a user's own career evidence into the ranked list GET
// /api/opportunities actually serves. Deliberately kept as ONE function
// callers can treat as a black box -- the API route and any future caller
// (a push-notification "new opportunities" job, say) shouldn't need to know
// about caching, thresholds, or the personalized/generic split themselves.

import { countMemories } from "@/lib/repo/memories";
import { getUserById } from "@/lib/repo/users";
import { getLatestSuggestedRolesForUser, MIN_TOTAL_MEMORIES } from "@/lib/repo/suggestedRoles";
import {
  listActiveJobPostings,
  type JobPosting,
} from "@/lib/repo/jobPostings";
import {
  getCachedOpportunities,
  replaceUserOpportunities,
  listFeedbackedJobIds,
} from "@/lib/repo/userOpportunities";
import { rankOpportunities, type OpportunityCandidate } from "@/lib/ai";

export type OpportunityCard = {
  id: string; // job_postings.id -- used for the feedback endpoint
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  sourceUrl: string;
  postedDate: string | null;
  fit: "strong" | "good" | "possible" | null; // null on the generic (not-yet-personalized) path
  reason: string | null;
};

export type OpportunitiesResult = {
  personalized: boolean;
  memoryCount: number;
  // How many more memories would unlock personalization -- 0 once already
  // personalized. Drives the "N more memories to personalize" nudge copy.
  memoriesNeeded: number;
  opportunities: OpportunityCard[];
};

const TARGET_COUNT = 22; // "20-25" -- see the product brief
const CACHE_MAX_AGE_DAYS = 3;
// Re-rank once at least this many NEW memories have landed since the cache
// was generated, even if it isn't stale by age yet -- new evidence should
// visibly change the list, not sit unused until the next scheduled refresh.
const RECOMPUTE_AFTER_NEW_MEMORIES = 3;

function toCard(job: JobPosting, fit: OpportunityCard["fit"], reason: string | null): OpportunityCard {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    sourceUrl: job.source_url,
    postedDate: job.posted_date,
    fit,
    reason,
  };
}

// Minimal, local word-overlap scorer -- NOT a real search index. Good
// enough to cut an up-to-several-hundred-row pool down to the ~80
// candidates worth spending an LLM call on; the LLM call itself (see
// rankOpportunities in lib/ai.ts) is what actually judges fit. Deliberately
// simple rather than pulling in retrieval.ts's embedding-based matching --
// job_postings has no embedding column yet, and this MVP is explicitly
// scoped to prove the feature before investing in that (see the product
// brief's phasing).
const STOPWORDS = new Set(["and", "or", "the", "a", "an", "of", "for", "to", "in", "at", "with", "any", "industry"]);

function keywordsFrom(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function preFilterCandidates(pool: JobPosting[], profileKeywords: string[], excludeIds: Set<string>, limit: number): JobPosting[] {
  const kw = new Set(profileKeywords);
  const scored = pool
    .filter((job) => !excludeIds.has(job.id))
    .map((job) => {
      const haystack = keywordsFrom(`${job.title} ${job.snippet ?? ""}`);
      let score = 0;
      for (const word of haystack) if (kw.has(word)) score++;
      return { job, score };
    })
    // A job with zero keyword overlap is still worth a chance at the
    // margin (function/industry transferability is exactly what the LLM
    // step is for -- see rankOpportunities), so this sorts by score
    // rather than dropping zero-score rows outright.
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.job);
}

function buildProfileText(
  roles: { title: string; industry: string | null; reasoning?: string | null }[],
  resumeText: string | null
): string {
  const rolesListing = roles
    .map((r) => `- ${r.title}${r.industry ? ` (${r.industry})` : ""}${r.reasoning ? ` -- ${r.reasoning}` : ""}`)
    .join("\n");
  const resumeExcerpt = resumeText ? resumeText.slice(0, 3000) : null;
  return (
    `Roles this person is genuinely ready for right now, per their own recorded career memories:\n${rolesListing}` +
    (resumeExcerpt ? `\n\nResume excerpt:\n${resumeExcerpt}` : "")
  );
}

function isCacheFresh(
  cache: ReturnType<typeof getCachedOpportunities>,
  memoryCount: number,
  wantsPersonalized: boolean
): boolean {
  if (cache.length === 0) return false;
  const row = cache[0];
  const isPersonalized = row.personalized === 1;
  // Eligibility just flipped (generic -> personalized available now, or
  // vice versa if suggested_roles somehow disappeared) -- always recompute.
  if (isPersonalized !== wantsPersonalized) return false;
  const ageMs = Date.now() - new Date(row.generated_at).getTime();
  if (ageMs > CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return false;
  if (isPersonalized && memoryCount - row.memory_count_at_generation >= RECOMPUTE_AFTER_NEW_MEMORIES) return false;
  return true;
}

export async function getOpportunitiesForUser(userId: string): Promise<OpportunitiesResult> {
  const memoryCount = countMemories(userId);
  const suggestedRoles = getLatestSuggestedRolesForUser(userId);
  const wantsPersonalized = !!suggestedRoles && suggestedRoles.roles.length > 0;
  const memoriesNeeded = wantsPersonalized ? 0 : Math.max(0, MIN_TOTAL_MEMORIES - memoryCount);

  const cache = getCachedOpportunities(userId);
  if (isCacheFresh(cache, memoryCount, wantsPersonalized)) {
    return {
      personalized: cache[0].personalized === 1,
      memoryCount,
      memoriesNeeded,
      opportunities: cache.map((row) => toCard(row.job, row.fit, row.reason)),
    };
  }

  const pool = listActiveJobPostings();
  const excludeIds = listFeedbackedJobIds(userId);

  if (!wantsPersonalized || pool.length === 0) {
    // Generic path: most-recently-seen postings, one per company where
    // possible so the tab doesn't read as a single employer's listings
    // repeated -- simple diversity heuristic, not real ranking.
    const seenCompanies = new Set<string>();
    const generic: JobPosting[] = [];
    for (const job of pool) {
      if (excludeIds.has(job.id)) continue;
      const companyKey = (job.company ?? job.id).toLowerCase();
      if (seenCompanies.has(companyKey) && generic.length < pool.length) continue;
      seenCompanies.add(companyKey);
      generic.push(job);
      if (generic.length >= TARGET_COUNT) break;
    }
    replaceUserOpportunities(
      userId,
      generic.map((job, i) => ({ jobPostingId: job.id, rank: i + 1, fit: null, reason: null })),
      { personalized: false, memoryCountAtGeneration: memoryCount }
    );
    return {
      personalized: false,
      memoryCount,
      memoriesNeeded,
      opportunities: generic.map((job) => toCard(job, null, null)),
    };
  }

  // Personalized path.
  const user = getUserById(userId);
  const profileText = buildProfileText(suggestedRoles.roles, user?.resume_text ?? null);
  const profileKeywords = keywordsFrom(
    suggestedRoles.roles.map((r) => `${r.title} ${r.industry ?? ""}`).join(" ")
  );
  const candidates = preFilterCandidates(pool, profileKeywords, excludeIds, 80);
  const opportunityCandidates: OpportunityCandidate[] = candidates.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    snippet: job.snippet,
  }));

  const ranked = candidates.length > 0 ? await rankOpportunities(profileText, opportunityCandidates) : null;

  if (!ranked || ranked.length === 0) {
    // AI unavailable/failed, or genuinely nothing in the pool cleared the
    // bar -- fall back to the generic list rather than showing an empty
    // tab. Still recorded as personalized=false so the next call retries
    // the real ranking instead of trusting this fallback as settled.
    const fallback = candidates.slice(0, TARGET_COUNT);
    replaceUserOpportunities(
      userId,
      fallback.map((job, i) => ({ jobPostingId: job.id, rank: i + 1, fit: null, reason: null })),
      { personalized: false, memoryCountAtGeneration: memoryCount }
    );
    return {
      personalized: false,
      memoryCount,
      memoriesNeeded,
      opportunities: fallback.map((job) => toCard(job, null, null)),
    };
  }

  const byId = new Map(candidates.map((job) => [job.id, job]));
  const items = ranked
    .map((r) => {
      const job = byId.get(r.id);
      return job ? { job, fit: r.fit as OpportunityCard["fit"], reason: r.reason } : null;
    })
    .filter((x): x is { job: JobPosting; fit: OpportunityCard["fit"]; reason: string } => x !== null)
    .slice(0, TARGET_COUNT);

  replaceUserOpportunities(
    userId,
    items.map((item, i) => ({ jobPostingId: item.job.id, rank: i + 1, fit: item.fit, reason: item.reason })),
    { personalized: true, memoryCountAtGeneration: memoryCount }
  );

  return {
    personalized: true,
    memoryCount,
    memoriesNeeded: 0,
    opportunities: items.map((item) => toCard(item.job, item.fit, item.reason)),
  };
}
