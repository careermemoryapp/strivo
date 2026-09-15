import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { listProjects, createProject, getProjectByName, countMemoriesByProject } from "@/lib/repo/projects";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = listProjects(userId);
  // Only the Settings > Projects management page actually reads
  // memoryCount (ProjectAssigner's dropdown just needs id/name) -- cheap
  // enough (one grouped query) to always include rather than adding a
  // second endpoint just for this.
  const counts = countMemoriesByProject(userId);
  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, memoryCount: counts[p.id] ?? 0 })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(60, "Project name is too long."),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Case-insensitive dedupe: creating "atlas" when "Atlas" already exists
  // returns the existing row instead of a near-duplicate the user would
  // just have to notice and clean up later (same reasoning the AI
  // suggestion match in generateMemoryMetadata already applies).
  const existing = getProjectByName(userId, parsed.data.name);
  if (existing) return NextResponse.json({ project: existing });

  const project = createProject(userId, parsed.data.name);
  return NextResponse.json({ project });
}
