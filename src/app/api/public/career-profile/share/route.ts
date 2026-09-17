import { NextResponse } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { CAREER_PROFILE_QUIZ_ORDER, type CareerProfileQuizId } from "@/lib/careerProfile";
import { buildPublicCareerProfileCardData, createPublicCareerProfileShare } from "@/lib/repo/careerProfile";

// Same convention as APP_ORIGIN in lib/email.ts / app/api/career-profile/share/route.ts.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://strivo.ai";

// Public, unauthenticated twin of app/api/career-profile/share/route.ts --
// for the marketing-site /quiz flow, where a visitor finishes all 5 Career
// Profile quizzes without an account. Unlike the in-app route, there's no
// server-stored per-user result to assemble a card from -- the client
// (PublicQuizClient.tsx, via localStorage) sends back the {quizId,
// resultKey} pairs from the 5 /api/public/career-profile/[quizId]/score
// calls it already made. Those pairs are still never trusted at face
// value: buildPublicCareerProfileCardData recomputes every row's title/
// description from the real archetype data and returns null on anything
// that doesn't check out (wrong quiz set, unknown result key), so a
// tampered request can only fail closed, never fabricate a card.
const bodySchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  results: z
    .array(
      z.object({
        quizId: z.string(),
        resultKey: z.string(),
      })
    )
    .length(CAREER_PROFILE_QUIZ_ORDER.length),
});

export async function POST(req: Request) {
  const limited = rateLimitOrResponse(`public-career-profile-share:${requestIp(req)}`, 10, 60 * 1000);
  if (limited) return limited;

  if (!isFeatureEnabled("career_profile")) {
    return NextResponse.json({ error: "Career Profile is temporarily unavailable." }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const validQuizIds = new Set<string>(CAREER_PROFILE_QUIZ_ORDER as string[]);
  for (const r of parsed.data.results) {
    if (!validQuizIds.has(r.quizId)) {
      return NextResponse.json({ error: "Unknown quiz" }, { status: 400 });
    }
  }

  const cardData = buildPublicCareerProfileCardData(
    parsed.data.displayName?.length ? parsed.data.displayName : null,
    parsed.data.results as { quizId: CareerProfileQuizId; resultKey: string }[]
  );
  if (!cardData) {
    return NextResponse.json({ error: "Complete all 5 discoveries to generate your Career Profile Card." }, { status: 400 });
  }

  const share = createPublicCareerProfileShare(cardData);

  return NextResponse.json({
    shareId: share.id,
    url: `${APP_ORIGIN}/cp/${share.id}`,
    cardData,
  });
}
