"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X, MessageSquare } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatCard } from "@/components/ChatCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import { CHAT_CATEGORIES, NEW_CHAT_TEMPLATES } from "@/lib/config";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { chatCategoryDef } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

// initialChats is the default (no search, "All" category) list, already
// fetched server-side by page.tsx — see ChatDetailClient.tsx for the full
// reasoning. Search and category filtering still fetch client-side on
// change, since those are genuinely driven by live typing/tapping and
// can't be known ahead of time; only the very first render (which used to
// always re-fetch the exact same default list a moment after mount) is
// skipped now.
export function ChatsListClient({ initialChats }: { initialChats: Chat[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [chats, setChats] = useState<Chat[] | null>(initialChats);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const isFirstRun = useRef(true);

  const load = useCallback(async (searchTerm: string, cat: string) => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (cat) params.set("category", cat);
      const res = await fetch(`/api/chats?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChats(data.chats);
    } catch {
      setError("Couldn't load your chats. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    // The very first render already has the right data from the server —
    // skip re-fetching it a moment later. Only real search/category
    // changes after that should hit the API.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const t = setTimeout(() => load(search, category), 250);
    return () => clearTimeout(t);
  }, [search, category, load]);

  async function startChat(template: (typeof NEW_CHAT_TEMPLATES)[number]) {
    setCreating(template.title);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.title,
          category: template.category,
          initialMessage: template.prompt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      router.push(`/chats/${data.chat.id}`);
    } catch {
      setCreating(null);
      setError("Couldn't start a new chat. Please try again.");
      setShowNewChat(false);
    }
  }

  return (
    <div className="pb-6">
      <DarkHeader
        wordmark
        avatarRight={
          <div className="flex items-center gap-3.5">
            <NotificationBell />
            <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
              <Avatar firstName={user?.firstName} lastName={user?.lastName} size={32} />
            </button>
          </div>
        }
      >
        <div className="relative mt-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[21px] font-bold text-white">Chats</h1>
            <p className="mt-1 text-[12px] text-white/55">All your conversations with your AI.</p>
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="flex shrink-0 items-center gap-1 rounded-pill bg-white px-3.5 py-2.5 text-xs font-bold text-[#26213c]"
          >
            <Plus size={15} /> New Chat
          </button>
        </div>

        <div className="relative mt-4 flex items-center gap-2 rounded-[13px] border border-white/10 bg-white/8 px-3.5 py-3">
          <Search size={16} className="shrink-0 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
          />
        </div>

        <div className="relative mt-3 flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {CHAT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold",
                category === c ? "bg-white text-[#26213c]" : "bg-white/8 text-white/60"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </DarkHeader>

      <div className="px-5 pt-5">
        {error && <ErrorBanner message={error} onRetry={() => load(search, category)} />}

        {!chats && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {chats && chats.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="No conversations yet"
            description="Start a new chat to get personalized advice from your memories."
          />
        )}

        <div className="space-y-2.5">
          {chats?.map((chat) => (
            <ChatCard key={chat.id} chat={chat} onChanged={() => load(search, category)} />
          ))}
        </div>
      </div>

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setShowNewChat(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Start a new chat</h3>
              <button onClick={() => setShowNewChat(false)} aria-label="Close">
                <X size={20} className="text-ink-soft" />
              </button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {NEW_CHAT_TEMPLATES.map((t) => {
                const { icon: Icon } = chatCategoryDef(t.category);
                return (
                  <button
                    key={t.title}
                    onClick={() => startChat(t)}
                    disabled={!!creating}
                    className="flex w-full items-center gap-3 rounded-card border border-border p-3.5 text-left hover:border-brand-primary/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2effa] text-[#8b5cf6]">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink">{t.title}</p>
                      <p className="text-xs text-ink-soft">{t.category}</p>
                    </div>
                    {creating === t.title && <Spinner />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
