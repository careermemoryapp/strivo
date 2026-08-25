import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo, setPreferredPlan } from "@/lib/repo/users";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ subscription: getSubscriptionInfo(user) });
}

// Records the plan choice made on the first-run trial screen (see
// app/(app)/welcome-trial). Doesn't touch billing -- see the comment on
// setPreferredPlan in lib/repo/users.ts for why.
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const plan = (body as { plan?: unknown })?.plan;
  if (plan !== "monthly" && plan !== "annual") {
    return NextResponse.json({ error: "plan must be 'monthly' or 'annual'" }, { status: 400 });
  }
  const user = setPreferredPlan(userId, plan);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ subscription: getSubscriptionInfo(user) });
}
