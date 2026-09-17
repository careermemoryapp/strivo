import {
  createMemory,
  updateMemoryMetadata,
  getMemoryById,
  countMemories,
  countMemoriesByCompetency,
  countMemoriesWithMetric,
  type Memory,
} from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText, type MemoryMetadata } from "@/lib/ai";
import { createPendingCheckin, countOpenCheckins } from "@/lib/repo/pendingCheckins";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { computeCareerSignalNotification } from "@/lib/repo/careerWrapped";
import { notifyUser } from "@/lib/notify";

// Shared by POST /api/memories/route.ts (one memory per request, the normal
// voice/type/single-file path) AND lib/storyBatchProcessor.ts (many
// memories from one split document, processed server-side in the
// background -- see that file's comment for why). Both need EXACTLY the
// same per-memory work -- persist the row, run the AI metadata/embedding
// calls, fire milestones/notifications -- so this lives here instead of
// being duplicated or imported route-file-to-route-file.

// Round-number checkpoints worth calling out on the memory-count milestone
// (see below) -- deliberately a short, sparse list rather than every 5th or
// 10th memory forever, so it stays a genuine one-time moment instead of
// becoming background noise.
const MEMORY_COUNT_MILESTONES = [10, 25, 50, 100, 250, 500];

// Soft cap on how many check-ins (see futureCheckin in generateMemoryMetadata,
// lib/ai.ts) can be open for one user at a time -- see countOpenCheckins in
// lib/repo/pendingCheckins.ts. Keeps a run of memories that each mention
// something upcoming from turning into a pile of nags that all land at once.
const MAX_OPEN_CHECKINS = 3;

// Everything that has to happen once a transcript has its AI metadata +
// embedding ready: persist the row, work out any one-time milestones, and
// fire the rare Career Wrapped signal notification. This is the exact same
// function whether it's the ONE memory a normal Record save creates, or one
// of up to 30 memories a split document's background batch creates -- see
// processStoryBatch in lib/storyBatchProcessor.ts.
export async function persistOneMemory(params: {
  userId: string;
  transcript: string;
  // Used for the initial insert (before metadata exists) and as the final
  // fallback if metadata generation fails.
  initialTitle: string;
  // An explicit title to use instead of the AI's own metadata.title, if
  // any -- set either from a real user-typed title, or (for one story out
  // of a split document -- see POST /api/memories/split and
  // lib/storyBatchProcessor.ts) that story's own short working title.
  // Wins over metadata.title when present.
  userProvidedTitle?: string;
  source: "voice" | "text" | "file";
  metadata: MemoryMetadata | null;
  embedding: number[] | null;
}): Promise<{ memory: Memory; milestones: string[] }> {
  const { userId, transcript, initialTitle, userProvidedTitle, source, metadata, embedding } = params;

  // Save the raw memory FIRST. Everything below is best-effort enrichment —
  // if any of it fails, the user's transcript is already safely persisted.
  const memory = createMemory({ userId, title: initialTitle, transcript, source });

  // One-time milestone callouts (see app/(app)/record/page.tsx's
  // savedMilestones popup) -- small, earned moments rather than a
  // repetitive streak counter. Each check below reads the user's PRIOR
  // memories only: this new row was already inserted above but doesn't
  // have competencies/has_metric written yet (that happens in
  // updateMemoryMetadata further down), so countMemoriesByCompetency and
  // countMemoriesWithMetric right now still reflect everything OTHER than
  // this memory -- exactly what "is this the first" needs to check against.
  const milestones: string[] = [];

  if (metadata) {
    const priorCompetencyCounts = countMemoriesByCompetency(userId);
    const priorMetricCount = countMemoriesWithMetric(userId);

    for (const c of metadata.competencies) {
      if (!priorCompetencyCounts[c]) {
        milestones.push(`First ${c} story`);
      }
    }
    if (metadata.hasMetric && priorMetricCount === 0) {
      milestones.push("First story backed by a real number");
    }

    updateMemoryMetadata(userId, memory.id, {
      title: userProvidedTitle?.trim() || metadata.title,
      summary: metadata.summary,
      key_points: JSON.stringify(metadata.keyPoints),
      category: metadata.category,
      tags: JSON.stringify(metadata.tags),
      search_text: metadata.searchText,
      // See COMPETENCY_OPTIONS in lib/ai.ts -- surfaced back to the user on
      // the Record success screen and shown on the memory detail page.
      competencies: JSON.stringify(metadata.competencies),
      // Short warm compliment paired with the competencies above -- shown
      // as a one-time popup on the Record success screen (see
      // savedPraise in app/(app)/record/page.tsx). Always null when
      // competencies is empty.
      praise: metadata.praise,
      // Ready-to-use resume bullet (always English) -- surfaced with a
      // copy button on the Record success popup and memory detail page.
      resume_line: metadata.resumeLine,
      has_metric: metadata.hasMetric ? 1 : 0,
      // Optional, skippable follow-up question shown on the Record success
      // screen (see savedReflectiveQuestion in record/page.tsx). Null when
      // the AI judged this memory too thin to follow up on.
      reflective_question: metadata.reflectiveQuestion,
      // See selfMinimized/selfMinimizedReason in generateMemoryMetadata
      // (lib/ai.ts) -- the flag behind the unprompted "someone's actually
      // proud of you" push (see listSelfMinimizedCandidates in
      // lib/repo/memories.ts and app/api/underplayed-win/run). Not shown
      // anywhere on this response; picked up later by that scheduled job.
      self_minimized: metadata.selfMinimized ? 1 : 0,
      self_minimized_reason: metadata.selfMinimizedReason,
      // Recurring proper nouns spotted in this memory (see entities in
      // generateMemoryMetadata, lib/ai.ts) -- aggregated across a user's
      // memories by listRecurringEntities and rendered into the chat system
      // prompt (see recurringEntitiesContext/buildSystemPrompt, lib/ai.ts)
      // as a lightweight personal glossary.
      entities: JSON.stringify(metadata.entities),
      // See mentionsSeniorStakeholder in generateMemoryMetadata (lib/ai.ts)
      // and the migration comment in lib/db.ts -- feeds the
      // "senior-stakeholder interactions" stat on Career Wrapped (see
      // lib/careerWrapped.ts). Stored as 0/1 here (never null) since this IS
      // a successful classification -- null is reserved for memories that
      // predate this field and haven't been backfilled yet.
      mentions_senior_stakeholder: metadata.mentionsSeniorStakeholder ? 1 : 0,
      metadata_status: "ready",
    });

    // "Proactive check-ins" -- see futureCheckin in generateMemoryMetadata
    // (lib/ai.ts) and app/api/checkins/run for the daily automation that
    // actually surfaces this later. Only fires on the small share of
    // memories that mention a specific upcoming event, and only if the user
    // isn't already sitting on several unresolved ones (see
    // MAX_OPEN_CHECKINS above). Re-reading countOpenCheckins fresh here
    // means this cap is enforced correctly across a whole batch of split
    // stories too, not just per document.
    if (metadata.futureCheckin && countOpenCheckins(userId) < MAX_OPEN_CHECKINS) {
      createPendingCheckin({
        userId,
        sourceMemoryId: memory.id,
        question: metadata.futureCheckin.question,
        targetDate: metadata.futureCheckin.targetDate,
      });
    }

    // Career Wrapped reward loop (spec section 9 / Phase 4) -- re-reads the
    // memory so computeCareerSignalNotification sees the competencies/
    // category/mentions_senior_stakeholder just written above, not the
    // pre-metadata placeholder. Best-effort and rare by design (see that
    // function's comment in lib/repo/careerWrapped.ts) -- most memories
    // trigger nothing here, which is intentional.
    if (isFeatureEnabled("career_wrapped")) {
      const classifiedMemory = getMemoryById(userId, memory.id);
      const signal = classifiedMemory ? computeCareerSignalNotification(userId, classifiedMemory) : null;
      if (signal) {
        await notifyUser(userId, {
          type: "career_wrapped_signal",
          title: signal.title,
          body: signal.body,
          route: "/career-wrapped",
        });
      }
    }
  } else {
    updateMemoryMetadata(userId, memory.id, { metadata_status: "failed" });
  }

  // Total-count milestone -- independent of whether AI metadata succeeded,
  // and independent of the competency loop above, since it's about the raw
  // count, not competencies. countMemories() already includes the row
  // createMemory just inserted, so checking against the checkpoint list
  // directly tells us whether THIS memory is the one that hit it -- and
  // since every memory in a split batch is persisted sequentially through
  // this same function, a batch that crosses a checkpoint mid-way still
  // fires it exactly once, on the right story.
  const totalCount = countMemories(userId);
  if (MEMORY_COUNT_MILESTONES.includes(totalCount)) {
    milestones.push(`${totalCount}th memory recorded`);
  }

  if (embedding) {
    updateMemoryMetadata(userId, memory.id, { embedding: JSON.stringify(embedding) });
  }

  const final = getMemoryById(userId, memory.id)!;
  return { memory: final, milestones };
}

// The AI generation half of creating one memory -- metadata + embedding.
export async function generateMetadataAndEmbedding(
  transcript: string,
  title: string,
  firstName: string | null,
  existingProjectNames: string[]
): Promise<{ metadata: MemoryMetadata | null; embedding: number[] | null }> {
  const metadata = await generateMemoryMetadata(transcript, firstName, new Date(), existingProjectNames);
  // Embedding input includes metadata.searchText (an English gloss of the
  // transcript, generated above) alongside the original title/transcript —
  // this is what lets a Hindi memory still surface for an English question
  // (or vice versa) in retrieval.ts, instead of relying purely on the
  // embedding model's native cross-lingual alignment. Falls back to just
  // title+transcript if metadata generation failed.
  const embedding = await embedText(`${title}\n${transcript}${metadata ? `\n${metadata.searchText}` : ""}`);
  return { metadata, embedding };
}

export function fallbackTitle(transcript: string): string {
  const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length < transcript.trim().length ? `${words}…` : words || "Untitled memory";
}
