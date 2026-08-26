import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import { createTemplate, listTemplates } from "@/lib/repo/emailTemplates";

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ templates: listTemplates() });
}

const schema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(60),
  subject: z.string().trim().min(1, "Add a subject line first.").max(150),
  body: z.string().trim().min(1, "Add a message body first.").max(10000),
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

// Saves whatever's currently in the composer as a new named template --
// see repo/emailTemplates.ts for why this is always a fresh row rather
// than an update-in-place.
export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const template = createTemplate({
    name: parsed.data.name,
    subject: parsed.data.subject,
    body: parsed.data.body,
    bannerImageUrl: parsed.data.bannerImageUrl || null,
    buttonText: parsed.data.buttonText || null,
    buttonUrl: parsed.data.buttonUrl || null,
    accentColor: parsed.data.accentColor || null,
  });
  return NextResponse.json({ template });
}
