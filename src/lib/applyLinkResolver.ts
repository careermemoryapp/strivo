// Server-only. Best-effort: tries to resolve an Adzuna `redirect_url` (an
// Adzuna-hosted click-tracking link, never the real destination) down to
// wherever it actually lands, so refresh-pool/run can show a verified
// employer/ATS link when it can. When it can't, the caller no longer drops
// the job -- see the long history below for why, and refresh-pool/run's
// own comment on its resolution loop for the current behavior.
//
// Why this exists: the founder's own testing found that most Adzuna
// results ultimately point at a marketplace listing (LinkedIn, Naukri,
// Indeed...) whose "apply" flow requires a separate account/profile on
// that site and, per direct feedback, often just doesn't work. The
// original product call was to only keep postings that resolve to the
// employer's own application flow -- either their own domain, or a
// standard hiring platform (Greenhouse, Lever, Workday, etc.) that
// presents as the company's own careers page even though it's hosted
// elsewhere -- and drop anything that resolves to a marketplace/aggregator
// domain instead.
//
// That worked until Adzuna started blocking this server's own attempts to
// follow its redirect_url at all (see the long investigation below), at
// which point "drop anything we can't verify" started dropping 100% of new
// postings -- not because they were portal listings, but because this
// server can no longer check. The fix that shipped (see below) makes
// resolution best-effort instead of a hard gate.
//
// This ONLY runs once per NEW job (see the external_id existence check in
// app/api/opportunities/refresh-pool/run) -- an already-known job's
// source_url is immutable once set (see the ON CONFLICT clause in
// lib/repo/jobPostings.ts), so a user's own opportunity list never triggers
// this, and a weekly refresh only ever resolves genuinely new postings.
//
// THE INVESTIGATION (for whoever touches this next): a post-purge chunk
// refresh filtered out 100% of 150 resolutions with nothing to explain
// why. Root-caused via the admin dashboard's "Test resolver" probe, in
// stages:
//   1. Node's built-in fetch (undici) has a TLS handshake signature that
//      doesn't match a real Chrome browser, no matter what headers are
//      set -- Adzuna's click-tracking endpoint does TLS fingerprinting on
//      top of headers, so instead of redirecting, it served back a page
//      still on adzuna.in -- which then matched AGGREGATOR_DOMAINS below
//      and every job got silently dropped as if it were a portal listing.
//   2. Switched to `impit` (github.com/apify/impit) for genuine Chrome TLS
//      impersonation (prebuilt native binaries, no compiler needed on
//      deploy) -- a real fix for TLS fingerprinting in general, and the
//      textbook one (confirmed by outside research into this exact
//      failure mode). Didn't fix THIS block: still 100% denied afterward.
//   3. A raw diagnostic (debugResolveFinalUrl, now folded into
//      debugResolveFinalUrlVariants below) showed the real response: HTTP
//      403 (not the 200 originally suspected), no cf-ray/cf-mitigated
//      header (so NOT a Cloudflare interstitial -- this is Adzuna's own
//      "Access Denied" page, assets served from their own
//      zunastatic-abf.kxcdn.com), and a full stack of fresh Adzuna session
//      cookies handed back on every single attempt regardless.
//   4. Three variants tested at once -- plain, with a Referer header
//      pointing at adzuna.in, and with a Referer plus a cookie picked up
//      from actually visiting adzuna.in's homepage first -- came back
//      byte-for-byte identical. Ruled out "missing request provenance" as
//      the cause; left IP/ASN-level reputation (this server's EC2 IP
//      flagged as automated/datacenter traffic, independent of what the
//      request itself looks like) as the remaining explanation -- echoing
//      this file's own note on mapWithConcurrency about the earlier
//      Jooble/Cloudflare incident.
//   5. Direct founder call after seeing this evidence: a real person's own
//      browser, on their own device, doesn't share this server's IP or
//      this problem -- so stop trying to gate on server-side verification
//      (which by this point could no longer succeed for ANY Adzuna
//      redirect_url from this server) and let the person's own browser
//      follow the link when they tap Apply instead. Chosen over paying for
//      a residential-IP proxy service just for this verification step
//      (real fix for the "never show portals" promise, but a new ongoing
//      cost and vendor dependency) and over a real headless browser (was
//      already ruled out for RAM reasons, and wouldn't have helped anyway
//      -- it would run from this same flagged IP).
//
// Net effect: resolveDirectApplyUrl/resolveFinalUrl below are still tried
// first on every new job (cheap, and self-heals for free if Adzuna's block
// or this server's IP reputation ever changes), but a failure no longer
// means "drop this job" -- see refresh-pool/run for what happens instead.

import { Impit } from "impit";
// AGGREGATOR_DOMAINS/hostnameOf/isAggregatorDomain moved to lib/config.ts
// (2026-09-25) so OpportunitiesClient.tsx -- a "use client" component --
// can reuse the exact same denylist when deciding whether a job's
// sourceUrl is worth trying a company-logo lookup against (see that
// file's avatar rendering). This file stays server-only (see the top
// comment) and just imports the shared list rather than keeping its own
// copy. Re-exported so existing callers of isAggregatorDomain from THIS
// file don't need to change their import path.
import { isAggregatorDomain, hostnameOf } from "@/lib/config";
export { isAggregatorDomain };

const RESOLVE_TIMEOUT_MS = 6000;

// Optional: routes every resolution request (both the real one below and
// the admin "Test resolver" debug probe, since both share impitClient)
// through a residential-IP proxy -- the fix stage 5 of the investigation
// above chose NOT to take at the time (paying for a proxy just for this
// verification step), reconsidered after the founder kept running into
// the practical effect of that call: an ever-growing share of the pool
// showing Adzuna's own link instead of a direct one, as old resolved
// postings age out and 100% of new ones fail this server's flagged-IP
// block. RESOLVER_PROXY_URL is a full proxy connection string (e.g.
// "http://username:password@gw.dataimpulse.com:823" -- exact host/port
// comes from whichever residential-proxy provider's account this is,
// never this app's own domain) -- see the comment on that env var in
// .env.example for where to get one. Left unset, proxyUrl is undefined
// and impit behaves exactly as before (direct from this server's own
// IP) -- this is purely additive, not a required dependency.
const RESOLVER_PROXY_URL = process.env.RESOLVER_PROXY_URL || undefined;

export function resolverProxyConfigured(): boolean {
  return !!RESOLVER_PROXY_URL;
}

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
  proxyUrl: RESOLVER_PROXY_URL,
});

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
