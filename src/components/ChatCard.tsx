"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { MoreVertical, Trash2 } from "lucide-react";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { chatCategoryDef } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

export function ChatCard({ chat, onDeleted }: { chat: Chat; onDeleted?: (id: string) => void }) {
  // Every category shares one brand-primary treatment now -- see the
  // comment above MEMORY_CATEGORIES in categoryIcons.tsx for why the old
  // per-category gradient/glow/wash (a different hue per category) got
  // removed. Only the icon still varies by category.
  const { icon: Icon } = chatCategoryDef(chat.category);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      // Tell the parent to drop this one row locally instead of asking it to
      // re-fetch the whole list from the server (the old onChanged?.()
      // behavior). Deleting several cards in quick succession used to fire
      // one full-list GET per delete, and those GETs could resolve out of
      // order -- a request that started before some of the deletes had
      // landed on the server could resolve *after* a request that started
      // later, overwriting the correctly-shortened list with a stale, longer
      // one. That's why deleted chats kept reappearing until a manual
      // refresh (a single fresh server render, no race possible). A plain
      // local array filter has no network round-trip, so there's nothing to
      // race.
      if (res.ok) onDeleted?.(chat.id);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="relative">
      <Link
        href={`/chats/${chat.id}`}
        className="block active:scale-[0.98] active:opacity-80 transition-transform"
        onClick={() => menuOpen && setMenuOpen(false)}
      >
        <Card className="relative overflow-hidden hover:border-brand-primary/40 transition-colors">
          <div className="relative flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary">
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              {/* Title is an AI-generated 3-5 word summary of the chat's
                  first message (see generateChatTitle in lib/ai.ts), not
                  the quick-action name it started from -- otherwise every
                  "General Chat" or "Interview Preparation" card looks
                  identical in this list and you can't tell them apart
                  without opening each one. Its own full-width row (rather
                  than squeezed next to the timestamp) with line-clamp-2
                  instead of a single-line truncate, so a real 3-5 word
                  summary -- especially in a wider script like Devanagari --
                  gets room to actually show instead of collapsing to one
                  or two visible words before the ellipsis. The category it
                  started under is shown separately as the small pill below,
                  not baked into this title. */}
              <h3 className="font-semibold text-ink line-clamp-2 pr-6">{chat.title}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="shrink-0 rounded-pill bg-brand-primary-soft px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                  {chat.category}
                </span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft line-clamp-1">
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete chat?"
        description="This chat and all its messages will be permanently deleted. This can't be undone."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
