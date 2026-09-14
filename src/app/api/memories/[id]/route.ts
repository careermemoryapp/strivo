import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById, deleteMemory, updateMemoryMetadata } from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText } from "@/lib/ai";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { getUserById } from "@/lib/repo/users";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const memory = getMemoryById(userId, id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ memory });
}

const patchSchema = z.object({
  transcript: z.string().trim().min(1, "Memory can't be empty"),
});

// Edits the transcript (from Memory Detail's "Edit" action) and regenerates
// AI metadata to match, the same way creation does. The edited transcript
// is saved first regardless of what happens with the AI call.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same two OpenAI calls per request as creation — shares that bucket so
  // create+edit spend is capped together per user, not doubled.
  const limited = rateLimitOrResponse(`memory-create:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  // Same defense-in-depth as memories POST -- shares the -ip bucket too,
  // so create+edit spend from one network is capped together.
  const limitedByIp = rateLimitOrResponse(`memory-create-ip:${requestIp(req)}`, 300, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const { id } = await params;
  const existing = getMemoryById(userId, id);
  if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  updateMemoryMetadata(userId, id, { transcript: parsed.data.transcript, metadata_status: "pending" });

  const firstName = getUserById(userId)?.first_name ?? null;
  const metadata = await generateMemoryMetadata(parsed.data.transcript, firstName);
  if (metadata) {
    updateMemoryMetadata(userId, id, {
      summary: metadata.summary,
      key_points: JSON.stringify(metadata.keyPoints),
      category: metadata.category,
      tags: JSON.stringify(metadata.tags),
      search_text: metadata.searchText,
      metadata_status: "ready",
    });
  } else {
    updateMemoryMetadata(userId, id, { metadata_status: "failed" });
  }

  // Same cross-language fix as the create route: fold the English
  // searchText gloss into what gets embedded so an edited memory stays
  // findable from a question in a different language.
  const embedding = await embedText(
    `${existing.title}\n${parsed.data.transcript}${metadata ? `\n${metadata.searchText}` : ""}`
  );
  if (embedding) {
    updateMemoryMetadata(userId, id, { embedding: JSON.stringify(embedding) });
  }

  return NextResponse.json({ memory: getMemoryById(userId, id), aiMetadataGenerated: !!metadata });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const memory = getMemoryById(userId, id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  deleteMemory(userId, id);
  // MemoriesListClient removes the row from its own local state immediately
  // (see the comment on its onDeleted prop / MemoryCard's handleDelete) --
  // that's still correct and stays as-is. What that local update can't fix
  // is Next's Router Cache: /memories and /home were both server-rendered
  // with this memory still in the list, and navigating away and back can
  // serve that cached render instead of re-fetching, which is exactly the
  // "deleted item comes back until I switch screens" bug that got reported.
  // revalidatePath marks those cached renders stale server-side so the next
  // visit gets a fresh one, without reintroducing the client-side GET race
  // that caused the earlier, different reappearing bug this file's comments
  // already guard against.
  revalidatePath("/memories");
  revalidatePath("/home");
  return NextResponse.json({ ok: true });
}
