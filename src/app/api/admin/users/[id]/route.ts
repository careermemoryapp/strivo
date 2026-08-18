import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { setUserSubscriptionStatus } from "@/lib/repo/users";

const schema = z.object({ status: z.enum(["trial", "active"]) });

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
  return NextResponse.json({ ok: true });
}
