import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { rateLimitOrResponse } from "@/lib/rateLimit";
import { getJobPostingById } from "@/lib/repo/jobPostings";
import { recordOpportunityFeedback } from "@/lib/repo/userOpportunities";

const REASONS = ["wrong_role", "wrong_industry", "wrong_location", "too_senior", "too_junior", "not_interested"] as const;

const schema = z.object({
  feedback: z.enum(["relevant", "not_for_me"]),
  reason: z.enum(REASONS).nullable().optional(),
});

// 👍/👎 on an Opportunities card (see opportunity_feedback's comment in
// lib/db.ts). This is Strivo's only signal for career INTENT -- what memories
// can't tell it -- so it's cheap on purpose: no auth-heavy checks beyond the
// normal session, no AI call, just a row write. A future ranking pass can
// read listFeedbackedJobIds/opportunity_feedback to avoid re-showing
// something already judged, or to weight the profile itself -- not built
// yet (see the product brief's phasing), this route only needs to capture
// the signal reliably.
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;

  const limited = rateLimitOrResponse(`opportunity-feedback:${userId}`, 120, 60 * 60 * 1000);
  if (limited) return limited;

  const job = getJobPostingById(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  recordOpportunityFeedback({
    userId,
    jobPostingId: jobId,
    feedback: parsed.data.feedback,
    reason: parsed.data.reason ?? null,
  });

  return NextResponse.json({ ok: true });
}
