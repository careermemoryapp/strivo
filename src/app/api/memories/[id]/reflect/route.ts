import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById, updateMemoryMetadata } from "@/lib/repo/memories";
import { embedText } from "@/lib/ai";
import { rateLimitOrResponse } from "@/lib/rateLimit";

const schema = z.object({ answer: z.string().trim().min(1).max(2000) });

// Records the user's answer to the optional reflective follow-up question
// generated when the memory was created (see reflectiveQuestion in
// generateMemoryMetadata, lib/ai.ts). The point isn't just to store the
// answer as a side note -- it's folded straight into the transcript, so a
// thin one-line memory that gets a thoughtful answer becomes genuinely
// richer evidence for the chat AI and retrieval, not just a decorated
// record. Re-embeds afterward so that enrichment actually improves future
// retrieval instead of only being visible if someone reopens this memory.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Triggers a real embedding call, same cost class as creating a memory —
  // same per-user cap as memory-create in ../route.ts.
  const limited = rateLimitOrResponse(`memory-reflect:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  const memory = getMemoryById(userId, id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  if (!memory.reflective_question) {
    return NextResponse.json({ error: "This memory doesn't have a reflection question to answer." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const answer = parsed.data.answer;

  // Appended as a clearly-labeled addendum rather than silently merged into
  // the original text, so the transcript still reads honestly as "what was
  // originally recorded" plus "what was added later" if the user (or the
  // chat AI) looks closely -- same principle as never fabricating content.
  const enrichedTranscript = `${memory.transcript}\n\nReflection -- ${memory.reflective_question}\n${answer}`;

  // Best-effort: if the embedding call fails, we still save the enriched
  // transcript and answer -- retrieval just falls back to keyword matching
  // for this memory until the next successful embed, same graceful
  // degradation as memory creation.
  const embedding = await embedText(
    `${memory.title}\n${enrichedTranscript}${memory.search_text ? `\n${memory.search_text}` : ""}`
  );

  const updated = updateMemoryMetadata(userId, id, {
    transcript: enrichedTranscript,
    reflective_answer: answer,
    ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
  });

  return NextResponse.json({ memory: updated });
}
