import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { countMemories, listMemoryDates } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { computeStreak } from "@/lib/utils";
import { getActiveNudge } from "@/lib/repo/nudges";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = getUserById(userId);
  const streak = computeStreak(listMemoryDates(userId));
  const memoryCount = countMemories(userId);
  const recentChats = listChats(userId).slice(0, 3);

  // Only surface the admin's broadcast nudge if this user hasn't already
  // dismissed this exact one — see dismissed_nudge_id on users and
  // /api/user/dismiss-nudge.
  const activeNudge = getActiveNudge();
  const nudge = activeNudge && activeNudge.id !== user?.dismissed_nudge_id ? activeNudge : null;

  return NextResponse.json({
    user: user
      ? { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email }
      : null,
    streak,
    memoryCount,
    recentChats,
    nudge: nudge ? { id: nudge.id, title: nudge.title, message: nudge.message } : null,
  });
}
