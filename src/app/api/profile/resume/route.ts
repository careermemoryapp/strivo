import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, setResume, clearResume, setResumeStats } from "@/lib/repo/users";
import { analyzeResumeCareerStats, type ResumeCareerStats } from "@/lib/ai";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { nowIso } from "@/lib/db";

// Stores the resume text a user already extracted client-side via the
// existing /api/memories/extract endpoint (same PDF/docx/etc. parser Record
// already uses for file-upload memories -- no need for a second extraction
// pipeline here). This route persists { text, filename } onto the user row
// as background context (see resume_text's comment in repo/users.ts) --
// it never touches the memories table -- and also runs one lightweight,
// counts-only stats pass over it (see analyzeResumeCareerStats in lib/ai.ts
// and resume_stats_* in lib/repo/users.ts) shown as a supplementary line on
// the Home stats card.
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

  // One bounded AI call (counts only, see analyzeResumeCareerStats' own
  // comment in lib/ai.ts) -- stamped even on failure/no-client so the Home
  // card can tell "no resume" apart from "resume on file, stats
  // unavailable." Never blocks the response on anything more than this
  // single call -- there's no per-story loop here the way document uploads
  // have, so no timeout risk to design around.
  const stats = await analyzeResumeCareerStats(text);
  setResumeStats(userId, stats, nowIso());

  // Returned so the upload screen can show what was actually found right
  // away (see settings/resume/page.tsx) instead of making someone hunt for
  // the supplementary line on Home to find out anything happened -- a
  // founder-reported source of "did this even do anything?" confusion,
  // since the resume never becomes a memory/story of its own (see this
  // route's own top comment) and previously gave no immediate feedback at
  // all. null here (AI unavailable, or the resume genuinely didn't show
  // any of the four categories) is a valid, honest result, not an error --
  // the UI shows that as "nothing further found" rather than hiding it.
  const statsPayload: ResumeCareerStats | null =
    stats && (stats.wins || stats.leadershipMoments || stats.problemsSolved || stats.seniorStakeholderInteractions)
      ? stats
      : null;

  return NextResponse.json({ hasResume: true, filename: parsed.data.filename, uploadedAt, stats: statsPayload });
}

export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearResume(userId);
  return NextResponse.json({ ok: true });
}
