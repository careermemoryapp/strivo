import { Spinner } from "@/components/Spinner";

// See (app)/home/loading.tsx for why this exists -- this one covers tapping
// the avatar icon in the header (Home, Chats, Memories, Record) to open
// Settings.
export default function SettingsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
