import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import {
  createMemory,
  updateMemoryMetadata,
  getMemoryById,
  countMemories,
  countMemoriesByCompetency,
  countMemoriesWithMetric,
  type Memory,
} from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText, splitDocumentIntoStories, type MemoryMetadata, type DocumentStorySegment } from "@/lib/ai";
import { searchMemoriesHybrid } from "@/lib/retrieval";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { isTrialExpired, getUserById } from "@/lib/repo/users";
import { createPendingCheckin, countOpenCheckins } from "@/lib/repo/pendingCheckins";
import { listProjects, withProjectNames } from "@/lib/repo/projects";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { computeCareerSignalNotification } from "@/lib/repo/careerWrapped";
import { notifyUser } from "@/lib/notify";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const sort = (searchParams.get("sort") as "newest" | "oldest" | null) ?? "newest";
  const category = searchParams.get("category") ?? undefined;
  const competency = searchParams.get("competency") ?? undefined;

  // searchMemoriesHybrid falls straight through to the plain keyword
  // listMemories query (no extra AI call) when `search` is empty -- see its
  // comment in lib/retrieval.ts -- so this is a no-cost no-op for the
  // default browse/filter-only case.
  const memories = await searchMemoriesHybrid(userId, { search, sort, category, competency });
  // Attaches each memory's project NAME so MemoryCard can show a project
  // tag -- see withProjectNames' comment in lib/repo/projects.ts.
  return NextResponse.json({ memories: withProjectNames(userId, memories) });
}

const createSchema = z.object({
  transcript: z.string().trim().min(1, "Memory can't be empty"),
  title: z.string().trim().max(120).optional(),
  source: z.enum(["voice", "text", "file"]).default("text"),
});

function fallbackTitle(transcript: string): string {
  const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length < transcript.trim().length ? `${words}…` : words || "Untitled memory";
}

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

// Below this many characters, a file upload essentially never turns out to
// be a genuine multi-story collection (a one-page job description, a
// certificate, a short cover letter) -- skip the extra splitDocumentIntoStories
// AI call entirely for those, rather than spending latency/cost checking
// something that was never going to split. Long, story-rich documents (the
// 35-page career-history case this was built for) clear this easily.
const MIN_CHARS_FOR_SPLIT_CHECK = 3000;

// Everything that has to happen once a transcript (either the whole
// upload, or one story split out of it) has its AI metadata + embedding
// ready: persist the row, work out any one-time milestones, and fire the
// rare Career Wrapped signal notification. Factored out so the single-
// memory path and the multi-story split path (see splitDocumentIntoStories
// above, wired up in POST below) share EXACTLY the same logic instead of
// two copies that could quietly drift apart -- milestones and check-in caps
// in particular depend on reading fresh DB state, which only works right if
// every created memory (whether one or twenty) goes through this same
// sequential path.
async function persistOneMemory(params: {
  userId: string;
  transcript: string;
  // Used for the initial insert (before metadata exists) and as the final
  // fallback if metadata generation fails. For the single-transcript path
  // this is the user-provided title or fallbackTitle(transcript); for a
  // split story it's that story's own short working title from
  // splitDocumentIntoStories.
  initialTitle: string;
  // An explicit user-typed title, if any -- only ever set on the single-
  // transcript path (there's no per-story title input for a split
  // document). Wins over the AI's own metadata.title when present, same as
  // this route always behaved before the split path existed.
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

// The AI generation half of creating one memory -- metadata + embedding,
// both pure network calls with no DB side effects, so this is safe to run
// concurrently across every story in a split batch (see Promise.all in
// POST below) instead of the ~2x-N sequential round trips that would
// otherwise add up to a real risk of the request timing out on a genuinely
// story-rich document. persistOneMemory above is what actually has to run
// in order, one at a time.
async function generateMetadataAndEmbedding(
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

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Backstop for the (app)/layout.tsx page-level redirect, which only
  // fires on a fresh navigation -- a tab already open when the trial ended
  // could otherwise keep creating memories via client-side fetch forever.
  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  // Every memory triggers two OpenAI calls (metadata generation + embedding)
  // — cap per-user spend from a runaway client/script, same reasoning as
  // the transcribe and chat-message endpoints. A split document spends more
  // than one "memory" of budget in a single request (one call per story
  // plus the split call itself), which is intentional -- it's still one
  // deliberate user action, and the story cap (30, see
  // splitDocumentIntoStories in lib/ai.ts) bounds how far that can go.
  const limited = rateLimitOrResponse(`memory-create:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  // Defense-in-depth on top of the per-user limit above: someone could
  // otherwise dodge it by creating several accounts from the same
  // network. Generous enough that a normal shared connection (a family,
  // a small office) never gets near it in real usage.
  const limitedByIp = rateLimitOrResponse(`memory-create-ip:${requestIp(req)}`, 300, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { transcript, source } = parsed.data;

  // Best-effort: lets praise/reflectiveQuestion address the user by name
  // occasionally (see the nameHint comment in generateMemoryMetadata) --
  // a lookup miss here just means those fields fall back to no name.
  const firstName = getUserById(userId)?.first_name ?? null;
  const existingProjects = listProjects(userId);
  const existingProjectNames = existingProjects.map((p) => p.name);

  // Long file uploads only -- see MIN_CHARS_FOR_SPLIT_CHECK's comment.
  // Voice/type stay single-memory unconditionally: those already carry the
  // app's "one thought at a time" framing (see the Tips row on Record), so
  // there's no reason to spend an extra AI call checking something that's
  // essentially never going to be a bundled document.
  let storySegments: DocumentStorySegment[] | null = null;
  if (source === "file" && transcript.length >= MIN_CHARS_FOR_SPLIT_CHECK) {
    storySegments = await splitDocumentIntoStories(transcript);
  }

  if (storySegments && storySegments.length >= 2) {
    // Multi-story path: this one uploaded document is actually a collection
    // of separate stories (the 35-page career-history case) -- each one
    // becomes its own real memory, with its own competencies/category/etc.,
    // instead of a single blended memory that badly under-counts what's
    // actually in the document.
    const generated = await Promise.all(
      storySegments.map((story) => generateMetadataAndEmbedding(story.content, story.title, firstName, existingProjectNames))
    );

    const memories: Memory[] = [];
    const milestones: string[] = [];
    let anyMetadataGenerated = false;

    // Sequential on purpose (unlike the Promise.all above) -- milestones,
    // the check-in cap, and the total-count checkpoint all depend on
    // reading fresh DB state after each prior story is fully persisted;
    // see persistOneMemory's own comments for why each of those needs that.
    for (let i = 0; i < storySegments.length; i++) {
      const story = storySegments[i];
      const { metadata, embedding } = generated[i];
      if (metadata) anyMetadataGenerated = true;
      const result = await persistOneMemory({
        userId,
        transcript: story.content,
        initialTitle: story.title,
        source: "file",
        metadata,
        embedding,
      });
      memories.push(result.memory);
      milestones.push(...result.milestones);
    }

    return NextResponse.json({
      memories,
      aiMetadataGenerated: anyMetadataGenerated,
      milestones,
      splitFromDocument: true,
    });
  }

  // Single-memory path -- unchanged behavior for voice, typed text, short
  // file uploads, and any file upload the split step above decided (or
  // failed to decide, on an AI error) wasn't really a multi-story
  // collection.
  const title = parsed.data.title?.trim() || fallbackTitle(transcript);
  const { metadata, embedding } = await generateMetadataAndEmbedding(transcript, title, firstName, existingProjectNames);

  // Resolved here, once, into an actual project id the client can act on
  // directly -- see suggestedExistingProjectName/suggestedNewProjectName on
  // generateMemoryMetadata's return value (lib/ai.ts). Never applied to the
  // memory automatically (project_id stays null until the user explicitly
  // confirms via PATCH /api/memories/[id]/project -- see ProjectAssigner.tsx).
  const projectSuggestion = metadata
    ? {
        existingId: metadata.suggestedExistingProjectName
          ? (existingProjects.find((p) => p.name === metadata.suggestedExistingProjectName)?.id ?? null)
          : null,
        existingName: metadata.suggestedExistingProjectName,
        newName: metadata.suggestedNewProjectName,
      }
    : { existingId: null, existingName: null, newName: null };

  const { memory: final, milestones } = await persistOneMemory({
    userId,
    transcript,
    initialTitle: title,
    userProvidedTitle: parsed.data.title,
    source,
    metadata,
    embedding,
  });

  return NextResponse.json({ memory: final, aiMetadataGenerated: !!metadata, milestones, projectSuggestion });
}
