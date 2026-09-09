import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { setAiConsent } from "@/lib/repo/users";

// Called once from /ai-consent's "I understand, continue" button (see that
// page and its gate in (app)/layout.tsx). No request body needed -- this
// is a simple acknowledgment, not a form.
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  setAiConsent(userId);
  return NextResponse.json({ ok: true });
}
