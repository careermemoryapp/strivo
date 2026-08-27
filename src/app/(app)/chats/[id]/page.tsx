import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getChatById } from "@/lib/repo/chats";
import { listMessages } from "@/lib/repo/messages";
import { ChatDetailClient } from "./ChatDetailClient";

// Server Component: fetches the chat + its messages here, before anything
// is sent to the browser, instead of shipping an empty client component
// that then fetches them itself over a second network round-trip. See the
// comment at the top of ChatDetailClient.tsx for the full reasoning — this
// is what was making opening a chat take multiple seconds even though the
// server answers in milliseconds and static assets are cached correctly.
export default async function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const chat = getChatById(userId, id);
  // A deleted chat or a stale/bad link -- back to the list rather than a
  // dead-end error screen for what's a rare, recoverable case.
  if (!chat) redirect("/chats");

  const messages = listMessages(userId, id);

  // node:sqlite rows aren't plain objects (they fail the "only plain
  // objects can cross the Server -> Client boundary" check Next.js does),
  // so they can't be handed to a Client Component as-is -- spreading each
  // one into a fresh object literal fixes that without changing any data.
  return (
    <ChatDetailClient
      chatId={id}
      initialChat={{ ...chat }}
      initialMessages={messages.map((m) => ({ ...m }))}
    />
  );
}
