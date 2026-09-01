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
} from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText } from "@/lib/ai";
import { searchMemoriesHybrid } from "@/lib/retrieval";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { isTrialExpired, getUserById } from "@/lib/repo/users";
import { createPendingCheckin, countOpenCheckins } from "@/lib/repo/pendingCheckins";

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
  return NextResponse.json({ memories });
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
  // the transcribe and chat-message endpoints.
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
  const title = parsed.data.title?.trim() || fallbackTitle(transcript);

  // Save the raw memory FIRST. Everything below is best-effort enrichment —
  // if any of it fails, the user's transcript is already safely persisted.
  const memory = createMemory({ userId, title, transcript, source });

  // One-time milestone callouts (see app/(app)/record/page.tsx's
  // savedMilestones popup) -- small, earned moments rather than a
  // repetitive streak counter. Each check below reads the user's PRIOR
  // memories only: this new row was already inserted by createMemory above
  // but doesn't have competencies/has_metric written yet (that happens in
  // updateMemoryMetadata further down), so countMemoriesByCompetency and
  // countMemoriesWithMetric right now still reflect everything OTHER than
  // this memory -- exactly what "is this the first" needs to check against.
  const milestones: string[] = [];

  // Best-effort: lets praise/reflectiveQuestion address the user by name
  // occasionally (see the nameHint comment in generateMemoryMetadata) --
  // a lookup miss here just means those fields fall back to no name.
  const firstName = getUserById(userId)?.first_name ?? null;
  const metadata = await generateMemoryMetadata(transcript, firstName);
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
      title: parsed.data.title?.trim() || metadata.title,
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
      metadata_status: "ready",
    });

    // "Proactive check-ins" -- see futureCheckin in generateMemoryMetadata
    // (lib/ai.ts) and app/api/checkins/run for the daily automation that
    // actually surfaces this later. Only fires on the small share of
    // memories that mention a specific upcoming event, and only if the user
    // isn't already sitting on several unresolved ones (see
    // MAX_OPEN_CHECKINS above).
    if (metadata.futureCheckin && countOpenCheckins(userId) < MAX_OPEN_CHECKINS) {
      createPendingCheckin({
        userId,
        sourceMemoryId: memory.id,
        question: metadata.futureCheckin.question,
        targetDate: metadata.futureCheckin.targetDate,
      });
    }
  } else {
    updateMemoryMetadata(userId, memory.id, { metadata_status: "failed" });
  }

  // Total-count milestone -- independent of whether AI metadata succeeded,
  // and independent of the loop above, since it's about the raw count, not
  // competencies. countMemories() already includes the row createMemory
  // just inserted, so checking against the checkpoint list directly tells
  // us whether THIS memory is the one that hit it.
  const totalCount = countMemories(userId);
  if (MEMORY_COUNT_MILESTONES.includes(totalCount)) {
    milestones.push(`${totalCount}th memory recorded`);
  }

  // Embedding input includes metadata.searchText (an English gloss of the
  // transcript, generated above) alongside the original title/transcript —
  // this is what lets a Hindi memory still surface for an English question
  // (or vice versa) in retrieval.ts, instead of relying purely on the
  // embedding model's native cross-lingual alignment. Falls back to just
  // title+transcript if metadata generation failed.
  const embedding = await embedText(`${title}\n${transcript}${metadata ? `\n${metadata.searchText}` : ""}`);
  if (embedding) {
    updateMemoryMetadata(userId, memory.id, { embedding: JSON.stringify(embedding) });
  }

  const final = getMemoryById(userId, memory.id);
  return NextResponse.json({ memory: final, aiMetadataGenerated: !!metadata, milestones });
}
