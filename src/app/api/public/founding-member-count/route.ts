import { NextResponse } from "next/server";
import { getFoundingMemberStats } from "@/lib/repo/foundingMember";

// Public, unauthenticated, no-PII read of real signup counts -- powers the
// live "N founding members have joined" counter on the marketing homepage
// (see FoundingMemberCounter in MarketingHome.tsx and the sticky bar's
// incentive line). A single cheap COUNT query either way, but every
// visitor hitting strivo.ai (including a burst of paid-ad traffic) fetches
// this independently, and the server this runs on has under 1GB of RAM
// (see the comment on typescript.ignoreBuildErrors in next.config.ts) --
// a 60s cache keeps a traffic spike from turning into a database query per
// page load for a number that only moves a few times an hour at most.
export const revalidate = 60;

export async function GET() {
  const stats = getFoundingMemberStats();
  return NextResponse.json(stats);
}
