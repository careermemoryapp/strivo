import { Spinner } from "@/components/Spinner";

// See home/loading.tsx for why this exists -- same instant-feedback fix,
// applied to every (app) screen that was showing this delay. This is the
// one that covers tapping into an individual memory from the Memories list.
export default function MemoryDetailLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
