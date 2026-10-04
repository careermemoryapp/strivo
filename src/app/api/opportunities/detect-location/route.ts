import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { nearestOpportunityCity } from "@/lib/geo";
import { getJobPreferences, setJobPreferences } from "@/lib/repo/jobPreferences";
import { clearUserOpportunities } from "@/lib/repo/userOpportunities";

// Backs the "Use my current location" control on the Opportunities tab
// (see OpportunitiesClient.tsx) -- added 2026-10-04 after a direct founder
// report: someone based in one city was being shown jobs in a different
// city entirely because resume-text city detection (detectCityFromText in
// lib/geo.ts) can miss or mis-detect. This is a one-tap, explicit action,
// not a standing filter form -- the person's browser asks them directly
// for a one-time geolocation reading, and this route just resolves that
// lat/lng to the nearest of our 15 supported cities (nearestOpportunityCity,
// lib/geo.ts) and stores it exactly like a manually-typed city preference:
// same user_job_preferences.city column, same precedence over resume-text
// detection (see detectedCity in lib/opportunities.ts). Raw coordinates are
// never persisted -- only the resolved city name, and only this user's own
// device ever sends them (no other caller has a reason to hit this route).
const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A one-tap control a person might retry once or twice if their first
  // GPS fix was bad -- generous but not unlimited, same shape as the other
  // opportunities preference writes.
  const limited = rateLimitOrResponse(`opportunities-detect-location:${userId}`, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const city = nearestOpportunityCity(parsed.data.lat, parsed.data.lng);
  if (!city) {
    // Not close enough to any covered city to confidently label -- leave
    // any existing stated/resume-detected city alone rather than guessing.
    return NextResponse.json({ ok: true, city: null });
  }

  // Preserve whatever else was already stated (function/industry) --
  // this control only ever speaks to city.
  const existing = getJobPreferences(userId);
  setJobPreferences(userId, { city, function: existing?.function ?? null, industry: existing?.industry ?? null });
  // Force the next GET /api/opportunities to recompute against the newly
  // saved city rather than serving a cache built under the old one -- same
  // reasoning as POST /api/opportunities/preferences.
  clearUserOpportunities(userId);

  return NextResponse.json({ ok: true, city });
}
