// Server-only. Looks up a company's logo DOMAIN by its plain NAME, via
// logo.dev's Search API (https://www.logo.dev/docs/brand-search/
// introduction) -- separate from, and now more important than,
// OpportunitiesClient.tsx's own client-side logoDomainFor (which guesses a
// domain from a job's already-resolved apply link).
//
// Why this exists as its own path: the server this app runs on is
// IP-blocked by Adzuna from following its own redirect_url (see the
// investigation at the top of lib/applyLinkResolver.ts) -- confirmed via
// the admin dashboard's "Test resolver" probe, and a direct founder call
// after seeing that evidence to stop gating on server-side verification.
// Net effect: close to 100% of NEW job postings now have source_url set to
// Adzuna's own redirect link, not the employer's domain -- so a
// logo lookup keyed on that link would almost never find anything. A
// company's NAME, by contrast, is always present on every Adzuna result
// regardless of whether its link ever resolves, so looking up by name
// sidesteps the block entirely rather than waiting on it to lift.
//
// Run ONCE PER COMPANY (see findResolvedLogoDomainForCompany in
// lib/repo/jobPostings.ts for the reuse-across-postings check) from
// app/api/opportunities/refresh-pool/run, in the background -- never
// per-request, per-user, or client-side, both because the lookup needs a
// SECRET key (never safe to ship to a browser, unlike the "publishable"
// key OpportunitiesClient.tsx uses for the actual logo IMAGE) and because
// doing it once per company is dramatically cheaper against logo.dev's
// free-tier request budget than once per card render would be.
const LOGO_SEARCH_TIMEOUT_MS = 8000;

export function logoDevConfigured(): boolean {
  return !!process.env.LOGO_DEV_SECRET_KEY;
}

type LogoDevSearchResult = { name?: string; domain?: string; logo_url?: string };

// Returns the top match's domain, or null when nothing matched (or the
// request failed/timed out -- best-effort, same as classifyJobPostings in
// lib/ai.ts: a transient failure here just means this company's postings
// keep showing the letter avatar until a LATER refresh-pool chunk retries
// it, never a reason to fail the whole run). strategy=match (rather than
// the default "suggest," meant for typeahead-as-you-type UIs) favors an
// exact name match as the first result, which is what an unattended
// backend lookup with no human picking from a list needs.
export async function lookupCompanyLogoDomain(company: string): Promise<string | null> {
  const key = process.env.LOGO_DEV_SECRET_KEY;
  if (!key) return null;
  const trimmed = company.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.logo.dev/search?q=${encodeURIComponent(trimmed)}&strategy=match`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const results = (await res.json()) as LogoDevSearchResult[];
    return results?.[0]?.domain?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
