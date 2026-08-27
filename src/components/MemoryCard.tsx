"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { MoreVertical, Trash2, Copy } from "lucide-react";
import { Card } from "@/components/Card";
import { memoryCategoryDef } from "@/lib/categoryIcons";
import { safeJsonParse } from "@/lib/utils";
import type { Memory } from "@/lib/repo/memories";

export function MemoryCard({
  memory,
  menu = true,
  onChanged,
}: {
  memory: Memory;
  menu?: boolean;
  onChanged?: () => void;
}) {
  const { icon: Icon } = memoryCategoryDef(memory.category);
  const tags = safeJsonParse<string[]>(memory.tags, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDuplicate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await fetch(`/api/memories/${memory.id}/duplicate`, { method: "POST" });
      onChanged?.();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await fetch(`/api/memories/${memory.id}`, { method: "DELETE" });
      onChanged?.();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  return (
    <div className="relative">
      <Link
        href={`/memories/${memory.id}`}
        className="block active:scale-[0.98] active:opacity-80 transition-transform"
        onClick={() => menuOpen && setMenuOpen(false)}
      >
        <Card className="hover:border-brand-primary/40 transition-colors">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2effa] text-[#8b5cf6]">
              <Icon size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-ink truncate pr-6">{memory.title}</h3>
              </div>
              <p className="mt-0.5 text-sm text-ink-soft line-clamp-2">
                {memory.summary || (memory.metadata_status === "pending" ? "Generating summary…" : memory.transcript)}
              </p>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-ink-faint">{format(new Date(memory.created_at), "MMM d")}</span>
                {memory.category && (
                  <span className="rounded-pill bg-bg px-2 py-0.5 text-[11px] font-medium text-ink-soft border border-border">
                    {memory.category}
                  </span>
                )}
                {tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-pill bg-bg px-2 py-0.5 text-[11px] text-ink-faint border border-border">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </Link>

      {menu && (
        <div className="absolute right-3 top-3">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Memory actions"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-bg"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-10 w-36 rounded-card border border-border bg-surface p-1"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <button
                onClick={handleDuplicate}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-ink hover:bg-bg"
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
