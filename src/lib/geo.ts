// Server-only. Shared Indian-city data for the Opportunities feature: the
// same list drives BOTH the job-pool refresh grid (see
// app/api/opportunities/refresh-pool/run, which queries Adzuna once per
// function x city cell) and per-user location matching (see
// detectCityFromText below, used by lib/opportunities.ts). One list, two
// uses -- the two can never silently drift apart.
//
// Deliberately kept to major cities rather than every city, per a direct
// founder call: city coverage is a fixed, hand-picked set of the metros/
// NCR satellite cities that actually matter for this app's users, and the
// refresh's query budget is spent widening FUNCTION coverage instead (see
// FUNCTIONS in the refresh-pool route) -- far more job categories per
// city, not more cities. Grown from 12 to 15 (added Faridabad, Jaipur,
// Lucknow) alongside the FUNCTIONS expansion, on the same call.
export const OPPORTUNITY_CITIES = [
  "Delhi",
  "Noida",
  "Gurgaon",
  "Faridabad",
  "Bengaluru",
  "Mumbai",
  "Ahmedabad",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Surat",
  "Chandigarh",
  "Kolkata",
  "Jaipur",
  "Lucknow",
] as const;

// Common alternate spellings/old names people actually write on a resume or
// that Adzuna's own India location data still uses in places (e.g. it
// sometimes returns "Bangalore" rather than "Bengaluru") -- maps each to
// the canonical OPPORTUNITY_CITIES entry so both sides of the match
// (resume text, and a job_postings.location string) agree on one spelling.
const CITY_ALIASES: Record<string, string> = {
  delhi: "Delhi",
  "new delhi": "Delhi",
  ncr: "Delhi",
  noida: "Noida",
  "greater noida": "Noida",
  gurugram: "Gurgaon",
  gurgaon: "Gurgaon",
  faridabad: "Faridabad",
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  ahmedabad: "Ahmedabad",
  hyderabad: "Hyderabad",
  chennai: "Chennai",
  madras: "Chennai",
  pune: "Pune",
  surat: "Surat",
  chandigarh: "Chandigarh",
  kolkata: "Kolkata",
  calcutta: "Kolkata",
  jaipur: "Jaipur",
  lucknow: "Lucknow",
};

// Best-effort: returns the first pool city this text seems to name, or
// null. Deliberately simple word-boundary matching over the alias table
// above rather than real NLP/NER -- good enough to catch "Bengaluru" or
// "based in Gurgaon" in a resume without over-matching (word boundaries
// mean it never fires on a substring inside an unrelated word). Checked
// against resume text (see buildProfileText in lib/opportunities.ts) to
// boost jobs in that city during candidate pre-filtering and to tell the
// ranking model explicitly where this person is likely based.
export function detectCityFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) return canonical;
  }
  return null;
}
