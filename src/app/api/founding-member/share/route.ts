import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getOrCreateFoundingMemberShare } from "@/lib/repo/foundingMember";
import type { FoundingMemberCardData } from "@/lib/founderCardImage";

// Same convention as APP_ORIGIN in lib/email.ts and
// app/api/career-wrapped/share/route.ts.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";

// Gets-or-creates this signed-in user's one Founding Member share (see
// getOrCreateFoundingMemberShare's comment for why this is idempotent
// rather than always minting a new row the way Career Wrapped's share
// route does). GET and POST are intentionally identical -- the in-app page
// calls this once on load (effectively a GET-shaped "give me my card"),
// but POST is kept too since every other share endpoint in this app uses
// POST for "ensure this exists and give me its id," and a share action
// re-calling the same endpoint shouldn't need to know which verb the
// initial page load used.
async function respondWithShare() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const share = getOrCreateFoundingMemberShare(userId);
  if (!share) {
    // Only reachable for an account whose founding_member_number is
    // somehow still null -- see that column's migration in lib/db.ts,
    // which backfills every existing row and createUser() assigns for
    // every new one, so this should never actually happen in practice.
    return NextResponse.json({ error: "Founding Member status not available for this account yet." }, { status: 404 });
  }

  const cardData: FoundingMemberCardData = JSON.parse(share.card_data);
  return NextResponse.json({
    shareId: share.id,
    url: `${APP_ORIGIN}/fm/${share.id}`,
    cardData,
  });
}

export async function GET() {
  return respondWithShare();
}

export async function POST() {
  return respondWithShare();
}
