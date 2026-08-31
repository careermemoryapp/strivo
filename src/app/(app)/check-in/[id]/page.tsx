import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getPendingCheckinById } from "@/lib/repo/pendingCheckins";
import { getMemoryById } from "@/lib/repo/memories";
import { CheckinClient } from "./CheckinClient";

// "Proactive check-ins" -- see app/api/checkins/run for how a check-in gets
// activated (a daily external automation, same pattern as the blog/weekly-
// recap/growth-narrative/quarterly-benchmark automations) and pushed. This
// page is where that push's tap deep-links to (route: `/check-in/${id}`,
// see sendPushToAllDevices in that route file), and it's also reachable from
// the Home teaser (see HomeClient.tsx) for anyone who opens the app without
// tapping the push.
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const checkin = getPendingCheckinById(userId, id);
  // A stale/bad link (or someone else's check-in id) -- back to Home rather
  // than a dead-end error screen for what's a rare, recoverable case.
  if (!checkin) redirect("/home");

  const sourceMemory = getMemoryById(userId, checkin.source_memory_id);

  // node:sqlite rows aren't plain objects, so they can't cross the
  // Server -> Client boundary as-is -- see the matching comment in
  // chats/[id]/page.tsx.
  return (
    <CheckinClient
      checkin={{
        id: checkin.id,
        question: checkin.question,
        status: checkin.status,
        sourceMemoryTitle: sourceMemory?.title ?? null,
        sourceMemoryId: sourceMemory?.id ?? null,
      }}
    />
  );
}
