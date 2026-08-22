import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { fetchRecentSentryIssues, sentryConfigured } from "@/lib/sentry";

// Admin-only. Surfaces currently-unresolved Sentry issues on the admin
// dashboard so problems are visible without needing a separate Sentry
// login. Degrades gracefully if SENTRY_API_TOKEN isn't set yet, or if
// Sentry itself is unreachable -- neither should ever break the rest of
// the admin page.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sentryConfigured()) {
    return NextResponse.json({ configured: false, issues: [] });
  }

  try {
    const issues = await fetchRecentSentryIssues(10);
    return NextResponse.json({ configured: true, issues });
  } catch (e) {
    console.error("Admin Sentry fetch failed:", e);
    return NextResponse.json({ configured: true, issues: [], error: "Couldn't reach Sentry." }, { status: 502 });
  }
}
