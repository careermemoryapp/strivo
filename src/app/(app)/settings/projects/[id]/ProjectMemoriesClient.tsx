"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/EmptyState";
import type { Memory } from "@/lib/repo/memories";
import type { Project } from "@/lib/repo/projects";

// "Tap a project, see what's actually in it" -- countMemoriesByProject
// (Settings > Projects' list) only ever showed a number; this is what
// answers "which three memories" for real. Every memory here already
// carries this project's name (see page.tsx), so MemoryCard's project tag
// shows too -- redundant on this specific screen, but keeps this list
// visually consistent with every other memory list in the app rather than
// a special-cased card.
export function ProjectMemoriesClient({
  project,
  initialMemories,
}: {
  project: Project;
  initialMemories: (Memory & { project_name: string | null })[];
}) {
  const [memories, setMemories] = useState(initialMemories);

  return (
    <div className="pb-6">
      <DarkHeader
        back
        inlineTitle={project.name}
        inlineSubtitle={`${memories.length} ${memories.length === 1 ? "memory" : "memories"}`}
      />

      <div className="px-5 pt-5">
        {memories.length === 0 ? (
          <EmptyState
            icon={<Brain size={22} />}
            title="Nothing here yet"
            description="Assign a memory to this project from its detail page, and it'll show up here."
          />
        ) : (
          <div className="space-y-2.5">
            {memories.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                // A duplicate lands with no project (see /api/memories/[id]/duplicate),
                // so it never belongs in this filtered list -- no onChanged
                // needed. A delete DOES need to disappear from here immediately,
                // same as the main Memories tab.
                onDeleted={(id) => setMemories((prev) => prev.filter((mm) => mm.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
