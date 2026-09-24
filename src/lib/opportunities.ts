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
import { OPPORTUNITY_INDUSTRIES_LIST, OPPORTUNITY_SENIORITY_LIST } from "@/lib/config";
import { getJobPreferences, hasStatedPreferences, type JobPreferences } from "@/lib/repo/jobPreferences";
import {
  listActiveJobPostings,
  type JobPosting,
} from "@/lib/repo/jobPostings";
import {
  getCachedOpportunities,
  replaceUserOpportunities,
  listFeedbackedJobIds,
  getFeedbackMap,
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
  // Whatever this user already tapped on this job in a PREVIOUS visit (see
  // opportunity_feedback via getFeedbackMap in lib/repo/userOpportunities.ts)
  // -- null means never reacted to. Round-tripped so OpportunitiesClient.tsx
  // can hydrate its "Marked fit"/"Marked not a fit" card state from the
  // server on load, instead of only from taps made in the current browser
  // session (which a refresh or revisit used to silently forget, even
  // though the feedback itself was already durably saved).
  feedback: "relevant" | "not_for_me" | null;
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

function toCard(
  job: JobPosting,
  fit: OpportunityCard["fit"],
  reason: string | null,
  feedback: OpportunityCard["feedback"]
): OpportunityCard {
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
    feedback,
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

// Structured 4-factor matching (function, industry, location, seniority) --
// a direct founder call, after the earlier pure-keyword-overlap version of
// this function (preFilterCandidates) couldn't reliably tell "Finance
// Manager at a retail company" from "Finance Manager at an automotive
// company": job_postings had no industry field at all, so the only signal
// was whatever words happened to overlap between a person's profile text
// and a job's title/snippet. Now that jobs and people are both classified
// against the SAME closed vocabularies (see classifyJobPostings and
// generateSuggestedRoles in lib/ai.ts, OPPORTUNITY_INDUSTRIES_LIST/
// OPPORTUNITY_SENIORITY_LIST in lib/config.ts), industry and seniority can
// be scored as real, exact signals instead of hoping the raw text happens
// to mention them.
//
// Function itself is deliberately NOT given a separate structured bonus
// here -- job.function_tag is literally the title that was searched to
// find it (see the FUNCTIONS grid in refresh-pool/run), which already
// shows up as a strong keyword-overlap hit against a person's own
// suggested-role titles below without any extra logic. Adding a second,
// redundant bonus for the same signal would just double-count it.
//
// Seniority gets ONE genuine hard filter (see SENIORITY_HARD_EXCLUDE_GAP)
// -- a direct founder ask that the tab actually stop showing obviously
// wrong-level postings rather than relying entirely on the LLM ranking
// step's judgment. Industry does NOT get a hard filter, only a bonus/
// penalty: a "plausible pivot" into an adjacent industry is exactly the
// kind of judgment call rankOpportunities (lib/ai.ts) already makes well
// with the full posting text in front of it, and a rigid industry filter
// would risk wrongly emptying a thin pool. Both signals fall back to
// neutral (no bonus, no penalty, never excluded) whenever either side of
// the comparison is unclassified/unknown -- an unclassified posting or a
// person Strivo hasn't sized up yet should never be punished for missing
// data it never had a chance to provide.
const SENIORITY_ORDER: Record<string, number> = Object.fromEntries(
  OPPORTUNITY_SENIORITY_LIST.map((s, i) => [s, i])
);
const SENIORITY_HARD_EXCLUDE_GAP = 2; // e.g. Entry-level vs Leadership -- only applied when BOTH sides are confidently classified
const SENIORITY_MATCH_BONUS = 9;
const SENIORITY_ADJACENT_BONUS = 3; // one band off either way -- still a normal, worth-showing stretch
const INDUSTRY_MATCH_BONUS = 10;
const INDUSTRY_MISMATCH_PENALTY = 3;

// Maps a legacy freeform stated industry (see JobPreferences.industry --
// typed into the now-removed filter form, still read here for anyone who
// used it before that form came out) onto the closed taxonomy, so it can
// still contribute to the exact-match scoring above instead of being
// silently ignored just because it isn't a byte-for-byte match. Only an
// exact (case-insensitive) match against a real list entry counts --
// deliberately no fuzzy/substring guessing here, unlike the AI
// classification prompts, since there's no model in the loop to judge intent.
function canonicalIndustry(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  return OPPORTUNITY_INDUSTRIES_LIST.find((i) => i.toLowerCase() === lower) ?? null;
}

function matchCandidates(
  pool: JobPosting[],
  profileKeywords: string[],
  excludeIds: Set<string>,
  limit: number,
  boostCity: string | null,
  userIndustries: Set<string>,
  userSeniority: string | null
): JobPosting[] {
  const kw = new Set(profileKeywords);
  const userSeniorityRank = userSeniority ? SENIORITY_ORDER[userSeniority] : undefined;
  const scored = pool
    .filter((job) => !excludeIds.has(job.id))
    .filter((job) => {
      // The one real hard exclude -- see this section's top comment.
      // Skipped entirely (job stays eligible) unless BOTH the job's own
      // seniority_tag and this user's overall_seniority are confidently
      // known and land in valid, recognized bands.
      if (userSeniorityRank === undefined || !job.seniority_tag) return true;
      const jobRank = SENIORITY_ORDER[job.seniority_tag];
      if (jobRank === undefined) return true;
      return Math.abs(jobRank - userSeniorityRank) < SENIORITY_HARD_EXCLUDE_GAP;
    })
    .map((job) => {
      const haystack = keywordsFrom(`${job.title} ${job.snippet ?? ""}`);
      let score = 0;
      for (const word of haystack) if (kw.has(word)) score++;
      if (boostCity && job.location && job.location.toLowerCase().includes(boostCity.toLowerCase())) {
        score += LOCATION_MATCH_BONUS;
      }
      if (job.industry_tag && userIndustries.size > 0) {
        score += userIndustries.has(job.industry_tag) ? INDUSTRY_MATCH_BONUS : -INDUSTRY_MISMATCH_PENALTY;
      }
      if (job.seniority_tag && userSeniorityRank !== undefined) {
        const jobRank = SENIORITY_ORDER[job.seniority_tag];
        if (jobRank !== undefined) {
          const gap = Math.abs(jobRank - userSeniorityRank);
          if (gap === 0) score += SENIORITY_MATCH_BONUS;
          else if (gap === 1) score += SENIORITY_ADJACENT_BONUS;
        }
      }
      return { job, score };
    })
    // A job with zero keyword overlap (and no industry/seniority signal)
    // is still worth a chance at the margin -- see the section comment
    // above -- so this sorts by score rather than dropping zero-score
    // rows outright.
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.job);
}

function buildProfileText(
  roles: { title: string; industry: string | null; reasoning?: string | null }[],
  resumeText: string | null,
  detectedCity: string | null,
  stated: JobPreferences | null,
  seniority: string | null
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
  // Same "state it explicitly rather than trust the model to infer it"
  // reasoning as locationLine -- this is now also the same structured
  // seniority band matchCandidates (below) uses for the hard exclude/bonus
  // scoring, so it's worth rankOpportunities seeing it spelled out too,
  // not just implicitly from the resume excerpt.
  const seniorityLine = seniority ? `Estimated seniority level: ${seniority}` : null;

  const parts = [rolesSection, statedLine, locationLine, seniorityLine, resumeExcerpt ? `Resume excerpt:\n${resumeExcerpt}` : null].filter(
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
  // Read once, reused across every return path below (including the
  // fallback and empty-pool ones, which return before this would otherwise
  // matter) -- see the feedback field's own comment on OpportunityCard for
  // why this exists at all.
  const feedbackMap = getFeedbackMap(userId);

  const cache = getCachedOpportunities(userId);
  if (isCacheFresh(cache, memoryCount, wantsPersonalized)) {
    return {
      personalized: cache[0].personalized === 1,
      memoryCount,
      memoriesNeeded,
      statedPreferences: prefs,
      opportunities: cache.map((row) => toCard(row.job, row.fit, row.reason, feedbackMap[row.job.id] ?? null)),
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
  const userSeniority = suggestedRoles?.seniority ?? null;
  const profileText = buildProfileText(roles, resumeText, detectedCity, prefs, userSeniority);
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
  // Every industry this person's own evidence points at -- from every role
  // suggested_roles named (a person can genuinely span more than one, e.g.
  // a consultant who's worked across a couple of sectors), PLUS a stated
  // preference if it happens to land exactly on a taxonomy entry (see
  // canonicalIndustry). Empty means "nothing confidently known" -- see
  // matchCandidates' own comment for why that's treated as neutral, never
  // as a mismatch.
  const userIndustries = new Set(roles.map((r) => r.industry).filter((v): v is string => !!v));
  const statedIndustry = canonicalIndustry(prefs?.industry);
  if (statedIndustry) userIndustries.add(statedIndustry);
  const candidates = matchCandidates(pool, profileKeywords, excludeIds, 80, detectedCity, userIndustries, userSeniority);
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
      opportunities: fallback.map((job) => toCard(job, null, null, feedbackMap[job.id] ?? null)),
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
    opportunities: items.map((item) => toCard(item.job, item.fit, item.reason, feedbackMap[item.job.id] ?? null)),
  };
}
