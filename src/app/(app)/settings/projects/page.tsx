"use client";

import { useEffect, useState } from "react";
import { FolderKanban, FolderPlus, Pencil, Trash2, X, Check, Sparkles } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Spinner } from "@/components/Spinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Project } from "@/lib/repo/projects";

type ProjectWithCount = Project & { memoryCount: number };

// Settings > Projects -- where a user manages the real, permanent projects
// that memories can be filed under (see ProjectAssigner.tsx for the
// suggest/assign flow this list feeds). Deliberately its own page rather
// than a modal off the memory detail view: creating/renaming/deleting a
// project is account-level housekeeping, not something tied to any one
// memory.
//
// Visually this leans on the same dark-header + gradient-card + gradient-CTA
// language as Record and the memory detail hero card, rather than the flat
// divided-list treatment the rest of Settings uses -- this is a page people
// come back to and act on (create, assign, tidy up), not a row of static
// toggles, so it gets the more "alive" treatment other action-heavy screens
// already use.
export default function ProjectsSettingsPage() {
  const [projects, setProjects] = useState<ProjectWithCount[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ProjectWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bumped by the "Try again" link on a load failure -- re-running the
  // effect below rather than calling an extracted async function directly
  // from the effect body, same "inline fetch + cancelled guard" pattern as
  // NotificationBell.tsx.
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  function startCreating() {
    setCreating(true);
    setCreateError(null);
  }

  async function createProject() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.project) throw new Error(data.error ?? "Couldn't create that project.");
      setProjects((prev) => {
        const withCount: ProjectWithCount = { ...data.project, memoryCount: data.project.memoryCount ?? 0 };
        // getProjectByName's case-insensitive dedupe (POST /api/projects)
        // means this can be an EXISTING project handed back rather than a
        // new one -- replace in place if so, otherwise append.
        const list = prev ?? [];
        const exists = list.some((p) => p.id === withCount.id);
        const next = exists ? list.map((p) => (p.id === withCount.id ? withCount : p)) : [...list, withCount];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewName("");
      setCreating(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create that project.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: ProjectWithCount) {
    setEditingId(p.id);
    setEditName(p.name);
    setRenameError(null);
  }

  async function saveRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSaving(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.project) throw new Error(data.error ?? "Couldn't rename that project.");
      setProjects((prev) =>
        (prev ?? [])
          .map((p) => (p.id === id ? { ...p, name: data.project.name } : p))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Couldn't rename that project.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="pb-8">
      <DarkHeader
        back
        title="Projects"
        subtitle="Group memories under real, ongoing work. We'll suggest one when it's obvious — you decide the rest."
      />

      <div className="px-5 pt-5 space-y-4">
        {/* Gradient hero card, same family as Record's capture card -- the
            primary action (create a project) lives right here rather than
            buried as the last row of a plain list. */}
        <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)", boxShadow: "0 8px 20px rgba(139,92,246,0.3)" }}
            >
              <FolderKanban size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#3c3650]">
                {projects && projects.length > 0
                  ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}`
                  : "No projects yet"}
              </p>
              <p className="mt-0.5 text-xs text-[#8a82a8]">Create one, then assign memories to it any time.</p>
            </div>
          </div>
          {!creating && (
            <button
              onClick={startCreating}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-pill py-3 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              <FolderPlus size={16} /> New Project
            </button>
          )}
          {creating && (
            <div className="mt-4 rounded-[13px] border border-[#ece5f5] bg-surface p-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="Project name"
                maxLength={60}
                className="w-full rounded-[10px] border border-[#ece5f5] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-[#a78bfa]"
              />
              {createError && <p className="mt-1.5 text-xs text-red-600">{createError}</p>}
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setCreateError(null);
                  }}
                  className="flex-1 rounded-pill border border-[#ece5f5] py-2 text-xs font-semibold text-ink-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={createProject}
                  disabled={!newName.trim() || saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                >
                  {saving ? <Spinner className="h-3 w-3 border-white/40 border-t-white" /> : <Check size={13} />}
                  Create
                </button>
              </div>
            </div>
          )}
        </div>

        {loadError && (
          <div className="flex items-center gap-2 px-1">
            <p className="text-sm text-red-600">Couldn&apos;t load your projects.</p>
            <button
              onClick={() => {
                setLoadError(false);
                setRetryKey((k) => k + 1);
              }}
              className="text-sm font-semibold text-[#8b5cf6]"
            >
              Try again
            </button>
          </div>
        )}

        {!projects && !loadError && (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5 border-brand-primary-soft border-t-brand-primary" />
          </div>
        )}

        {projects && projects.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-[#d9d2ea] bg-[#faf9fc] px-5 py-8 text-center">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)", opacity: 0.85 }}
            >
              <Sparkles size={20} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#3c3650]">Nothing filed yet</p>
            <p className="mt-1 text-xs text-[#8a82a8] max-w-[220px] mx-auto">
              Create your first project above, or assign one straight from any memory.
            </p>
          </div>
        )}

        {/* Each project as its own elevated card -- individually tappable
            surfaces with a gradient icon, rather than a flat divided list,
            so the page reads as something you interact with, not a
            settings table. */}
        {projects && projects.length > 0 && (
          <div className="space-y-2.5">
            {projects.map((p) => (
              <div
                key={p.id}
                className="rounded-[15px] border border-[#f0ecf7] bg-surface p-3.5"
                style={{ boxShadow: "0 2px 10px rgba(60,50,90,0.05)" }}
              >
                {editingId === p.id ? (
                  <div>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRename(p.id)}
                      maxLength={60}
                      className="w-full rounded-[10px] border border-[#ece5f5] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-[#a78bfa]"
                    />
                    {renameError && <p className="mt-1.5 text-xs text-red-600">{renameError}</p>}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 rounded-pill border border-[#ece5f5] px-3 py-1.5 text-xs font-semibold text-ink-soft"
                      >
                        <X size={13} /> Cancel
                      </button>
                      <button
                        onClick={() => saveRename(p.id)}
                        disabled={!editName.trim() || saving}
                        className="flex items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                      >
                        {saving ? <Spinner className="h-3 w-3 border-white/40 border-t-white" /> : <Check size={13} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white"
                      style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                    >
                      <FolderKanban size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                      <p className="text-xs text-ink-faint">
                        {p.memoryCount === 0
                          ? "No memories yet"
                          : `${p.memoryCount} ${p.memoryCount === 1 ? "memory" : "memories"}`}
                      </p>
                    </div>
                    <button
                      onClick={() => startEdit(p)}
                      aria-label={`Rename ${p.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a29ab9] hover:bg-[#f5f2fb] hover:text-[#8b5cf6]"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      aria-label={`Delete ${p.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a29ab9] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be deleted. ${
                deleteTarget.memoryCount > 0
                  ? `Its ${deleteTarget.memoryCount} ${deleteTarget.memoryCount === 1 ? "memory keeps" : "memories keep"} their content — they'll just show no project.`
                  : ""
              }`
            : ""
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
