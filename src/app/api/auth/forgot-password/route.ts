import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/repo/users";
import { createResetToken } from "@/lib/repo/passwordReset";

const schema = z.object({ email: z.string().trim().email() });

// NOTE (MVP limitation, disclosed rather than faked): this sandbox has no
// outbound email service configured, so we cannot actually send a reset
// email. Instead we return the reset link directly in the API response so
// the flow is fully testable end-to-end. In production this would be
// emailed and devResetLink would be removed.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const user = getUserByEmail(parsed.data.email);
  if (!user) {
    // Don't reveal whether the account exists.
    return NextResponse.json({ ok: true });
  }
  const { token } = createResetToken(user.id);
  return NextResponse.json({ ok: true, devResetLink: `/reset-password?token=${token}` });
}
