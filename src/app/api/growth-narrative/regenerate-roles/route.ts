import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed, checkGrowthNarrativeSecret } from "@/lib/adminAuth";
import { getUserByEmail } from "@/lib/repo/users";
import { listNewestMemories } from "@/lib/repo/memories";
import { createSuggestedRoles } from "@/lib/repo/suggestedRoles";
import { generateSuggestedRoles } from "@/lib/ai";

// Same recency-ordered sample size "Roles you're ready for" itself uses --
// see ROLE_SAMPLE_SIZE's own comment in app/api/growth-narrative/run/route.ts
// for why this is one bigger sample rather than two small batches. Kept as
// its own copy here (not imported -- that file has no exports) since it's
// one constant, not worth a shared module for.
const ROLE_SAMPLE_SIZE = 20;

const bodySchema = z.object({ email: z.string().trim().email() });

// Manual, single-user version of the "Roles you're ready for" half of
// app/api/growth-narrative/run -- exists specifically so the founder (or
// support) can force a fresh regeneration for ONE account right away,
// bypassing shouldGenerateSuggestedRoles' monthly-cadence gating (new
// memories since last time, or 30 days elapsed + a few new ones). Without
// this, seeing a prompt change reflected in your own "Roles you're ready
// for" card means waiting for the next monthly cron run OR happening to
// cross the retrigger threshold naturally -- neither is a real option right
// after a prompt tweak you want to see today.
// Same secret as the monthly cron (GROWTH_NARRATIVE_SECRET, see
// lib/adminAuth.ts) -- no new server env var or crontab entry needed to use
// this.
export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkGrowthNarrativeSecret(req.headers.get("x-growth-narrative-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const user = getUserByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: "No account with that email" }, { status: 404 });
  }

  const roleMemories = listNewestMemories(user.id, ROLE_SAMPLE_SIZE);
  if (roleMemories.length === 0) {
    return NextResponse.json({ error: "This account has no memories yet -- nothing to generate roles from" }, { status: 400 });
  }

  const generated = await generateSuggestedRoles(roleMemories);
  if (!generated || generated.roles.length === 0) {
    return NextResponse.json({
      ok: true,
      rolesGenerated: 0,
      message: "Nothing in this account's memories genuinely supported naming a role this time -- the old list (if any) was left as-is.",
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
