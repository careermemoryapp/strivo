import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { countMemoriesByCompetency } from "@/lib/repo/memories";
import { COMPETENCY_OPTIONS } from "@/lib/ai";
import { CoverageClient } from "./CoverageClient";

// "Story Bank" — shows the user how many memories they have for each of the
// 12 fixed behavioral-interview competencies (see COMPETENCY_OPTIONS in
// lib/ai.ts), so gaps ("0 Conflict Resolution stories") read as something
// to go fill rather than a hidden blind spot they only discover mid-
// interview. COMPETENCY_OPTIONS is imported here (a Server Component) —
// never in CoverageClient.tsx, since lib/ai.ts is server-only.
export default async function CoveragePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const counts = countMemoriesByCompetency(userId);
  const coverage = COMPETENCY_OPTIONS.map((name) => ({ name, count: counts[name] ?? 0 }));

  return <CoverageClient coverage={coverage} />;
}
