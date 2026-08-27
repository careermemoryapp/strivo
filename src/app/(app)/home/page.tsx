import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { countMemories, listMemoryDates } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { computeStreak } from "@/lib/utils";
import { HomeClient } from "./HomeClient";

// Server Component: fetches everything Home needs here, before anything is
// sent to the browser, instead of shipping an empty client component that
// fetches it all itself over /api/home on mount. See ChatDetailClient.tsx
// for the full reasoning.
//
// The old /api/home response also carried `needsPlanChoice` so Home could
// redirect to /welcome-trial client-side as a first-run check. That's no
// longer needed here: (app)/layout.tsx already does that same check
// server-side, for every route under (app), before this page ever renders
// — see the comment there. Home's copy of the check was already documented
// as a redundant safety net by that point, not the primary gate.
export default async function HomePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const user = getUserById(userId);
  const streak = computeStreak(listMemoryDates(userId));
  const memoryCount = countMemories(userId);
  const recentChats = listChats(userId).slice(0, 3);

  return (
    <HomeClient
      initialData={{
        user: user
          ? { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email }
          : null,
        streak,
        memoryCount,
        // node:sqlite rows aren't plain objects, so they can't cross the
        // Server -> Client boundary as-is -- see the matching comment in
        // chats/[id]/page.tsx.
        recentChats: recentChats.map((c) => ({ ...c })),
      }}
    />
  );
}
