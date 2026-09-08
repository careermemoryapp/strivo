import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listChats } from "@/lib/repo/chats";
import { countMemories } from "@/lib/repo/memories";
import { ChatsListClient } from "./ChatsListClient";

// Server Component: fetches the default (unfiltered) chat list here,
// before anything is sent to the browser. See ChatDetailClient.tsx for the
// full reasoning — this removes the extra client-side round-trip that was
// making this screen take multiple seconds to show anything on every tap
// into the Chats tab.
export default async function ChatsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const chats = listChats(userId, {});
  // Cheap COUNT query -- only used to decide whether the zero-chats empty
  // state below shows the "record your first memory" nudge instead of the
  // plain "No conversations yet" text. See chats/[id]/page.tsx for the
  // matching comment on why this is a genuinely useful moment to catch: a
  // brand-new user's very first look at this tab.
  const memoryCount = countMemories(userId);

  // node:sqlite rows aren't plain objects, so they can't cross the
  // Server -> Client boundary as-is -- see the matching comment in
  // chats/[id]/page.tsx.
  return <ChatsListClient initialChats={chats.map((c) => ({ ...c }))} memoryCount={memoryCount} />;
}
