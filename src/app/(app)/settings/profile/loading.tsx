import { Spinner } from "@/components/Spinner";

// See (app)/home/loading.tsx for why this exists.
export default function ProfileLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
