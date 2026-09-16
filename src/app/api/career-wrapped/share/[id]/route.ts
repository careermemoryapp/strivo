import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { revokeCareerWrappedShare } from "@/lib/repo/careerWrapped";

// Lets a user pull a previously generated Career Card link down (see spec
// section 7 -- "the user controls whether anything gets shared"). Scoped by
// user_id inside revokeCareerWrappedShare, same isolation invariant as every
// other per-user write in this app -- someone can't revoke a share that
// isn't theirs even if they know its id.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  revokeCareerWrappedShare(userId, id);
  return NextResponse.json({ ok: true });
}
