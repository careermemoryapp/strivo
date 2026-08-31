"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Brain, Trophy, ChevronRight } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { groupMemoriesByTime } from "@/lib/utils";
import type { Memory } from "@/lib/repo/memories";

// initialMemories is the default (no search, newest-first) list, already
// fetched server-side by page.tsx — see ChatDetailClient.tsx and
// ChatsListClient.tsx for the full reasoning. Search and sort changes
// still fetch client-side, since those are driven by live typing/tapping;
// only the very first render is skipped now.
export function MemoriesListClient({ initialMemories }: { initialMemories: Memory[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [memories, setMemories] = useState<Memory[] | null>(initialMemories);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [error, setError] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const isFirstRun = useRef(true);

  const load = useCallback(async (searchTerm: string, sortOrder: "newest" | "oldest") => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      params.set("sort", sortOrder);
      const res = await fetch(`/api/memories?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemories(data.memories);
    } catch {
      setError("Couldn't load your memories. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    // The very first render already has the right data from the server —
    // skip re-fetching it a moment later. Only real search/sort changes
    // after that should hit the API.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const t = setTimeout(() => load(search, sort), 250);
    return () => clearTimeout(t);
  }, [search, sort, load]);

  const groups = memories ? groupMemoriesByTime(memories) : [];

  return (
    <div className="pb-6">
      <DarkHeader
        wordmark
        avatarRight={
          <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size={32} />
          </button>
        }
      >
        <div className="relative mt-5">
          <h1 className="text-[21px] font-bold text-white">All Memories</h1>
          <p className="mt-1 text-[12px] text-white/55">Your experiences, insights and moments that matter.</p>
        </div>

        {/* Entry point to the Story Bank coverage view (see
            /memories/coverage) — which competencies the user has strong
            stories for and which are still gaps worth filling. */}
        <button
          onClick={() => router.push("/memories/coverage")}
          className="relative mt-4 flex w-full items-center justify-between rounded-[13px] border border-white/10 bg-white/8 px-3.5 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <Trophy size={16} className="text-amber-300" /> Story Bank
          </span>
          <span className="flex items-center gap-1 text-xs text-white/55">
            See your coverage <ChevronRight size={14} />
          </span>
        </button>

        <div className="relative mt-4 flex items-center gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-2 rounded-[13px] border border-white/10 bg-white/8 px-3.5 py-3">
            <Search size={16} className="shrink-0 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
            />
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-[13px] border border-white/10 bg-white/8 px-3 py-3 text-sm font-medium text-white/70"
            >
              {sort === "newest" ? "Newest" : "Oldest"}
              <ChevronDown size={15} />
            </button>
            {sortMenuOpen && (
              <div
                className="absolute right-0 top-12 z-10 w-32 rounded-card border border-border bg-surface p-1"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {(["newest", "oldest"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSort(s);
                      setSortMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-input px-3 py-2 text-sm text-ink hover:bg-bg capitalize"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DarkHeader>

      <div className="px-5 pt-5">
        {error && <ErrorBanner message={error} onRetry={() => load(search, sort)} />}

        {!memories && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {memories && memories.length === 0 && (
          <EmptyState
            icon={<Brain size={22} />}
            title={search ? "No memories match your search" : "No memories yet"}
            description={search ? "Try a different search term." : "Capture your first memory to see it here."}
          />
        )}

        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{group.label}</h3>
              <div className="space-y-2.5">
                {group.items.map((m) => (
                  <MemoryCard key={m.id} memory={m} onChanged={() => load(search, sort)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
