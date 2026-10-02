import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getUserByEmail } from "@/lib/repo/users";
import { getOpportunitiesDebugInfo } from "@/lib/opportunities";

// Admin-only diagnostic, added 2026-10-02 after a direct founder question
// that no existing admin panel could answer with real numbers: "is my short
// Opportunities list (6 jobs) really everything relevant in the pool, or is
// good matching being left on the table somewhere before the AI ranking
// step even sees it?" Takes a user's email (easier for the founder to type
// than a raw user id) and returns getOpportunitiesDebugInfo's breakdown --
// see that function's own comment in lib/opportunities.ts for what each
// number means and how to read it. Deliberately NOT wired into the admin
// dashboard's UI yet (no founder ask for that) -- hit directly as
// /api/admin/opportunities-debug?email=... while signed into /admin, same
// auth cookie covers it.
export async function GET(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Pass ?email=someone@example.com" }, { status: 400 });
  }
  const user = getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 });
  }
  return NextResponse.json(getOpportunitiesDebugInfo(user.id));
}
