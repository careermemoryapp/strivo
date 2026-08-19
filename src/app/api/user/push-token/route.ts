import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { savePushToken } from "@/lib/repo/pushTokens";

const schema = z.object({
  token: z.string().trim().min(1),
  platform: z.string().trim().min(1).default("android"),
  appVersion: z.string().trim().max(30).optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  savePushToken(userId, parsed.data.token, parsed.data.platform, parsed.data.appVersion);
  return NextResponse.json({ ok: true });
}
