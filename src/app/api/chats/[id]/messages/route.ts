import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { sendUserMessageAndGetReply } from "@/lib/chatService";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";

const schema = z.object({ content: z.string().trim().min(1, "Message can't be empty").max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Every message triggers an OpenAI chat completion (and often an
  // embedding call) — cap per-user spend from a runaway client/script.
  const limited = rateLimitOrResponse(`chat-message:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  // Shares the -ip bucket with the initial-message path in chats/route.ts.
  const limitedByIp = rateLimitOrResponse(`chat-message-ip:${requestIp(req)}`, 300, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

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
