import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listMemories } from "@/lib/repo/memories";
import { MemoriesListClient } from "./MemoriesListClient";

// Server Component: fetches the default (newest-first, unfiltered) memory
// list here, before anything is sent to the browser. See
// ChatDetailClient.tsx for the full reasoning.
export default async function MemoriesPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const memories = listMemories(userId, {});

  // node:sqlite rows aren't plain objects, so they can't cross the
  // Server -> Client boundary as-is -- see the matching comment in
  // chats/[id]/page.tsx.
  return <MemoriesListClient initialMemories={memories.map((m) => ({ ...m }))} />;
}
