import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getOpportunitiesForUser } from "@/lib/opportunities";

// Serves the Opportunities tab -- see lib/opportunities.ts for the actual
// personalized-vs-generic decision and caching. This route is deliberately
// thin: auth, delegate, return. No AI call happens directly on this
// request path in the common case (cache hit); when it does run a fresh
// ranking, that's still one batched call over a pre-filtered candidate
// set, not per-job -- see rankOpportunities in lib/ai.ts.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getOpportunitiesForUser(userId);
  return NextResponse.json(result);
}
