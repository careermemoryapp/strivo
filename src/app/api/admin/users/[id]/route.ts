import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { setUserSubscriptionStatus, setPreferredPlan } from "@/lib/repo/users";

// `plan` is optional and only meaningful alongside status "active" -- it's
// how the admin records which plan a manually-granted (comped) Strivo Plus
// account is "on" for their own bookkeeping (friends/relatives granted free
// access, see setPreferredPlan in lib/repo/users.ts). It doesn't affect
// access itself: "active" already means unlimited, ungated access
// regardless of plan.
const schema = z.object({ status: z.enum(["trial", "active"]), plan: z.enum(["monthly", "annual"]).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const user = setUserSubscriptionStatus(id, parsed.data.status);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.plan) {
    setPreferredPlan(id, parsed.data.plan);
  }
  return NextResponse.json({ ok: true });
}
