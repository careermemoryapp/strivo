"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Trash2, Pencil, FileText, Sparkles, Mic, Type, CheckCircle2, Paperclip,
  ThumbsUp, ThumbsDown, Copy, ClipboardCheck,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProjectAssigner } from "@/components/ProjectAssigner";
import { memoryCategoryDef } from "@/lib/categoryIcons";
import { cn, safeJsonParse } from "@/lib/utils";
import type { Memory } from "@/lib/repo/memories";

// Seeded from page.tsx's server-side fetch instead of fetching itself on
// mount — see ChatDetailClient.tsx (same pattern, same reasoning) for why:
// this removes the extra network round-trip that was making every memory
// take multiple seconds to open even though the server itself answers in
// milliseconds.
export function MemoryDetailClient({
  memoryId,
  initialMemory,
  initialProjectName,
}: {
  memoryId: string;
  initialMemory: Memory;
  // Resolved server-side (see page.tsx) since the memory row only carries
  // project_id, not the project's name -- null whenever project_id is null.
  initialProjectName: string | null;
}) {
  const router = useRouter();
  const [memory, setMemory] = useState<Memory>(initialMemory);
  // Kept alongside memory.project_id rather than re-derived, since nothing
  // else on this page fetches the project list -- ProjectAssigner updates
  // both together via onChange whenever the user picks/creates/clears a
  // project (see its onChange handler below).
  const [projectName, setProjectName] = useState<string | null>(initialProjectName);
  const [tab, setTab] = useState<"Transcript" | "Summary">("Transcript");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [resumeLineCopied, setResumeLineCopied] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/memories/${memoryId}`, { method: "DELETE" });
      // refresh() before the push so /memories' Router Cache entry is
      // updated to reflect the delete -- otherwise a later browser-back
      // navigation onto /memories can restore Next's last cached render of
      // it (from before this delete), showing the deleted memory again.
      // staleTimes doesn't govern that back/forward restoration (see
      // node_modules/next/dist/docs/.../staleTimes.md), so this is the only
      // thing that keeps it honest.
      router.refresh();
      router.push("/memories");
    } finally {
      // Only reached if the DELETE failed and navigation didn't happen --
      // the success path leaves this page before this line would matter.
      setDeleting(false);
    }
  }

  async function handleFeedback(feedback: "yes" | "no") {
    setMemory({ ...memory, summary_feedback: feedback });
    await fetch(`/api/memories/${memoryId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
  }

  async function copyResumeLine() {
    if (!memory.resume_line) return;
    try {
      await navigator.clipboard.writeText(memory.resume_line);
      setResumeLineCopied(true);
      setTimeout(() => setResumeLineCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts — fail silently,
      // the line is still visible to select and copy manually.
    }
  }

  function startEdit() {
    setEditText(memory.transcript);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: editText }),
      });
      const data = await res.json();
      if (res.ok) {
        setMemory(data.memory);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const { icon: Icon } = memoryCategoryDef(memory.category);
  const keyPoints = safeJsonParse<string[]>(memory.key_points, []);
  const competencies = safeJsonParse<string[]>(memory.competencies, []);
  const wordCount = memory.transcript.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="pb-6">
      {/* No top-right "..." menu -- it only ever held one item (Delete),
          duplicating the Delete action below, and its dropdown was
          rendering clipped/behind the header on some devices. One clear
          Delete entry point (the button at the bottom of this page) is
          simpler and doesn't have that bug. */}
      <DarkHeader back wordmark />

      <div className="px-5 pt-5 space-y-4">
        <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-[#8b5cf6]"
              style={{ boxShadow: "0 3px 8px rgba(60,50,90,0.1)" }}
            >
              <Icon size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-[#3c3650] leading-tight">{memory.title}</h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                {memory.category && (
                  <span className="rounded-pill bg-surface px-2.5 py-1 text-[11px] font-semibold text-[#8b5cf6]">
                    {memory.category}
                  </span>
                )}
                <span className="text-[#a29ab9]">•</span>
                <span className="text-[#a29ab9]">{format(new Date(memory.created_at), "MMM d, yyyy, h:mm a")}</span>
                <span className="text-[#a29ab9]">•</span>
                <span className="flex items-center gap-1 text-[#a29ab9]">
                  {memory.source === "voice" ? <Mic size={12} /> : memory.source === "file" ? <Paperclip size={12} /> : <Type size={12} />}
                  {memory.source === "voice" ? "Voice" : memory.source === "file" ? "Document" : "Text"}
                </span>
              </div>
              {/* No `suggestion` prop here -- there's never an AI suggestion
                  to show on the detail page, only on the Record success
                  screen right after saving (see record/page.tsx). This is
                  what lets an OLD memory (predating this feature entirely)
                  get a project assigned manually, per the "not now, no
                  retroactive assignment" call -- nothing happens unless the
                  user taps this themselves. */}
              <div className="mt-2.5">
                <ProjectAssigner
                  memoryId={memory.id}
                  currentProjectId={memory.project_id}
                  currentProjectName={projectName}
                  onChange={(projectId, name) => {
                    setMemory((m) => ({ ...m, project_id: projectId }));
                    setProjectName(name);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Competencies (Leadership, Problem-Solving, etc.) the AI
              identified this memory as genuinely demonstrating, even though
              the person almost certainly didn't frame it that way
              themselves when recording it — see COMPETENCY_OPTIONS in
              lib/ai.ts. Distinct amber/gold styling (vs. the purple category
              pill above) to read as "here's something notable," not just
              another classification tag. */}
          {competencies.length > 0 && (
            <div className="mt-4 rounded-[13px] border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <Sparkles size={13} /> This looks like a strong example of:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {competencies.map((c) => (
                  <span key={c} className="rounded-pill bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    {c}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-amber-700/80">
                {memory.praise || "Worth reusing in an interview or performance review — just ask your AI for it."}
              </p>
              {memory.resume_line && (
                <div className="mt-2.5 rounded-[10px] border border-amber-200/70 bg-white/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                    Resume-ready line
                  </p>
                  <p className="mt-1 text-xs text-ink leading-snug">{memory.resume_line}</p>
                  <button
                    onClick={copyResumeLine}
                    className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                  >
                    {resumeLineCopied ? <ClipboardCheck size={12} /> : <Copy size={12} />}
                    {resumeLineCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1 rounded-pill bg-[#f2effa] p-1">
          <button
            onClick={() => setTab("Transcript")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-sm font-medium",
              tab === "Transcript" ? "bg-surface text-[#8b5cf6]" : "text-[#a29ab9]"
            )}
            style={tab === "Transcript" ? { boxShadow: "0 2px 6px rgba(60,50,90,0.08)" } : undefined}
          >
            <FileText size={15} /> Transcript
          </button>
          <button
            onClick={() => setTab("Summary")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-sm font-medium",
              tab === "Summary" ? "bg-surface text-[#8b5cf6]" : "text-[#a29ab9]"
            )}
            style={tab === "Summary" ? { boxShadow: "0 2px 6px rgba(60,50,90,0.08)" } : undefined}
          >
            <Sparkles size={15} /> Summary (AI)
          </button>
        </div>

        {tab === "Transcript" ? (
          <div className="rounded-[14px] border border-[#f0ecf7] bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">Transcript</h3>
              {!editing && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 rounded-pill border border-[#ece5f5] px-3 py-1.5 text-xs font-medium text-[#8b5cf6]"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="mt-3 space-y-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={10}
                  className="w-full rounded-input border border-border bg-bg p-3 text-[15px] text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20 resize-none"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={saveEdit} loading={saving}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-ink whitespace-pre-wrap select-text">
                  {memory.transcript}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-[#f0ecf7] pt-3 text-xs text-ink-faint">
                  <span className="flex items-center gap-1">
                    <Sparkles size={12} />
                    {memory.source === "voice"
                      ? "Generated from your speech"
                      : memory.source === "file"
                        ? "Extracted from an uploaded document"
                        : "Written by you"}
                  </span>
                  <span>{wordCount} words</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#ece5f5] bg-[#f2effa]/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-[#8b5cf6]">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-semibold text-ink">AI Summary</h3>
              </div>
              <span className="rounded-pill bg-surface px-2.5 py-1 text-[11px] font-medium text-[#8b5cf6]">
                AI Generated
              </span>
            </div>

            {memory.summary ? (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-ink">{memory.summary}</p>
                {keyPoints.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-[#ece5f5] pt-3">
                  <span className="text-sm text-ink-soft">Was this summary helpful?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFeedback("yes")}
                      className={cn(
                        "flex items-center gap-1 rounded-pill border px-3 py-1.5 text-xs font-medium",
                        memory.summary_feedback === "yes"
                          ? "border-[#8b5cf6] bg-[#8b5cf6] text-white"
                          : "border-[#ece5f5] text-ink-soft"
                      )}
                    >
                      <ThumbsUp size={13} /> Yes
                    </button>
                    <button
                      onClick={() => handleFeedback("no")}
                      className={cn(
                        "flex items-center gap-1 rounded-pill border px-3 py-1.5 text-xs font-medium",
                        memory.summary_feedback === "no"
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-[#ece5f5] text-ink-soft"
                      )}
                    >
                      <ThumbsDown size={13} /> No
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                {memory.metadata_status === "failed"
                  ? "AI summary generation didn't complete for this memory. The full transcript is still available in the Transcript tab."
                  : "Generating summary…"}
              </p>
            )}
          </div>
        )}

        {/* Just Delete now -- Share and Duplicate weren't pulling their
            weight here, and this consolidates the memory's only destructive
            action into one clear button instead of it being spread across
            this row and a second (buggy) menu at the top. */}
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-pill border border-red-200 bg-red-50 py-3.5 text-sm font-semibold text-red-600"
        >
          <Trash2 size={16} /> Delete Memory
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete memory?"
        description="This memory and its AI summary will be permanently deleted. This can't be undone."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
