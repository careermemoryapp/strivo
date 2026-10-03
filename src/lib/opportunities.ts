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

import { countMemories, listNewestMemories } from "@/lib/repo/memories";
import { getUserById } from "@/lib/repo/users";
import { detectCityFromText } from "@/lib/geo";
import {
  getLatestSuggestedRolesForUser,
  shouldGenerateSuggestedRoles,
  createSuggestedRoles,
  MIN_TOTAL_MEMORIES,
} from "@/lib/repo/suggestedRoles";
import { OPPORTUNITY_INDUSTRIES_LIST, OPPORTUNITY_SENIORITY_LIST, isLowQualityCompanyName } from "@/lib/config";
import { getJobPreferences, hasStatedPreferences, type JobPreferences } from "@/lib/repo/jobPreferences";
import {
  listActiveJobPostings,
  type JobPosting,
} from "@/lib/repo/jobPostings";
import {
  getCachedOpportunities,
  replaceUserOpportunities,
  getFeedbackMap,
} from "@/lib/repo/userOpportunities";
import { rankOpportunities, generateSuggestedRoles, type OpportunityCandidate } from "@/lib/ai";

export type OpportunityCard = {
  id: string; // job_postings.id -- used for the feedback endpoint
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  sourceUrl: string;
  // This posting's company's logo domain, looked up server-side once per
  // company (see lib/logoLookup.ts and the logo_domain column's comment in
  // lib/db.ts) -- null when the lookup hasn't run yet, or genuinely found
  // no logo for this company. OpportunitiesClient.tsx renders a real logo
  // from this when present, falling back to a client-side guess from
  // sourceUrl itself (rarely useful now -- see logoLookup.ts's top
  // comment for why), then to the plain letter avatar.
  logoDomain: string | null;
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
// chunk-refreshes -- see that constant's own comment). Originally set to
// 15 (direct founder call, so a user's list would never lag much behind
// the ~14-16-day chunked refresh-pool cadence -- see app/api/opportunities/
// refresh-pool/run's top comment) -- widened to 30 on 2026-10-03, a second
// direct founder call made alongside the industry hard-exclude -> soft
// signal change above, once the classification backlog fix made clear how
// thin a niche profile's eligible pool actually was at 15 days (1,345 of
// 11,006 active postings). A posting this old is still very likely open
// (most listings stay live for 30-60 days), and for a thin niche the extra
// supply matters more than shaving a few days off freshness -- this is a
// site-wide setting, so it widens everyone's pool, not just a niche
// profile's. Checked against job_postings.posted_date (Adzuna's own
// "created" timestamp, set once at first insert and never overwritten --
// see upsertJobPosting -- so this age genuinely reflects the listing's
// real age, not just when we last re-saw it).
const MAX_JOB_AGE_DAYS = 30;
// Re-rank once at least this many NEW memories have landed since the cache
// was generated, even if it isn't stale by age yet -- new evidence should
// visibly change the list, not sit unused until the next scheduled refresh.
const RECOMPUTE_AFTER_NEW_MEMORIES = 3;

// Same recency-ordered sample size "Roles you're ready for" itself uses --
// see ROLE_SAMPLE_SIZE's own comment in app/api/growth-narrative/run/route.ts
// for why this is one bigger sample rather than two small batches. Kept as
// its own copy here (not imported -- that file has no exports), same as
// api/growth-narrative/regenerate-roles/route.ts's own copy.
const ROLE_SAMPLE_SIZE = 20;

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
    logoDomain: job.logo_domain,
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

// A job whose company got a REAL logo match from logo.dev (see
// lib/logoLookup.ts, logo_domain) is a reasonable, cheap proxy for "this is
// a brand a person has actually heard of, or could at least look up" --
// since it already passed isShowableQuality's placeholder-name check above,
// this is a soft tiebreaker among otherwise-real company names, not a
// replacement for that hard check. Deliberately small relative to
// INDUSTRY_MATCH_BONUS/SENIORITY_MATCH_BONUS below so a recognizable brand
// never outranks a genuinely better function/industry/seniority fit -- and
// deliberately a BONUS for having a logo, never a penalty for lacking one,
// since logo_domain is also null for a company whose lookup simply hasn't
// run yet (see listJobsNeedingLogoLookup) or a genuinely real, small
// company logo.dev just doesn't have on file.
const KNOWN_LOGO_BONUS = 4;

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
// Seniority keeps its ONE genuine hard filter (see SENIORITY_HARD_EXCLUDE_GAP)
// -- a direct founder ask that the tab actually stop showing obviously
// wrong-level postings rather than relying entirely on the LLM ranking
// step's judgment. Industry's history is more winding: it STARTED as
// soft-penalty-only (a "plausible pivot" into an adjacent industry is
// exactly the kind of judgment call rankOpportunities, lib/ai.ts, already
// makes well with the full posting text in front of it, and a rigid filter
// risks wrongly emptying a thin pool), got promoted to a hard exclude on
// 2026-10-02 after real "not a fit" taps kept climbing on confidently
// off-industry postings (a Legal Secretary role shown to someone with zero
// legal background) -- then, 2026-10-03, a direct founder call reverted it
// back to soft, same day the classification backlog fix (see
// countUnclassifiedActiveJobPostings in lib/repo/jobPostings.ts) finally
// made the hard exclude's real effect visible: once most of the pool
// actually had a real industry_tag, the hard exclude cut HIS OWN pool of
// eligible postings from 1,284 to 245 for a niche profile (Automotive & EV
// strategy) -- founder's own words: "even though my industry is automotive,
// you should also consider parallel industries... where my skills can be
// utilized... give priority [to the same industry], but also consider
// other industries, not just automotive." A hard exclude can't express
// "prefer X, but still show a well-argued Y" -- only a priority/soft-signal
// can, which is exactly what INDUSTRY_MISMATCH_PENALTY below (paired with
// INDUSTRY_MATCH_BONUS) does, with rankOpportunities' own existing
// instruction ("a plausible pivot is fine, an unrelated field is not -- if
// the profile shows no real connection at all... leave it out entirely")
// as the real judgment call on which off-industry postings are genuine
// transferable-skill stretches versus noise -- the same mechanism this
// file's own history says was already the right tool for this, now
// actually given candidates to judge instead of having them hard-excluded
// before it ever saw them.
const SENIORITY_ORDER: Record<string, number> = Object.fromEntries(
  OPPORTUNITY_SENIORITY_LIST.map((s, i) => [s, i])
);
const SENIORITY_HARD_EXCLUDE_GAP = 2; // e.g. Entry-level vs Leadership -- only applied when BOTH sides are confidently classified
const SENIORITY_MATCH_BONUS = 9;
const SENIORITY_ADJACENT_BONUS = 3; // one band off either way -- still a normal, worth-showing stretch
const INDUSTRY_MATCH_BONUS = 10;
// Applied only when BOTH sides are confidently known and they DON'T match
// -- same neutral-when-unknown shape as everything else here. Modest
// relative to INDUSTRY_MATCH_BONUS (10) and the keyword/seniority bonuses,
// so a same-industry posting still wins the pre-LLM top-80 cut whenever
// enough of them exist, but a strong, clearly-relevant off-industry posting
// (lots of keyword/seniority/location signal) can still surface instead of
// being silently excluded outright.
const INDUSTRY_MISMATCH_PENALTY = 5;

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

// Seniority's hard exclude as its own predicate -- pulled out so the admin
// debug helper below (getOpportunitiesDebugInfo) can report EXACTLY how
// many postings clear this bar for a given person, using the identical
// logic matchCandidates itself runs, rather than a second hand-written copy
// that could silently drift out of sync with the real filtering over time.
// Industry is deliberately NOT part of this predicate any more -- see
// INDUSTRY_MISMATCH_PENALTY's own comment above for why it moved to a soft
// scoring signal instead of a hard exclude.
function passesHardFilters(job: JobPosting, userSeniorityRank: number | undefined): boolean {
  // Seniority -- skipped entirely (job stays eligible) unless BOTH the
  // job's own seniority_tag and this user's overall_seniority are
  // confidently known and land in valid, recognized bands.
  if (userSeniorityRank !== undefined && job.seniority_tag) {
    const jobRank = SENIORITY_ORDER[job.seniority_tag];
    if (jobRank !== undefined && Math.abs(jobRank - userSeniorityRank) >= SENIORITY_HARD_EXCLUDE_GAP) return false;
  }
  return true;
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
    .filter((job) => passesHardFilters(job, userSeniorityRank))
    .map((job) => {
      const haystack = keywordsFrom(`${job.title} ${job.snippet ?? ""}`);
      let score = 0;
      for (const word of haystack) if (kw.has(word)) score++;
      if (boostCity && job.location && job.location.toLowerCase().includes(boostCity.toLowerCase())) {
        score += LOCATION_MATCH_BONUS;
      }
      if (job.logo_domain) {
        score += KNOWN_LOGO_BONUS;
      }
      // Industry is a soft signal now, not a hard exclude -- see
      // INDUSTRY_MISMATCH_PENALTY's own comment above. A confirmed match
      // gets the bonus; a confident mismatch (both sides known) gets a
      // smaller penalty instead of being filtered out outright, so a
      // strong off-industry candidate can still reach the top-80 cut (and
      // from there, rankOpportunities' own judgment on whether it's a
      // genuine transferable-skill pivot or just noise) when there isn't
      // enough same-industry supply to fill the list. Neutral (neither
      // bonus nor penalty) whenever either side is unclassified/unknown.
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
  // Worded deliberately as a WANT, never a HAVE -- this field is free text
  // typed into a preferences form (see JobPreferences), not evidence of
  // anything they've actually done. Earlier wording ("They directly told
  // Strivo they're looking for: Automotive") read enough like a fact about
  // them that rankOpportunities' system prompt in lib/ai.ts started citing
  // it back as if it were real automotive work history -- e.g. "your
  // experience in the automotive sector" -- when no such experience exists
  // anywhere in rolesSection/resumeExcerpt. Keep this phrasing explicit
  // about the distinction even if it reads a little redundant.
  const statedLine =
    statedBits.length > 0
      ? `They typed into a job-preferences form that they are INTERESTED IN exploring: ${statedBits.join(
          ", "
        )}. This is a stated target/wish, NOT evidence of experience -- do not describe it as something they have done, have worked in, or are experienced in. Only the roles and resume sections above are actual evidence.`
      : null;
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

// A near-empty description is a strong, cheap signal of a thin/scraped
// listing -- not a genuine employer's own posting -- regardless of how
// well its title happens to match. Chosen conservatively (a real one-line
// posting easily clears this); not tuned against real data yet since this
// app's production pool isn't reachable from here -- see isShowableQuality's
// own comment for how to re-tune it from the admin debug numbers.
const MIN_SNIPPET_LENGTH = 50;

// Whether a posting is even worth surfacing to a real person at all --
// separate from isRecentEnough (freshness) and passesHardFilters (fit).
// Direct founder complaint (2026-10-03): "very unknown company, low
// quality profile... I was not attracted to the jobs" -- a DIFFERENT
// problem from role/industry/seniority mismatch, which matchCandidates/
// rankOpportunities already handle; this is about whether the posting
// itself names a real, researchable employer and says anything substantive
// at all. Two cheap, uncontroversial checks: an anonymized/placeholder
// company name (see isLowQualityCompanyName in lib/config.ts --
// "Confidential", "Undisclosed", "A Reputed Company", ...) and a near-empty
// description. Deliberately NOT a broad recruiter/staffing-agency name
// filter (e.g. excluding every company name containing "Consultants" or
// "Manpower") -- those ARE real postings for real roles, just routed
// through a third-party recruiter, and a founder call would be needed
// before risking starving the pool over that, the same way the "no longer
// available" substring match turned into an undiagnosed false-positive
// disaster (see this file's own git history / the backfill routes' revert
// notes) by excluding/deleting on an unverified heuristic. This only ever
// changes what's RANKED/SHOWN to a user -- never what's deleted from
// job_postings itself, so there's no data-loss risk the way that bug had.
// Check this against the admin debug endpoint's activePoolSize/
// passesHardFilters numbers after deploying (see getOpportunitiesDebugInfo
// below) before tightening it further.
function isShowableQuality(job: JobPosting): boolean {
  if (isLowQualityCompanyName(job.company)) return false;
  if (!job.snippet || job.snippet.trim().length < MIN_SNIPPET_LENGTH) return false;
  return true;
}

function isCacheFresh(
  cache: ReturnType<typeof getCachedOpportunities>,
  memoryCount: number,
  wantsPersonalized: boolean,
  // Timestamp of the CURRENT suggested_roles row (null if this person has
  // none) -- see the comment below for why this is checked at all.
  rolesGeneratedAt: string | null
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
  // Direct founder report (2026-09-28): the inline roles-refresh added
  // above this function (see its own comment in getOpportunitiesForUser)
  // -- and the admin's manual regenerate-roles endpoint -- can both hand
  // this person a freshly regenerated suggested_roles row WITHOUT their
  // memory count having moved at all since this opportunities cache was
  // last generated. The memory-count check above only catches "you added
  // memories since your list was built" -- it has no way to notice "your
  // named roles changed out from under an otherwise-untouched cache," so a
  // cache built one minute before a roles refresh was still being served,
  // untouched, as "fresh" indefinitely. Comparing timestamps directly
  // closes that gap: whenever suggested_roles is newer than this cached
  // list, the list was built from a since-superseded profile and must be
  // recomputed, regardless of whether the memory count itself changed.
  if (isPersonalized && rolesGeneratedAt && new Date(rolesGeneratedAt).getTime() > new Date(row.generated_at).getTime()) {
    return false;
  }
  return true;
}

export async function getOpportunitiesForUser(userId: string): Promise<OpportunitiesResult> {
  const memoryCount = countMemories(userId);
  // Fetched up front (used both for the suggested_roles regeneration call
  // below and again further down for matching itself -- see
  // generateSuggestedRoles' own comment in lib/ai.ts for why it's now
  // passed resume text too) rather than only where it was previously read,
  // further down this function, after that regeneration had already run
  // without it.
  const resumeTextForProfile = getUserById(userId)?.resume_text ?? null;

  // Direct founder call (2026-09-28): "Roles you're ready for" used to
  // ONLY regenerate on the monthly growth-narrative/roles batch (see
  // shouldGenerateSuggestedRoles in lib/repo/suggestedRoles.ts and
  // app/api/growth-narrative/run) -- so someone who kept recording memories
  // between monthly runs (one real account went from a handful up to 83
  // memories) still had their Opportunities matches computed off a much
  // thinner, months-stale roles read the whole time. The RECOMPUTE_AFTER_
  // NEW_MEMORIES check below was re-running the match/rank step often
  // enough, just against that same stale profile every time -- more memories
  // never actually changed which jobs this person's evidence pointed at.
  // Fixed by checking the exact same eligibility gate right here, on the
  // request path a person actually takes after recording new memories
  // (opening this tab), instead of waiting on the next monthly batch to
  // notice. Same gate, same thresholds (still needs 8+ new memories since
  // the last generation, or 30+ days elapsed with 3+ new ones) -- this only
  // moves WHEN that inline AI call can fire, not how often across the user
  // base, so it doesn't change the aggregate AI-cost profile the monthly
  // batch was already tuned for. Best-effort: on failure, or if the model
  // genuinely finds nothing new worth naming, this silently falls back to
  // whatever suggested_roles already has on file -- exactly what the batch
  // job (and the admin's manual regenerate-roles endpoint) already do.
  if (shouldGenerateSuggestedRoles(userId)) {
    const roleMemories = listNewestMemories(userId, ROLE_SAMPLE_SIZE);
    if (roleMemories.length > 0) {
      const generated = await generateSuggestedRoles(roleMemories, resumeTextForProfile);
      if (generated && generated.roles.length > 0) {
        createSuggestedRoles({
          userId,
          roles: generated.roles,
          memoryCountAtGeneration: roleMemories.length,
          overallSeniority: generated.seniority,
        });
      }
    }
  }

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
  if (isCacheFresh(cache, memoryCount, wantsPersonalized, suggestedRoles?.generatedAt ?? null)) {
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
  const pool = listActiveJobPostings().filter(isRecentEnough).filter(isShowableQuality);
  // Only a "not for me" tap should keep a job out of future matching passes
  // -- a direct founder report (2026-10-02): a job the person marked FIT was
  // silently vanishing from their list a few days later, even though it was
  // still well within MAX_JOB_AGE_DAYS and genuinely still relevant. Root
  // cause was this set previously coming from listFeedbackedJobIds, which
  // returned BOTH directions of feedback -- so "relevant" was being treated
  // exactly like "not_for_me" and excluded from every future candidate
  // pool, meaning a fresh cache regeneration (see replaceUserOpportunities'
  // own "full replace, not a merge" comment -- it has nothing to carry a
  // past-fit job forward with) could never show it again. Deriving straight
  // from feedbackMap (already fetched above) instead of a second query
  // means a "fit" tap no longer removes a job from consideration; see the
  // explicit re-pinning below for the other half of this fix -- not
  // excluding it is not the same as guaranteeing it stays visible.
  const excludeIds = new Set(
    Object.entries(feedbackMap)
      .filter(([, v]) => v === "not_for_me")
      .map(([jobId]) => jobId)
  );
  // Previous cache's fit/reason per job, so a job pinned back in below (see
  // pinPreviouslyShownJobs) can keep showing whatever fit label/explanation
  // it had last time, instead of going blank just because this regeneration
  // didn't happen to re-rank it.
  const prevById = new Map(cache.map((row) => [row.job_posting_id, row]));

  // ANY job this person was already shown should stay, as long as it's
  // still within MAX_JOB_AGE_DAYS and still in the live pool -- not just a
  // job explicitly marked "fit" (see excludeIds' comment above for that
  // half of this). Direct founder follow-up (2026-10-02): a regeneration
  // shouldn't be allowed to drop a still-recent, still-live job just
  // because this pass's ranking didn't happen to re-pick it -- matchCandidates/
  // rankOpportunities might still pick one up naturally (it's no longer
  // excluded unless it's a "not for me"), but nothing GUARANTEES that -- a
  // thin field of candidates, an off day from the LLM ranking, or simply 25
  // other jobs scoring higher could all still drop it silently. So every
  // job from the PREVIOUS list (prevById -- i.e. this person has actually
  // seen it before) gets explicitly re-added here, on top of whatever fresh
  // candidates this regeneration ranked, as long as it's: still in `pool`
  // (still in the live, non-pruned job_postings table AND still within
  // MAX_JOB_AGE_DAYS -- a job genuinely gone from the market, or that's
  // simply aged out past that window, is still allowed to drop off, same as
  // before), not something they said "not for me" to (excludeIds), and not
  // already present in this round's fresh items. Fit/reason carried forward
  // from last time it was shown rather than going blank. This is
  // deliberately additive, not a cap -- new jobs the refresh turns up still
  // show up alongside whatever's being kept, exactly as asked ("keep the
  // job... along with refreshing new jobs"); MAX_JOB_AGE_DAYS is what keeps
  // this from growing without bound, not TARGET_COUNT.
  // Direct founder follow-up (2026-10-02, same conversation): "not a fit"
  // taps were climbing, traced partly to THIS pinning itself -- a weak
  // match that only ever got shown because a thin candidate field or an
  // AI-unavailable moment fell back to it (fit: null, no real LLM judgment
  // behind it -- see the fallback branch below) was being kept alive for
  // the full MAX_JOB_AGE_DAYS just because it had been shown once. Only a
  // job with a REAL positive fit label from a previous rankOpportunities
  // pass (prev.fit !== null) gets pinned now -- an ungraded one is allowed
  // to quietly drop instead of lingering on the strength of having
  // technically appeared before.
  function pinPreviouslyShownJobs(
    items: { job: JobPosting; fit: OpportunityCard["fit"]; reason: string | null }[]
  ): { job: JobPosting; fit: OpportunityCard["fit"]; reason: string | null }[] {
    const already = new Set(items.map((i) => i.job.id));
    const pinned = pool
      .filter((job) => {
        const prev = prevById.get(job.id);
        return !!prev && prev.fit !== null && !excludeIds.has(job.id) && !already.has(job.id);
      })
      .map((job) => {
        const prev = prevById.get(job.id)!;
        return { job, fit: prev.fit, reason: prev.reason };
      });
    return [...items, ...pinned];
  }

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
  const resumeText = resumeTextForProfile;
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
    const fallbackItems = pinPreviouslyShownJobs(
      candidates.slice(0, TARGET_COUNT).map((job) => ({ job, fit: null, reason: null }))
    );
    replaceUserOpportunities(
      userId,
      fallbackItems.map((item, i) => ({ jobPostingId: item.job.id, rank: i + 1, fit: item.fit, reason: item.reason })),
      { personalized: false, memoryCountAtGeneration: memoryCount }
    );
    return {
      personalized: false,
      memoryCount,
      memoriesNeeded,
      statedPreferences: prefs,
      opportunities: fallbackItems.map((item) => toCard(item.job, item.fit, item.reason, feedbackMap[item.job.id] ?? null)),
    };
  }

  const byId = new Map(candidates.map((job) => [job.id, job]));
  const items = pinPreviouslyShownJobs(
    ranked
      .map((r) => {
        const job = byId.get(r.id);
        return job ? { job, fit: r.fit as OpportunityCard["fit"], reason: r.reason } : null;
      })
      .filter((x): x is { job: JobPosting; fit: OpportunityCard["fit"]; reason: string } => x !== null)
      .slice(0, TARGET_COUNT)
  );

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

export type OpportunitiesDebugInfo = {
  memoryCount: number;
  roles: { title: string; industry: string | null }[];
  overallSeniority: string | null;
  statedPreferences: JobPreferences | null;
  // Every active, <=MAX_JOB_AGE_DAYS-old posting in the WHOLE shared pool --
  // not scoped to this person at all, same as the admin dashboard's own
  // "jobs active" figure.
  activePoolSize: number;
  // Of activePoolSize, how many clear this person's own SENIORITY hard
  // exclude (see passesHardFilters) -- the real ceiling of what could EVER
  // reach keyword scoring, the top-80 cut, or the AI ranking step for them,
  // before any of those further narrow it down. Industry is no longer a
  // hard exclude (2026-10-03, direct founder call -- see
  // INDUSTRY_MISMATCH_PENALTY's own comment), so this number no longer
  // reflects industry fit at all -- that signal now only shows up in
  // topCandidateSample's ordering. If this number is already small, a
  // short final list is the pool genuinely being thin for this person, not
  // a bug; if it's large, the AI step itself is being too conservative.
  passesHardFilters: number;
  // What's actually cached/visible on their Opportunities tab right now.
  currentlyShown: number;
  // The actual titles/companies/fit/reason behind currentlyShown -- so "why
  // only 6" can be answered by looking at what they actually are, not just
  // the count.
  currentList: { title: string; company: string | null; fit: OpportunityCard["fit"]; reason: string | null }[];
  // Of passesHardFilters, the top ~15 (by the SAME keyword/location/industry/
  // seniority score matchCandidates itself ranks by) that would actually
  // reach the AI ranking step this round -- the top-80 cut happens BEFORE
  // the LLM ever sees anything, purely on crude keyword overlap plus the
  // structured bonuses. If these look like genuinely strong matches, the
  // bottleneck is the LLM being too conservative; if they look like noise,
  // the keyword pre-filter itself is the problem, not the AI judgment.
  topCandidateSample: { title: string; company: string | null; industry: string | null }[];
  // The EXACT text handed to rankOpportunities' system prompt as "PERSON'S
  // PROFILE" (see buildProfileText) -- added 2026-10-02 while chasing a
  // report that reasons were citing automotive work experience nowhere in
  // roles/statedPreferences above. Showing the real string sent to the LLM
  // settles at a glance whether that's a prompt-wording problem (the stated
  // preference being misread as experience) or the resumeExcerpt itself
  // actually containing automotive content the roles above don't capture
  // (e.g. a resume upload that doesn't match this account's real career) --
  // no more guessing from the roles list alone.
  profileText: string;
};

// Admin-only diagnostic (see app/api/admin/opportunities-debug/route.ts) --
// answers "is six really everything, or is the pool hiding more genuine
// matches" with real numbers instead of guessing. Deliberately reuses
// passesHardFilters, the EXACT predicate the live matching path runs,
// rather than a second hand-rolled count that could quietly drift out of
// sync with it over time.
export function getOpportunitiesDebugInfo(userId: string): OpportunitiesDebugInfo {
  const memoryCount = countMemories(userId);
  const suggestedRoles = getLatestSuggestedRolesForUser(userId);
  const roles = suggestedRoles?.roles ?? [];
  const prefs = getJobPreferences(userId);
  const userIndustries = new Set(roles.map((r) => r.industry).filter((v): v is string => !!v));
  const statedIndustry = canonicalIndustry(prefs?.industry);
  if (statedIndustry) userIndustries.add(statedIndustry);
  const userSeniority = suggestedRoles?.seniority ?? null;
  const userSeniorityRank = userSeniority ? SENIORITY_ORDER[userSeniority] : undefined;

  const pool = listActiveJobPostings().filter(isRecentEnough).filter(isShowableQuality);
  // Industry no longer excludes here either (see passesHardFilters' own
  // comment) -- this debug number now reports what clears the SENIORITY
  // bar alone, so it'll read higher than it used to for the same person;
  // the industry signal's effect now shows up in topCandidateSample's
  // ordering (via INDUSTRY_MATCH_BONUS/INDUSTRY_MISMATCH_PENALTY) instead.
  const passing = pool.filter((job) => passesHardFilters(job, userSeniorityRank));

  const cache = getCachedOpportunities(userId);

  // Same candidate-selection call the live path makes (see
  // getOpportunitiesForUser) -- reused here, not re-derived, so this sample
  // can never silently drift from what matching actually does.
  const user = getUserById(userId);
  const resumeText = user?.resume_text ?? null;
  const detectedCity = prefs?.city || detectCityFromText(resumeText);
  const profileKeywords = [
    ...keywordsFrom(roles.map((r) => `${r.title} ${r.industry ?? ""}`).join(" ")),
    ...keywordsFrom((resumeText ?? "").slice(0, 1500)),
    ...keywordsFrom(`${prefs?.function ?? ""} ${prefs?.industry ?? ""}`),
  ];
  const feedbackMap = getFeedbackMap(userId);
  const excludeIds = new Set(
    Object.entries(feedbackMap)
      .filter(([, v]) => v === "not_for_me")
      .map(([jobId]) => jobId)
  );
  const topCandidates = matchCandidates(pool, profileKeywords, excludeIds, 80, detectedCity, userIndustries, userSeniority);

  return {
    memoryCount,
    roles: roles.map((r) => ({ title: r.title, industry: r.industry })),
    currentList: cache.map((row) => ({ title: row.job.title, company: row.job.company, fit: row.fit, reason: row.reason })),
    topCandidateSample: topCandidates
      .slice(0, 15)
      .map((job) => ({ title: job.title, company: job.company, industry: job.industry_tag })),
    overallSeniority: userSeniority,
    statedPreferences: prefs,
    activePoolSize: pool.length,
    passesHardFilters: passing.length,
    currentlyShown: cache.length,
    profileText: buildProfileText(roles, resumeText, detectedCity, prefs, userSeniority),
  };
}
