import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { deleteUser } from "@/lib/repo/users";

export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  deleteUser(userId); // cascades to memories, chats, messages via FK
  return NextResponse.json({ ok: true });
}
