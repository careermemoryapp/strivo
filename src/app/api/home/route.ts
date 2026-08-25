import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { countMemories, listMemoryDates } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { computeStreak } from "@/lib/utils";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = getUserById(userId);
  const streak = computeStreak(listMemoryDates(userId));
  const memoryCount = countMemories(userId);
  const recentChats = listChats(userId).slice(0, 3);

  return NextResponse.json({
    user: user
      ? { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email }
      : null,
    streak,
    memoryCount,
    recentChats,
    // True until the user has picked Monthly/Annual on the first-run trial
    // screen (see app/(app)/welcome-trial) -- Home.tsx redirects there once
    // instead of rendering. Piggybacked on this response rather than a
    // separate fetch since /api/home already loads the user row.
    needsPlanChoice: user ? user.preferred_plan === null : false,
  });
}
