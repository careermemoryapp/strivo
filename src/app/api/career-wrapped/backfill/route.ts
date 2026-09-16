import { NextResponse } from "next/server";
import { isAdminAuthed, checkCareerWrappedSecret } from "@/lib/adminAuth";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { listUserIdsWithMemoriesSince, listMemoriesMissingSeniorStakeholderFlag, updateMemoryMetadata } from "@/lib/repo/memories";
import { classifySeniorStakeholder } from "@/lib/ai";

// How many un-classified memories to process per user, per run -- small and
// cheap on purpose (see CANDIDATE_BATCH_SIZE in underplayed-win/run for the
// same reasoning). A user with a large backlog of pre-Career-Wrapped
// memories just gets caught up gradually over a few runs rather than one
// request doing an unbounded number of OpenAI calls.
const BATCH_SIZE_PER_USER = 20;

// Safely backfills mentions_senior_stakeholder (see the migration comment on
// memories in lib/db.ts) for memories that predate that field -- called
// manually from an admin session, or on a periodic schedule (recommended:
// daily, until an /api/admin/career-wrapped-backfill-status-style check
// shows the backlog is cleared, then it can stop) via the same
// secret-header pattern as every other automation in this app.
// listMemoriesMissingSeniorStakeholderFlag only ever selects memories where
// mentions_senior_stakeholder IS NULL, so a memory already classified (0 or
// 1) is never touched twice, and nothing about the memory's own content
// (transcript, competencies, etc.) is rewritten -- this only ever fills in
// the one new column.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkCareerWrappedSecret(req.headers.get("x-career-wrapped-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("career_wrapped")) {
    return NextResponse.json({ ok: true, skipped: "career_wrapped feature flag is off" });
  }

  const userIds = listUserIdsWithMemoriesSince(new Date(0).toISOString());

  let usersTouched = 0;
  let memoriesClassified = 0;
  let memoriesFailed = 0;

  for (const userId of userIds) {
    const candidates = listMemoriesMissingSeniorStakeholderFlag(userId, BATCH_SIZE_PER_USER);
    if (candidates.length === 0) continue;
    usersTouched++;

    for (const memory of candidates) {
      const result = await classifySeniorStakeholder(memory.transcript);
      if (result === null) {
        // Leave it NULL -- still "unclassified," safely retryable on the
        // next run rather than recording a guess.
        memoriesFailed++;
        continue;
      }
      updateMemoryMetadata(userId, memory.id, { mentions_senior_stakeholder: result ? 1 : 0 });
      memoriesClassified++;
    }
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: userIds.length,
    usersTouched,
    memoriesClassified,
    memoriesFailed,
  });
}
