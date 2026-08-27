import { Spinner } from "@/components/Spinner";

// See home/loading.tsx for why this exists -- same instant-feedback fix,
// applied to every (app) screen that was showing this delay. This is the
// one that covers tapping into an individual chat from the Chats list.
export default function ChatDetailLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
