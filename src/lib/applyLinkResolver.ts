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

const RESOLVE_TIMEOUT_MS = 6000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    // Free the connection without buffering the body -- we only need the
    // final URL, not the page content.
    res.body?.cancel().catch(() => {});
    if (!res.url) return null;
    return res.url;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The one function refresh-pool/run actually calls: resolve, then judge.
// Returns the final URL when it's a real, non-aggregator apply link;
// null when it couldn't be resolved OR resolved to an aggregator --
// callers treat both the same (drop the job), matching the product
// decision to fail closed rather than show a maybe-broken apply link.
export async function resolveDirectApplyUrl(redirectUrl: string): Promise<string | null> {
  const finalUrl = await resolveFinalUrl(redirectUrl);
  if (!finalUrl) return null;
  if (isAggregatorDomain(finalUrl)) return null;
  return finalUrl;
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
