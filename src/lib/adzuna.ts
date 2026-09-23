// Server-only. Never import this file from a "use client" component.
//
// Thin client for Adzuna's India REST API (see
// https://developer.adzuna.com/overview) -- the job-supply side of the
// Opportunities tab. Replaces the earlier Jooble integration (see git
// history / lib/jooble.ts, now unused): Jooble's free tier was a
// 500-request LIFETIME cap and its India endpoint started returning
// Cloudflare bot-challenge pages from this app's server IP.
//
// Adzuna's own default limits, straight from
// https://developer.adzuna.com/docs/terms_of_service ("Default API access
// limits"): 25 hits/minute, 250 hits/day, 1,000 hits/week, 2,500 hits/
// month. A note that used to live here said the monthly figure was
// 1,000 -- that was wrong (misread from a secondary source, not Adzuna's
// own docs) and has been corrected. 2,500/month is the real ceiling;
// there is no API response header or separate endpoint that reports
// calls remaining (confirmed against the same docs) -- see
// lib/repo/adzunaUsage.ts for how this app tracks its own usage instead.
// Note the DAILY cap (250) is tighter, in practice, than the monthly one
// for this app's usage pattern: one refresh-pool run is 975 calls (see
// FUNCTIONS in app/api/opportunities/refresh-pool/run), comfortably under
// the monthly cap but nearly 4x the daily one if that limit is actually
// enforced. An earlier 80-call test run completed with zero failures,
// which suggests the per-day/per-minute figures aren't strictly
// enforced in practice for a burst this size -- but see the 429 retry
// below, added as a safety net rather than assuming that holds at 975
// calls too.
//
// Uses a single API with a country-code URL segment, which also fits
// this product's "India first, other countries later" roadmap better
// than Jooble's one-key-per-country design would have.
//
// Auth is an (app_id, app_key) PAIR, not a single key like Jooble --
// both are required query params on every request, confirmed against
// https://developer.adzuna.com/docs/search.

const ADZUNA_HOST = "https://api.adzuna.com/v1/api/jobs/in/search";

export type AdzunaJob = {
  id: string;
  title: string;
  location: string;
  snippet: string;
  salary: string | null;
  link: string;
  company: string;
  updated: string; // Adzuna's own "created" timestamp for the listing
};

// Only the fields this file actually reads -- Adzuna's real response has
// more (latitude/longitude, category, contract_type, contract_time, ...)
// that job_postings has no column for yet.
type AdzunaApiResult = {
  id: string;
  title: string;
  description?: string;
  redirect_url: string;
  location?: { display_name?: string };
  company?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  // Confirmed as a real field in Adzuna's response schema
  // (developer.adzuna.com/docs/search): 0 = employer-stated salary,
  // 1 = Adzuna's own statistical estimate. Surfaced in the UI-facing
  // salary string below so an estimated figure isn't presented as if the
  // employer posted it.
  salary_is_predicted?: number;
  created?: string;
};

type AdzunaResponse = {
  results: AdzunaApiResult[];
  count: number;
};

export function adzunaConfigured(): boolean {
  return !!process.env.ADZUNA_APP_ID && !!process.env.ADZUNA_APP_KEY;
}

function formatSalary(min: number | undefined, max: number | undefined, isPredicted: number | undefined): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const range = min && max && min !== max ? `${fmt(min)} - ${fmt(max)}` : fmt((min || max) as number);
  return isPredicted ? `${range} (estimated)` : range;
}

// Retries a 429 (rate limited) up to twice with a growing backoff before
// giving up -- see the top-of-file comment on Adzuna's documented 25/min
// and 250/day caps. A single non-429 failure still fails immediately (no
// point retrying a 4xx/5xx that isn't about rate limiting), same as
// before this existed.
async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, { method: "GET" });
  if (res.status === 429 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

// One page of results for one (keywords, location) query. Returns null on
// any failure (missing credentials, network error, non-200 response,
// unexpected shape) rather than throwing -- refresh-pool/run calls this
// once per cell of a fixed grid and should keep going through the rest of
// the grid if a single query fails, not abort the whole refresh. Same
// contract as the Jooble version this replaces.
export async function searchAdzunaJobs(
  keywords: string,
  location: string,
  page = 1
): Promise<AdzunaJob[] | null> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return null;
  try {
    const url = new URL(`${ADZUNA_HOST}/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", keywords);
    url.searchParams.set("where", location);
    url.searchParams.set("results_per_page", "20");
    url.searchParams.set("content-type", "application/json");

    const res = await fetchWithRetry(url.toString());
    if (!res.ok) {
      console.error(`Adzuna search failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as AdzunaResponse;
    if (!Array.isArray(data.results)) return null;
    return data.results.map((r) => ({
      id: r.id,
      title: r.title,
      location: r.location?.display_name || location,
      snippet: r.description || "",
      salary: formatSalary(r.salary_min, r.salary_max, r.salary_is_predicted),
      link: r.redirect_url,
      company: r.company?.display_name || "",
      updated: r.created || "",
    }));
  } catch (err) {
    console.error("Adzuna search threw:", err);
    return null;
  }
}
