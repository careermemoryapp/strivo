import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { createMemory, listMemories, updateMemoryMetadata, getMemoryById } from "@/lib/repo/memories";
import { generateMemoryMetadata, embedText } from "@/lib/ai";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const sort = (searchParams.get("sort") as "newest" | "oldest" | null) ?? "newest";

  const memories = listMemories(userId, { search, sort });
  return NextResponse.json({ memories });
}

const createSchema = z.object({
  transcript: z.string().trim().min(1, "Memory can't be empty"),
  title: z.string().trim().max(120).optional(),
  source: z.enum(["voice", "text"]).default("text"),
});

function fallbackTitle(transcript: string): string {
  const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length < transcript.trim().length ? `${words}…` : words || "Untitled memory";
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const metadata = await generateMemoryMetadata(transcript);
  if (metadata) {
    updateMemoryMetadata(userId, memory.id, {
      title: parsed.data.title?.trim() || metadata.title,
      summary: metadata.summary,
      key_points: JSON.stringify(metadata.keyPoints),
      category: metadata.category,
      tags: JSON.stringify(metadata.tags),
      metadata_status: "ready",
    });
  } else {
    updateMemoryMetadata(userId, memory.id, { metadata_status: "failed" });
  }

  const embedding = await embedText(`${title}\n${transcript}`);
  if (embedding) {
    updateMemoryMetadata(userId, memory.id, { embedding: JSON.stringify(embedding) });
  }

  const final = getMemoryById(userId, memory.id);
  return NextResponse.json({ memory: final, aiMetadataGenerated: !!metadata });
}
