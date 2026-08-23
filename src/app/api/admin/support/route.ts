import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { listSupportMessages, setSupportMessageStatus } from "@/lib/repo/support";

// Admin-only. Help & Support submissions (see /api/support) were previously
// only ever emailed via SES -- if that email fails to send or land (e.g.
// the sending domain isn't fully verified yet), the message still exists in
// the database but was otherwise invisible. This surfaces it directly.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ messages: listSupportMessages(100) });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "resolved"]),
});

export async function PATCH(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = setSupportMessageStatus(parsed.data.id, parsed.data.status);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ message: updated });
}
