import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getMemoryById, setMemoryProject } from "@/lib/repo/memories";
import { getProjectById } from "@/lib/repo/projects";

// Deliberately its own tiny route rather than folded into the general
// PATCH /api/memories/[id] (which edits the transcript and regenerates AI
// metadata -- see that route) -- assigning a project is a separate,
// cheap, no-AI-call action, whether it's confirming a suggestion right
// after recording, changing it from the dropdown, or assigning one to an
// old memory later from the detail page (see ProjectAssigner.tsx, used in
// both places).
const patchSchema = z.object({
  // null clears the memory's project ("No project").
  projectId: z.string().min(1).nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const memory = getMemoryById(userId, id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.projectId !== null) {
    // Ownership check -- a project id has to actually belong to this user,
    // not just exist, same "scoped by user_id" rule every other lookup in
    // this app follows.
    const project = getProjectById(userId, parsed.data.projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  setMemoryProject(userId, id, parsed.data.projectId);
  return NextResponse.json({ memory: getMemoryById(userId, id) });
}
