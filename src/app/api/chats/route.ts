import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { createChat, listChats } from "@/lib/repo/chats";
import { sendUserMessageAndGetReply } from "@/lib/chatService";
import { rateLimitOrResponse } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const chats = listChats(userId, { search, category });
  return NextResponse.json({ chats });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  initialMessage: z.string().trim().max(4000).optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // An initial message here triggers the exact same OpenAI call as
  // POST /chats/[id]/messages — without this check, someone could dodge
  // that endpoint's rate limit entirely by always starting a fresh chat
  // instead of posting to an existing one. Sharing the same bucket closes
  // that gap.
  if (parsed.data.initialMessage) {
    const limited = rateLimitOrResponse(`chat-message:${userId}`, 60, 60 * 60 * 1000);
    if (limited) return limited;
  }

  const chat = createChat({ userId, title: parsed.data.title, category: parsed.data.category });

  let firstExchange = null;
  if (parsed.data.initialMessage) {
    firstExchange = await sendUserMessageAndGetReply(userId, chat.id, parsed.data.initialMessage);
  }

  return NextResponse.json({ chat, firstExchange });
}
