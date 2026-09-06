import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { setNavTourStep } from "@/lib/repo/users";

// Superseded by /api/tour/step (see that route) when the tour was redesigned
// from a single "seen the nav bar once" boolean into a 3-checkpoint,
// step-tracked tour spanning Record -> save -> Chats. Left in place, rather
// than deleted, only because this file lives in the connected workspace
// folder where Claude can't delete or rename files -- NavTour.tsx calls
// /api/tour/step exclusively; nothing in the app calls this route anymore.
// Kept functionally identical to /api/tour/step so it can't drift into a
// broken, half-updated endpoint that still references removed code.
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
