import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isAdminAuthed, checkCategoryInsightSecret } from "@/lib/adminAuth";
import { listAllUserIds, setLastCategoryInsightAt, getUserById } from "@/lib/repo/users";
import { detectCategoryImbalance, isDueForCategoryInsight } from "@/lib/categoryInsight";
import { notifyUser } from "@/lib/notify";

// Called weekly by an external automation (same shape as
// checkins/weekly-recap/growth-narrative/quarterly-benchmark/underplayed-win/
// engagement-nudge -- see CATEGORY_INSIGHT_SECRET's comment in
// lib/adminAuth.ts), or manually from an admin session. The "category-
// imbalance insight" feature: if someone's logged twenty Work memories and
// zero Personal or Learning ones, that's a real, individual pattern worth
// reflecting back (see detectCategoryImbalance, lib/categoryInsight.ts)
// rather than treating every user's memory mix as equally healthy. Runs
// against every user (detectCategoryImbalance itself cheaply short-circuits
// anyone below the minimum memory count via one indexed COUNT query), same
// "unbounded, fine at today's scale" reasoning as every other automation
// route in this app.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkCategoryInsightSecret(req.headers.get("x-category-insight-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const userIds = listAllUserIds();

  let considered = 0;
  let flagged = 0;
  let pushed = 0;

  for (const userId of userIds) {
    considered++;
    const user = getUserById(userId);
    if (!isDueForCategoryInsight(user?.last_category_insight_at ?? null, now)) continue;

    const insight = detectCategoryImbalance(userId);
    if (!insight) continue;

    flagged++;
    try {
      const { pushed: didPush } = await notifyUser(userId, {
        type: "category_insight",
        title: insight.title,
        body: insight.body,
        route: "/record",
      });
      if (didPush) pushed++;
      setLastCategoryInsightAt(userId, now.toISOString());
    } catch (e) {
      console.error("Category insight failed for user:", userId, e);
      Sentry.captureException(e);
    }
  }

  return NextResponse.json({ ok: true, considered, flagged, pushed });
}
