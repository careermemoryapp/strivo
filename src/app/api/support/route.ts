import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { createSupportMessage } from "@/lib/repo/support";

const schema = z.object({
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1, "Add a message before sending.").max(4000),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // No support inbox email is configured yet — the message is persisted so
  // it isn't lost, and can be delivered/reviewed once that's decided.
  const saved = createSupportMessage({
    userId,
    email: user.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  return NextResponse.json({ ok: true, id: saved.id });
}
