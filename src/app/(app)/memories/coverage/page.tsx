import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { listMemoriesGroupedByCompetency } from "@/lib/repo/memories";
import { COMPETENCY_OPTIONS } from "@/lib/ai";
import { CoverageClient } from "./CoverageClient";

// "Story Bank" — shows the user how many memories they have for each of the
// fixed competencies in the taxonomy (see COMPETENCY_OPTIONS in lib/ai.ts),
// so gaps ("0 Conflict Resolution stories") read as something
// to go fill rather than a hidden blind spot they only discover mid-
// interview. COMPETENCY_OPTIONS is imported here (a Server Component) —
// never in CoverageClient.tsx, since lib/ai.ts is server-only.
export default async function CoveragePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const grouped = listMemoriesGroupedByCompetency(userId);
  const coverage = COMPETENCY_OPTIONS.map((name) => ({
    name,
    count: grouped[name]?.length ?? 0,
    stories: grouped[name] ?? [],
  }));

  return <CoverageClient coverage={coverage} />;
}
