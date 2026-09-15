import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { getProjectById, renameProject, deleteProject } from "@/lib/repo/projects";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(60, "Project name is too long."),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = getProjectById(userId, id);
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  renameProject(userId, id, parsed.data.name);
  return NextResponse.json({ project: getProjectById(userId, id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = getProjectById(userId, id);
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Never deletes the memories that were filed under this project -- see
  // deleteProject in lib/repo/projects.ts, which clears project_id on all
  // of them back to "no project" first.
  deleteProject(userId, id);
  return NextResponse.json({ ok: true });
}
