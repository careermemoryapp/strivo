import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { setUserPhoneNumber, clearUserPhoneNumber } from "@/lib/repo/users";

// Called from the Home phone-number banner (PhoneNumberBanner.tsx), and
// later Settings if a phone field is added there. Requires a leading "+"
// and 8-15 digits after it (loose E.164 shape) -- good enough to catch
// obviously-wrong input (missing country code, stray letters) without a
// full phone-validation library, since this number isn't used for anything
// live yet (see setUserPhoneNumber's comment) and can always be corrected
// later. Real deliverability verification is deferred to whenever the
// WhatsApp send flow is actually built.
const schema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Include your country code, e.g. +91 98765 43210"),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid phone number" }, { status: 400 });
  }
  const user = setUserPhoneNumber(userId, parsed.data.phoneNumber);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// "Remove number" in Settings (settings/profile/page.tsx) -- see
// clearUserPhoneNumber's own comment for why this needs to exist: the
// Privacy Policy's "Phone number and WhatsApp messages" section promises
// removal is possible at any time.
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearUserPhoneNumber(userId);
  return NextResponse.json({ ok: true });
}
