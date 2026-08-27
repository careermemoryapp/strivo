import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { listMessages } from "@/lib/repo/messages";
import { getMemoriesByIds } from "@/lib/repo/memories";
import { safeJsonParse } from "@/lib/utils";

// Returns the memories that informed the most recent AI reply in this
// conversation. Deliberately scoped to just the latest turn (not a union
// across every reply ever sent) — otherwise loosely-related memories from
// earlier questions in a long conversation never drop off the list, even
// once they're no longer relevant to what's being discussed now.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chat = getChatById(userId, id);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const aiMessages = listMessages(userId, id).filter((m) => m.sender === "ai");
  const latest = aiMessages[aiMessages.length - 1];
  const memoryIds = latest ? safeJsonParse<string[]>(latest.retrieved_memories, []) : [];

  // Single batched query instead of one getMemoryById() call per id (N+1
  // pattern) -- then re-sort into the original retrieval order, since a
  // WHERE...IN query doesn't guarantee row order matches the ids list.
  const fetched = getMemoriesByIds(userId, memoryIds);
  const byId = new Map(fetched.map((m) => [m.id, m]));
  const memories = memoryIds.map((mid) => byId.get(mid)).filter((m): m is NonNullable<typeof m> => !!m);

  return NextResponse.json({ chat, memories });
}
