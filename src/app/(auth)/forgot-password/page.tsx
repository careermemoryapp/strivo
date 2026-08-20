import { redirect } from "next/navigation";

// Strivo is Google-sign-in-only — there's no password to reset. Kept as an
// inert redirect stub, same as /signup and /reset-password, so old
// links/bookmarks land somewhere sensible instead of 404ing.
export default function ForgotPasswordPage() {
  redirect("/login");
}
