import { getServerSession } from "next-auth";
import * as Sentry from "@sentry/nextjs";
import { authOptions } from "@/lib/auth";

// Small helper every API route AND protected Server Component page uses to
// get the authenticated user's id. Returns null if unauthenticated —
// callers must respond 401 / redirect.
//
// Also tags the current request's Sentry scope with that user id. Sentry's
// Next.js SDK isolates each request into its own scope (OpenTelemetry-based
// as of @sentry/nextjs v8+), so this is safe under concurrent requests --
// it doesn't leak between users the way a naive global mutation would.
// Since requireUserId() runs on nearly every protected route, this is the
// one place that reliably attaches "which user" to a server-side error
// (API route crash, SSR failure) without having to remember to call
// Sentry.setUser() in dozens of individual routes.
export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (userId) {
    Sentry.setUser({ id: userId });
  }
  return userId;
}
