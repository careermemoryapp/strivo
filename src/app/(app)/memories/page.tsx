import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listMemories } from "@/lib/repo/memories";
import { withProjectNames } from "@/lib/repo/projects";
import { MemoriesListClient } from "./MemoriesListClient";

// Server Component: fetches the default (newest-first, unfiltered) memory
// list here, before anything is sent to the browser. See
// ChatDetailClient.tsx for the full reasoning.
export default async function MemoriesPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const memories = listMemories(userId, {});

  // withProjectNames spreads each row into a fresh plain object itself
  // (see its comment in lib/repo/projects.ts), which also satisfies the
  // "node:sqlite rows aren't plain objects" Server -> Client boundary rule
  // -- see the matching comment in chats/[id]/page.tsx.
  return <MemoriesListClient initialMemories={withProjectNames(userId, memories)} />;
}
