"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X, MessageSquare } from "lucide-react";
import { LogoWithWordmark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { ChatCard } from "@/components/ChatCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import { CHAT_CATEGORIES, NEW_CHAT_TEMPLATES } from "@/lib/config";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { chatCategoryDef } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

export default function ChatsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

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
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={36} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} size={34} />
        </button>
      </div>

      <div className="px-5 pt-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Chats</h1>
          <p className="mt-1 text-sm text-ink-soft">All your conversations with your AI.</p>
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          className="flex shrink-0 items-center gap-1 rounded-pill bg-gradient-brand px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> New Chat
        </button>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full rounded-input border border-border bg-surface py-3 pl-10 pr-3 text-ink placeholder:text-ink-faint outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {CHAT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium border",
                category === c ? "bg-brand-primary text-white border-brand-primary" : "bg-surface text-ink-soft border-border"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4">
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

        <div className="space-y-2.5 pb-4">
          {chats?.map((chat) => (
            <ChatCard key={chat.id} chat={chat} />
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
                const { icon: Icon, bg, text } = chatCategoryDef(t.category);
                return (
                  <button
                    key={t.title}
                    onClick={() => startChat(t)}
                    disabled={!!creating}
                    className="flex w-full items-center gap-3 rounded-card border border-border p-3.5 text-left hover:border-brand-primary/40"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg} ${text}`}>
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
