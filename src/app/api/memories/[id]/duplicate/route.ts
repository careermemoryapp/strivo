import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById, createMemory, updateMemoryMetadata } from "@/lib/repo/memories";

// Duplicates a memory instantly by copying its already-generated metadata
// (no new AI calls needed — the content is identical).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const original = getMemoryById(userId, id);
  if (!original) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const copy = createMemory({
    userId,
    title: `${original.title} (Copy)`,
    transcript: original.transcript,
    source: original.source,
  });
  updateMemoryMetadata(userId, copy.id, {
    summary: original.summary ?? undefined,
    key_points: original.key_points ?? undefined,
    category: original.category ?? undefined,
    tags: original.tags ?? undefined,
    embedding: original.embedding ?? undefined,
    metadata_status: original.metadata_status,
  });

  return NextResponse.json({ memory: getMemoryById(userId, copy.id) });
}
