import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { consumeResetToken } from "@/lib/repo/passwordReset";
import { updateUserPassword } from "@/lib/repo/users";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = consumeResetToken(parsed.data.token);
  if (!result) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  updateUserPassword(result.userId, passwordHash);
  return NextResponse.json({ ok: true });
}
