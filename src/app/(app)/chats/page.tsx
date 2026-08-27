import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listChats } from "@/lib/repo/chats";
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

  return <ChatsListClient initialChats={chats} />;
}
