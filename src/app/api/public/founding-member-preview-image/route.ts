import { ImageResponse } from "next/og";
import { getFoundingMemberStats } from "@/lib/repo/foundingMember";
import { buildFoundingMemberCardElement, FOUNDING_MEMBER_CARD_SIZE } from "@/lib/founderCardImage";

// Public, unauthenticated preview of the Founding Member card a visitor
// would actually get if they signed up right now -- shown on the
// marketing homepage (see FoundingMemberShowcase in MarketingHome.tsx) so
// "become a founding member" is something a visitor can SEE before they
// ever install, not just a line of text to take on faith. The number is
// real and live (stats.count + 1, the exact number createUser() would
// hand out to the very next signup -- see getFoundingMemberStats' own
// comment on why COUNT, not MAX, is the right read for "how many have
// joined"), never a mocked-up placeholder, so this stays honest even as
// it updates throughout the day.
//
// "You" stands in for a real first name (which obviously doesn't exist
// yet for someone who hasn't signed up) -- same card layout and rendering
// function as every other Founding Member card on the site
// (buildFoundingMemberCardElement), so what a visitor sees here is
// exactly what they'd actually receive, not a separate "marketing version"
// that could drift from the real thing.
//
// `force-dynamic` (not `revalidate = 60`) -- same fix and same reasoning
// as founding-member-count/route.ts: this image's whole job is to show the
// REAL next number right now, so it can't be allowed to lag behind an
// actual signup even briefly.
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getFoundingMemberStats();
  const nextNumber = Math.min(stats.count + 1, stats.cap);
  return new ImageResponse(
    buildFoundingMemberCardElement({
      firstName: "You",
      memberNumber: nextNumber,
      cap: stats.cap,
      joinedDateLabel: "today",
    }),
    {
      ...FOUNDING_MEMBER_CARD_SIZE,
      // Same belt-and-suspenders reasoning as founding-member-count/route.ts
      // -- explicit header rather than trusting `dynamic = "force-dynamic"`
      // alone to stop an intermediary (CDN/reverse proxy) from caching this.
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
