import { redirect } from "next/navigation";

// The in-app Career Profile hub moved out to the public, no-login /quiz
// flow on the marketing site (strivo.ai) -- see the career_profile_public_shares
// comment in lib/db.ts for why. Kept as a redirect, not a deleted route,
// so any existing bookmark/deep link (in-app nav history, an old push
// notification, etc.) still lands somewhere useful instead of a 404.
export default function CareerProfilePage() {
  redirect("/quiz");
}
