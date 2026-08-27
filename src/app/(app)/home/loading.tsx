import { Spinner } from "@/components/Spinner";

// Next.js shows this the instant someone taps into this screen (bottom nav,
// a link, a deep link), before the page's own client code has even started
// its data fetch. Without it, the previous screen just sat there frozen for
// however long the network round-trip took, which is what was making
// navigation feel like it needed two or three taps to "take" -- there was
// no visible change until everything was fully ready, so a normal tap
// looked like it had done nothing.
export default function HomeLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
