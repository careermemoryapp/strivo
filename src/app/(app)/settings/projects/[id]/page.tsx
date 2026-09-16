import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getProjectById } from "@/lib/repo/projects";
import { listMemoriesByProject } from "@/lib/repo/memories";
import { ProjectMemoriesClient } from "./ProjectMemoriesClient";

// Server Component: fetches the project and its memories here, same
// "server-side first render, no client round trip" pattern as the memory
// detail page -- see its page.tsx for the full reasoning.
export default async function ProjectMemoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const project = getProjectById(userId, id);
  // A deleted project or a stale/bad link -- back to the project list
  // rather than a dead-end error screen, same convention as the memory
  // detail page redirecting to /memories.
  if (!project) redirect("/settings/projects");

  const memories = listMemoriesByProject(userId, id);

  // node:sqlite rows aren't plain objects, so they can't cross the
  // Server -> Client boundary as-is -- see the matching comment in
  // chats/[id]/page.tsx. project_name is the same for every row here (it's
  // this project), attached so MemoryCard's tag renders exactly like it
  // does everywhere else rather than a special case.
  return (
    <ProjectMemoriesClient
      project={{ ...project }}
      initialMemories={memories.map((m) => ({ ...m, project_name: project.name }))}
    />
  );
}
