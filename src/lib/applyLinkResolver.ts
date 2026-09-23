// Server-only. Resolves an Adzuna `redirect_url` (an Adzuna-hosted
// click-tracking link, never the real destination) down to wherever it
// actually lands, and decides whether that's worth showing at all.
//
// Why this exists: the founder's own testing found that most Adzuna
// results ultimately point at a marketplace listing (LinkedIn, Naukri,
// Indeed...) whose "apply" flow requires a separate account/profile on
// that site and, per direct feedback, often just doesn't work. The product
// call is to only keep postings that resolve to the employer's own
// application flow -- either their own domain, or a standard hiring
// platform (Greenhouse, Lever, Workday, etc.) that presents as the
// company's own careers page even though it's hosted elsewhere. Anything
// that resolves to a marketplace/aggregator domain is dropped.
//
// This ONLY runs once per NEW job (see the external_id existence check in
// app/api/opportunities/refresh-pool/run) -- an already-known job's
// source_url is immutable once set (see the ON CONFLICT clause in
// lib/repo/jobPostings.ts), so a user's own opportunity list never triggers
// this, and a weekly refresh only ever resolves genuinely new postings.
//
// Uses `impit` (github.com/apify/impit), not Node's built-in fetch, to
// actually follow Adzuna's redirect_url. Found the hard way, via the admin
// dashboard's "Test resolver" probe: Adzuna's click-tracking endpoint does
// TLS fingerprinting on top of whatever User-Agent header a request sends
// -- Node's fetch (undici) has a TLS handshake signature that doesn't match
// a real Chrome browser no matter what headers are set, so instead of
// redirecting, Adzuna served back an HTTP 200 "Access Denied" page still on
// adzuna.in -- which then matched AGGREGATOR_DOMAINS below and every single
// job got silently dropped as if it were a portal listing. impit is a
// native module (prebuilt binaries, no compiler needed on deploy) that
// genuinely impersonates a real browser's TLS handshake, not just its
// headers -- see impitClient below. Direct founder call after seeing this
// explained: worth the new dependency to keep the "never job portals"
// promise intact, over either dropping server-side verification (would
// let some jobs slip through to LinkedIn/Naukri again) or running a real
// headless browser per resolution (too heavy for this server's limited
// RAM at this concurrency).

import { Impit } from "impit";

const RESOLVE_TIMEOUT_MS = 6000;

// One shared instance -- reused (not re-created) across every resolution
// in a refresh-pool run, matching impit's own guidance that one Impit
// instance's connection pool is meant to be reused across requests.
// vanillaFallback: true means a site that doesn't recognize the Chrome
// impersonation degrades to a plain request instead of hard-failing --
// this only ever needs to WORK, no reason to let an edge case throw.
// Deliberately no manual User-Agent header here (unlike the old fetch-based
// version) -- impit's `browser: "chrome"` sets a full, internally-consistent
// set of impersonation headers to match its TLS fingerprint, and setting
// our own User-Agent would override just that one header, right back into
// the same header/fingerprint mismatch this whole change exists to fix.
const impitClient = new Impit({
  browser: "chrome",
  vanillaFallback: true,
  followRedirects: true,
  timeout: RESOLVE_TIMEOUT_MS,
});

// Job marketplaces / aggregators to exclude -- matched by hostname suffix,
// so "www.linkedin.com" and "in.linkedin.com" both match "linkedin.com".
// Deliberately NOT exhaustive of every job site that exists; this is the
// practical list of what actually turns up in Adzuna's India results.
// Extend it here if a refresh keeps letting another aggregator through.
const AGGREGATOR_DOMAINS = [
  "adzuna.com",
  "adzuna.in",
  "linkedin.com",
  "indeed.com",
  "in.indeed.com",
  "naukri.com",
  "naukrigulf.com",
  "monsterindia.com",
  "monster.com",
  "foundit.in",
  "shine.com",
  "timesjobs.com",
  "glassdoor.com",
  "glassdoor.co.in",
  "ziprecruiter.com",
  "simplyhired.com",
  "simplyhired.co.in",
  "careerbuilder.com",
  "careerjet.com",
  "careerjet.co.in",
  "jooble.org",
  "jora.com",
  "talent.com",
  "jobrapido.com",
  "jobsora.com",
  "instahyre.com",
  "hirist.com",
  "iimjobs.com",
  "cutshort.io",
  "wellfound.com",
  "angel.co",
  "apna.co",
  "freshersworld.com",
  "quikrjobs.com",
  "ncs.gov.in",
  "receptix.com",
  "google.com", // Google for Jobs aggregation pages, not a real employer flow
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Exact match or subdomain match ("in.indeed.com" -> matches "indeed.com").
export function isAggregatorDomain(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return true; // unparseable URL -- treat as untrusted, exclude
  return AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Follows the redirect chain (GET, not HEAD -- several career sites 405 on
// HEAD) and returns the final landed URL, or null if it couldn't resolve
// within the timeout or the request failed outright. Deliberately doesn't
// read/return the response body -- only response.url (the final address
// after following every redirect) is needed, so the body is cancelled
// immediately to free the connection instead of buffering a full HTML page
// per job.
export async function resolveFinalUrl(url: string): Promise<string | null> {
  try {
    const res = await impitClient.fetch(url, { method: "GET", redirect: "follow" });
    // Free the connection without buffering the body -- we only need the
    // final URL (res.url -- impit resolves this to the post-redirect
    // address the same way the Fetch API does), not the page content.
    // impit's response body is a standard ReadableStream, same cancel()
    // contract as the fetch-based version this replaced.
    res.body?.cancel().catch(() => {});
    if (!res.url) return null;
    return res.url;
  } catch {
    // Covers a timeout (impitClient's own `timeout` option above), a
    // network failure, or any other transport-level error impit throws --
    // same fail-closed contract as before (caller treats this identically
    // to "resolved but it's a portal").
    return null;
  }
}

// The one function refresh-pool/run actually calls: resolve, then judge.
// Returns a discriminated result rather than a bare string|null -- a job
// still gets dropped either way (that product decision hasn't changed),
// but WHY it was dropped now survives past this call instead of
// collapsing into one undifferentiated "filtered out" count. Added after
// the very first post-purge run filtered out 100% of resolutions (150/150,
// 0 upserted) -- with only a plain null to go on, there was no way to
// tell "every one of these genuinely landed on a job portal" apart from
// "the resolver itself is broken for some systemic reason" (network,
// timeout, or -- the actual suspect -- Adzuna's redirect_url not issuing a
// real HTTP 3xx and fetch correctly stopping at Adzuna's own domain,
// which IS itself in AGGREGATOR_DOMAINS). See refresh-pool/run's use of
// this for how the breakdown gets surfaced.
export type ApplyUrlResolution =
  | { url: string; reason?: undefined }
  // resolveFinalUrl came back empty -- a network error, a timeout, or
  // (rare) a response with no res.url at all. Genuinely couldn't reach a
  // verdict, as opposed to reaching one and not liking it (below).
  | { url: null; reason: "unresolved" }
  // Resolved fine, but the final landed host is on the denylist -- domain
  // is the actual hostname that matched, so a run-level tally can show
  // e.g. "adzuna.in (150)" instead of a single opaque number.
  | { url: null; reason: "aggregator"; domain: string };

export async function resolveDirectApplyUrl(redirectUrl: string): Promise<ApplyUrlResolution> {
  const finalUrl = await resolveFinalUrl(redirectUrl);
  if (!finalUrl) return { url: null, reason: "unresolved" };
  if (isAggregatorDomain(finalUrl)) {
    return { url: null, reason: "aggregator", domain: hostnameOf(finalUrl) ?? finalUrl };
  }
  return { url: finalUrl };
}

// Runs `fn` over `items` with at most `limit` in flight at once -- plain
// Promise.all over 200+ external requests would open that many sockets at
// once and is exactly the kind of burst that gets a server IP rate-limited
// or blocked (see the Jooble/Cloudflare incident this feature's sibling
// code ran into). A simple worker-pool loop, not a library, since this is
// the only place in the codebase that needs bounded concurrency.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Debug-only: a raw look at what a redirect_url actually returns, instead
// of just resolveFinalUrl's pass/fail verdict. Used ONLY by the admin
// dashboard's "Test resolver" probe (app/api/admin/opportunities-test-
// resolve/route.ts) -- never called from the real refresh-pool path, so it
// can afford to read the response body instead of cancelling it. Exists
// because switching to impit (see this file's top comment) still didn't
// get past Adzuna's block -- every test result still landed back on
// adzuna.in even with real Chrome TLS impersonation.
//
// First round of this diagnostic (debugResolveFinalUrl, now folded into the
// "plain" variant below) showed: HTTP 403, no cf-ray/cf-mitigated header
// (so NOT a Cloudflare interstitial), and a body that's Adzuna's own
// "Access Denied" page (title says so outright, assets served from their
// own zunastatic-abf.kxcdn.com). That rules out impit's TLS impersonation
// being unconvincing -- if the handshake itself were the problem, Adzuna's
// edge wouldn't complete the connection well enough to hand back a full,
// well-formed HTML page with the right content-type. This looks like an
// application-level decision, not a transport-level one.
//
// Two real hypotheses remain, both testable without a code change to the
// real resolver yet: (1) IP/ASN reputation -- this server's EC2 IP is
// flagged as datacenter/automated traffic regardless of what the request
// looks like (see this file's own comment on mapWithConcurrency, about the
// earlier Jooble/Cloudflare incident); (2) missing request provenance --
// Adzuna's redirect_url is meant to be followed by a browser that just
// came from an actual adzuna.in page (search results, a job listing) with
// a Referer/cookie to match, and our resolver calls it cold, with neither.
// "withReferer" and "withSession" below test (2) directly: if either comes
// back with something other than the same 403 Access Denied page, (2) is
// the real cause and the fix is cheap (add that header/cookie to the real
// resolver). If all three variants come back identical, that's real
// evidence for (1), which needs a different class of fix (see this file's
// top comment for why a residential/rotating-IP proxy or dropping
// server-side verification were the two alternatives already discussed).
export type DebugResolution = {
  status: number | null;
  headers: Record<string, string>;
  bodySnippet: string | null;
  finalUrl: string | null;
  error: string | null;
};

async function debugFetchOnce(url: string, extraHeaders?: Record<string, string>): Promise<DebugResolution> {
  try {
    const res = await impitClient.fetch(url, { method: "GET", redirect: "follow", headers: extraHeaders });
    const headers: Record<string, string> = {};
    // Only the headers actually useful for telling a Cloudflare-style
    // interstitial apart from a plain deny page, or spotting a session
    // cookie Adzuna wants -- not dumping every header impit reports, most
    // of which won't mean anything here.
    for (const name of ["server", "cf-ray", "cf-mitigated", "content-type", "content-length", "set-cookie"]) {
      const value = res.headers.get(name);
      if (value) headers[name] = value;
    }
    let bodySnippet: string | null = null;
    try {
      const text = await res.text();
      bodySnippet = text.slice(0, 500);
    } catch {
      bodySnippet = null;
    }
    return { status: res.status, headers, bodySnippet, finalUrl: res.url ?? null, error: null };
  } catch (err) {
    return {
      status: null,
      headers: {},
      bodySnippet: null,
      finalUrl: null,
      error: err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err),
    };
  }
}

export type DebugResolutionVariants = {
  plain: DebugResolution;
  withReferer: DebugResolution;
  withSession: DebugResolution;
};

export async function debugResolveFinalUrlVariants(url: string): Promise<DebugResolutionVariants> {
  const plain = await debugFetchOnce(url);
  const withReferer = await debugFetchOnce(url, { referer: "https://www.adzuna.in/" });

  // Visit Adzuna's own homepage first (a real page a browser would have
  // loaded before ever seeing this redirect), grab whatever cookie it
  // hands back, then retry the redirect carrying that cookie plus the same
  // Referer. If Adzuna's block is really about "this request never
  // originated from our own site," this is the variant that would get
  // through where the other two don't.
  let withSession: DebugResolution;
  try {
    const homepageRes = await impitClient.fetch("https://www.adzuna.in/", { method: "GET" });
    const setCookie = homepageRes.headers.get("set-cookie");
    homepageRes.body?.cancel().catch(() => {});
    withSession = await debugFetchOnce(url, {
      referer: "https://www.adzuna.in/",
      ...(setCookie ? { cookie: setCookie } : {}),
    });
  } catch (err) {
    withSession = {
      status: null,
      headers: {},
      bodySnippet: null,
      finalUrl: null,
      error: err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err),
    };
  }

  return { plain, withReferer, withSession };
}
