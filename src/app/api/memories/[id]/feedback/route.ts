import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById, updateMemoryMetadata } from "@/lib/repo/memories";

const schema = z.object({ feedback: z.enum(["yes", "no"]) });

// Records whether the user found the AI summary helpful ("Was this summary
// helpful?" on Memory Detail). Simple, real, and stored — not decorative.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getMemoryById(userId, id)) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const memory = updateMemoryMetadata(userId, id, { summary_feedback: parsed.data.feedback });
  return NextResponse.json({ memory });
}
