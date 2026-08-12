import { redirect } from "next/navigation";

// There is no separate manual sign-up flow anymore — signing in with Google
// on the login page automatically creates the account on first use. This
// page is kept only so old /signup links or bookmarks still land somewhere
// sensible.
export default function SignupPage() {
  redirect("/login");
}
