import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { listMessages } from "@/lib/repo/messages";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const chat = getChatById(userId, id);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const messages = listMessages(userId, id);
  return NextResponse.json({ chat, messages });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const chat = getChatById(userId, id);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  // Scoped delete — WHERE user_id = ? ensures a user can only ever delete
  // their own chat, even though we already checked ownership above.
  getDb().prepare(`DELETE FROM chats WHERE id = ? AND user_id = ?`).run(id, userId);
  // Same fix as the memories DELETE route (see the comment there): the
  // client-side local-array-filter approach in ChatCard/ChatsListClient is
  // correct and stays as-is, but it can't invalidate Next's Router Cache for
  // /chats and /home (which shows recentChats), which is why a deleted chat
  // could reappear until the user switched screens. This marks those cached
  // renders stale so the next visit re-fetches instead.
  revalidatePath("/chats");
  revalidatePath("/home");
  return NextResponse.json({ ok: true });
}
