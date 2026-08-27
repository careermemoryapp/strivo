import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { FEATURE_FLAGS, getAllFeatureFlags, setFeatureFlag } from "@/lib/repo/featureFlags";

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ flags: getAllFeatureFlags() });
}

const flagKeys = FEATURE_FLAGS.map((f) => f.key) as [string, ...string[]];
const schema = z.object({ key: z.enum(flagKeys), enabled: z.boolean() });

// A single PATCH endpoint (not /[key]) since there are only ever three
// fixed keys, all edited from the same admin panel screen -- one route is
// simpler than a dynamic segment here.
export async function PATCH(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  setFeatureFlag(parsed.data.key as (typeof FEATURE_FLAGS)[number]["key"], parsed.data.enabled);
  return NextResponse.json({ flags: getAllFeatureFlags() });
}
