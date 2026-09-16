"use client";

import { useState } from "react";
import { Sparkles, ChevronDown, Plus, Check, FolderPlus } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/repo/projects";

// Shared "which project does this memory belong to" control, used in two
// places: the Record success screen (right after saving, showing the AI's
// suggestion -- see suggestedExistingProjectName/suggestedNewProjectName on
// generateMemoryMetadata, lib/ai.ts) and the memory detail page (assigning
// or changing a project any time after the fact, including on memories
// that predate this feature). Both cases end up calling the exact same
// PATCH /api/memories/[id]/project -- the only difference is what's shown
// before the user has made a choice: a suggestion card here, vs. a plain
// "+ Add to a project" chip there.
//
// "AI proposes, human confirms": nothing in here ever assigns a project on
// its own. A suggestion is just a pre-filled starting point the user taps
// to accept, change, or ignore -- same principle as the
// transcription-cleanup pass in transcribeAudio (lib/ai.ts).
export type ProjectSuggestion = {
  existingId: string | null;
  existingName: string | null;
  newName: string | null;
};

export function ProjectAssigner({
  memoryId,
  currentProjectId,
  currentProjectName,
  suggestion,
  onChange,
}: {
  memoryId: string;
  currentProjectId: string | null;
  currentProjectName: string | null;
  // Omit entirely (rather than passing null) on the detail page, where
  // there's never a suggestion to show -- only the Record success screen
  // has one, fresh off of generateMemoryMetadata.
  suggestion?: ProjectSuggestion | null;
  onChange: (projectId: string | null, projectName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  // Once the user has acted on (or explicitly dismissed) the suggestion,
  // stop showing the suggestion card even on a re-render with the same
  // `suggestion` prop -- it's a one-time nudge, not something that should
  // reappear after the user already made a call on it.
  const [suggestionHandled, setSuggestionHandled] = useState(false);

  async function ensureProjectsLoaded() {
    if (projects || loadingProjects) return;
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json().catch(() => ({}));
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function assign(projectId: string | null, projectName: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) return;
      onChange(projectId, projectName);
      setOpen(false);
      setCreatingNew(false);
      setNewName("");
      setSuggestionHandled(true);
    } finally {
      setSaving(false);
    }
  }

  async function createAndAssign(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.project) return;
      setProjects((prev) => (prev ? [...prev, data.project].sort((a, b) => a.name.localeCompare(b.name)) : [data.project]));
      await assign(data.project.id, data.project.name);
    } finally {
      setSaving(false);
    }
  }

  const showSuggestion =
    !suggestionHandled && !currentProjectId && !!suggestion && !!(suggestion.existingId || suggestion.newName);

  if (showSuggestion && suggestion) {
    const label = suggestion.existingName || suggestion.newName;
    return (
      <div className="rounded-[13px] border border-[#ece5f5] bg-[#f9f8fc] px-3.5 py-3 text-left">
        <p className="flex items-start gap-1.5 text-sm font-semibold text-[#3c3650]">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
          <span>
            This looks like it&apos;s part of <span className="text-[#8b5cf6]">{label}</span>
            {suggestion.newName && !suggestion.existingId && (
              <span className="font-normal text-[#a29ab9]"> — new project</span>
            )}
          </span>
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() =>
              suggestion.existingId
                ? assign(suggestion.existingId, suggestion.existingName)
                : createAndAssign(suggestion.newName!)
            }
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {saving ? <Spinner className="h-3 w-3 border-white/40 border-t-white" /> : <Check size={13} />}
            Yes, that&apos;s right
          </button>
          <button
            onClick={() => {
              setOpen(true);
              ensureProjectsLoaded();
            }}
            disabled={saving}
            className="rounded-pill border border-[#ece5f5] px-3 py-2 text-xs font-semibold text-ink-soft disabled:opacity-50"
          >
            Change
          </button>
        </div>
        {open && (
          <div className="mt-2">
            <ProjectDropdown
              projects={projects}
              loading={loadingProjects}
              creatingNew={creatingNew}
              newName={newName}
              setNewName={setNewName}
              setCreatingNew={setCreatingNew}
              currentProjectId={currentProjectId}
              saving={saving}
              onPick={(p) => assign(p?.id ?? null, p?.name ?? null)}
              onCreate={() => createAndAssign(newName)}
              onDismissNoProject={() => {
                // "No project" from the Change dropdown, while a
                // suggestion was showing, IS a real decision (not just
                // closing the popover) -- record it as handled so the
                // suggestion doesn't reappear.
                setSuggestionHandled(true);
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // Already filed under a project -- keep this compact: a small pill with
  // the project's name that opens the same dropdown to change it.
  if (currentProjectId) {
    return (
      <div className="relative inline-block text-left">
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (!open) ensureProjectsLoaded();
          }}
          className="flex items-center gap-1 rounded-pill bg-surface px-2.5 py-1 text-[11px] font-semibold text-[#8b5cf6]"
        >
          {currentProjectName}
          <ChevronDown size={11} />
        </button>
        {open && (
          <div className="absolute left-0 z-20 mt-1.5 w-60">
            <ProjectDropdown
              projects={projects}
              loading={loadingProjects}
              creatingNew={creatingNew}
              newName={newName}
              setNewName={setNewName}
              setCreatingNew={setCreatingNew}
              currentProjectId={currentProjectId}
              saving={saving}
              onPick={(p) => assign(p?.id ?? null, p?.name ?? null)}
              onCreate={() => createAndAssign(newName)}
            />
          </div>
        )}
      </div>
    );
  }

  // Not filed under anything (no project, and either no AI suggestion or
  // the user already dismissed one) -- rather than a small, easy-to-miss
  // chip, say so plainly and offer the same list-plus-create-new picker
  // from a real button. Every memory gets this, including ones that
  // predate the feature entirely -- nothing is ever assigned without the
  // user tapping this themselves.
  return (
    <div className="rounded-[13px] border border-dashed border-[#d9d2ea] bg-[#faf9fc] px-3.5 py-3 text-left">
      <p className="flex items-start gap-1.5 text-sm text-ink-soft">
        <FolderPlus size={14} className="mt-0.5 shrink-0 text-[#a29ab9]" />
        <span>
          <span className="font-semibold text-[#3c3650]">Not filed under a project yet.</span> If you think this
          belongs to one, assign it below.
        </span>
      </p>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) ensureProjectsLoaded();
        }}
        disabled={saving}
        className="mt-2.5 flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
      >
        {saving ? <Spinner className="h-3 w-3 border-white/40 border-t-white" /> : <FolderPlus size={13} />}
        Assign to a project
      </button>
      {open && (
        <div className="mt-2.5">
          <ProjectDropdown
            projects={projects}
            loading={loadingProjects}
            creatingNew={creatingNew}
            newName={newName}
            setNewName={setNewName}
            setCreatingNew={setCreatingNew}
            currentProjectId={currentProjectId}
            saving={saving}
            onPick={(p) => assign(p?.id ?? null, p?.name ?? null)}
            onCreate={() => createAndAssign(newName)}
          />
        </div>
      )}
    </div>
  );
}

function ProjectDropdown({
  projects,
  loading,
  creatingNew,
  newName,
  setNewName,
  setCreatingNew,
  currentProjectId,
  saving,
  onPick,
  onCreate,
  onDismissNoProject,
}: {
  projects: Project[] | null;
  loading: boolean;
  creatingNew: boolean;
  newName: string;
  setNewName: (v: string) => void;
  setCreatingNew: (v: boolean) => void;
  currentProjectId: string | null;
  saving: boolean;
  onPick: (project: Project | null) => void;
  onCreate: () => void;
  onDismissNoProject?: () => void;
}) {
  return (
    <div
      className="rounded-[12px] border border-[#ece5f5] bg-surface p-1.5"
      style={{ boxShadow: "0 12px 28px rgba(60,50,90,0.14)" }}
    >
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
        </div>
      ) : creatingNew ? (
        <div className="p-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
            placeholder="New project name"
            maxLength={60}
            className="w-full rounded-[9px] border border-[#ece5f5] bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-[#a78bfa]"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => setCreatingNew(false)}
              className="flex-1 rounded-[8px] py-1.5 text-[11px] font-semibold text-ink-soft hover:bg-[#f5f2fb]"
            >
              Cancel
            </button>
            <button
              onClick={onCreate}
              disabled={!newName.trim() || saving}
              className="flex-1 rounded-[8px] py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => (onDismissNoProject ? onDismissNoProject() : onPick(null))}
            disabled={saving}
            className={cn(
              "flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-xs disabled:opacity-50",
              !currentProjectId ? "font-semibold text-[#8b5cf6]" : "text-ink hover:bg-[#f5f2fb]"
            )}
          >
            No project
          </button>
          {(projects ?? []).length > 0 && <div className="my-1 h-px bg-[#f0ecf7]" />}
          <div className="max-h-40 overflow-y-auto">
            {(projects ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                disabled={saving}
                className={cn(
                  "flex w-full items-center gap-2 truncate rounded-[9px] px-2.5 py-1.5 text-left text-xs disabled:opacity-50",
                  currentProjectId === p.id ? "font-semibold text-[#8b5cf6]" : "text-ink hover:bg-[#f5f2fb]"
                )}
              >
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-[#f0ecf7]" />
          <button
            onClick={() => setCreatingNew(true)}
            className="flex w-full items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-left text-xs font-semibold text-[#8b5cf6] hover:bg-[#f5f2fb]"
          >
            <Plus size={12} /> New project
          </button>
        </>
      )}
    </div>
  );
}
