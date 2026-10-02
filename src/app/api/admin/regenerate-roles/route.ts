import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getUserByEmail } from "@/lib/repo/users";
import { listNewestMemories } from "@/lib/repo/memories";
import { createSuggestedRoles } from "@/lib/repo/suggestedRoles";
import { generateSuggestedRoles } from "@/lib/ai";

// Same recency-ordered sample size "Roles you're ready for" itself uses --
// see ROLE_SAMPLE_SIZE's own comment in app/api/growth-narrative/run/route.ts.
const ROLE_SAMPLE_SIZE = 20;

// GET sibling of POST /api/growth-narrative/regenerate-roles, added
// 2026-10-02 alongside generateSuggestedRoles' resume-plus-memories fix (see
// its own comment in lib/ai.ts) specifically so the founder can force a
// fresh regeneration for one account by just pasting a URL while signed
// into /admin -- same pattern as opportunities-debug and
// opportunities-clear-cache above, rather than needing a POST client
// (Postman, curl) to exercise the existing JSON-body endpoint. Hit directly
// as /api/admin/regenerate-roles?email=... -- bypasses
// shouldGenerateSuggestedRoles' monthly-cadence gating (new memories since
// last time, or 30 days elapsed), same as the POST version.
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

  const roleMemories = listNewestMemories(user.id, ROLE_SAMPLE_SIZE);
  if (roleMemories.length === 0) {
    return NextResponse.json({ error: "This account has no memories yet -- nothing to generate roles from" }, { status: 400 });
  }

  const generated = await generateSuggestedRoles(roleMemories, user.resume_text);
  if (!generated || generated.roles.length === 0) {
    return NextResponse.json({
      ok: true,
      rolesGenerated: 0,
      message: "Nothing in this account's memories/resume genuinely supported naming a role this time -- the old list (if any) was left as-is.",
    });
  }

  createSuggestedRoles({
    userId: user.id,
    roles: generated.roles,
    memoryCountAtGeneration: roleMemories.length,
    overallSeniority: generated.seniority,
  });
  return NextResponse.json({
    ok: true,
    rolesGenerated: generated.roles.length,
    roles: generated.roles,
    seniority: generated.seniority,
  });
}
