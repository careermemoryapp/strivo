import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo } from "@/lib/repo/users";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ subscription: getSubscriptionInfo(user) });
}
