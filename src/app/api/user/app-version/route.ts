import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { setUserAppVersion } from "@/lib/repo/users";

const schema = z.object({
  version: z.string().trim().min(1).max(30),
});

// Pinged once per native app open/resume (see useAppVersionPing.ts) — this
// is intentionally separate from /api/user/push-token so version tracking
// doesn't depend on someone granting notification permission.
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  setUserAppVersion(userId, parsed.data.version);
  return NextResponse.json({ ok: true });
}
