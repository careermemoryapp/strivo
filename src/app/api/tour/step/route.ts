import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { setNavTourStep } from "@/lib/repo/users";

// Called by NavTour.tsx every time the record -> save -> chat tour advances
// (including Skip, which jumps straight to 3) -- see nav_tour_step's own
// comment on the User type in repo/users.ts for what each value means.
const schema = z.object({ step: z.number().int().min(0).max(3) });

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  setNavTourStep(userId, parsed.data.step);
  return NextResponse.json({ ok: true });
}
