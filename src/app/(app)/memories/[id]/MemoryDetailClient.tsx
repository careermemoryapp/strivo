"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  MoreVertical, Trash2, Pencil, FileText, Sparkles, Mic, Type, CheckCircle2, Paperclip,
  ThumbsUp, ThumbsDown, Share2, Copy,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { memoryCategoryDef } from "@/lib/categoryIcons";
import { cn, safeJsonParse } from "@/lib/utils";
import type { Memory } from "@/lib/repo/memories";

// Seeded from page.tsx's server-side fetch instead of fetching itself on
// mount — see ChatDetailClient.tsx (same pattern, same reasoning) for why:
// this removes the extra network round-trip that was making every memory
// take multiple seconds to open even though the server itself answers in
// milliseconds.
export function MemoryDetailClient({ memoryId, initialMemory }: { memoryId: string; initialMemory: Memory }) {
  const router = useRouter();
  const [memory, setMemory] = useState<Memory>(initialMemory);
  const [tab, setTab] = useState<"Transcript" | "Summary">("Transcript");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/memories/${memoryId}`, { method: "DELETE" });
      router.push("/memories");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/memories/${data.memory.id}`);
    } finally {
      setDuplicating(false);
    }
  }

  async function handleShare() {
    const text = `${memory.title}\n\n${memory.summary || memory.transcript}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: memory.title, text });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg("Copied to clipboard");
      setTimeout(() => setShareMsg(null), 2000);
    } catch {
      setShareMsg("Couldn't share on this device");
      setTimeout(() => setShareMsg(null), 2000);
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
  const wordCount = memory.transcript.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="pb-6">
      <DarkHeader
        back
        wordmark
        right={
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 active:bg-white/10"
            >
              <MoreVertical size={19} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-9 z-10 w-40 rounded-card border border-border bg-surface p-1"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} /> {deleting ? "Deleting…" : "Delete memory"}
                </button>
              </div>
            )}
          </div>
        }
      />

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
            </div>
          </div>
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

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-1 rounded-[14px] border border-[#f0ecf7] bg-surface py-3 text-[#8b5cf6]"
          >
            <Share2 size={17} />
            <span className="text-xs font-medium">Share</span>
          </button>
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="flex flex-col items-center gap-1 rounded-[14px] border border-[#f0ecf7] bg-surface py-3 text-[#8b5cf6]"
          >
            {duplicating ? <Spinner /> : <Copy size={17} />}
            <span className="text-xs font-medium">Duplicate</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex flex-col items-center gap-1 rounded-[14px] border border-[#f0ecf7] bg-surface py-3 text-red-600"
          >
            <Trash2 size={17} />
            <span className="text-xs font-medium">Delete</span>
          </button>
        </div>

        {shareMsg && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-pill bg-ink px-4 py-2 text-sm text-white">
            {shareMsg}
          </div>
        )}
      </div>
    </div>
  );
}
