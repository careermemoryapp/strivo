import { redirect } from "next/navigation";

// See the redirect comment in ../page.tsx. There's no in-app equivalent of
// the reveal step to send this to (a Career Profile Card is now generated
// entirely through the public /quiz flow, with no per-user stored card) --
// this lands on the hub, same as a stale/incomplete deep link into the old
// in-app flow always did.
export default function CareerProfileCardRedirectPage() {
  redirect("/quiz");
}
