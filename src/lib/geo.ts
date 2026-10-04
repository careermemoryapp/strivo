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

// Approximate city-center coordinates for OPPORTUNITY_CITIES -- added
// 2026-10-04 after a direct founder report that resume-text city detection
// alone was showing someone jobs in a city they don't actually live/work
// in (their example: a person based in Bangalore being shown Mohali
// postings). Used only to resolve a ONE-TIME browser geolocation reading
// (see the "Use my current location" control on the Opportunities tab,
// OpportunitiesClient.tsx, and POST /api/opportunities/detect-location) to
// the nearest of our 15 supported cities -- this is "which of our cities
// is this person probably in," not real geocoding, so city-center
// precision is intentionally good enough rather than exact. Raw lat/lng
// coordinates are never stored anywhere -- only the resolved city name,
// written to the same user_job_preferences.city column a manually-typed
// city would use (see setJobPreferences in lib/repo/jobPreferences.ts),
// so it takes the same precedence over resume-detected city that a stated
// preference already had (see detectedCity in lib/opportunities.ts).
const CITY_COORDINATES: Record<(typeof OPPORTUNITY_CITIES)[number], { lat: number; lng: number }> = {
  Delhi: { lat: 28.6139, lng: 77.209 },
  Noida: { lat: 28.5355, lng: 77.391 },
  Gurgaon: { lat: 28.4595, lng: 77.0266 },
  Faridabad: { lat: 28.4089, lng: 77.3178 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Surat: { lat: 21.1702, lng: 72.8311 },
  Chandigarh: { lat: 30.7333, lng: 76.7794 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Lucknow: { lat: 26.8467, lng: 80.9462 },
};

// Beyond this, the nearest of our 15 cities is probably not actually where
// the person is (e.g. a smaller town between two covered cities, or
// someone outside India entirely) -- better to say "couldn't place you in
// one of our covered cities" and fall back to resume-text detection than
// to confidently mislabel them. ~120km comfortably covers normal
// GPS/network-location imprecision and short commute distances around any
// one of these metros without reaching all the way to a neighboring one.
const MAX_GEOLOCATION_MATCH_KM = 120;

function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Resolves a raw browser geolocation reading to the nearest OPPORTUNITY_CITIES
// entry, or null when nothing covered is close enough (see
// MAX_GEOLOCATION_MATCH_KM). Called server-side from
// POST /api/opportunities/detect-location -- the client only ever sends a
// coordinate pair, never picks or guesses the city name itself, so this
// stays the single source of truth for the distance cutoff.
export function nearestOpportunityCity(lat: number, lng: number): string | null {
  const point = { lat, lng };
  let best: string | null = null;
  let bestDistanceKm = Infinity;
  for (const city of OPPORTUNITY_CITIES) {
    const distanceKm = haversineDistanceKm(point, CITY_COORDINATES[city]);
    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm;
      best = city;
    }
  }
  return best && bestDistanceKm <= MAX_GEOLOCATION_MATCH_KM ? best : null;
}
