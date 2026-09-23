import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { setJobPreferences } from "@/lib/repo/jobPreferences";
import { clearUserOpportunities } from "@/lib/repo/userOpportunities";

// Backs the inline "tell us what you're looking for" form shown on the
// Opportunities tab's locked state (see OpportunitiesClient.tsx) -- the
// other way, alongside recording enough memories, that someone unlocks
// real matching (see wantsPersonalized in lib/opportunities.ts). Each
// field is optional and nullable -- a user can state just a city, or clear
// a field they'd previously set by submitting it empty.
const schema = z.object({
  city: z.string().trim().max(100).nullable().optional(),
  function: z.string().trim().max(100).nullable().optional(),
  industry: z.string().trim().max(100).nullable().optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Generous but not unlimited -- this is a simple form a person fills in
  // by hand a handful of times, never a bulk/automation target.
  const limited = rateLimitOrResponse(`opportunities-preferences:${userId}`, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const saved = setJobPreferences(userId, parsed.data);
  // Force the next GET /api/opportunities to recompute rather than serving
  // a cached "still locked" result from before this was saved -- see the
  // comment on clearUserOpportunities itself.
  clearUserOpportunities(userId);

  return NextResponse.json({ ok: true, preferences: saved });
}
