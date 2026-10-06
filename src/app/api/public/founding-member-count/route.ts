import { NextResponse } from "next/server";
import { getFoundingMemberStats } from "@/lib/repo/foundingMember";

// Public, unauthenticated, no-PII read of real signup counts -- powers the
// live "N founding members have joined" counter on the marketing homepage
// (see FoundingMemberCounter in MarketingHome.tsx and the sticky bar's
// incentive line).
//
// `force-dynamic` (not `revalidate = 60`, which this used to be) -- direct
// founder report 2026-10-06: "somebody just downloaded and the number is
// still the same... it is static." A 60s ISR cache should only ever be
// that stale, never permanently frozen, but the whole point of this number
// is that it's real and live, not "close enough" -- the entire Founding
// Member pitch (on the homepage AND in the badge email) rests on visitors
// trusting it's not a mockup. The query behind it is one cheap COUNT on a
// users table that's nowhere near large enough yet for per-request cost to
// matter, so there's no real tradeoff being made by dropping the cache --
// see getFoundingMemberStats' own comment for why this one query is cheap.
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getFoundingMemberStats();
  // Explicit header, not just relying on `force-dynamic` above -- belt and
  // suspenders against any CDN/reverse-proxy in front of this (nginx, etc.)
  // applying its own caching defaults that `dynamic = "force-dynamic"`
  // alone wouldn't override, since that setting only controls Next's OWN
  // server-side caching, not what an intermediary does with the response.
  return NextResponse.json(stats, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
