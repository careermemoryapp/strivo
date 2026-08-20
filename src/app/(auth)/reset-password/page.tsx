import { redirect } from "next/navigation";

// Strivo is Google-sign-in-only — there's no password to reset. This page
// (and the matching forgot-password page / API routes) is kept only as an
// inert stub so old links/bookmarks land somewhere sensible instead of
// 404ing, the same way /signup redirects to /login.
export default function ResetPasswordPage() {
  redirect("/login");
}
