import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { listMessages } from "@/lib/repo/messages";
import { getMemoryById } from "@/lib/repo/memories";
import { safeJsonParse } from "@/lib/utils";

// Returns the union of memories that were actually retrieved and used
// across this conversation's AI replies (most recently used first).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chat = getChatById(userId, id);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const messages = listMessages(userId, id).filter((m) => m.sender === "ai").reverse();
  const seen = new Set<string>();
  const memoryIds: string[] = [];
  for (const m of messages) {
    const ids = safeJsonParse<string[]>(m.retrieved_memories, []);
    for (const mid of ids) {
      if (!seen.has(mid)) {
        seen.add(mid);
        memoryIds.push(mid);
      }
    }
  }

  const memories = memoryIds
    .map((mid) => getMemoryById(userId, mid))
    .filter((m): m is NonNullable<typeof m> => !!m);

  return NextResponse.json({ chat, memories });
}
