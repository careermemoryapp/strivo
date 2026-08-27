import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById } from "@/lib/repo/memories";
import { MemoryDetailClient } from "./MemoryDetailClient";

// Server Component: fetches the memory here, before anything is sent to
// the browser. See ChatDetailClient.tsx for the full reasoning — this
// removes the extra client-side round-trip that was making every memory
// take multiple seconds to open.
export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const memory = getMemoryById(userId, id);
  // A deleted memory or a stale/bad link -- back to the list rather than a
  // dead-end error screen for what's a rare, recoverable case.
  if (!memory) redirect("/memories");

  return <MemoryDetailClient memoryId={id} initialMemory={memory} />;
}
