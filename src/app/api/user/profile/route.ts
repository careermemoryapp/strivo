import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, updateUserProfile } from "@/lib/repo/users";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { password_hash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return NextResponse.json({ user: safe });
}

const schema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
});

export async function PATCH(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const user = updateUserProfile(userId, {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { password_hash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return NextResponse.json({ user: safe });
}
