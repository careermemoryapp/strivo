import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { classifyJobPostings, aiConfigured } from "@/lib/ai";
import { mapWithConcurrency } from "@/lib/applyLinkResolver";
import { listUnclassifiedActiveJobPostings, countUnclassifiedActiveJobPostings, setJobClassification } from "@/lib/repo/jobPostings";

// One-time (repeat-until-done) admin lever for clearing the industry/
// seniority classification backlog -- added 2026-10-03 after a direct
// founder report ("out of 14,000 jobs, how am I only fit for 5?") traced to
// this exact backlog: countUnclassifiedActiveJobPostings() showed 10,387 of
// 11,006 active postings (94%) had never been classified, which starves
// lib/opportunities.ts's matchCandidates of the industry signal it needs to
// surface genuinely on-industry postings into the pre-LLM top-80 sample --
// see that file's INDUSTRY_MATCH_BONUS and this route's own sibling,
// opportunities-status, which first surfaced the real number.
//
// WHY this couldn't just catch up on its own: classification already runs
// inside EVERY refresh-pool/run chunk (see that route's own classification
// block), but bounded to CLASSIFY_BATCH_SIZE * MAX_CLASSIFY_BATCHES_PER_RUN
// = 150 postings per invocation, and refresh-pool/run itself only fires on
// its crontab (10 days/month, see that file's top comment) -- roughly 1,500
// classifications/month against a backlog in the thousands, made worse by
// the mass-deletion-then-rediscovery churn from the dead-listing bug this
// same session fixed. At that rate the backlog would take many months to
// clear, if it ever did (new unclassified postings keep arriving from every
// refresh too). Classification is PURE OpenAI cost with no relationship to
// Adzuna's call budget (see classifyJobPostings' own comment in lib/ai.ts)
// -- there's no reason it has to share refresh-pool/run's conservative,
// Adzuna-budget-driven pacing. This route exists so an admin can burn down
// the existing backlog in one sitting (same "click repeatedly until
// remaining hits 0" shape as "Backfill existing links"), independent of
// the refresh-pool cadence -- refresh-pool/run's own smaller per-chunk
// classification pass stays as-is, so ordinary new postings keep getting
// classified between admin runs of this too.
//
// Bounded per call (not unbounded) for the same reason every other
// repeat-until-done admin route in this file is: one HTTP request
// shouldn't risk a request-timeout trying to process the whole backlog at
// once. Larger than opportunities-backfill-links' 150, since each unit of
// work here is a single OpenAI call shared across 25 postings (see
// MAX_CLASSIFY_BATCH in lib/ai.ts) rather than one outbound fetch per
// posting, so the real cost per click is lower.
const MAX_CLASSIFY_PER_RUN = 300;
const CLASSIFY_BATCH_SIZE = 25;
const CLASSIFY_CONCURRENCY = 4; // concurrent OpenAI calls -- modest, same "don't hammer a third-party API" reasoning as every other concurrency cap in this codebase

export async function POST() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY isn't configured -- classification can't run without it." },
      { status: 400 }
    );
  }

  const toClassify = listUnclassifiedActiveJobPostings(MAX_CLASSIFY_PER_RUN);
  const batches: typeof toClassify[] = [];
  for (let i = 0; i < toClassify.length; i += CLASSIFY_BATCH_SIZE) {
    batches.push(toClassify.slice(i, i + CLASSIFY_BATCH_SIZE));
  }

  let classifiedCount = 0;
  await mapWithConcurrency(batches, CLASSIFY_CONCURRENCY, async (batch) => {
    const classified = await classifyJobPostings(
      batch.map((job) => ({ id: job.id, title: job.title, company: job.company, snippet: job.snippet }))
    );
    for (const job of batch) {
      const result = classified.get(job.id);
      // Still written even when this call came back empty for this job (a
      // transient API failure, not a missing key -- see the aiConfigured()
      // gate above) -- see classified_at's own comment in lib/db.ts for why
      // a genuinely-attempted-but-inconclusive posting still has to be
      // marked done rather than retried forever.
      setJobClassification(job.id, result?.industry ?? null, result?.seniority ?? null);
      classifiedCount++;
    }
  });

  return NextResponse.json({
    batchSize: toClassify.length,
    classifiedCount,
    remaining: countUnclassifiedActiveJobPostings(),
  });
}
