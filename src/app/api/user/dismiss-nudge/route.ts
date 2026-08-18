import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { setDismissedNudge } from "@/lib/repo/users";

const schema = z.object({ nudgeId: z.string().min(1) });

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  setDismissedNudge(userId, parsed.data.nudgeId);
  return NextResponse.json({ ok: true });
}
