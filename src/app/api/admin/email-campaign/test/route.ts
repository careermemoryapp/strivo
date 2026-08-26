import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { sendCampaignEmail } from "@/lib/email";

// Sends one real email to an address the admin types in (usually their own),
// rendered exactly the way a real campaign would render, so they can check
// how it looks in an actual inbox before blasting a whole segment. Unlike
// the real campaign send (POST /api/admin/email-campaign), this is awaited
// -- it's a single send, so there's no timeout risk, and the admin wants an
// immediate pass/fail rather than a fire-and-forget result.
const schema = z.object({
  toEmail: z.string().trim().email("Enter a valid email address."),
  subject: z.string().trim().min(1, "Add a subject line before sending.").max(150),
  bodyMarkdown: z.string().trim().min(1, "Add a message body before sending.").max(10000),
  bannerImageUrl: z.string().trim().url("Banner image must be a valid https:// URL.").or(z.literal("")).optional(),
  buttonText: z.string().trim().max(40, "Button text is too long.").or(z.literal("")).optional(),
  buttonUrl: z.string().trim().url("Button link must be a valid https:// URL.").or(z.literal("")).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #8b5cf6.")
    .or(z.literal(""))
    .optional(),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // "test" as the userId means the unsubscribe link in this preview email
  // won't resolve to a real account (getUserById returns undefined) -- if
  // clicked, it shows a harmless "couldn't find an account" page rather
  // than silently opting anyone real out.
  const ok = await sendCampaignEmail({
    toEmail: parsed.data.toEmail,
    toUserId: "test",
    firstName: "there",
    subject: parsed.data.subject,
    bodyMarkdown: parsed.data.bodyMarkdown,
    bannerImageUrl: parsed.data.bannerImageUrl || null,
    buttonText: parsed.data.buttonText || null,
    buttonUrl: parsed.data.buttonUrl || null,
    accentColor: parsed.data.accentColor || null,
  });

  if (!ok) {
    return NextResponse.json(
      { error: "Send failed -- check that SES is configured and the sending identity is verified." },
      { status: 500 }
    );
  }
  return NextResponse.json({ sent: true });
}
