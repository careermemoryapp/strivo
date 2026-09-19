import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { setPhoneBannerDismissed } from "@/lib/repo/users";

// "Not now" on the Home phone-number banner -- see
// shouldShowPhoneBanner/PHONE_BANNER_SNOOZE_MS in repo/users.ts for how
// this makes the banner come back later instead of vanishing for good. No
// body needed; this is a pure status change, same shape as
// /api/checkins/[id]/dismiss.
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  setPhoneBannerDismissed(userId);
  return NextResponse.json({ ok: true });
}
