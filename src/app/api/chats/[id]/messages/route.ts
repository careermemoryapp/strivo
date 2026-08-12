import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { sendUserMessageAndGetReply } from "@/lib/chatService";

const schema = z.object({ content: z.string().trim().min(1, "Message can't be empty").max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chat = getChatById(userId, id);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await sendUserMessageAndGetReply(userId, id, parsed.data.content);
  return NextResponse.json(result);
}
