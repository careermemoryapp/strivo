"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { MoreVertical, Trash2 } from "lucide-react";
import { Card } from "@/components/Card";
import { chatCategoryDef } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

export function ChatCard({ chat, onChanged }: { chat: Chat; onChanged?: () => void }) {
  const { icon: Icon } = chatCategoryDef(chat.category);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      onChanged?.();
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  }

  return (
    <div className="relative">
      <Link
        href={`/chats/${chat.id}`}
        className="block active:scale-[0.98] active:opacity-80 transition-transform"
        onClick={() => menuOpen && setMenuOpen(false)}
      >
        <Card className="hover:border-brand-primary/40 transition-colors">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f2effa] text-[#8b5cf6]">
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-ink truncate pr-6">{chat.title}</h3>
                <span className="shrink-0 text-xs text-ink-faint pr-6">
                  {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-soft line-clamp-1">
                {chat.last_message || "No messages yet"}
              </p>
            </div>
          </div>
        </Card>
      </Link>

      <div className="absolute right-3 top-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label="Chat actions"
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
              onClick={handleDelete}
              disabled={deleting}
              className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
