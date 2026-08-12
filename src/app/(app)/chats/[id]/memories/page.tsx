"use client";

import { useEffect, useState, useMemo, use as usePromise } from "react";
import { Search, Sparkles, Lock, Info, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/repo/chats";
import type { Memory } from "@/lib/repo/memories";

export default function RelevantMemoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [chat, setChat] = useState<Chat | null>(null);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showInfo, setShowInfo] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/chats/${id}/memories`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChat(data.chat);
      setMemories(data.memories);
    } catch {
      setError("Couldn't load relevant memories. Check your connection and try again.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- intentional fetch-on-mount
    load();
  }, [id]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories ?? []) {
      const c = m.category ?? "General";
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [memories]);

  const filtered = useMemo(() => {
    let list = memories ?? [];
    if (activeCategory !== "All") list = list.filter((m) => (m.category ?? "General") === activeCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.summary ?? "").toLowerCase().includes(q) ||
          m.transcript.toLowerCase().includes(q)
      );
    }
    return list;
  }, [memories, activeCategory, search]);

  return (
    <div>
      <PageHeader title="Relevant Memories" subtitle={chat ? `For ${chat.title}` : undefined} back />

      <div className="px-5">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {!memories && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {memories && (
          <>
            <div
              className="mb-4 flex items-start gap-3 rounded-card border border-border bg-surface p-3.5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white">
                <Sparkles size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  {memories.length} relevant {memories.length === 1 ? "memory" : "memories"} found
                </p>
                <p className="text-xs text-ink-soft">
                  These memories help me give you personalized answers based on your real experiences.
                </p>
              </div>
              <button
                onClick={() => setShowInfo(true)}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-primary"
              >
                Learn how <Info size={13} />
              </button>
            </div>

            {showInfo && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
                onClick={() => setShowInfo(false)}
              >
                <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-surface p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-ink">How retrieval works</h3>
                    <button onClick={() => setShowInfo(false)} aria-label="Close">
                      <X size={18} className="text-ink-soft" />
                    </button>
                  </div>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    When you ask a question, Strivo searches only your own memories for the ones most relevant
                    to it, then gives those to the AI as context before it answers — so responses are grounded
                    in things you&apos;ve actually done, not invented. Your memories are never shared with or
                    visible to any other user.
                  </p>
                </div>
              </div>
            )}

            {memories.length > 0 && (
              <>
                <div className="relative mb-3">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search memories…"
                    className="w-full rounded-input border border-border bg-surface py-3 pl-10 pr-3 text-ink placeholder:text-ink-faint outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3">
                  <button
                    onClick={() => setActiveCategory("All")}
                    className={cn(
                      "shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium border",
                      activeCategory === "All" ? "bg-brand-primary text-white border-brand-primary" : "bg-surface text-ink-soft border-border"
                    )}
                  >
                    All ({memories.length})
                  </button>
                  {Object.entries(categoryCounts).map(([cat, count]) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={cn(
                        "shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium border",
                        activeCategory === cat ? "bg-brand-primary text-white border-brand-primary" : "bg-surface text-ink-soft border-border"
                      )}
                    >
                      {cat} ({count})
                    </button>
                  ))}
                </div>
              </>
            )}

            {memories.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={22} />}
                title="No memories used yet"
                description="Once the AI finds relevant experiences for your questions in this chat, they'll show up here."
              />
            ) : (
              <div className="space-y-2.5 pb-4">
                {filtered.map((m) => (
                  <MemoryCard key={m.id} memory={m} menu={false} />
                ))}
              </div>
            )}

            {memories.length > 0 && (
              <div className="mb-8 flex items-center gap-3 rounded-card border border-border bg-brand-primary-soft/30 p-3.5">
                <Lock size={17} className="text-brand-primary shrink-0" />
                <p className="text-xs text-ink-soft">
                  <span className="font-medium text-ink">Only you can see your memories.</span> These memories are private and secure.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
