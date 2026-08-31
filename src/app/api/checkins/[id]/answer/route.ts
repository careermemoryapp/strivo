import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getPendingCheckinById, markCheckinAnswered } from "@/lib/repo/pendingCheckins";
import { getMemoryById, createMemory, updateMemoryMetadata } from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText } from "@/lib/ai";
import { getUserById } from "@/lib/repo/users";
import { rateLimitOrResponse } from "@/lib/rateLimit";

const schema = z.object({ answer: z.string().trim().min(1).max(4000) });

// Answering a proactive check-in (see app/api/checkins/run and futureCheckin
// in lib/ai.ts) creates a BRAND NEW memory rather than editing the original
// one that mentioned the upcoming event -- unlike the reflective-question
// flow (see /api/memories/[id]/reflect), which folds an answer into the SAME
// memory. The reasoning is different here: a check-in answer is genuinely a
// new moment happening days or weeks later ("the interview happened, here's
// how it went"), not an elaboration on the original note. The two are linked
// only via pending_checkins.resolved_memory_id, not by rewriting history on
// the original memory.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const checkin = getPendingCheckinById(userId, id);
  if (!checkin) return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
  if (checkin.status !== "active" && checkin.status !== "pending") {
    return NextResponse.json({ error: "This check-in has already been resolved." }, { status: 400 });
  }

  // Same cost class as creating a memory the normal way (metadata + embed
  // calls) -- same per-user cap as memory-create in ../../memories/route.ts.
  const limited = rateLimitOrResponse(`checkin-answer:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const answer = parsed.data.answer;

  // The question is baked into the new memory's own transcript (clearly
  // labeled, same "honest about what was added" principle as the reflective-
  // question flow) so the new memory reads sensibly on its own even without
  // pulling up the original -- it doesn't just say "here's how it went"
  // with no context for what "it" was.
  const sourceMemory = getMemoryById(userId, checkin.source_memory_id);
  const title = sourceMemory ? `Follow-up: ${sourceMemory.title}` : "Follow-up";
  const transcript = `${checkin.question}\n\n${answer}`;

  const memory = createMemory({ userId, title, transcript, source: "text" });

  const firstName = getUserById(userId)?.first_name ?? null;
  const metadata = await generateMemoryMetadata(transcript, firstName);
  if (metadata) {
    updateMemoryMetadata(userId, memory.id, {
      title: metadata.title,
      summary: metadata.summary,
      key_points: JSON.stringify(metadata.keyPoints),
      category: metadata.category,
      tags: JSON.stringify(metadata.tags),
      search_text: metadata.searchText,
      competencies: JSON.stringify(metadata.competencies),
      praise: metadata.praise,
      resume_line: metadata.resumeLine,
      has_metric: metadata.hasMetric ? 1 : 0,
      reflective_question: metadata.reflectiveQuestion,
      metadata_status: "ready",
    });
  } else {
    updateMemoryMetadata(userId, memory.id, { metadata_status: "failed" });
  }

  const embedding = await embedText(`${title}\n${transcript}${metadata ? `\n${metadata.searchText}` : ""}`);
  if (embedding) {
    updateMemoryMetadata(userId, memory.id, { embedding: JSON.stringify(embedding) });
  }

  markCheckinAnswered(userId, checkin.id, memory.id);

  const final = getMemoryById(userId, memory.id);
  return NextResponse.json({ memory: final });
}
