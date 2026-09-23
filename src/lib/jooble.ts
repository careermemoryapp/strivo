// Server-only. Never import this file from a "use client" component.
//
// Thin client for Jooble's India REST API (see
// https://in.jooble.org/api/about) — the job-supply side of the
// Opportunities tab. Jooble issues API keys per country domain, so this is
// deliberately hardcoded to the India host rather than made configurable;
// a different market would need its own key AND its own host, at which
// point this file should grow a `country` param rather than silently
// guess one from an env var.
//
// IMPORTANT — the free tier is a 500-REQUEST LIFETIME cap, not monthly
// (see JOOBLE_API_KEY's comment in .env.example). Nothing in this file
// enforces that budget itself — callers are responsible for not burning it
// (see app/api/opportunities/refresh-pool/run, the only caller as of this
// writing, and its fixed function x city grid). Do NOT call this per user
// request/page load.

const JOOBLE_HOST = "https://in.jooble.org/api";

export type JoobleJob = {
  id: number;
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
};

type JoobleResponse = {
  totalCount: number;
  jobs: JoobleJob[];
};

export function joobleConfigured(): boolean {
  return !!process.env.JOOBLE_API_KEY;
}

// One page of results for one (keywords, location) query. Returns null on
// any failure (missing key, network error, non-200 response, unexpected
// shape) rather than throwing -- refresh-pool/run calls this once per cell
// of a fixed grid and should keep going through the rest of the grid if a
// single query fails, not abort the whole refresh.
export async function searchJoobleJobs(
  keywords: string,
  location: string,
  page = 1
): Promise<JoobleJob[] | null> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${JOOBLE_HOST}/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords,
        location,
        page: String(page),
        // Jooble's own docs example sends radius as a numeric-looking
        // string despite the field allowing only a fixed set of values
        // (0/4/8/16/26/40/80) -- 80 casts the widest net for a city-level
        // search, appropriate here since our own city_tag (see
        // refresh-pool/run) is already the precise signal, not radius.
        radius: "80",
      }),
    });
    if (!res.ok) {
      console.error(`Jooble search failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as JoobleResponse;
    if (!Array.isArray(data.jobs)) return null;
    return data.jobs;
  } catch (err) {
    console.error("Jooble search threw:", err);
    return null;
  }
}
