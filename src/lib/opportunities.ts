// Orchestration for the Opportunities tab -- the piece that decides
// personalized-vs-not-yet-unlocked and turns the cheap job_postings pool
// (see lib/repo/jobPostings.ts, filled by
// app/api/opportunities/refresh-pool/run) plus a user's own career
// evidence into the ranked list GET /api/opportunities actually serves.
// Deliberately kept as ONE function callers can treat as a black box -- the
// API route and any future caller (a push-notification "new opportunities"
// job, say) shouldn't need to know about caching, thresholds, or the
// personalized/locked split themselves.
//
// There is deliberately NO generic/unpersonalized job list anymore -- a
// direct product call. Until a person has enough recorded memories for
// Strivo to name real roles for them (wantsPersonalized below), this
// returns an EMPTY list rather than a generic sample of the pool, so the
// tab reads as locked ("create more memories to unlock this") instead of
// quietly working already. See the !wantsPersonalized branch below and
// OpportunitiesClient.tsx's locked-state card for the actual copy.

import { countMemories } from "@/lib/repo/memories";
import { getUserById } from "@/lib/repo/users";
import { detectCityFromText } from "@/lib/geo";
import { getLatestSuggestedRolesForUser, MIN_TOTAL_MEMORIES } from "@/lib/repo/suggestedRoles";
import { getJobPreferences, hasStatedPreferences, type JobPreferences } from "@/lib/repo/jobPreferences";
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
  fit: "strong" | "good" | "possible" | null; // null when not yet personalized, or on the rare AI-unavailable fallback
  reason: string | null;
};

export type OpportunitiesResult = {
  personalized: boolean;
  memoryCount: number;
  // How many more memories would unlock memory-based personalization -- 0
  // once already personalized via memories. Note this can be >0 even when
  // personalized is true, if what unlocked it was stated preferences
  // instead (see statedPreferences) -- the UI shouldn't show this as a
  // literal countdown (see OpportunitiesClient.tsx: recording a handful of
  // low-effort one-line memories just to hit a number doesn't actually
  // help matching), just as an internal signal of how thin the memory
  // evidence still is.
  memoriesNeeded: number;
  // What the user has directly told Strivo they're looking for (see
  // POST /api/opportunities/preferences) -- null fields mean "not stated".
  // Surfaced so the client can pre-fill the ask-for-info form when editing,
  // and to decide whether personalized:false should be shown as "tell us
  // what you want" vs "record more memories" framing.
  statedPreferences: JobPreferences | null;
  opportunities: OpportunityCard[];
};

const TARGET_COUNT = 25; // direct founder call: "at least 25" -- was 22
const CACHE_MAX_AGE_DAYS = 3;
// A job shown to a user must have been posted within this many days --
// separate from STALE_AFTER_DAYS in lib/repo/jobPostings.ts, which decides
// how long a row stays in the raw pool at all (kept much looser than this,
// at 40 days, so the pool itself doesn't go empty between a function's
// chunk-refreshes -- see that constant's own comment). Direct founder
// call: since each function only actually gets re-queried against Adzuna
// roughly every 14-16 days (the chunked refresh-pool cadence -- see
// app/api/opportunities/refresh-pool/run's top comment), a user's list
// should never show anything older than that same ~15-day window, so what
// they see always reflects a genuinely current pass over the job market
// rather than a stale one sitting around for weeks. Checked against
// job_postings.posted_date (Adzuna's own "created" timestamp, set once at
// first insert and never overwritten -- see upsertJobPosting -- so this
// age genuinely reflects the listing's real age, not just when we last
// re-saw it). Note this is a little tight against the refresh cadence: for
// a function whose chunk hasn't been re-queried in close to the full
// 14-16 days, some of its older postings will drop out of a user's list a
// day or two before that function's next refresh brings fresher ones in --
// accepted deliberately, since the pool spans all 80 functions (only 1/5
// of them are ever that close to their next refresh at once) and 3-day
// cache means a user's own list re-pulls from the pool often anyway.
const MAX_JOB_AGE_DAYS = 15;
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

// A job whose location matches the person's own (detected) city is worth
// far more than any single keyword hit -- this was the actual bug behind
// "jobs don't consider my location": profileKeywords used to come ONLY
// from suggested_roles' title/industry, so a resume's city never factored
// into which ~80 candidates even reached the LLM ranking step in the first
// place. A flat, large bonus (rather than folding "delhi" into the regular
// keyword set) means a same-city job always outranks an equally-generic
// one from elsewhere, without letting location alone drown out genuine
// function/industry signal for the jobs that DO share real keyword overlap.
const LOCATION_MATCH_BONUS = 8;

function preFilterCandidates(
  pool: JobPosting[],
  profileKeywords: string[],
  excludeIds: Set<string>,
  limit: number,
  boostCity: string | null
): JobPosting[] {
  const kw = new Set(profileKeywords);
  const scored = pool
    .filter((job) => !excludeIds.has(job.id))
    .map((job) => {
      const haystack = keywordsFrom(`${job.title} ${job.snippet ?? ""}`);
      let score = 0;
      for (const word of haystack) if (kw.has(word)) score++;
      if (boostCity && job.location && job.location.toLowerCase().includes(boostCity.toLowerCase())) {
        score += LOCATION_MATCH_BONUS;
      }
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
  resumeText: string | null,
  detectedCity: string | null,
  stated: JobPreferences | null
): string {
  const rolesListing = roles
    .map((r) => `- ${r.title}${r.industry ? ` (${r.industry})` : ""}${r.reasoning ? ` -- ${r.reasoning}` : ""}`)
    .join("\n");
  const rolesSection = rolesListing
    ? `Roles this person is genuinely ready for right now, per their own recorded career memories:\n${rolesListing}`
    : null;
  // What they typed into the "tell us what you're looking for" form (see
  // POST /api/opportunities/preferences) -- may be the ONLY signal at all
  // for someone too new to have suggested_roles yet, so this is stated as
  // its own clear line rather than folded silently into the resume
  // excerpt. City is handled separately via locationLine below (it already
  // takes a stated city over a resume-detected one -- see the caller).
  const statedBits = stated ? [stated.function, stated.industry].filter((v): v is string => !!v) : [];
  const statedLine =
    statedBits.length > 0 ? `They directly told Strivo they're looking for: ${statedBits.join(", ")}.` : null;
  const resumeExcerpt = resumeText ? resumeText.slice(0, 3000) : null;
  // Stated explicitly, ahead of the resume excerpt, rather than trusting
  // the model to notice a city name buried in it -- see rankOpportunities'
  // system prompt in lib/ai.ts for how this is judged.
  const locationLine = detectedCity
    ? `Likely based in: ${detectedCity}${stated?.city ? " (they told Strivo this directly)" : " (detected from their resume)"}`
    : null;

  const parts = [rolesSection, statedLine, locationLine, resumeExcerpt ? `Resume excerpt:\n${resumeExcerpt}` : null].filter(
    (p): p is string => !!p
  );
  return parts.length > 0
    ? parts.join("\n\n")
    : "No career evidence recorded yet beyond what they stated directly above.";
}

// Whether a posting is recent enough to show at all. A missing/unparseable
// posted_date is treated as "can't vouch for this one" and excluded rather
// than assumed recent -- Adzuna sends a `created` timestamp on essentially
// every real result (see lib/adzuna.ts), so this should only ever catch a
// genuinely malformed row.
function isRecentEnough(job: JobPosting): boolean {
  if (!job.posted_date) return false;
  const postedMs = new Date(job.posted_date).getTime();
  if (Number.isNaN(postedMs)) return false;
  return Date.now() - postedMs <= MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;
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
  const roles = suggestedRoles?.roles ?? [];
  const prefs = getJobPreferences(userId);
  // Two independent ways to unlock real matching: enough recorded memories
  // for Strivo to have named real roles (roles.length > 0), OR the person
  // just telling Strivo directly what they want via the ask-for-info form
  // (see POST /api/opportunities/preferences). Either is enough on its
  // own -- someone with zero memories but a filled-in city/function/
  // industry gets real (if thinner-signal) matching immediately, rather
  // than waiting on memories alone.
  const wantsPersonalized = roles.length > 0 || hasStatedPreferences(prefs);
  const memoriesNeeded = roles.length > 0 ? 0 : Math.max(0, MIN_TOTAL_MEMORIES - memoryCount);

  const cache = getCachedOpportunities(userId);
  if (isCacheFresh(cache, memoryCount, wantsPersonalized)) {
    return {
      personalized: cache[0].personalized === 1,
      memoryCount,
      memoriesNeeded,
      statedPreferences: prefs,
      opportunities: cache.map((row) => toCard(row.job, row.fit, row.reason)),
    };
  }

  if (!wantsPersonalized) {
    // Deliberately BLANK, not a generic sample of the shared pool -- a
    // direct product call: showing real jobs before Strivo actually knows
    // this person undercuts the entire incentive to record memories (why
    // bother, the tab already has jobs). This IS the nudge; see
    // OpportunitiesClient.tsx's locked-state card, which combines this
    // with an inline form to state city/function/industry directly --
    // that's the other way out of this branch, see wantsPersonalized
    // above. Still cached the same way as the other two return paths below
    // so a page reload within CACHE_MAX_AGE_DAYS doesn't redo this work
    // for nothing.
    replaceUserOpportunities(userId, [], { personalized: false, memoryCountAtGeneration: memoryCount });
    return { personalized: false, memoryCount, memoriesNeeded, statedPreferences: prefs, opportunities: [] };
  }

  // Filtered to postings within MAX_JOB_AGE_DAYS -- see isRecentEnough's
  // comment. Applied here, before the "pool is empty" check below, so a
  // pool that's technically non-empty but entirely stale reads the same
  // as a genuinely empty one rather than silently ranking old listings.
  const pool = listActiveJobPostings().filter(isRecentEnough);
  const excludeIds = listFeedbackedJobIds(userId);

  if (pool.length === 0) {
    // A genuinely different situation from the branch above -- this person
    // DOES have enough signal to match on (wantsPersonalized is true
    // here), the shared job pool itself is just empty (e.g. right after a
    // fresh deploy, before refresh-pool's first run has ever completed).
    // Deliberately NOT cached as a settled personalized:false outcome --
    // unlike the "nothing to match on yet" case, this should resolve
    // itself as soon as the pool has something in it, not sit stale for
    // CACHE_MAX_AGE_DAYS.
    return { personalized: false, memoryCount, memoriesNeeded: 0, statedPreferences: prefs, opportunities: [] };
  }

  // Personalized path -- reachable via memory-derived roles, stated
  // preferences, or both at once; everything below just uses whichever
  // sources are actually present.
  const user = getUserById(userId);
  const resumeText = user?.resume_text ?? null;
  // An explicitly stated city always wins over one merely detected in the
  // resume -- the person said it themselves, no inference needed.
  const detectedCity = prefs?.city || detectCityFromText(resumeText);
  const profileText = buildProfileText(roles, resumeText, detectedCity, prefs);
  // Role title/industry keywords, PLUS the first slice of resume text,
  // PLUS whatever function/industry the person stated directly -- the
  // resume alone is what carries someone's actual seniority language
  // ("VP", "5 years") and sector specifics that suggested_roles doesn't
  // capture, and stated preferences are the only signal at all for someone
  // who unlocked this via the form rather than memories.
  const profileKeywords = [
    ...keywordsFrom(roles.map((r) => `${r.title} ${r.industry ?? ""}`).join(" ")),
    ...keywordsFrom((resumeText ?? "").slice(0, 1500)),
    ...keywordsFrom(`${prefs?.function ?? ""} ${prefs?.industry ?? ""}`),
  ];
  const candidates = preFilterCandidates(pool, profileKeywords, excludeIds, 80, detectedCity);
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
      statedPreferences: prefs,
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
    statedPreferences: prefs,
    opportunities: items.map((item) => toCard(item.job, item.fit, item.reason)),
  };
}
