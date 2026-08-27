import { Spinner } from "@/components/Spinner";

// See home/loading.tsx for why this exists -- same instant-feedback fix,
// applied to every (app) screen that was showing this delay.
export default function ChatsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
