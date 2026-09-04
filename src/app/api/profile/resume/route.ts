import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, setResume, clearResume } from "@/lib/repo/users";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { nowIso } from "@/lib/db";

// Stores the resume text a user already extracted client-side via the
// existing /api/memories/extract endpoint (same PDF/docx/etc. parser Record
// already uses for file-upload memories -- no need for a second extraction
// pipeline here). This route only persists { text, filename } onto the user
// row as background context (see resume_text's comment in repo/users.ts) --
// it never touches the memories table.
//
// Used from two places: the "Upload Resume (PDF)" option on /first-record
// (onboarding, one-time), and settings/resume (anytime, upload/replace/
// remove). Both go through this same route so there's one source of truth
// for what's currently on file.

const MAX_CHARS = 20000; // same cap as /api/memories/extract -- defensive, extract already enforces this

const saveSchema = z.object({
  text: z.string().trim().min(1, "No text to save"),
  filename: z.string().trim().min(1).max(200).default("resume.pdf"),
});

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUserById(userId);
  return NextResponse.json({
    hasResume: !!user?.resume_text,
    filename: user?.resume_filename ?? null,
    uploadedAt: user?.resume_uploaded_at ?? null,
  });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same shape of protection as memory-create -- cheap DB write, but still
  // worth capping against a runaway client/script.
  const limited = rateLimitOrResponse(`resume-save:${userId}`, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const text = parsed.data.text.length > MAX_CHARS ? `${parsed.data.text.slice(0, MAX_CHARS)}…` : parsed.data.text;
  const uploadedAt = nowIso();
  setResume(userId, text, parsed.data.filename, uploadedAt);
  return NextResponse.json({ hasResume: true, filename: parsed.data.filename, uploadedAt });
}

export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearResume(userId);
  return NextResponse.json({ ok: true });
}
