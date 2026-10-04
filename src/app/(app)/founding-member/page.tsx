import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getOrCreateFoundingMemberShare } from "@/lib/repo/foundingMember";
import type { FoundingMemberCardData } from "@/lib/founderCardImage";
import { FoundingMemberClient } from "./FoundingMemberClient";

// Entry point for the in-app "You're a Founding Member" reveal -- reached
// from the "Founding Member" row in Settings today (see settings/page.tsx).
// Unlike Career Wrapped's card flow (app/(app)/career-wrapped/card/page.tsx,
// which this otherwise mirrors), there's no separate preview step before
// generating: nothing here is derived from private memory data that needs
// reviewing before it's shareable, just this user's own name and the
// number they were given at signup, so getOrCreateFoundingMemberShare runs
// right here and the client lands straight on the finished card.
export default async function FoundingMemberPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const share = getOrCreateFoundingMemberShare(userId);
  // Only reachable for an account whose founding_member_number is somehow
  // still null -- see that column's migration comment in lib/db.ts, which
  // backfills every existing row. Shouldn't happen in practice; sending
  // back to Home is safer than rendering a broken card.
  if (!share) redirect("/home");

  const cardData: FoundingMemberCardData = JSON.parse(share.card_data);
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";
  return <FoundingMemberClient shareId={share.id} url={`${appOrigin}/fm/${share.id}`} cardData={cardData} />;
}
