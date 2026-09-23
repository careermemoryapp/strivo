import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { OpportunitiesClient } from "./OpportunitiesClient";

// Unlike Memories/Chats (see their page.tsx files), this deliberately does
// NOT fetch server-side and hand initial data to the client. On a cache
// miss, getOpportunitiesForUser (lib/opportunities.ts) can run a real AI
// ranking call over up to ~80 candidate jobs -- fine as an async API
// route, but blocking a Server Component's render on that would hold the
// whole page (and every layout wrapping it) waiting on a multi-second AI
// call instead of showing the shell immediately with a loading state.
// OpportunitiesClient fetches GET /api/opportunities itself on mount.
export default async function OpportunitiesPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  return <OpportunitiesClient />;
}
